import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  electron: process.versions.electron,
});
