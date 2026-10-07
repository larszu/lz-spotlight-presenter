// LZ Spotlight Presenter – ESP32 remote (M5Stack CoreS3 / Core2 via M5Unified).
// Touch screen picks the mode, two hardware buttons (Dual Button Unit on
// Port B, or the board's own buttons) aim and click. Speaks the same
// WebSocket protocol as the phone: hello, mode, move, key, button.
// Setup: on first start (or holding both buttons at boot) the device opens
// the Wi-Fi "LZ-Spotlight-Setup" to enter Wi-Fi, computer IP and 6-digit code.

#include <M5Unified.h>
#include <WiFiManager.h>
#include <WebSocketsClient.h>
#include <Preferences.h>

enum Mode { LASER, SPOTLIGHT, MOUSE, SLIDES };
const char* MODE_NAMES[] = {"Laser", "Spotlight", "Maus", "Folien"};
const char* MODE_WIRE[] = {"laser", "spotlight", "mouse", "off"};

Preferences prefs;
WebSocketsClient ws;
String host, code;
int port = 8787;
float sensitivity = 2.5f;
bool connected = false, aiming = false;
Mode mode = LASER;
int pinA = -1, pinB = -1;  // external buttons, active low
uint32_t lastGyro = 0, lastDraw = 0;

void send(String json) { if (connected) ws.sendTXT(json); }
void sendMode(const char* m) { send(String("{\"type\":\"mode\",\"mode\":\"") + m + "\"}"); }
void sendKey(const char* k) { send(String("{\"type\":\"key\",\"action\":\"") + k + "\"}"); }
void sendButton(const char* phase) { send(String("{\"type\":\"button\",\"button\":\"left\",\"phase\":\"") + phase + "\"}"); }

bool btnA() { return pinA >= 0 ? digitalRead(pinA) == LOW : M5.BtnA.isPressed(); }
bool btnB() { return pinB >= 0 ? digitalRead(pinB) == LOW : M5.BtnB.isPressed(); }

void draw() {
  auto& d = M5.Display;
  d.startWrite();
  d.fillScreen(TFT_BLACK);
  d.setTextColor(connected ? TFT_GREEN : TFT_RED);
  d.setTextSize(1.5);
  d.setCursor(8, 6);
  d.printf("%s  %d%%", connected ? "Verbunden" : "Verbinde ...", (int)M5.Power.getBatteryLevel());
  int w = d.width() / 2, h = (d.height() - 30) / 2;
  const uint16_t colors[] = {0xC145, 0xF52C, 0x2BEB, 0x1BFF};
  for (int i = 0; i < 4; i++) {
    int x = (i % 2) * w, y = 30 + (i / 2) * h;
    d.fillRoundRect(x + 4, y + 4, w - 8, h - 8, 12, i == mode ? colors[i] : 0x2104);
    d.setTextColor(TFT_WHITE);
    d.setTextDatum(middle_center);
    d.setTextSize(2);
    d.drawString(MODE_NAMES[i], x + w / 2, y + h / 2);
  }
  d.setTextDatum(top_left);
  d.endWrite();
}

void onWs(WStype_t type, uint8_t* payload, size_t len) {
  if (type == WStype_CONNECTED) {
    ws.sendTXT(String("{\"type\":\"hello\",\"token\":\"") + code + "\",\"device\":\"ESP32\"}");
  } else if (type == WStype_TEXT) {
    if (strstr((char*)payload, "\"welcome\"")) { connected = true; draw(); }
  } else if (type == WStype_DISCONNECTED) {
    if (connected) { connected = false; draw(); }
  }
}

void setupWifi(bool force) {
  WiFiManager wm;
  WiFiManagerParameter pHost("host", "Computer-IP", host.c_str(), 40);
  WiFiManagerParameter pCode("code", "Verbindungscode (6 Ziffern)", code.c_str(), 8);
  wm.addParameter(&pHost);
  wm.addParameter(&pCode);
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setCursor(8, 20);
  M5.Display.setTextSize(2);
  M5.Display.println("WLAN-Setup:\n\"LZ-Spotlight-Setup\"\nverbinden");
  bool ok = force ? wm.startConfigPortal("LZ-Spotlight-Setup") : wm.autoConnect("LZ-Spotlight-Setup");
  if (!ok) ESP.restart();
  if (strlen(pHost.getValue())) { host = pHost.getValue(); prefs.putString("host", host); }
  if (strlen(pCode.getValue())) { code = pCode.getValue(); prefs.putString("code", code); }
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  pinA = M5.getPin(m5::pin_name_t::port_b_in);
  pinB = M5.getPin(m5::pin_name_t::port_b_out);
  if (pinA >= 0) pinMode(pinA, INPUT_PULLUP);
  if (pinB >= 0) pinMode(pinB, INPUT_PULLUP);
  prefs.begin("lzspot", false);
  host = prefs.getString("host", "");
  code = prefs.getString("code", "");
  delay(50);
  setupWifi(host.isEmpty() || code.isEmpty() || (btnA() && btnB()));
  ws.begin(host, port, "/");
  ws.onEvent(onWs);
  ws.setReconnectInterval(2000);
  draw();
}

void loop() {
  M5.update();
  ws.loop();

  // Touch: pick a mode.
  auto t = M5.Touch.getDetail();
  if (t.wasPressed() && t.y > 30) {
    int i = (t.x >= M5.Display.width() / 2 ? 1 : 0) + (t.y >= 30 + (M5.Display.height() - 30) / 2 ? 2 : 0);
    if (aiming) { sendMode("off"); aiming = false; }
    mode = (Mode)i;
    draw();
  }

  static bool lastA = false, lastB = false;
  bool a = btnA(), b = btnB();
  if (mode == SLIDES) {
    if (a && !lastA) sendKey("prev");
    if (b && !lastB) sendKey("next");
  } else {
    // A held = aim; B = next slide, or left mouse button in Maus mode.
    if (a && !lastA) { aiming = true; sendMode(MODE_WIRE[mode]); lastGyro = millis(); }
    if (!a && lastA) { aiming = false; sendMode("off"); }
    if (mode == MOUSE) {
      if (b && !lastB) sendButton("down");
      if (!b && lastB) sendButton("up");
    } else if (b && !lastB) sendKey("next");
  }
  lastA = a; lastB = b;

  // Gyro → move, ~100 Hz while aiming. Held like a remote, screen up.
  if (aiming && millis() - lastGyro >= 10 && M5.Imu.update()) {
    float gx, gy, gz;
    M5.Imu.getGyro(&gx, &gy, &gz);  // deg/s
    float dt = (millis() - lastGyro) / 1000.0f;
    lastGyro = millis();
    float k = sensitivity / 57.3f * dt;
    float dx = fabsf(gz) < 1.5f ? 0 : -gz * k;
    float dy = fabsf(gx) < 1.5f ? 0 : -gx * k * 16.0f / 9.0f;
    if (dx != 0 || dy != 0) send(String("{\"type\":\"move\",\"dx\":") + String(dx, 5) + ",\"dy\":" + String(dy, 5) + "}");
  }

  if (millis() - lastDraw > 30000) { lastDraw = millis(); draw(); }  // battery refresh
}
