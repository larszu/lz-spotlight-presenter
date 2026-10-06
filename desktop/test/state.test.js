const test = require("node:test");
const assert = require("node:assert");
const { createPointer, applyMove, setMode, parseMessage } = require("../src/state");

test("moves are ignored while off", () => {
  const p = createPointer();
  applyMove(p, 0.2, 0.2);
  assert.deepStrictEqual(p, { mode: "off", x: 0.5, y: 0.5 });
});

test("activation centres and moves clamp to the screen", () => {
  const p = createPointer();
  p.x = 0.1;
  setMode(p, "laser");
  assert.strictEqual(p.x, 0.5);
  applyMove(p, 2, -2);
  assert.deepStrictEqual([p.x, p.y], [1, 0]);
});

test("switching laser to spotlight keeps position", () => {
  const p = createPointer();
  setMode(p, "laser");
  applyMove(p, 0.1, 0.1);
  setMode(p, "spotlight");
  assert.deepStrictEqual([p.mode, p.x, p.y], ["spotlight", 0.6, 0.6]);
});

test("invalid input is rejected", () => {
  const p = createPointer();
  setMode(p, "rainbow");
  assert.strictEqual(p.mode, "off");
  setMode(p, "laser");
  applyMove(p, NaN, 0.1);
  assert.strictEqual(p.x, 0.5);
  assert.strictEqual(parseMessage("{"), null);
  assert.strictEqual(parseMessage('{"a":1}'), null);
  assert.deepStrictEqual(parseMessage('{"type":"key"}'), { type: "key" });
});
