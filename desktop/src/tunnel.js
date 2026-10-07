// Public HTTPS address via a Cloudflare quick tunnel (no account needed).
// Lets phones on mobile data or any other network reach this computer, and
// gives the browser remote the secure context it needs for motion sensors.
// cloudflared is downloaded once into the app's data folder.

const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = "https://github.com/cloudflare/cloudflared/releases/latest/download/";

function asset() {
  if (process.platform === "darwin") return process.arch === "arm64" ? "cloudflared-darwin-arm64.tgz" : "cloudflared-darwin-amd64.tgz";
  if (process.platform === "win32") return "cloudflared-windows-amd64.exe";
  return null;
}

async function ensureBinary(dir) {
  const exe = path.join(dir, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  if (fs.existsSync(exe)) return exe;
  const name = asset();
  if (!name) throw new Error("Plattform ohne cloudflared");
  fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  if (name.endsWith(".tgz")) {
    await new Promise((ok, fail) => execFile("tar", ["-xzf", file, "-C", dir], (e) => (e ? fail(e) : ok())));
    fs.rmSync(file);
  } else {
    fs.renameSync(file, exe);
  }
  fs.chmodSync(exe, 0o755);
  return exe;
}

// Keeps a tunnel running and reports { status, url, error } changes.
function startTunnel({ dir, port, onChange }) {
  let proc = null;
  let stopped = false;
  let retry = null;

  const run = async () => {
    onChange({ status: "starting" });
    let exe;
    try {
      exe = await ensureBinary(dir);
    } catch (err) {
      onChange({ status: "error", error: err.message });
      retry = setTimeout(run, 30000);
      return;
    }
    if (stopped) return;
    proc = spawn(exe, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { windowsHide: true });
    const scan = (chunk) => {
      const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) onChange({ status: "online", url: m[0] });
    };
    proc.stdout.on("data", scan);
    proc.stderr.on("data", scan);
    proc.on("exit", () => {
      proc = null;
      if (stopped) return;
      onChange({ status: "error", error: "Tunnel getrennt – neuer Versuch …" });
      retry = setTimeout(run, 5000);
    });
  };

  run();
  return {
    stop() {
      stopped = true;
      clearTimeout(retry);
      if (proc) proc.kill();
    }
  };
}

module.exports = { startTunnel };
