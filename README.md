# LZ Spotlight Presenter

Turns your phone into a presenter remote with a motion-controlled laser pointer and spotlight. The desktop app draws the pointer as a transparent overlay on top of any presentation (PowerPoint, Keynote, Google Slides, PDF) and forwards slide keys to the app in front.

**Free & open source · macOS + Windows desktop · iOS + Android remote · local Wi-Fi, no cloud, no account**

## What it does

| On the phone | On the computer |
|---|---|
| **Laser** – hold and aim, the phone's gyroscope moves a red dot | Glowing laser dot with a short trail |
| **Spotlight** – hold and aim | Screen dims, a bright circle follows the phone |
| **‹ / ›** – previous / next slide | Left / Right arrow key |
| **Start · Schwarz · Esc** | Start show (F5 on Windows, ⌘⇧↩ in PowerPoint for Mac) · B (black screen) · Esc |

Further details:

- Pairing by QR code (or IP address + 6-digit code), reconnects automatically.
- Choose which screen the overlay sits on; by default the external screen.
- Phone settings: sensitivity, invert axes, hold-to-point or tap-to-toggle.
- The phone stays awake while the remote is open.
- HTTP API for Bitfocus Companion / Stream Deck.

## Install

### Desktop

Download the installer for your system from [Releases](https://github.com/larszu/lz-spotlight-presenter/releases):

- **macOS:** `.dmg`. The app is not notarised: on first launch right-click → *Open*. Then allow *System Settings → Privacy & Security → Accessibility* for **LZ Spotlight Presenter** – required for slide keys, the overlay works without it. The app shows a button that opens the setting.
- **Windows:** `Setup.exe`. On first launch allow access for *private networks* in the firewall prompt.

### Phone

The app is built with Expo. Until it is in the stores, run it with **Expo Go**:

```bash
cd mobile
npm install
npx expo start
```

Scan the terminal QR code with the iPhone camera (or the Expo Go app on Android). Phone and computer must be on the same Wi-Fi.

Standalone builds: `npx eas-cli@latest build --platform ios|android` (needs an Expo account; iOS additionally an Apple Developer account).

## Usage

1. Start the desktop app. It shows a QR code and a 6-digit code.
2. Open the phone app → *QR-Code scannen*.
3. Hold the phone like a remote: screen up, top edge pointing at the screen.
4. Hold **Laser** or **Spotlight** and aim. The pointer starts in the centre of the screen every time.

*Neuer Code* in the desktop app creates a new code and disconnects all paired phones.

## Companion / Stream Deck

Use the *Generic HTTP* module with GET requests:

```
http://<computer-ip>:8787/api/<command>?token=<code>
```

Commands: `next`, `prev`, `black`, `white`, `escape`, `start`, `laser`, `spotlight`, `off`.

## How it works

```
Phone app (Expo)                     Desktop app (Electron)
gyroscope ─ move {dx,dy} ─┐          ┌─ overlay window (transparent, click-through,
buttons ── mode / key ────┼─ WS ────▶│  always on top) draws laser / spotlight
                          │  :8787   └─ keystrokes: osascript (macOS) /
Companion ── HTTP GET ────┘             PowerShell keybd_event (Windows)
```

Messages are JSON over WebSocket. The first message must be `{"type":"hello","token":"123456"}`; after that:

| Message | Meaning |
|---|---|
| `{"type":"mode","mode":"laser"\|"spotlight"\|"off"}` | show / hide the pointer |
| `{"type":"move","dx":0.01,"dy":-0.004}` | move by a fraction of screen width / height |
| `{"type":"key","action":"next"}` | `next`, `prev`, `black`, `white`, `escape`, `start` |

The desktop app uses no native Node modules, so it builds for both platforms from one machine.

## Development

```bash
# Desktop
cd desktop && npm install
npm start          # run
npm test           # unit tests
npm run dist:mac   # .dmg  (dist:win for the Windows installer)

# Phone
cd mobile && npm install
npm test && npm run typecheck
npx expo start
```

Releases: push a tag `v1.2.3`; GitHub Actions builds the macOS and Windows installers and attaches them to the release.

```
desktop/   Electron app: server, overlay, keystrokes, pairing window
mobile/    Expo app (iOS + Android): pairing, remote, settings
```

## License

MIT · Lars Zumpe
