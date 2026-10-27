const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('viewer', {
  load: (file) => ipcRenderer.invoke('load', file),
  pathOf: (f) => webUtils.getPathForFile(f),
});
