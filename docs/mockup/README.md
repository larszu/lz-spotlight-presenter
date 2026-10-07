# Remote rendering

`scene.py` builds the ESP32 remote in Blender (Cycles) and renders
`docs/screenshots/esp32-remote.jpg`. The screen shows `screen-ui.html`,
captured as a PNG first.

```bash
blender -b --factory-startup -P docs/mockup/scene.py -- screen.png out.png 128 1.0
```

Arguments: screen image, output, samples, resolution scale.

The demo animation `docs/demo.gif` is a [HyperFrames](https://github.com/heygen-com/hyperframes)
composition in `docs/animation/` (place the rendering there as `remote.png`):

```bash
npx hyperframes render docs/animation --format gif --fps 15 -o docs/demo.gif
```
