# LZ Spotlight hardware remote (ESP32)

An ESP32 with a gyro instead of the phone: aim with the button held, the
laser, spotlight or mouse follows. It joins the Wi-Fi and talks to the desktop
app exactly like the phone.

## Supported hardware

| | Waveshare ESP32-S3-Touch-AMOLED-1.8 | Any ESP32 + MPU-6050 |
|---|---|---|
| Screen | 1.8" AMOLED touch: mode tabs, aim area, ‹ › | none – LED blinks the mode |
| Gyro | QMI8658 (on board) | MPU-6050 on SDA 21, SCL 22, 3.3 V |
| Buttons | BOOT and PWR (on board) | two push buttons from GPIO 32 / 33 to GND |
| Battery | 3.7 V LiPo, charging on board | your own |

The board is chosen automatically: ESP32-S3 builds the AMOLED version, a
classic ESP32 the MPU-6050 version (override in `config.h`).

## Controls

| | Button 1 (BOOT / GPIO 32) | Button 2 (PWR / GPIO 33) |
|---|---|---|
| Laser, Spotlight | hold = aim | next slide |
| Maus | hold = aim with the real cursor | left click (hold = drag) |
| Folien | previous slide | next slide |
| both together | next mode | |

On the AMOLED the touch screen picks the mode; holding the large area aims as
well, in *Folien* its halves are ‹ and ›. The screen dims after 20 s.

Hold the remote like the phone: screen up, top edge towards the screen.

## Setup

1. Start the desktop app.
2. Switch the remote on. On first start (or with both buttons held while
   switching on) it opens the Wi-Fi **LZ-Spotlight-Setup**. Join it with the
   phone; the setup page opens.
3. Choose your Wi-Fi, enter the 6-digit **Verbindungscode** from the desktop
   app, save.

The remote finds the computer by itself (mDNS, `_lzspot._tcp`). If the network
blocks that, enter the computer's IP on the setup page. The same page sets
sensitivity, axes and inversion – e.g. `yx` when the MPU-6050 is mounted
upright.

## Build and flash

Arduino CLI with the ESP32 core 3.x and these libraries: WiFiManager,
WebSockets (Links2004), GFX Library for Arduino, SensorLib, XPowersLib,
Adafruit XCA9554.

```bash
# Waveshare AMOLED 1.8
arduino-cli compile --upload -p <port> \
  --fqbn "esp32:esp32:esp32s3:CDCOnBoot=cdc,PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB" \
  esp32/lz_spotlight_remote

# ESP32 + MPU-6050
arduino-cli compile --upload -p <port> \
  --fqbn "esp32:esp32:esp32:PartitionScheme=huge_app" esp32/lz_spotlight_remote
```
