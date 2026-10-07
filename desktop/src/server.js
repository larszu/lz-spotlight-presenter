// One port for everything: the browser remote (GET /), the WebSocket for
// browser and app, and a plain HTTP GET API for Bitfocus Companion /
// Stream Deck ("Generic HTTP" module).

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { WebSocketServer } = require("ws");
const { ACTIONS, parseMessage, isAuthorized } = require("./state");

// Requests through the Cloudflare tunnel carry this header; they only
// count as authorised with the long secret.
const viaInternet = (req) => Boolean(req.headers["cf-connecting-ip"]);

function startServer({ port, getKeys, getStatus = () => ({}), onMessage, onClients }) {
  const remoteHtml = fs.readFileSync(path.join(__dirname, "remote.html"));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(remoteHtml);
      return;
    }
    if (url.pathname === "/pair") {
      // Links from older QR codes.
      res.writeHead(302, { location: `/?k=${encodeURIComponent(url.searchParams.get("token") || "")}` }).end();
      return;
    }
    const match = url.pathname.match(/^\/api\/(\w+)$/);
    if (!match) {
      res.writeHead(404).end("not found");
      return;
    }
    if (!isAuthorized(url.searchParams.get("token"), getKeys(), viaInternet(req))) {
      res.writeHead(401).end("bad token");
      return;
    }
    const cmd = match[1];
    if (ACTIONS.includes(cmd)) onMessage({ type: "key", action: cmd });
    else if (["laser", "spotlight", "mouse", "off"].includes(cmd)) onMessage({ type: "mode", mode: cmd });
    else {
      res.writeHead(404).end("unknown command");
      return;
    }
    res.writeHead(200).end("ok");
  });

  const wss = new WebSocketServer({ server });
  const clients = new Set();
  const list = () => [...clients].map((c) => c.deviceName);

  wss.on("connection", (socket, req) => {
    const internet = viaInternet(req);
    let authed = false;
    const kick = setTimeout(() => !authed && socket.close(4001, "no hello"), 5000);

    socket.on("message", (raw) => {
      const msg = parseMessage(raw);
      if (!msg) return;
      if (!authed) {
        if (msg.type === "hello" && isAuthorized(msg.token, getKeys(), internet)) {
          authed = true;
          clearTimeout(kick);
          clients.add(socket);
          socket.deviceName = String(msg.device || "Handy").slice(0, 60) + (internet ? " (Internet)" : "");
          socket.send(JSON.stringify({ type: "welcome", host: os.hostname(), ...getStatus() }));
          onClients(list());
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
      if (clients.delete(socket)) onClients(list());
    });
    socket.on("error", () => {});
  });

  server.listen(port, "0.0.0.0");
  return {
    server,
    broadcast(msg) {
      const data = JSON.stringify(msg);
      for (const c of clients) c.send(data);
    },
    kickAll() {
      for (const c of clients) c.close(4003, "token changed");
    }
  };
}

module.exports = { startServer };
