// Addresses a phone can reach on the local network or the phone's hotspot.
// VPN and overlay networks (Tailscale, ZeroTier, WireGuard) are left out:
// a phone in the audience room is not on them.

const VPN_NAME = /^(utun|tun|tap|tailscale|zt|wg|ppp|ipsec)/i;

function isCgnat(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 100 && b >= 64 && b <= 127; // 100.64.0.0/10, used by Tailscale
}

function rank(ip) {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("172.20.10.")) return 1; // iPhone hotspot
  if (ip.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
}

function lanAddresses(interfaces) {
  const out = [];
  for (const [name, list] of Object.entries(interfaces)) {
    if (VPN_NAME.test(name)) continue;
    for (const a of list || []) {
      if (a.family !== "IPv4" || a.internal || isCgnat(a.address) || a.address.startsWith("169.254.")) continue;
      out.push(a.address);
    }
  }
  return out.sort((x, y) => rank(x) - rank(y));
}

module.exports = { lanAddresses };
