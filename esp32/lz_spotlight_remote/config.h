#pragma once
// Pick the hardware. Set by the build (-D) or here.
//   BOARD_AMOLED18  Waveshare ESP32-S3-Touch-AMOLED-1.8: touch screen, QMI8658
//                   gyro, BOOT + PWR buttons, battery via AXP2101.
//   BOARD_MPU6050   any ESP32 + MPU-6050 (SDA 21, SCL 22) + two buttons to GND
//                   on GPIO 32 / 33; no screen, status on the LED (GPIO 2).
#if !defined(BOARD_AMOLED18) && !defined(BOARD_MPU6050)
#if defined(CONFIG_IDF_TARGET_ESP32S3)
#define BOARD_AMOLED18
#else
#define BOARD_MPU6050
#endif
#endif
