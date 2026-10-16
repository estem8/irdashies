import { ipcMain } from 'electron';
import type { TelemetryRateCapHz } from '@irdashies/types';
import {
  loadTelemetryRateCapHz,
  saveTelemetryRateCapHz,
} from '../storage/telemetryRate';

export function setupTelemetryRateBridge(): void {
  loadTelemetryRateCapHz();

  ipcMain.handle('telemetryRate:get', () => loadTelemetryRateCapHz());

  ipcMain.handle('telemetryRate:save', (_, capHz: TelemetryRateCapHz) =>
    saveTelemetryRateCapHz(capHz)
  );
}
