// HTML pages for phones that open the desktop address in a browser,
// typically after scanning the pairing QR code with the system camera.

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title, body) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;padding:28px;background:#0b0b0d;color:#f2f2f2;font:17px/1.45 -apple-system,system-ui,sans-serif}
h1{font-size:26px;margin:0 0 6px}.muted{color:#8a8a92}ol{padding-left:22px}li{margin:8px 0}
.btn{display:block;text-align:center;background:#1677ff;color:#fff;padding:16px;border-radius:13px;text-decoration:none;font-weight:600;margin:20px 0}
.box{background:#17171a;border-radius:13px;padding:14px 16px;margin:18px 0}.code{font-size:28px;font-weight:700;letter-spacing:3px}
#nf{display:none;color:#ffb547}</style></head>
<body><h1>LZ Spotlight Presenter</h1>${body}</body></html>`;
}

// The code is only shown when the scanned link already carried it,
// so nobody on the network can read it from this page.
function pairPage(url, hostHeader, token) {
  const [host, port = "8787"] = String(hostHeader || "").split(":");
  const name = url.searchParams.get("name") || "";
  if (url.searchParams.get("token") !== token) {
    return page("LZ Spotlight koppeln", `<p>Dieser Code ist nicht mehr gültig. Den QR-Code scannen, den die Desktop-App gerade anzeigt.</p>`);
  }
  const deep = `lzspot://connect?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&token=${token}&name=${encodeURIComponent(name)}`;
  return page(
    "LZ Spotlight koppeln",
    `${name ? `<p class="muted">Computer: ${esc(name)}</p>` : ""}
<a class="btn" id="open" href="${esc(deep)}">In der App öffnen</a>
<p id="nf">Die App hat sich nicht geöffnet. Unter Expo Go oder ohne installierte App so koppeln:</p>
<ol>
  <li>LZ-Spotlight-App öffnen.</li>
  <li><b>QR-Code scannen</b> tippen und den QR-Code am Computer scannen.</li>
</ol>
<div class="box"><div class="muted">Oder von Hand eingeben</div>
IP-Adresse <b>${esc(host)}</b><br><span class="code">${token}</span></div>
<script>
document.getElementById("open").addEventListener("click", () => {
  setTimeout(() => { if (!document.hidden) document.getElementById("nf").style.display = "block"; }, 1500);
});
</script>`
  );
}

function rootPage() {
  return page(
    "LZ Spotlight Presenter",
    `<p>Die Desktop-App läuft.</p>
<ol>
  <li>LZ-Spotlight-App auf dem Handy öffnen.</li>
  <li><b>QR-Code scannen</b> tippen und den QR-Code im Fenster der Desktop-App scannen.</li>
</ol>
<p class="muted">Bitfocus Companion / Stream Deck: GET /api/&lt;next|prev|black|white|escape|start|laser|spotlight|off&gt;?token=CODE</p>`
  );
}

module.exports = { pairPage, rootPage };
