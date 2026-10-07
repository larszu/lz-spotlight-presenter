const { app, BrowserWindow, ipcMain, screen, shell, systemPreferences } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const QRCode = require("qrcode");
const { createPointer, applyMove, setMode, randomToken, randomSecret } = require("./state");
const { lanAddresses } = require("./net");
const { startTunnel } = require("./tunnel");
const { startServer } = require("./server");
const input = require("./input");

const PORT = 8787;
const configPath = () => path.join(app.getPath("userData"), "config.json");

let config = { token: randomToken(), secret: randomSecret(), displayId: null, qrMode: "internet" };
let tunnel = { status: "starting" };
let tunnelCtl = null;
let controlWin = null;
let overlayWin = null;
let server = null;
let clients = [];
const pointer = createPointer();

function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
  } catch {}
  saveConfig();
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
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

// macOS drops injected mouse and key events silently without the
// Accessibility permission. An unsigned app loses it with every update even
// though the switch in System Settings still looks on.
function inputAllowed() {
  return process.platform !== "darwin" || systemPreferences.isTrustedAccessibilityClient(false);
}

let askedAccessibility = false;
function checkInput() {
  if (inputAllowed()) return true;
  if (!askedAccessibility) {
    askedAccessibility = true;
    systemPreferences.isTrustedAccessibilityClient(true);
  }
  return false;
}

let lastInputState = null;
function publishInputState() {
  const ok = inputAllowed();
  if (ok === lastInputState) return;
  lastInputState = ok;
  server.broadcast({ type: "status", input: ok });
}

function handleMessage(msg) {
  if (["key", "mouse", "button", "scroll", "text"].includes(msg.type) || (msg.type === "mode" && msg.mode === "mouse")) checkInput();
  switch (msg.type) {
    case "move":
      if (pointer.mode === "mouse") {
        // Same motion as the laser, but on the system cursor.
        const { width, height } = targetDisplay().bounds;
        input.move(Number(msg.dx) * width, Number(msg.dy) * height);
      } else {
        applyMove(pointer, Number(msg.dx), Number(msg.dy));
        pushPointer();
      }
      break;
    case "mode":
      setMode(pointer, msg.mode);
      pushPointer();
      break;
    case "key":
      input.key(msg.action);
      break;
    case "mouse":
      input.move(Number(msg.dx), Number(msg.dy));
      break;
    case "button":
      input.button(msg.button, msg.phase);
      break;
    case "scroll":
      input.scroll(Number(msg.dy), Number(msg.dx) || 0);
      break;
    case "text":
      input.text(msg.text);
      break;
  }
}

async function controlState() {
  const ips = lanAddresses(os.networkInterfaces());
  const lanUrl = ips.length ? `http://${ips[0]}:${PORT}/?k=${config.token}` : null;
  const netUrl = tunnel.status === "online" ? `${tunnel.url}/?k=${config.secret}` : null;
  const mode = config.qrMode === "internet" && netUrl ? "internet" : "lan";
  const link = mode === "internet" ? netUrl : lanUrl;
  return {
    ips,
    port: PORT,
    token: config.token,
    qrMode: config.qrMode,
    shownMode: mode,
    tunnel,
    link,
    qr: link ? await QRCode.toDataURL(link, { margin: 1, width: 280 }) : null,
    clients,
    displays: screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `Bildschirm ${i + 1} (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? " – Hauptbildschirm" : ""}`
    })),
    displayId: targetDisplay().id,
    platform: process.platform,
    accessibility: inputAllowed()
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
  config.secret = randomSecret();
  saveConfig();
  server.kickAll();
  refreshControl();
});
ipcMain.handle("set-qr-mode", (_e, mode) => {
  config.qrMode = mode === "lan" ? "lan" : "internet";
  saveConfig();
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
    getKeys: () => ({ code: config.token, secret: config.secret }),
    getStatus: () => ({ input: inputAllowed() }),
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
  tunnelCtl = startTunnel({
    dir: path.join(app.getPath("userData"), "bin"),
    port: PORT,
    onChange: (t) => {
      tunnel = t;
      refreshControl();
    }
  });
  // Start the input helper now; on Windows its first start takes seconds.
  input.warmUp();
  createOverlay();
  createControl();
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"]) {
    screen.on(ev, () => {
      createOverlay();
      refreshControl();
    });
  }
  // Accessibility can be granted while the app runs.
  setInterval(() => {
    refreshControl();
    publishInputState();
  }, 3000);
});

app.on("before-quit", () => {
  input.stopInput();
  if (tunnelCtl) tunnelCtl.stop();
});
