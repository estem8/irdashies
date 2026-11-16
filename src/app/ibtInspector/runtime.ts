import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import type { OverlayManager } from '../overlayManager';
import type { ChannelBus } from '../bridge/channelBridge';
import {
  getCurrentBridge,
  reconfigureTelemetrySource,
} from '../bridge/iracingSdk/setup';
import { isTapeReplayCommand } from '../bridge/tapeReplayBridge';
import { IbtInspectorService } from './service';
import { RendererHeapSampler } from './rendererHeapSampler';
import { collectMainGarbage, linuxPrivateMemoryMiB } from './memoryCheckpoint';
import logger from '../logger';

/** Loaded only by the explicit CLI environment flag, never normal app startup. */
export function setupMemoryDiagnostics(
  manager: OverlayManager,
  bus: ChannelBus
) {
  const keys = [
    'IRDASHIES_TELEMETRY_REPLAY',
    'IRDASHIES_TELEMETRY_REPLAY_SPEED',
    'IRDASHIES_TELEMETRY_REPLAY_EVERY_FRAME',
    'IRDASHIES_TELEMETRY_REPLAY_PAUSED',
    'IRDASHIES_TELEMETRY_REPLAY_LOOP',
    'PERF_METRICS',
    'PERF_METRICS_COLLECTION',
    'PERF_REPORT_INTERVAL_MS',
    'PERF_SCENARIO',
    'PERF_RUN_ID',
  ];
  let previous: Record<string, string | undefined> | undefined;
  let closing = false;
  const restore = () => {
    if (previous)
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) Reflect.deleteProperty(process.env, key);
        else process.env[key] = value;
      }
    previous = undefined;
  };
  const service = new IbtInspectorService({
    directory: path.join(app.getPath('documents'), 'iRacing', 'telemetry'),
    workDirectory: path.join(app.getPath('userData'), 'memory-diagnostics'),
    getPlayback: () => getCurrentBridge()?.getTapeReplayStatus?.() ?? null,
    command: (command) => {
      const bridge = getCurrentBridge();
      if (!bridge?.controlTapeReplay) throw new Error('Replay is not active');
      bridge.controlTapeReplay(command);
    },
    collectMainGarbage,
    rendererHeapSampler: new RendererHeapSampler(() =>
      BrowserWindow.getAllWindows()
    ),
    getProcessMemorySnapshot: () =>
      Promise.all(
        app.getAppMetrics().map(async (metric) => ({
          key: `${metric.pid}:${metric.creationTime}`,
          pid: metric.pid,
          creationTime: metric.creationTime,
          type: metric.type,
          name: metric.name || undefined,
          cpuPercent: null,
          cpuTimeMsPerSecond: null,
          memoryMB: metric.memory.workingSetSize / 1024,
          privateMemoryMB:
            typeof metric.memory.privateBytes === 'number'
              ? metric.memory.privateBytes / 1024
              : process.platform === 'linux'
                ? await linuxPrivateMemoryMiB(metric.pid)
                : null,
        }))
      ),
    switchSource: async (tape, speed) => {
      if (!tape && !previous) return;
      if (closing) {
        if (tape) throw new Error('Diagnostic controller is closing');
        getCurrentBridge()?.stop();
        restore();
        return;
      }
      await reconfigureTelemetrySource(manager, bus, () => {
        if (tape) {
          previous ??= Object.fromEntries(
            keys.map((key) => [key, process.env[key]])
          );
          Object.assign(process.env, {
            IRDASHIES_TELEMETRY_REPLAY: tape,
            IRDASHIES_TELEMETRY_REPLAY_SPEED: String(speed ?? 1),
            IRDASHIES_TELEMETRY_REPLAY_EVERY_FRAME: '1',
            IRDASHIES_TELEMETRY_REPLAY_PAUSED: '1',
            IRDASHIES_TELEMETRY_REPLAY_LOOP: '0',
            PERF_METRICS: '1',
            PERF_METRICS_COLLECTION: 'on',
            PERF_REPORT_INTERVAL_MS: '1000',
            PERF_SCENARIO: 'memory-diagnostics',
            PERF_RUN_ID: `memory-${Date.now()}`,
          });
        } else restore();
      });
    },
  });
  const controller = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    width: 1,
    height: 1,
    webPreferences: {
      preload: path.join(__dirname, 'memoryPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  controller.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  controller.webContents.on('will-navigate', (event) => event.preventDefault());
  controller.webContents.on('will-redirect', (event) => event.preventDefault());
  const channels: string[] = [];
  const handle = (
    channel: string,
    handler: (...args: unknown[]) => unknown
  ) => {
    channels.push(channel);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (event.sender !== controller.webContents || closing)
        throw new Error('Diagnostic controller only');
      return handler(...args);
    });
  };
  handle('memoryDiagnostics:version', () => app.getVersion());
  handle(
    'memoryDiagnostics:playback',
    () => getCurrentBridge()?.getTapeReplayStatus?.() ?? null
  );
  handle('memoryDiagnostics:status', () => service.status());
  handle('memoryDiagnostics:load', (name, speed) => service.load(name, speed));
  handle('memoryDiagnostics:command', (command) => {
    if (!isTapeReplayCommand(command))
      throw new Error('Invalid tape replay command');
    return service.command(command);
  });
  handle('memoryDiagnostics:startCapture', () => service.startCapture());
  handle('memoryDiagnostics:stopCapture', () => service.stopCapture());
  handle('memoryDiagnostics:checkpoint', () => service.checkpointMemory());
  handle('memoryDiagnostics:stop', () => service.stop());
  void controller
    .loadURL('about:blank#ibt-memory-controller')
    .catch((error) => logger.error('Could not load memory controller', error));
  return async () => {
    closing = true;
    for (const channel of channels) ipcMain.removeHandler(channel);
    try {
      await service.stop();
    } finally {
      if (!controller.isDestroyed()) controller.destroy();
    }
  };
}
