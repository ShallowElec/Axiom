const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  electron: process.versions.electron,
});
