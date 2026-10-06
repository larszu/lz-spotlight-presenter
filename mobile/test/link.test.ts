import test from "node:test";
import assert from "node:assert";
import { parseLink, motionDelta } from "../src/link.ts";

test("parses the desktop QR link", () => {
  assert.deepStrictEqual(parseLink("lzspot://connect?host=192.168.0.134&port=8787&token=757604&name=MBP%20Lars"), {
    host: "192.168.0.134",
    port: 8787,
    token: "757604",
    name: "MBP Lars"
  });
});

test("rejects foreign or broken codes", () => {
  assert.strictEqual(parseLink("https://example.com"), null);
  assert.strictEqual(parseLink("lzspot://connect?host=1.2.3.4&token=12"), null);
  assert.strictEqual(parseLink("lzspot://connect?token=123456"), null);
});

test("turning left moves left, tilting up moves up", () => {
  const s = { sensitivity: 2, invertX: false, invertY: false };
  const d = motionDelta({ x: 1, z: 1 }, 0.016, s);
  assert.ok(d.dx < 0 && d.dy < 0);
  const inv = motionDelta({ x: 1, z: 1 }, 0.016, { ...s, invertX: true, invertY: true });
  assert.ok(inv.dx > 0 && inv.dy > 0);
});

test("tremor below the deadzone and huge gaps are ignored", () => {
  const s = { sensitivity: 2, invertX: false, invertY: false };
  assert.deepStrictEqual(motionDelta({ x: 0.01, z: -0.02 }, 0.016, s), { dx: -0, dy: -0 });
  assert.ok(Math.abs(motionDelta({ x: 0, z: 1 }, 5, s).dx) <= 0.1 + 1e-9);
});
