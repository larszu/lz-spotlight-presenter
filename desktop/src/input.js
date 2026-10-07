// Keyboard and mouse injection without native Node modules. One long-running
// helper per platform reads JSON lines on stdin:
//   macOS:   osascript (JXA) posting CGEvents; text via System Events.
//            Needs the Accessibility permission.
//   Windows: PowerShell with a small C# SendInput wrapper.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Named keys: macOS key code (+ modifiers), Windows virtual key (+ extended flag).
const KEYS = {
  next: { mac: 124, vk: 0x27, ext: 1 },
  prev: { mac: 123, vk: 0x25, ext: 1 },
  right: { mac: 124, vk: 0x27, ext: 1 },
  left: { mac: 123, vk: 0x25, ext: 1 },
  up: { mac: 126, vk: 0x26, ext: 1 },
  down: { mac: 125, vk: 0x28, ext: 1 },
  enter: { mac: 36, vk: 0x0d },
  backspace: { mac: 51, vk: 0x08 },
  tab: { mac: 48, vk: 0x09 },
  space: { mac: 49, vk: 0x20 },
  escape: { mac: 53, vk: 0x1b },
  black: { mac: 11, vk: 0x42 }, // B
  white: { mac: 13, vk: 0x57 }, // W
  start: { mac: 36, macFlags: (1 << 20) | (1 << 17), vk: 0x74 } // ⌘⇧↩ (PowerPoint for Mac) / F5
};

const MAC_HELPER = `
ObjC.import("Foundation");
ObjC.import("CoreGraphics");
const se = Application("System Events");
const post = (e) => $.CGEventPost($.kCGHIDEventTap, e);
const here = () => { const p = $.CGEventGetLocation($.CGEventCreate(null)); return { x: p.x, y: p.y }; };
let leftDown = false, lastClick = { b: "", t: 0, n: 0 };
const BTN = { left: [1, 2, 0], right: [3, 4, 1] }; // down, up, button number

function button(b, phase) {
  const [down, up, num] = BTN[b];
  const p = here();
  const now = Date.now();
  if (phase !== "up") {
    lastClick = lastClick.b === b && now - lastClick.t < 450 ? { b, t: now, n: lastClick.n + 1 } : { b, t: now, n: 1 };
  }
  const send = (type) => {
    const e = $.CGEventCreateMouseEvent(null, type, p, num);
    $.CGEventSetIntegerValueField(e, 1, lastClick.n); // kCGMouseEventClickState
    post(e);
  };
  if (phase === "click" || phase === "down") send(down);
  if (phase === "click" || phase === "up") send(up);
  if (b === "left") leftDown = phase === "down";
}

function handle(c) {
  if (c.k === "key") {
    for (const isDown of [true, false]) {
      const e = $.CGEventCreateKeyboardEvent(null, c.code, isDown);
      if (c.flags) $.CGEventSetFlags(e, c.flags);
      post(e);
    }
  } else if (c.k === "move") {
    const p = here();
    post($.CGEventCreateMouseEvent(null, leftDown ? 6 : 5, { x: p.x + c.x, y: p.y + c.y }, 0));
  } else if (c.k === "button") {
    button(c.b, c.phase);
  } else if (c.k === "scroll") {
    post($.CGEventCreateScrollWheelEvent2(null, 0, 2, Math.round(c.y), Math.round(c.x || 0), 0));
  } else if (c.k === "text") {
    se.keystroke(c.t);
  }
}

const fh = $.NSFileHandle.fileHandleWithStandardInput;
let buf = "";
while (true) {
  const d = fh.availableData;
  if (d.length == 0) break;
  buf += $.NSString.alloc.initWithDataEncoding(d, $.NSUTF8StringEncoding).js;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    try { handle(JSON.parse(line)); } catch (e) { console.log("helper: " + e); }
  }
}
`;

