import express from "express";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const certDir = path.join(__dirname, "certs");

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(certDir, "presenter-key.pem")),
    cert: fs.readFileSync(path.join(certDir, "presenter.pem")),
  },
  app
);

const wss = new WebSocketServer({ server });

const clients = new Set();

app.use("/phone", express.static(path.join(__dirname, "../phone")));
app.use("/overlay", express.static(path.join(__dirname, "../overlay")));

app.get("/", (req, res) => {
  res.send(`
    <h1>Presenter Overlay Server</h1>
    <p><a href="/phone/">Phone Controller</a></p>
    <p><a href="/overlay/">Overlay</a></p>
  `);
});

wss.on("connection", (socket) => {
  clients.add(socket);

  console.log(`Client verbunden (${clients.size} Clients)`);

  socket.on("message", (message) => {
    const data = message.toString();

    console.log("MESSAGE:", data);

    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
    console.log(`Client getrennt (${clients.size} Clients)`);
  });

  socket.on("error", (error) => {
    console.error("WebSocket Fehler:", error);
    clients.delete(socket);
  });
});

server.listen(8787, "0.0.0.0", () => {
  console.log("");
  console.log("=================================");
  console.log(" Presenter Overlay HTTPS Server");
  console.log("=================================");
  console.log("Mac Phone: https://localhost:8787/phone/");
  console.log("Mac Overlay: https://localhost:8787/overlay/");
  console.log("iPhone: https://192.168.0.134:8787/phone/");
  console.log("WebSocket: wss://192.168.0.134:8787");
  console.log("");
  console.log("Server wartet auf Verbindungen...");
  console.log("");
});
