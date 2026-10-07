#include "board.h"
#ifdef BOARD_AMOLED18
// Waveshare ESP32-S3-Touch-AMOLED-1.8. Pins from Waveshare's pin_config.h.
#include <Wire.h>
#include <Arduino_GFX_Library.h>
#include <Adafruit_XCA9554.h>
#include <SensorQMI8658.hpp>
#define XPOWERS_CHIP_AXP2101
#include <XPowersLib.h>

#define LCD_SDIO0 4
#define LCD_SDIO1 5
#define LCD_SDIO2 6
#define LCD_SDIO3 7
#define LCD_SCLK 11
#define LCD_CS 12
#define W 368
#define H 448
#define IIC_SDA 15
#define IIC_SCL 14
#define TOUCH_ADDR 0x38  // FT3168
#define EXIO_PWR 4        // PWR button on the TCA9554, high = pressed

static Arduino_DataBus* bus = new Arduino_ESP32QSPI(LCD_CS, LCD_SCLK, LCD_SDIO0, LCD_SDIO1, LCD_SDIO2, LCD_SDIO3);
static Arduino_CO5300* gfx = new Arduino_CO5300(bus, GFX_NOT_DEFINED, 0, W, H, 16, 0, 0, 0);
static Adafruit_XCA9554 expander;
static SensorQMI8658 imu;
static XPowersAXP2101 pmu;
static bool imuOk = false, pmuOk = false, touchWas = false;
static uint32_t lastActivity = 0;
static bool dimmed = false;

static const int TAB_H = 84, HEAD_H = 56;
static const uint16_t COLORS[] = {0xC145, 0xF52C, 0x2BEB, 0x1BFF};
static const char* NAMES[] = {"Laser", "Spot", "Maus", "Folien"};

void boardBegin() {
  Wire.begin(IIC_SDA, IIC_SCL);
  if (expander.begin(0x20)) {
    for (int p = 0; p < 3; p++) expander.pinMode(p, OUTPUT);  // display/touch power and reset
    for (int p = 0; p < 3; p++) expander.digitalWrite(p, LOW);
    delay(20);
    for (int p = 0; p < 3; p++) expander.digitalWrite(p, HIGH);
    expander.pinMode(EXIO_PWR, INPUT);
  }
  pinMode(0, INPUT_PULLUP);  // BOOT
  gfx->begin();
  gfx->setBrightness(200);
  imuOk = imu.begin(Wire, QMI8658_L_SLAVE_ADDRESS, IIC_SDA, IIC_SCL);
  if (imuOk) {
    imu.configGyroscope(SensorQMI8658::GYR_RANGE_512DPS, SensorQMI8658::GYR_ODR_224_2Hz, SensorQMI8658::LPF_MODE_3);
    imu.enableGyroscope();
  }
  pmuOk = pmu.begin(Wire, AXP2101_SLAVE_ADDRESS, IIC_SDA, IIC_SCL);
  if (pmuOk) pmu.enableBattDetection();
  lastActivity = millis();
  Serial.printf("[board] AMOLED 1.8: Gyro %s, Akku-Chip %s\n", imuOk ? "ok" : "fehlt", pmuOk ? "ok" : "fehlt");
}

void boardActivity() {
  lastActivity = millis();
  if (dimmed) { gfx->setBrightness(200); dimmed = false; }
}

void boardButtons(bool& a, bool& b) {
  a = digitalRead(0) == LOW;
  b = expander.digitalRead(EXIO_PWR) == HIGH;
  // AMOLED: dim after 20 s without input to save battery and the panel.
  if (!dimmed && millis() - lastActivity > 20000) { gfx->setBrightness(30); dimmed = true; }
}

bool boardGyro(float& gx, float& gy, float& gz) {
  if (!imuOk || !imu.getDataReady()) return false;
  return imu.getGyroscope(gx, gy, gz);
}

int boardBattery() { return pmuOk && pmu.isBatteryConnect() ? pmu.getBatteryPercent() : -1; }

