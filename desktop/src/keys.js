// Sends presentation keystrokes to the foreground app without native modules:
// macOS via osascript (needs Accessibility permission), Windows via a
// long-running PowerShell that calls keybd_event.

const { spawn, execFile } = require("child_process");

// macOS key codes and modifiers.
const MAC = {
  next: { code: 124 },
  prev: { code: 123 },
  black: { code: 11 }, // B
  white: { code: 13 }, // W
  escape: { code: 53 },
  start: { code: 36, using: ["command down", "shift down"] } // PowerPoint for Mac
};

// Windows virtual key codes; ext marks extended keys (arrows).
const WIN = {
  next: { vk: 0x27, ext: 1 },
  prev: { vk: 0x25, ext: 1 },
  black: { vk: 0x42, ext: 0 },
  white: { vk: 0x57, ext: 0 },
  escape: { vk: 0x1b, ext: 0 },
  start: { vk: 0x74, ext: 0 } // F5
};

const PS_SCRIPT = `
$sig = '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);'
$k = Add-Type -MemberDefinition $sig -Name K -Namespace LZ -PassThru
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Split(',')
  $vk = [byte][int]$p[0]; $ext = [uint32][int]$p[1]
  $k::keybd_event($vk, 0, $ext, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 15
  $k::keybd_event($vk, 0, $ext -bor 2, [UIntPtr]::Zero)
}
`;

let ps = null;

function windowsHelper() {
  if (ps && !ps.killed && ps.exitCode === null) return ps;
  ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"], {
    windowsHide: true,
    stdio: ["pipe", "ignore", "pipe"]
  });
  ps.stderr.on("data", (d) => console.error("[keys]", String(d).trim()));
  // Feed the loop script once; further lines on stdin are key commands.
  ps.stdin.write(PS_SCRIPT.replace(/\n/g, "\r\n") + "\r\n");
  return ps;
}

function sendKey(action) {
  if (process.platform === "darwin") {
    const key = MAC[action];
    if (!key) return;
    const using = key.using ? ` using {${key.using.join(", ")}}` : "";
    execFile("osascript", ["-e", `tell application "System Events" to key code ${key.code}${using}`], (err) => {
      if (err) console.error("[keys]", err.message);
    });
  } else if (process.platform === "win32") {
    const key = WIN[action];
    if (!key) return;
    windowsHelper().stdin.write(`${key.vk},${key.ext}\r\n`);
  }
}

function stopKeys() {
  if (ps) ps.kill();
}

module.exports = { sendKey, stopKeys };
