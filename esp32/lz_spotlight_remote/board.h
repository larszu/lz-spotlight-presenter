#pragma once
#include <Arduino.h>
#include "config.h"

enum Mode { LASER, SPOTLIGHT, MOUSE, SLIDES, MODE_COUNT };

struct UiState {
  Mode mode;
  bool connected;
  bool aiming;
  bool setup;        // Wi-Fi setup portal open
  const char* info;  // status line
};

// What a touch on the screen means.
enum TouchAction { T_NONE, T_MODE, T_AIM_DOWN, T_AIM_UP, T_PREV, T_NEXT };
struct Touch { TouchAction action; Mode mode; };

void boardBegin();
void boardButtons(bool& a, bool& b);          // a = aim / prev, b = click / next
bool boardGyro(float& gx, float& gy, float& gz);  // deg/s
Touch boardTouch(const UiState& ui);
void boardDraw(const UiState& ui);
int boardBattery();                             // percent, -1 unknown
void boardActivity();                           // wake display from dimming