static bool readTouch(int& x, int& y) {
  Wire.beginTransmission(TOUCH_ADDR);
  Wire.write(0x02);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(TOUCH_ADDR, 5) != 5) return false;
  uint8_t n = Wire.read() & 0x0F, xh = Wire.read(), xl = Wire.read(), yh = Wire.read(), yl = Wire.read();
  if (n == 0) return false;
  x = ((xh & 0x0F) << 8) | xl;
  y = ((yh & 0x0F) << 8) | yl;
  return true;
}

Touch boardTouch(const UiState& ui) {
  int x, y;
  bool now = readTouch(x, y);
  Touch t{T_NONE, LASER};
  static int downX = 0, downY = 0;
  if (now && !touchWas) {
    boardActivity();
    downX = x; downY = y;
    if (y >= HEAD_H && y < HEAD_H + TAB_H) {
      t = {T_MODE, (Mode)min(MODE_COUNT - 1, x * MODE_COUNT / W)};
    } else if (y >= HEAD_H + TAB_H) {
      if (ui.mode == SLIDES) t = {x < W / 2 ? T_PREV : T_NEXT, ui.mode};
      else t = {T_AIM_DOWN, ui.mode};
    }
  } else if (!now && touchWas && downY >= HEAD_H + TAB_H && ui.mode != SLIDES) {
    t = {T_AIM_UP, ui.mode};
  }
  touchWas = now;
  return t;
}

static void centered(const char* s, int cx, int cy, int size, uint16_t color) {
  int16_t x1, y1; uint16_t w, h;
  gfx->setTextSize(size);
  gfx->getTextBounds(s, 0, 0, &x1, &y1, &w, &h);
  gfx->setTextColor(color);
  gfx->setCursor(cx - w / 2, cy - h / 2);
  gfx->print(s);
}

void boardDraw(const UiState& ui) {
  gfx->fillScreen(RGB565_BLACK);
  // Header: connection and battery.
  gfx->fillCircle(24, HEAD_H / 2, 8, ui.connected ? 0x2FE6 : 0xF8A2);
  gfx->setTextSize(2);
  gfx->setTextColor(RGB565_WHITE);
  gfx->setCursor(42, HEAD_H / 2 - 8);
  gfx->print(ui.info);
  int bat = boardBattery();
  if (bat >= 0) { gfx->setCursor(W - 70, HEAD_H / 2 - 8); gfx->printf("%d%%", bat); }
  if (ui.setup) {
    centered("WLAN-Setup", W / 2, H / 2 - 40, 3, RGB565_WHITE);
    centered("Mit WLAN verbinden:", W / 2, H / 2 + 10, 2, 0xAD55);
    centered("LZ-Spotlight-Setup", W / 2, H / 2 + 44, 2, RGB565_WHITE);
    return;
  }
  // Mode tabs.
  int tw = W / MODE_COUNT;
  for (int i = 0; i < MODE_COUNT; i++) {
    gfx->fillRoundRect(i * tw + 4, HEAD_H + 4, tw - 8, TAB_H - 8, 16, i == ui.mode ? COLORS[i] : 0x2104);
    centered(NAMES[i], i * tw + tw / 2, HEAD_H + TAB_H / 2, 2, i == ui.mode && i == SPOTLIGHT ? RGB565_BLACK : RGB565_WHITE);
  }
  // Action area.
  int top = HEAD_H + TAB_H + 8, ah = H - top - 70;
  if (ui.mode == SLIDES) {
    gfx->fillRoundRect(8, top, W / 2 - 12, ah, 24, 0x3186);
    gfx->fillRoundRect(W / 2 + 4, top, W / 2 - 12, ah, 24, 0x1BFF);
    centered("<", W / 4, top + ah / 2, 8, RGB565_WHITE);
    centered(">", 3 * W / 4, top + ah / 2, 8, RGB565_WHITE);
  } else {
    gfx->fillRoundRect(8, top, W - 16, ah, 24, ui.aiming ? COLORS[ui.mode] : 0x18E3);
    centered(ui.aiming ? "zielen ..." : "halten = zielen", W / 2, top + ah / 2, 3, RGB565_WHITE);
  }
  const char* hint = ui.mode == SLIDES ? "BOOT = zurueck   PWR = weiter"
                     : ui.mode == MOUSE ? "BOOT = zielen   PWR = Klick"
                                        : "BOOT = zielen   PWR = weiter";
  centered(hint, W / 2, H - 35, 2, 0xAD55);
}
#endif
