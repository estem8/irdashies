import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import logger from '../logger';
import type { TireCalibration } from '../processors/tireCalibration';

const FILE_NAME = 'tireCalibration.json';
const DATA_VERSION = 1;
/** Car and track pairs kept; the least recently updated go first. */
const MAX_ENTRIES = 200;
const CORNERS = ['lf', 'rf', 'lr', 'rr'] as const;

interface TireCalibrationFile {
  version: typeof DATA_VERSION;
  entries: Record<string, TireCalibration>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasGains = (gains: unknown): gains is TireCalibration['gains'] =>
  isRecord(gains) && CORNERS.every((corner) => Number.isFinite(gains[corner]));

const isCalibration = (value: unknown): value is TireCalibration =>
  isRecord(value) &&
  typeof value.model === 'string' &&
  Number.isFinite(value.stops) &&
  Number.isFinite(value.updatedAt) &&
  hasGains(value.gains);

let cache: TireCalibrationFile | undefined;

const filePath = () => path.join(app.getPath('userData'), FILE_NAME);

const read = (): TireCalibrationFile => {
  if (cache) return cache;
  cache = { version: DATA_VERSION, entries: {} };
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    if (
      isRecord(parsed) &&
      parsed.version === DATA_VERSION &&
      isRecord(parsed.entries)
    ) {
      for (const [key, value] of Object.entries(parsed.entries)) {
        if (isCalibration(value)) cache.entries[key] = value;
      }
    }
  } catch (error) {
    // A missing file is the normal first run.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('[TireCalibration] unreadable, starting empty', error);
    }
  }
  return cache;
};

export const loadTireCalibration = (key: string): TireCalibration | undefined =>
  read().entries[key];

export const saveTireCalibration = (
  key: string,
  calibration: TireCalibration
): void => {
  const data = read();
  // Rebuilt rather than deleted from: the newest MAX_ENTRIES stay.
  data.entries = Object.fromEntries(
    Object.entries({ ...data.entries, [key]: calibration })
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ENTRIES)
  );
  try {
    fs.writeFileSync(filePath(), JSON.stringify(data));
  } catch (error) {
    logger.warn('[TireCalibration] could not save', error);
  }
};
