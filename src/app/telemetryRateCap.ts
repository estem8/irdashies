import {
  TELEMETRY_RATE_CAP_OPTIONS,
  type TelemetryRateCapHz,
} from '@irdashies/types';

let capHz: TelemetryRateCapHz = 0;

/** Anything that is not a listed option means no cap. */
export function normalizeTelemetryRateCap(value: unknown): TelemetryRateCapHz {
  return TELEMETRY_RATE_CAP_OPTIONS.find((option) => option === value) ?? 0;
}

export function getTelemetryRateCapHz(): TelemetryRateCapHz {
  return capHz;
}

export function setTelemetryRateCapHz(value: unknown): TelemetryRateCapHz {
  capHz = normalizeTelemetryRateCap(value);
  return capHz;
}

/** Lowers the wanted loop rate to the cap; 0 leaves it unchanged. */
export function applyTelemetryRateCap(wantedHz: number, cap: number): number {
  return cap > 0 ? Math.min(wantedHz, cap) : wantedHz;
}
