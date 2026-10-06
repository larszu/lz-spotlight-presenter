// LAN server: WebSocket for the phone app, plain HTTP GET API for
// Bitfocus Companion / Stream Deck ("Generic HTTP" module).

const http = require("http");
const { WebSocketServer } = require("ws");
const { ACTIONS, parseMessage } = require("./state");

function startServer({ port, getToken, onMessage, onClients }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
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
