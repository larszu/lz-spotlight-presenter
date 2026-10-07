const test = require("node:test");
const assert = require("node:assert");
const { lanAddresses } = require("../src/net");
const { isAuthorized } = require("../src/state");

const v4 = (address, internal = false) => ({ family: "IPv4", address, internal });

test("Tailscale, VPN, loopback and link-local addresses are hidden", () => {
  const ips = lanAddresses({
    lo0: [v4("127.0.0.1", true)],
    utun4: [v4("100.111.192.16")],
    en5: [v4("100.100.1.1")],
    en0: [v4("192.168.0.134")],
    en7: [v4("169.254.3.3")],
    bridge100: [v4("172.20.10.2")]
  });
  assert.deepStrictEqual(ips, ["192.168.0.134", "172.20.10.2"]);
});

test("internet clients need the long secret, LAN clients may use the code", () => {
  const keys = { code: "482913", secret: "s3cr3t-long-value" };
  assert.ok(isAuthorized("s3cr3t-long-value", keys, true));
  assert.ok(!isAuthorized("482913", keys, true));
  assert.ok(isAuthorized("482913", keys, false));
  assert.ok(!isAuthorized("", { code: "", secret: "" }, false));
});
