const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lz", {
  onPointer: (cb) => ipcRenderer.on("pointer", (_e, p) => cb(p)),
  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  getState: () => ipcRenderer.invoke("get-state"),
  setDisplay: (id) => ipcRenderer.invoke("set-display", id),
  newToken: () => ipcRenderer.invoke("new-token"),
  test: (msg) => ipcRenderer.invoke("test", msg),
  askAccessibility: () => ipcRenderer.invoke("ask-accessibility")
});
