import { app, BrowserWindow, screen } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import WebSocket from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WS_URL = "wss://192.168.0.134:8787";

const windows = new Map();

function createOverlay(display) {
  console.log(
    `Erzeuge Overlay für Display ${display.id}: ${display.bounds.width}x${display.bounds.height}`
  );

  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,

    frame: false,
    transparent: true,
    backgroundColor: "#00000000",

    show: false,
    focusable: false,
    fullscreenable: false,
    resizable: false,
    movable: false,

    skipTaskbar: true,
    hasShadow: false,

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  });

  win.setIgnoreMouseEvents(true, {
    forward: true
  });

  win.loadFile(path.join(__dirname, "overlay.html"));

  win.webContents.on("did-finish-load", () => {
    console.log(`✓ Overlay Renderer geladen: Display ${display.id}`);

    win.showInactive();

    win.setAlwaysOnTop(true, "screen-saver");

    win.webContents.send("presenter-ready", {
      displayId: display.id
    });
  });

  win.webContents.on("console-message", (_event, level, message) => {
    console.log(`[OVERLAY ${display.id}] ${message}`);
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      `Overlay Renderer beendet: Display ${display.id}`,
      details
    );
  });

  windows.set(display.id, win);

  return win;
}

function createAllOverlays() {
  for (const display of screen.getAllDisplays()) {
    createOverlay(display);
  }
}

function sendToOverlays(message) {
  for (const [displayId, win] of windows) {
    if (win.isDestroyed()) {
      windows.delete(displayId);
      continue;
    }

    if (!win.webContents.isLoading()) {
      console.log(
        `IPC → Display ${displayId}: ${message.type}`
      );

      win.webContents.send("presenter-command", message);
    }
  }
}

function connectWebSocket() {
  console.log(`Verbinde mit ${WS_URL}`);

  const ws = new WebSocket(WS_URL, {
    rejectUnauthorized: false
  });

  ws.on("open", () => {
    console.log("✓ Presenter WebSocket verbunden");
  });

  ws.on("message", (raw) => {
    const text = raw.toString();

    console.log("WS RAW:", text);

    let message;

    try {
      message = JSON.parse(text);
    } catch {
      console.error("Ungültiges JSON:", text);
      return;
    }

    if (!message || typeof message.type !== "string") {
      console.error("Ungültige Presenter-Nachricht:", message);
      return;
    }

    console.log(
      `COMMAND: ${message.type}`,
      message.payload ?? ""
    );

    sendToOverlays(message);
  });

  ws.on("close", () => {
    console.log("Presenter WebSocket getrennt");

    setTimeout(connectWebSocket, 1000);
  });

  ws.on("error", (error) => {
    console.error("WebSocket Fehler:", error.message);
  });
}

app.whenReady().then(() => {
  console.log("");
  console.log("=================================");
  console.log(" Presenter Native Overlay Host");
  console.log("=================================");

  createAllOverlays();
  connectWebSocket();

  screen.on("display-added", (_event, display) => {
    console.log("Display hinzugefügt:", display.id);

    if (!windows.has(display.id)) {
      createOverlay(display);
    }
  });

  screen.on("display-removed", (_event, display) => {
    console.log("Display entfernt:", display.id);

    const win = windows.get(display.id);

    if (win && !win.isDestroyed()) {
      win.close();
    }

    windows.delete(display.id);
  });
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  for (const win of windows.values()) {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }

  windows.clear();
});
