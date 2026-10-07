// LZ Spotlight Presenter – hardware remote for ESP32.
// Speaks the same WebSocket protocol as the phone (hello, mode, move, key,
// button) to the desktop app on port 8787. Board-specific code lives in
// board_*.cpp; pick the board in config.h.
//
// Setup: on first start, or when both buttons are held while switching on,
// the remote opens the Wi-Fi "LZ-Spotlight-Setup". Enter the Wi-Fi, the
// 6-digit code from the desktop app and, if automatic discovery does not
// find the computer, its IP address.

#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiManager.h>
#include <WebSocketsClient.h>
#include <Preferences.h>
#include "board.h"

static const char* WIRE_MODE[] = {"laser", "spotlight", "mouse", "off"};

Preferences prefs;
WebSocketsClient ws;
String host, code, axes = "zx";
float sensitivity = 2.5f;
bool invX = false, invY = false;
UiState ui{LASER, false, false, false, "Verbinde ..."};
bool redraw = true;
uint32_t lastGyro = 0;

void send(String json) { if (ui.connected) ws.sendTXT(json); }
void sendMode(const char* m) { send(String("{\"type\":\"mode\",\"mode\":\"") + m + "\"}"); }
void sendKey(const char* k) { send(String("{\"type\":\"key\",\"action\":\"") + k + "\"}"); }
void sendClick(const char* phase) { send(String("{\"type\":\"button\",\"button\":\"left\",\"phase\":\"") + phase + "\"}"); }

void setAim(bool on) {
  if (on == ui.aiming || ui.mode == SLIDES) return;
  ui.aiming = on;
  sendMode(on ? WIRE_MODE[ui.mode] : "off");
  lastGyro = millis();
  redraw = true;
}

void setMode(Mode m) {
  setAim(false);
  ui.mode = m;
  redraw = true;
}

void onWs(WStype_t type, uint8_t* payload, size_t len) {
  if (type == WStype_CONNECTED) {
    ws.sendTXT(String("{\"type\":\"hello\",\"token\":\"") + code + "\",\"device\":\"ESP32-Fernbedienung\"}");
  } else if (type == WStype_TEXT) {
    if (strstr((char*)payload, "\"welcome\"")) { ui.connected = true; ui.info = "Verbunden"; redraw = true; }
    if (strstr((char*)payload, "\"error\"")) { ui.info = "Code falsch"; redraw = true; }
  } else if (type == WStype_DISCONNECTED && ui.connected) {
    ui.connected = false; ui.aiming = false; ui.info = "Verbinde ..."; redraw = true;
  }
}

// The desktop app announces itself as _lzspot._tcp on the local network.
bool discover() {
  if (!MDNS.begin("lz-spotlight-remote")) return false;
  int n = MDNS.queryService("lzspot", "tcp");
  if (n <= 0) return false;
  host = MDNS.address(0).toString();
  return true;
}

void runSetup(bool force) {
  WiFiManager wm;
  char sens[8];
  snprintf(sens, sizeof sens, "%.1f", sensitivity);
  WiFiManagerParameter pCode("code", "Verbindungscode (6 Ziffern, steht in der Desktop-App)", code.c_str(), 8);
  WiFiManagerParameter pHost("host", "IP des Computers (leer = automatisch finden)", prefs.getString("host", "").c_str(), 40);
  WiFiManagerParameter pSens("sens", "Empfindlichkeit (0.5 bis 8)", sens, 6);
  WiFiManagerParameter pAxes("axes", "Achsen Gier/Nick (zx Standard, z. B. yx bei hochkant)", axes.c_str(), 3);
  WiFiManagerParameter pInv("inv", "Umkehren: x, y, xy oder leer", (String(invX ? "x" : "") + (invY ? "y" : "")).c_str(), 3);
  wm.addParameter(&pCode); wm.addParameter(&pHost); wm.addParameter(&pSens); wm.addParameter(&pAxes); wm.addParameter(&pInv);
  wm.setSaveParamsCallback([&]() {
    prefs.putString("code", pCode.getValue());
    prefs.putString("host", pHost.getValue());
    prefs.putFloat("sens", atof(pSens.getValue()));
    prefs.putString("axes", pAxes.getValue());
    prefs.putString("inv", pInv.getValue());
  });
  wm.setBreakAfterConfig(true);
  ui.setup = true; ui.info = "Einrichtung"; boardDraw(ui);
  bool ok = force ? wm.startConfigPortal("LZ-Spotlight-Setup") : wm.autoConnect("LZ-Spotlight-Setup");
  if (!ok) ESP.restart();
  ui.setup = false;
}

