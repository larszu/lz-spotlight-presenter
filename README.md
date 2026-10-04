# 🎯 LZ Spotlight Presenter

Professional presenter control software for live presentations — turning an iPhone into a wireless motion controller for a native desktop overlay.

Control a presentation pointer and spotlight from your phone using its built-in motion sensors, while a native macOS overlay renders the result directly on top of any presentation output.

**Free & open-source · macOS native overlay · iPhone controller · LAN/Wi-Fi**

---

## ✨ Overview

LZ Spotlight Presenter is a lightweight presenter control platform designed for professional live-production environments.

The system combines:

* 📱 iPhone motion sensors
* 🌐 Secure WebSocket communication
* 🖥️ Native Electron overlay rendering
* 🎯 Motion-controlled presentation pointer
* 🔦 Spotlight mode for highlighting content
* 🖥️ Multi-display overlay support

The phone acts as the controller while the Mac handles the actual presentation overlay.

Unlike browser-only presenter tools, the visible overlay is rendered by a native desktop host and can therefore be displayed independently across connected screens.

---

## 📸 Screenshots

*Add screenshots here*

* iPhone controller
* Pointer mode
* Spotlight mode
* Native overlay
* Multi-display setup

---

## ✨ Core Features

### 🎯 Motion Pointer

Use the iPhone's built-in orientation sensors to control a presentation pointer.

* Real-time motion tracking
* Smooth pointer movement
* Adjustable horizontal sensitivity
* Adjustable vertical sensitivity
* Persistent sensitivity settings
* No external hardware required

The pointer uses the phone's orientation changes rather than requiring a physical mouse or remote.

---

### 🔦 Spotlight Mode

Highlight a specific area of the presentation without hiding the entire image.

* Large circular focus area
* Dimmed surrounding area
* Pointer-controlled position
* Native overlay rendering
* Pointer and spotlight are mutually exclusive

The spotlight follows the same motion-controlled positioning system as the presenter pointer.

---

### 📱 iPhone Controller

The controller runs directly in the phone's browser.

No native iOS application is required.

The controller provides:

* Pointer enable/disable
* Spotlight enable/disable
* Motion sensor status
* Sensitivity controls
* Persistent local settings
* Secure HTTPS connection
* WebSocket communication

The phone only controls the presentation. Rendering happens on the computer.

---

### 🖥️ Native macOS Overlay

The visible presentation layer runs as a native Electron application.

The overlay:

* Has no window frame
* Is transparent
* Stays above presentation applications
* Ignores mouse input
* Supports multiple displays
* Can span independent presentation outputs
* Runs independently from the phone browser

This makes it suitable for real-world presentation and live-event environments.

---

### 🖥️ Multi-Display Support

The native overlay host automatically creates an overlay window for every connected display.

When a display is added or removed, the overlay host updates automatically.

This allows the system to work with:

* Presentation laptops
* Confidence monitors
* Extended desktop outputs
* Multiple presentation screens
* Live-production display systems

---

### 🔐 Secure Local Communication

Communication between the phone, server and native overlay uses HTTPS and WebSockets.

The development setup uses locally trusted certificates through `mkcert`.

Architecture:

```text
iPhone
   │
   │ HTTPS / WSS
   ▼
Presenter Server
   │
   │ WebSocket
   ▼
Native Overlay Host
   │
   ├── Display 1
   ├── Display 2
   └── Display N
```

The server acts as the central message transport.

---

## 🧠 Architecture

The current implementation is deliberately split into three components.

### Phone Controller

```text
phone/
└── index.html
```

Responsible for:

* Motion sensor input
* User controls
* Pointer movement
* Spotlight control
* Sensitivity settings
* WebSocket messages

---

### Presenter Server

```text
server/
├── server.js
└── certs/
```

Responsible for:

* HTTPS
* Static file hosting
* WebSocket connections
* Message broadcasting
* Connecting controllers and overlay clients

---

### Native Overlay Host

```text
overlay-host/
├── main.js
├── preload.cjs
└── overlay.html
```

Responsible for:

* Native Electron windows
* Display detection
* Transparent overlays
* Pointer rendering
* Spotlight rendering
* WebSocket connection
* IPC communication

The renderer itself does not need Node.js access. Communication with Electron is exposed through a restricted preload bridge.

