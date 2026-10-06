const { app, BrowserWindow, ipcMain, screen, shell, systemPreferences } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const QRCode = require("qrcode");
const { createPointer, applyMove, setMode, randomToken } = require("./state");
const { startServer } = require("./server");
const { sendKey, stopKeys } = require("./keys");

const PORT = 8787;
const configPath = () => path.join(app.getPath("userData"), "config.json");

let config = { token: randomToken(), displayId: null };
let controlWin = null;
let overlayWin = null;
let server = null;
let clients = [];
const pointer = createPointer();

function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
  } catch {
    saveConfig();
  }
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  }
  return out;
}

function targetDisplay() {
  const all = screen.getAllDisplays();
  const chosen = all.find((d) => d.id === config.displayId);
  if (chosen) return chosen;
  // Default: the external screen, where slides usually run.
  const primary = screen.getPrimaryDisplay();
  return all.find((d) => d.id !== primary.id) || primary;
}

function createOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy();
  const { bounds } = targetDisplay();
  overlayWin = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    focusable: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), backgroundThrottling: false }
  });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.loadFile(path.join(__dirname, "overlay.html"));
  overlayWin.webContents.on("did-finish-load", () => {
    overlayWin.setBounds(bounds);
    overlayWin.showInactive();
    pushPointer();
  });
}

function pushPointer() {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send("pointer", pointer);
}

function handleMessage(msg) {
  switch (msg.type) {
    case "move":
      applyMove(pointer, Number(msg.dx), Number(msg.dy));
      pushPointer();
      break;
    case "mode":
      setMode(pointer, msg.mode);
      pushPointer();
      break;
    case "key":
      sendKey(msg.action);
      break;
  }
}

async function controlState() {
  const ips = lanAddresses();
  const host = ips[0] || "127.0.0.1";
  // Plain http so the iPhone/Android camera opens it too; the app scanner reads it directly.
  const link = `http://${host}:${PORT}/pair?token=${config.token}&name=${encodeURIComponent(os.hostname())}`;
  return {
    ips,
    port: PORT,
    token: config.token,
    qr: await QRCode.toDataURL(link, { margin: 1, width: 280 }),
    clients,
    displays: screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `Bildschirm ${i + 1} (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? " – Hauptbildschirm" : ""}`
    })),
    displayId: targetDisplay().id,
    platform: process.platform,
    accessibility: process.platform !== "darwin" || systemPreferences.isTrustedAccessibilityClient(false)
  };
}

async function refreshControl() {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send("state", await controlState());
}

function createControl() {
  controlWin = new BrowserWindow({
    width: 440,
    height: 760,
    resizable: true,
    title: "LZ Spotlight Presenter",
    backgroundColor: "#0b0b0d",
    webPreferences: { preload: path.join(__dirname, "preload.js") }
  });
  controlWin.removeMenu();
  controlWin.loadFile(path.join(__dirname, "control.html"));
  controlWin.on("closed", () => app.quit());
}

ipcMain.handle("get-state", controlState);
ipcMain.handle("set-display", (_e, id) => {
  config.displayId = Number(id);
  saveConfig();
  createOverlay();
  refreshControl();
});
ipcMain.handle("new-token", () => {
  config.token = randomToken();
  saveConfig();
  server.kickAll();
  refreshControl();
});
ipcMain.handle("test", (_e, msg) => handleMessage(msg));
ipcMain.handle("ask-accessibility", () => {
  if (process.platform !== "darwin") return;
  systemPreferences.isTrustedAccessibilityClient(true);
  shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
});

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => controlWin && controlWin.show());

app.whenReady().then(() => {
  loadConfig();
  server = startServer({
    port: PORT,
    getToken: () => config.token,
    onMessage: handleMessage,
    onClients: (list) => {
      clients = list;
      if (list.length === 0) {
        setMode(pointer, "off");
        pushPointer();
      }
      refreshControl();
    }
  });
  server.server.on("error", (err) => console.error("[server]", err.message));
  createOverlay();
  createControl();
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"]) {
    screen.on(ev, () => {
      createOverlay();
      refreshControl();
    });
  }
  // Accessibility can be granted while the app runs.
  setInterval(refreshControl, 3000);
});

app.on("before-quit", stopKeys);
