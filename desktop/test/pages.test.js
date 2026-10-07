const test = require("node:test");
const assert = require("node:assert");
const { pairPage, rootPage } = require("../src/pages");

const url = (q) => new URL(`http://x/pair?${q}`);

test("valid pairing link shows code, deep link and in-app fallback", () => {
  const html = pairPage(url("token=482913&name=Studio-Mac"), "192.168.1.20:8787", "482913");
  assert.match(html, /lzspot:\/\/connect\?host=192\.168\.1\.20&(amp|#38);port=8787&(amp|#38);token=482913/);
  assert.match(html, /QR-Code scannen/);
  assert.match(html, /482913/);
});

test("wrong or missing token never reveals the code", () => {
  assert.doesNotMatch(pairPage(url("token=000000"), "h:8787", "482913"), /482913/);
  assert.doesNotMatch(pairPage(url(""), "h:8787", "482913"), /482913/);
  assert.match(rootPage(), /QR-Code scannen/);
});

test("computer name is escaped", () => {
  const html = pairPage(url("token=482913&name=%3Cscript%3E"), "h:8787", "482913");
  assert.doesNotMatch(html, /<script>alert|Computer: <script>/);
});
