// Electron 预加载脚本：隔离渲染进程，按需暴露 API
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
});
