import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Gyroscope } from "expo-sensors";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_PORT, MotionSettings, Target, motionDelta, parseLink, socketUrl } from "./src/link";

type Status = "connecting" | "connected" | "badtoken" | "offline";
type Mode = "off" | "laser" | "spotlight";
type Settings = MotionSettings & { holdToPoint: boolean };

const DEFAULT_SETTINGS: Settings = { sensitivity: 2.5, invertX: false, invertY: false, holdToPoint: true };
const STORE_TARGET = "lzspot.target";
const STORE_SETTINGS = "lzspot.settings";

export default function App() {
  const [target, setTarget] = useState<Target | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [t, s] = await Promise.all([AsyncStorage.getItem(STORE_TARGET), AsyncStorage.getItem(STORE_SETTINGS)]);
      if (t) setTarget(JSON.parse(t));
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
      // Opening an lzspot:// link (e.g. via the system camera) pairs directly.
      const initial = await Linking.getInitialURL();
      const fromLink = initial ? parseLink(initial) : null;
      if (fromLink) setTarget(fromLink);
      setLoaded(true);
    })();
    const sub = Linking.addEventListener("url", ({ url }) => {
      const t = parseLink(url);
      if (t) setTarget(t);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (target) AsyncStorage.setItem(STORE_TARGET, JSON.stringify(target));
    else AsyncStorage.removeItem(STORE_TARGET);
  }, [target, loaded]);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    AsyncStorage.setItem(STORE_SETTINGS, JSON.stringify(s));
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.root}>
        {!loaded ? null : target ? (
          <Remote target={target} settings={settings} onSettings={updateSettings} onDisconnect={() => setTarget(null)} />
        ) : (
          <Connect onTarget={setTarget} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Connect({ onTarget }: { onTarget: (t: Target) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [host, setHost] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const startScan = async () => {
    const p = permission?.granted ? permission : await requestPermission();
    if (p.granted) setScanning(true);
    else setError("Kamera-Zugriff wurde nicht erlaubt. Code unten von Hand eingeben.");
  };

  if (scanning) {
    return (
      <View style={styles.flex}>
        <CameraView
          style={styles.flex}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            const t = parseLink(data);
            if (t) {
              setScanning(false);
              onTarget(t);
            }
          }}
        />
        <Button label="Abbrechen" onPress={() => setScanning(false)} style={styles.cancel} />
      </View>
    );
  }

  const manual = () => {
    const [h, p] = host.trim().split(":");
    if (!h || !/^\d{6}$/.test(token.trim())) {
      setError("IP-Adresse und 6-stelligen Code eingeben.");
      return;
    }
    onTarget({ host: h, port: Number(p) || DEFAULT_PORT, token: token.trim() });
  };

  return (
    <View style={styles.page}>
      <Text style={styles.title}>LZ Spotlight Presenter</Text>
      <Text style={styles.muted}>Desktop-App am Computer starten, dann den QR-Code scannen.</Text>
      <Button label="QR-Code scannen" primary onPress={startScan} style={{ marginTop: 28 }} />
      <Text style={[styles.muted, { marginTop: 32 }]}>Oder von Hand verbinden</Text>
      <TextInput
        style={styles.input}
        placeholder="IP-Adresse, z. B. 192.168.0.134"
        placeholderTextColor="#666"
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        value={host}
        onChangeText={setHost}
      />
      <TextInput
        style={styles.input}
        placeholder="Verbindungscode"
        placeholderTextColor="#666"
        keyboardType="number-pad"
        maxLength={6}
        value={token}
        onChangeText={setToken}
      />
      <Button label="Verbinden" onPress={manual} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function useConnection(target: Target) {
  const [status, setStatus] = useState<Status>("connecting");
  const [hostName, setHostName] = useState(target.name ?? target.host);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const open = () => {
      setStatus((s) => (s === "connected" ? "connecting" : s));
      const sock = new WebSocket(socketUrl(target));
      ws.current = sock;
      sock.onopen = () =>
        sock.send(JSON.stringify({ type: "hello", token: target.token, device: Platform.OS === "ios" ? "iPhone" : "Android" }));
      sock.onmessage = (e) => {
        const msg = JSON.parse(String(e.data));
        if (msg.type === "welcome") {
          setStatus("connected");
          setHostName(msg.host);
        } else if (msg.type === "error") {
          stopped = true;
          setStatus("badtoken");
        }
      };
      sock.onclose = () => {
        if (stopped) return;
        setStatus("offline");
        retry = setTimeout(open, 1500);
      };
      sock.onerror = () => {};
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, [target]);

  const send = useCallback((msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  return { status, hostName, send };
}

function Remote({
  target,
  settings,
  onSettings,
  onDisconnect
}: {
  target: Target;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onDisconnect: () => void;
}) {
  useKeepAwake();
  const { status, hostName, send } = useConnection(target);
  const [mode, setModeState] = useState<Mode>("off");
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const setMode = (m: Mode) => {
    setModeState(m);
    send({ type: "mode", mode: m });
    if (m !== "off") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Stream gyro deltas only while a pointer is visible.
  useEffect(() => {
    if (mode === "off") return;
    Gyroscope.setUpdateInterval(16);
    let last = 0;
    const sub = Gyroscope.addListener((g) => {
      const dt = last ? g.timestamp - last : 0;
      last = g.timestamp;
      const { dx, dy } = motionDelta(g, dt, settingsRef.current);
      if (dx || dy) send({ type: "move", dx, dy });
    });
    return () => sub.remove();
  }, [mode, send]);

  const key = (action: string) => {
    send({ type: "key", action });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const pointerButton = (m: Exclude<Mode, "off">, label: string) => {
    const active = mode === m;
    const handlers = settings.holdToPoint
      ? { onPressIn: () => setMode(m), onPressOut: () => setMode("off") }
      : { onPress: () => setMode(active ? "off" : m) };
    return (
      <Pressable {...handlers} style={[styles.pointer, m === "spotlight" && styles.spot, active && styles.pointerActive]}>
        <Text style={[styles.pointerText, m === "spotlight" && { color: "#111" }]}>{label}</Text>
        <Text style={[styles.hint, m === "spotlight" && { color: "#5a4300" }]}>
          {settings.holdToPoint ? "halten und zielen" : active ? "an – tippen zum Ausschalten" : "tippen"}
        </Text>
      </Pressable>
    );
  };

  if (showSettings) {
    return (
      <SettingsView settings={settings} onChange={onSettings} onClose={() => setShowSettings(false)} onDisconnect={onDisconnect} />
    );
  }

  const statusText = {
    connecting: "Verbinde …",
    connected: `Verbunden mit ${hostName}`,
    offline: "Getrennt – versuche erneut …",
    badtoken: "Code ungültig – neu koppeln"
  }[status];

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={[styles.dot, status === "connected" ? styles.dotOk : styles.dotBad]} />
        <Text style={styles.status} numberOfLines={1}>
          {statusText}
        </Text>
        <Pressable onPress={() => setShowSettings(true)} hitSlop={12}>
          <Text style={styles.gear}>⚙︎</Text>
        </Pressable>
      </View>
      {status === "badtoken" ? <Button label="Neu koppeln" primary onPress={onDisconnect} /> : null}

      <View style={styles.pointerRow}>
        {pointerButton("laser", "Laser")}
        {pointerButton("spotlight", "Spotlight")}
      </View>

      <View style={styles.navRow}>
        <Pressable style={[styles.nav, styles.prev]} onPress={() => key("prev")}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Pressable style={[styles.nav, styles.next]} onPress={() => key("next")}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.smallRow}>
        <Button label="Start" onPress={() => key("start")} style={styles.small} />
        <Button label="Schwarz" onPress={() => key("black")} style={styles.small} />
        <Button label="Esc" onPress={() => key("escape")} style={styles.small} />
      </View>
    </View>
  );
}

function SettingsView({
  settings,
  onChange,
  onClose,
  onDisconnect
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onDisconnect: () => void;
}) {
  const step = (d: number) =>
    onChange({ ...settings, sensitivity: Math.round(Math.min(8, Math.max(0.5, settings.sensitivity + d)) * 10) / 10 });
  const toggle = (k: "invertX" | "invertY" | "holdToPoint", label: string) => (
    <View style={styles.settingRow}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={settings[k]} onValueChange={(v) => onChange({ ...settings, [k]: v })} />
    </View>
  );
  return (
    <View style={styles.page}>
      <Text style={styles.title}>Einstellungen</Text>
      <View style={styles.settingRow}>
        <Text style={styles.label}>Empfindlichkeit</Text>
        <View style={styles.stepper}>
          <Button label="–" onPress={() => step(-0.5)} style={styles.stepBtn} />
          <Text style={styles.stepValue}>{settings.sensitivity.toFixed(1)}</Text>
          <Button label="+" onPress={() => step(0.5)} style={styles.stepBtn} />
        </View>
      </View>
      {toggle("holdToPoint", "Pointer nur solange gedrückt")}
      {toggle("invertX", "Horizontal umkehren")}
      {toggle("invertY", "Vertikal umkehren")}
      <Text style={[styles.muted, { marginTop: 16 }]}>
        Handy wie eine Fernbedienung halten: Display nach oben, Oberkante zeigt zur Leinwand.
      </Text>
      <Button label="Fertig" primary onPress={onClose} style={{ marginTop: 28 }} />
      <Button label="Anderen Computer koppeln" onPress={onDisconnect} />
    </View>
  );
}

function Button({ label, onPress, primary, style }: { label: string; onPress: () => void; primary?: boolean; style?: object }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, primary && styles.primary, pressed && { opacity: 0.6 }, style]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0d" },
  flex: { flex: 1 },
  page: { flex: 1, padding: 20 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700", marginBottom: 8 },
  muted: { color: "#8a8a92", fontSize: 15 },
  error: { color: "#ff6b6b", marginTop: 12 },
  input: { backgroundColor: "#17171a", color: "#fff", borderRadius: 12, padding: 14, fontSize: 17, marginTop: 10 },
  btn: { backgroundColor: "#2b2b31", borderRadius: 13, padding: 15, marginTop: 10, alignItems: "center" },
  primary: { backgroundColor: "#1677ff" },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  cancel: { position: "absolute", bottom: 40, left: 20, right: 20 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOk: { backgroundColor: "#5fd16d" },
  dotBad: { backgroundColor: "#ff6b6b" },
  status: { color: "#ddd", fontSize: 15, flex: 1 },
  gear: { color: "#aaa", fontSize: 26 },
  pointerRow: { flex: 1.3, flexDirection: "row", gap: 12, marginTop: 8 },
  pointer: { flex: 1, backgroundColor: "#c62828", borderRadius: 22, alignItems: "center", justifyContent: "center" },
  spot: { backgroundColor: "#f5a623" },
  pointerActive: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  pointerText: { color: "#fff", fontSize: 24, fontWeight: "700" },
  hint: { color: "#ffd0d0", fontSize: 13, marginTop: 6, textAlign: "center", paddingHorizontal: 8 },
  navRow: { flex: 1, flexDirection: "row", gap: 12, marginTop: 12 },
  nav: { borderRadius: 22, alignItems: "center", justifyContent: "center" },
  prev: { flex: 1, backgroundColor: "#2b2b31" },
  next: { flex: 2, backgroundColor: "#1677ff" },
  navText: { color: "#fff", fontSize: 64, fontWeight: "300", marginTop: -8 },
  smallRow: { flexDirection: "row", gap: 10, marginTop: 2 },
  small: { flex: 1 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  label: { color: "#fff", fontSize: 16, flex: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBtn: { marginTop: 0, paddingVertical: 8, paddingHorizontal: 16 },
  stepValue: { color: "#fff", fontSize: 17, width: 36, textAlign: "center" }
});
