// Pure pointer/protocol logic, shared by main process and tests.

// "mouse": the phone aims the real mouse cursor instead of an overlay pointer.
const MODES = ["off", "laser", "spotlight", "mouse"];
const ACTIONS = ["next", "prev", "black", "white", "escape", "start"];

function createPointer() {
  return { mode: "off", x: 0.5, y: 0.5 };
}

function clamp(v) {
  return Math.min(1, Math.max(0, v));
}

// dx/dy are fractions of the screen width/height.
function applyMove(pointer, dx, dy) {
  if (pointer.mode === "off") return pointer;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return pointer;
  pointer.x = clamp(pointer.x + dx);
  pointer.y = clamp(pointer.y + dy);
  return pointer;
}

function setMode(pointer, mode) {
  if (!MODES.includes(mode)) return pointer;
  // A fresh activation starts in the centre so the presenter finds it instantly.
  if (pointer.mode === "off" && mode !== "off") {
    pointer.x = 0.5;
    pointer.y = 0.5;
  }
  pointer.mode = mode;
  return pointer;
}

function parseMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!msg || typeof msg.type !== "string") return null;
  return msg;
}

function randomToken() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Long secret for links that travel through the internet tunnel; the short
// code is for typing on the local network only.
function randomSecret() {
  return require("crypto").randomBytes(18).toString("base64url");
}

function isAuthorized(given, { code, secret }, viaInternet) {
  given = String(given || "");
  if (!given) return false;
  if (given === secret) return true;
  return !viaInternet && given === code;
}

module.exports = { MODES, ACTIONS, createPointer, applyMove, setMode, parseMessage, randomToken, randomSecret, isAuthorized };
