/**
 * Developer-only cap on the iRacing telemetry loop rate, for A/B measurements.
 * 0 means no cap: the loop follows what the visible widgets ask for.
 */
export const TELEMETRY_RATE_CAP_OPTIONS = [0, 60, 30, 20, 10, 5] as const;

export type TelemetryRateCapHz = (typeof TELEMETRY_RATE_CAP_OPTIONS)[number];

export interface TelemetryRateBridge {
  getCapHz: () => Promise<TelemetryRateCapHz>;
  saveCapHz: (capHz: TelemetryRateCapHz) => Promise<TelemetryRateCapHz>;
}
