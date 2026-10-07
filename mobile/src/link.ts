export type Target = { host: string; port: number; token: string; secure?: boolean; name?: string };

export const DEFAULT_PORT = 8787;

// Accepts what the desktop QR code contains:
//   https://<tunnel>.trycloudflare.com/?k=<secret>   (internet, any network)
//   http://<lan-ip>:8787/?k=<code>                    (local network)
// plus older links: http://<ip>:8787/pair?token=..  and  lzspot://connect?host=..&token=..
export function parseLink(text: string): Target | null {
  const t = text.trim();
  const web = /^(https?):\/\/([^/:?#]+)(?::(\d+))?\/(pair)?\?(.+)$/.exec(t);
  const deep = /^lzspot:\/\/connect\?(.+)$/.exec(t);
  const query = web ? web[5] : deep ? deep[1] : null;
  if (query === null) return null;
  const q: Record<string, string> = {};
  for (const pair of query.split("&")) {
    const [k, v = ""] = pair.split("=");
    q[k] = decodeURIComponent(v);
  }
  const secure = web?.[1] === "https";
  const host = web ? web[2] : q.host;
  const port = Number((web ? web[3] : q.port) || (secure ? 443 : DEFAULT_PORT));
  const token = q.k || q.token || "";
  if (!host || !/^[\w-]{6,64}$/.test(token) || !Number.isInteger(port)) return null;
  return { host, port, token, secure: secure || undefined, name: q.name || undefined };
}

export function socketUrl(t: Target) {
  return `${t.secure ? "wss" : "ws"}://${t.host}:${t.port}`;
}

export type Gyro = { x: number; z: number };
export type MotionSettings = { sensitivity: number; invertX: boolean; invertY: boolean };

const DEADZONE = 0.03; // rad/s, suppresses hand tremor at rest

// Phone held like a remote, screen up, top pointing at the screen:
// yaw (rotation around z) moves horizontally, pitch (around x) vertically.
// Returns deltas as fractions of the screen width/height.
export function motionDelta(g: Gyro, dt: number, s: MotionSettings) {
  const wz = Math.abs(g.z) < DEADZONE ? 0 : g.z;
  const wx = Math.abs(g.x) < DEADZONE ? 0 : g.x;
  const t = Math.min(Math.max(dt, 0), 0.05);
  return {
    dx: -wz * t * s.sensitivity * (s.invertX ? -1 : 1),
    dy: -wx * t * s.sensitivity * (16 / 9) * (s.invertY ? -1 : 1)
  };
}
