// Drives the real input helper. Runs on Windows in CI; on macOS only with
// LZ_INPUT_TEST=1 because it needs the Accessibility permission.
const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("child_process");

const enabled = process.platform === "win32" || (process.platform === "darwin" && process.env.LZ_INPUT_TEST === "1");

function cursor() {
  if (process.platform === "win32") {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; $p=[System.Windows.Forms.Cursor]::Position; \"$($p.X) $($p.Y)\""]).toString();
    const [x, y] = out.trim().split(/\s+/).map(Number);
    return { x, y };
  }
  const out = execFileSync("osascript", ["-l", "JavaScript", "-e",
    'ObjC.import("CoreGraphics"); const p=$.CGEventGetLocation($.CGEventCreate(null)); p.x+" "+p.y']).toString();
  const [x, y] = out.trim().split(/\s+/).map(Number);
  return { x, y };
}

test("relative mouse move reaches the system cursor", { skip: !enabled }, async () => {
  const input = require("../src/input");
  input.move(0, 0);
  await new Promise((r) => setTimeout(r, 4000)); // helper start-up (PowerShell compiles C#)
  const a = cursor();
  input.move(-40, -30);
  await new Promise((r) => setTimeout(r, 1000));
  const b = cursor();
  input.move(40, 30);
  await new Promise((r) => setTimeout(r, 500));
  input.stopInput();
  assert.ok(b.x < a.x && b.y < a.y, `cursor did not move: ${JSON.stringify({ a, b })}`);
});
