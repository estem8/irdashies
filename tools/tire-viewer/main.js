const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { replay } = require('./replay.cjs');

ipcMain.handle('load', async (_e, file) => {
  let target = file;
  if (!target) {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'iRacing telemetry', extensions: ['ibt'] }], properties: ['openFile'] });
    if (r.canceled) return null;
    target = r.filePaths[0];
  }
  try {
    return { ok: replay(target) };
  } catch (err) {
    return { error: String(err && err.stack ? err.stack : err) };
  }
});

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1500, height: 950, backgroundColor: '#0f172a', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