---

## 🔄 Control Flow

A typical pointer movement looks like this:

```text
iPhone motion sensor
        │
        ▼
DeviceOrientation
        │
        ▼
Motion delta calculation
        │
        ▼
POINTER_MOVE
        │
        ▼
WebSocket
        │
        ▼
Presenter Server
        │
        ▼
Native Overlay Host
        │
        ▼
Electron IPC
        │
        ▼
Overlay Renderer
        │
        ▼
Pointer / Spotlight
```

The phone therefore does not need to know anything about the presentation application itself.

---

## 📡 Protocol

The system uses small JSON messages over WebSocket.

Example:

```json
{
  "type": "POINTER_MOVE",
  "payload": {
    "dx": 1.2,
    "dy": -0.7,
    "alpha": 124.5,
    "beta": 18.2,
    "gamma": 2.1
  }
}
```

Mode changes use:

```json
{
  "type": "MODE_CHANGE",
  "payload": {
    "mode": "SPOTLIGHT"
  }
}
```

Pointer control uses:

```text
POINTER_ENABLE
POINTER_DISABLE
POINTER_MOVE
```

Other system commands can be added without changing the transport layer.

---

## ⚙️ Tech Stack

| Layer            | Technology                       |
| ---------------- | -------------------------------- |
| Controller       | HTML / CSS / JavaScript          |
| Motion sensors   | DeviceOrientation API            |
| Transport        | WebSocket                        |
| Secure transport | HTTPS / WSS                      |
| Server           | Node.js + Express                |
| WebSocket server | `ws`                             |
| Native host      | Electron                         |
| Desktop overlay  | Electron BrowserWindow           |
| IPC              | Electron preload / contextBridge |
| Certificates     | mkcert                           |

---

## 🚀 Getting Started

### Requirements

* macOS
* Node.js
* npm
* iPhone with motion sensors
* iPhone and Mac on the same network

For development, `mkcert` is used to create a locally trusted HTTPS certificate.

---

### 1. Install dependencies

Start the server:

```bash
cd /Users/larszumpe/presenter-overlay-test/server
npm install
```

Install the native overlay host:

```bash
cd /Users/larszumpe/presenter-overlay-test/overlay-host
npm install
```

---

### 2. Create local certificates

Install `mkcert`:

```bash
brew install mkcert
mkcert -install
```

Create the certificate directory:

```bash
mkdir -p /Users/larszumpe/presenter-overlay-test/server/certs
```

Generate a certificate for the local machine:

```bash
cd /Users/larszumpe/presenter-overlay-test/server/certs

mkcert \
  -key-file presenter-key.pem \
  -cert-file presenter.pem \
  192.168.0.134 \
  localhost \
  127.0.0.1
```

---

### 3. Start the server

```bash
cd /Users/larszumpe/presenter-overlay-test/server
npm start
```

The server listens on:

```text
https://0.0.0.0:8787
```

On the Mac:

```text
https://localhost:8787/phone/
```

On the iPhone:

```text
https://<MAC-IP>:8787/phone/
```

Replace `<MAC-IP>` with the IP address of the computer running the server.

---

### 4. Start the native overlay

In another terminal:

```bash
cd /Users/larszumpe/presenter-overlay-test/overlay-host
npm start
```

The native overlay host automatically detects connected displays.

---

## 📱 Using the Controller

Open the controller on the iPhone.

### Pointer

Press **Pointer aktivieren**.

Move the phone to control the pointer.

The pointer sensitivity can be adjusted independently for horizontal and vertical movement.

### Spotlight

Press **Spotlight aktivieren**.

The pointer is replaced by a large spotlight that follows the same motion control.

Pointer and spotlight cannot be active simultaneously.

### Disable

Disabling the active mode removes the overlay control.

---

## 🧩 Project Structure

```text
lz-spotlight-presenter/
│
├── phone/
│   └── index.html
│
├── overlay/
│   └── index.html
│
├── overlay-host/
│   ├── main.js
│   ├── preload.cjs
│   ├── overlay.html
│   └── package.json
│
├── server/
│   ├── server.js
│   ├── package.json
│   └── certs/
│
├── .gitignore
└── README.md
```

---

## 👤 Author

Built and maintained by **Lars Zumpe**

---

## 📄 License

MIT

---
