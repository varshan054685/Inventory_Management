// E2E harness: real DB manager + real IPC handlers + real preload + real renderer.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.disableHardwareAcceleration();

// Use an isolated temp user-data dir so we don't pollute the real DB.
const tmpData = path.join(os.tmpdir(), 'cpms-e2e-' + Date.now());
process.env.APP_DATA = tmpData;
fs.mkdirSync(path.join(tmpData, 'data'), { recursive: true });

async function main() {
  const { openDatabase } = require('./dist-electron/main.js');
}
