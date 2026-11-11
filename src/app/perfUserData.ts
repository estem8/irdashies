import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// This module must be the first dependency imported by main.ts. Storage modules
// read app.getPath('userData') during evaluation, before app.whenReady().
if (process.env.PERF_METRICS === '1') {
  const requestedPath = process.env.PERF_USER_DATA_DIR?.trim();
  if (requestedPath) {
    const userDataPath = path.resolve(requestedPath);
    mkdirSync(userDataPath, { recursive: true });
    app.setPath('userData', userDataPath);
  }
}
