export type Target = { host: string; port: number; token: string; name?: string };

export const DEFAULT_PORT = 8787;

// Accepts the desktop QR payload http://<host>:<port>/pair?token=..&name=..
// and the deep link lzspot://connect?host=..&port=..&token=..&name=..
export function parseLink(text: string): Target | null {
  const t = text.trim();
  const http = /^https?:\/\/([^/:?#]+)(?::(\d+))?\/pair\?(.+)$/.exec(t);
  const deep = /^lzspot:\/\/connect\?(.+)$/.exec(t);
  const query = http ? http[3] : deep ? deep[1] : null;
  if (query === null) return null;
  const q: Record<string, string> = {};
  if (http) {
    q.host = http[1];
    q.port = http[2] || "";
  }
  for (const pair of query.split("&")) {
    const [k, v = ""] = pair.split("=");
    q[k] = decodeURIComponent(v);
  }
  const port = Number(q.port || DEFAULT_PORT);
  if (!q.host || !/^\d{6}$/.test(q.token || "") || !Number.isInteger(port)) return null;
  return { host: q.host, port, token: q.token, name: q.name || undefined };
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
