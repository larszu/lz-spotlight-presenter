const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onCommand(callback) {
    const listener = (_event, message) => {
      callback(message);
    };

    ipcRenderer.on("presenter-command", listener);

    return () => {
      ipcRenderer.removeListener("presenter-command", listener);
    };
  }
});
