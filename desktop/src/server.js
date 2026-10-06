// LAN server: WebSocket for the phone app, plain HTTP GET API for
// Bitfocus Companion / Stream Deck ("Generic HTTP" module).

const http = require("http");
const { WebSocketServer } = require("ws");
const { ACTIONS, parseMessage } = require("./state");

// Landing page for the system camera: explains the app and offers the deep link.
// The code is only echoed back when the scanned link already carried it.
function pairPage(url, hostHeader, token) {
  const ok = url.searchParams.get("token") === token;
  const [host, port] = String(hostHeader || "").split(":");
  const name = (url.searchParams.get("name") || "").replace(/[<>&"]/g, "");
  const deep = `lzspot://connect?host=${host}&port=${port || 8787}&token=${token}&name=${encodeURIComponent(name)}`;
  const body = ok
    ? `<p>Diesen QR-Code in der <b>LZ-Spotlight-App</b> mit „QR-Code scannen“ erfassen – oder:</p>
       <a class="btn" href="${deep}">In der App öffnen</a>
       <p class="muted">Von Hand: IP <b>${host}</b> · Code <b>${token}</b></p>`
    : `<p>Der Code ist abgelaufen. Den aktuellen QR-Code in der Desktop-App scannen.</p>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LZ Spotlight koppeln</title>
<style>body{margin:0;padding:28px;background:#0b0b0d;color:#f2f2f2;font:17px -apple-system,system-ui,sans-serif}
h1{font-size:26px}.muted{color:#8a8a92}.btn{display:block;text-align:center;background:#1677ff;color:#fff;
padding:16px;border-radius:13px;text-decoration:none;font-weight:600;margin:20px 0}</style></head>
<body><h1>LZ Spotlight Presenter</h1>${name ? `<p class="muted">Computer: ${name}</p>` : ""}${body}</body></html>`;
}

function startServer({ port, getToken, onMessage, onClients }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/pair") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(pairPage(url, req.headers.host, getToken()));
      return;
    }
    const match = url.pathname.match(/^\/api\/(\w+)$/);
    if (!match) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("LZ Spotlight Presenter\nGET /api/<next|prev|black|white|escape|start|laser|spotlight|off>?token=CODE\n");
      return;
    }
    if (url.searchParams.get("token") !== getToken()) {
      res.writeHead(401).end("bad token");
      return;
    }
    const cmd = match[1];
    if (ACTIONS.includes(cmd)) onMessage({ type: "key", action: cmd });
    else if (["laser", "spotlight", "off"].includes(cmd)) onMessage({ type: "mode", mode: cmd });
    else {
      res.writeHead(404).end("unknown command");
      return;
    }
    res.writeHead(200).end("ok");
  });

  const wss = new WebSocketServer({ server });
  const clients = new Set();

  wss.on("connection", (socket) => {
    let authed = false;
    const kick = setTimeout(() => !authed && socket.close(4001, "no hello"), 5000);

    socket.on("message", (raw) => {
      const msg = parseMessage(raw);
      if (!msg) return;
      if (!authed) {
        if (msg.type === "hello" && String(msg.token) === getToken()) {
          authed = true;
          clearTimeout(kick);
          clients.add(socket);
          socket.deviceName = String(msg.device || "Handy").slice(0, 60);
          socket.send(JSON.stringify({ type: "welcome", host: require("os").hostname() }));
          onClients([...clients].map((c) => c.deviceName));
        } else {
          socket.send(JSON.stringify({ type: "error", reason: "token" }));
          socket.close(4003, "bad token");
        }
        return;
      }
      if (msg.type === "ping") socket.send(JSON.stringify({ type: "pong", t: msg.t }));
      else onMessage(msg);
    });

    socket.on("close", () => {
      clearTimeout(kick);
      if (clients.delete(socket)) onClients([...clients].map((c) => c.deviceName));
    });
    socket.on("error", () => {});
  });

  server.listen(port, "0.0.0.0");
  return {
    server,
    kickAll() {
      for (const c of clients) c.close(4003, "token changed");
    }
  };
}

module.exports = { startServer };