void loadPrefs() {
  code = prefs.getString("code", "");
  host = prefs.getString("host", "");
  sensitivity = prefs.getFloat("sens", 2.5f);
  if (sensitivity < 0.5f || sensitivity > 8) sensitivity = 2.5f;
  axes = prefs.getString("axes", "zx");
  if (axes.length() != 2) axes = "zx";
  String inv = prefs.getString("inv", "");
  invX = inv.indexOf('x') >= 0;
  invY = inv.indexOf('y') >= 0;
}

float axis(char c, float gx, float gy, float gz) { return c == 'x' ? gx : c == 'y' ? gy : gz; }

void setup() {
  Serial.begin(115200);
  boardBegin();
  prefs.begin("lzspot", false);
  loadPrefs();
  bool a, b;
  boardButtons(a, b);
  runSetup(code.isEmpty() || (a && b));
  loadPrefs();
  if (host.isEmpty() && !discover()) { ui.info = "PC nicht gefunden"; boardDraw(ui); delay(3000); ESP.restart(); }
  ws.begin(host, 8787, "/");
  ws.onEvent(onWs);
  ws.setReconnectInterval(2000);
}

void loop() {
  ws.loop();

  Touch t = boardTouch(ui);
  if (t.action == T_MODE) setMode(t.mode);
  else if (t.action == T_AIM_DOWN) setAim(true);
  else if (t.action == T_AIM_UP) setAim(false);
  else if (t.action == T_PREV) sendKey("prev");
  else if (t.action == T_NEXT) sendKey("next");

  static bool lastA = false, lastB = false, combo = false;
  bool a, b;
  boardButtons(a, b);
  if (a != lastA || b != lastB) boardActivity();
  if (a && b) {
    // Both buttons: next mode (needed on boards without a screen).
    if (!combo) { combo = true; setMode((Mode)((ui.mode + 1) % MODE_COUNT)); }
  } else if (combo) {
    if (!a && !b) combo = false;
  } else if (ui.mode == SLIDES) {
    if (a && !lastA) sendKey("prev");
    if (b && !lastB) sendKey("next");
  } else {
    if (a != lastA) setAim(a);
    if (ui.mode == MOUSE) {
      if (b && !lastB) sendClick("down");
      if (!b && lastB) sendClick("up");
    } else if (b && !lastB) sendKey("next");
  }
  lastA = a; lastB = b;

  // Gyro → move while aiming. Held like a remote: screen up, top towards
  // the screen; yaw moves horizontally, pitch vertically.
  float gx, gy, gz;
  if (ui.aiming && millis() - lastGyro >= 10 && boardGyro(gx, gy, gz)) {
    float dt = min(0.05f, (millis() - lastGyro) / 1000.0f);
    lastGyro = millis();
    float yaw = axis(axes[0], gx, gy, gz), pitch = axis(axes[1], gx, gy, gz);
    float k = sensitivity / 57.3f * dt;
    float dx = fabsf(yaw) < 1.5f ? 0 : -yaw * k * (invX ? -1 : 1);
    float dy = fabsf(pitch) < 1.5f ? 0 : -pitch * k * 16.0f / 9.0f * (invY ? -1 : 1);
    if (dx != 0 || dy != 0) send(String("{\"type\":\"move\",\"dx\":") + String(dx, 5) + ",\"dy\":" + String(dy, 5) + "}");
  }

  static uint32_t lastBattery = 0;
  if (millis() - lastBattery > 60000) { lastBattery = millis(); redraw = true; }
  if (redraw) { redraw = false; boardDraw(ui); }
}
