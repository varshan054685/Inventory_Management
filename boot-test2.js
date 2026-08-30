const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
app.disableHardwareAcceleration();

// Fresh isolated data dir
const tmpData = path.join(os.tmpdir(), 'cpms-boot-' + Date.now());
fs.mkdirSync(path.join(tmpData, 'data'), { recursive: true });
process.env.APP_DATA = tmpData;

(async () => {
  const { openDatabase } = await import('./dist-electron/main.js');
})().catch(() => {});

// NOTE: main.js runs its own lifecycle; we instead use the services directly.
