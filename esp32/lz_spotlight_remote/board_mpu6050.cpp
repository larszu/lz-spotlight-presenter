#include "board.h"
#ifdef BOARD_MPU6050
// Plain ESP32 + MPU-6050 + two buttons. No screen: both buttons together
// switch the mode, the LED blinks the mode number (1 Laser, 2 Spotlight,
// 3 Maus, 4 Folien) and stays on while connected.
#include <Wire.h>

#define PIN_A 32
#define PIN_B 33
#define PIN_LED 2
#define MPU 0x68

static bool imuOk = false;

static void mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU); Wire.write(reg); Wire.write(val); Wire.endTransmission();
}

void boardBegin() {
  pinMode(PIN_A, INPUT_PULLUP);
  pinMode(PIN_B, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  Wire.begin(21, 22);
  Wire.beginTransmission(MPU);
  imuOk = Wire.endTransmission() == 0;
  if (imuOk) {
    mpuWrite(0x6B, 0x00);  // wake up
    mpuWrite(0x1A, 0x03);  // DLPF 44 Hz
    mpuWrite(0x1B, 0x08);  // gyro ±500 °/s → 65.5 LSB per °/s
  }
  Serial.printf("[board] ESP32 + MPU-6050: Gyro %s\n", imuOk ? "gefunden" : "NICHT gefunden (SDA 21, SCL 22?)");
}

void boardActivity() {}

void boardButtons(bool& a, bool& b) {
  a = digitalRead(PIN_A) == LOW;
  b = digitalRead(PIN_B) == LOW;
}

bool boardGyro(float& gx, float& gy, float& gz) {
  if (!imuOk) return false;
  Wire.beginTransmission(MPU); Wire.write(0x43);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(MPU, 6) != 6) return false;
  int16_t v[3];
  for (int i = 0; i < 3; i++) v[i] = (Wire.read() << 8) | Wire.read();
  gx = v[0] / 65.5f; gy = v[1] / 65.5f; gz = v[2] / 65.5f;
  return true;
}

int boardBattery() { return -1; }

Touch boardTouch(const UiState&) { return {T_NONE, LASER}; }

void boardDraw(const UiState& ui) {
  digitalWrite(PIN_LED, LOW);
  for (int i = 0; i <= ui.mode; i++) { delay(120); digitalWrite(PIN_LED, HIGH); delay(120); digitalWrite(PIN_LED, LOW); }
  digitalWrite(PIN_LED, ui.connected ? HIGH : LOW);
}
#endif