const WIN_HELPER = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LZInput {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct INPUT {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public MOUSEINPUT mi;
    [FieldOffset(8)] public KEYBDINPUT ki;
  }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  static void Send(INPUT i) {
    if (SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT))) == 0)
      Console.Error.WriteLine("SendInput failed: " + Marshal.GetLastWin32Error() + " size=" + Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Mouse(uint flags, int dx, int dy, int data) {
    var i = new INPUT { type = 0 }; i.mi.dx = dx; i.mi.dy = dy; i.mi.flags = flags; i.mi.data = (uint)data; Send(i);
  }
  public static void Key(ushort vk, uint flags) {
    var i = new INPUT { type = 1 }; i.ki.vk = vk; i.ki.flags = flags; Send(i);
    i.ki.flags = flags | 2; Send(i);
  }
  public static void Text(string s) {
    foreach (char c in s) {
      var i = new INPUT { type = 1 }; i.ki.scan = c; i.ki.flags = 4; Send(i);
      i.ki.flags = 4 | 2; Send(i);
    }
  }
}
'@
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  try {
    $c = $line | ConvertFrom-Json
    switch ($c.k) {
      'key'   { [LZInput]::Key([uint16]$c.vk, [uint32]$c.ext) }
      'move'  { [LZInput]::Mouse(1, [int]$c.x, [int]$c.y, 0) }
      'flags' { [LZInput]::Mouse([uint32]$c.f, 0, 0, 0) }
      'scroll'{ [LZInput]::Mouse(0x800, 0, 0, [int]$c.y) }
      'text'  { [LZInput]::Text([string]$c.t) }
    }
  } catch { [Console]::Error.WriteLine($_) }
}
`;

// Windows mouse button flags: [down, up].
const WIN_BTN = { left: [0x02, 0x04], right: [0x08, 0x10] };

let helper = null;
let lastError = "";

function start() {
  if (helper && helper.exitCode === null && !helper.killed) return helper;
  if (process.platform === "darwin") {
    const file = path.join(os.tmpdir(), "lz-spotlight-input.js");
    fs.writeFileSync(file, MAC_HELPER);
    helper = spawn("osascript", ["-l", "JavaScript", file], { stdio: ["pipe", "ignore", "pipe"] });
  } else if (process.platform === "win32") {
    // The script goes in as -EncodedCommand so stdin carries only commands.
    const encoded = Buffer.from(WIN_HELPER, "utf16le").toString("base64");
    helper = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"]
    });
  } else {
    return null;
  }
  helper.stderr.on("data", (d) => {
    lastError = (lastError + String(d)).slice(-2000).trim();
    console.error("[input]", lastError);
  });
  helper.stdin.on("error", () => {});
  return helper;
}

function write(cmd) {
  const h = start();
  if (h) h.stdin.write(JSON.stringify(cmd) + (process.platform === "win32" ? "\r\n" : "\n"));
}

const mac = process.platform === "darwin";

function key(action) {
  const k = KEYS[action];
  if (!k) return;
  write(mac ? { k: "key", code: k.mac, flags: k.macFlags || 0 } : { k: "key", vk: k.vk, ext: k.ext || 0 });
}

// Relative mouse movement in pixels, merged and sent at most every 8 ms so a
// slow helper never builds up a queue.
let pending = { x: 0, y: 0 };
let flushTimer = null;
function move(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  pending.x += dx;
  pending.y += dy;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const x = Math.round(pending.x), y = Math.round(pending.y);
    pending = { x: pending.x - x, y: pending.y - y };
    if (x || y) write({ k: "move", x, y });
  }, 8);
}

function button(b, phase) {
  if (!["left", "right"].includes(b) || !["click", "down", "up"].includes(phase)) return;
  if (mac) return write({ k: "button", b, phase });
  const [down, up] = WIN_BTN[b];
  if (phase !== "up") write({ k: "flags", f: down });
  if (phase !== "down") write({ k: "flags", f: up });
}

function scroll(dy, dx = 0) {
  if (!Number.isFinite(dy)) return;
  // macOS: pixels, positive = content moves down; Windows: wheel units of 120.
  write(mac ? { k: "scroll", y: Math.round(dy), x: Math.round(dx) } : { k: "scroll", y: Math.round(dy * 4) });
}

function text(t) {
  if (typeof t !== "string" || !t) return;
  write({ k: "text", t: t.slice(0, 500) });
}

function stopInput() {
  if (helper) helper.kill();
}

module.exports = { KEYS, warmUp: start, key, move, button, scroll, text, stopInput, lastError: () => lastError };
