import type { TelemetryRateCapHz } from '@irdashies/types';
import {
  normalizeTelemetryRateCap,
  setTelemetryRateCapHz,
} from '../telemetryRateCap';
import { readData, writeData } from './storage';

const STORAGE_KEY = 'telemetryRateCapHz';

/** Loads the stored cap into the running loop's setting. */
export function loadTelemetryRateCapHz(): TelemetryRateCapHz {
  return setTelemetryRateCapHz(readData<unknown>(STORAGE_KEY));
}

export function saveTelemetryRateCapHz(value: unknown): TelemetryRateCapHz {
  const capHz = setTelemetryRateCapHz(normalizeTelemetryRateCap(value));
  writeData(STORAGE_KEY, capHz);
  return capHz;
}
