import type {
  PitServiceSnapshot,
  SessionLifecycleEvent,
  Telemetry,
} from '@irdashies/types';
import type { TelemetryProcessor } from './TelemetryProcessor';

const numberValue = (frame: Telemetry, key: string): number | undefined => {
  const current = (
    frame as unknown as Record<string, { value?: unknown[] } | undefined>
  )[key]?.value?.[0];
  return typeof current === 'number' ? current : undefined;
};

/** Rounds to 1 / `perUnit`, e.g. 10 for tenths. */
const round = (value: number | undefined, perUnit: number) =>
  value === undefined ? undefined : Math.round(value * perUnit) / perUnit;

type DataKey = Exclude<keyof PitServiceSnapshot, 'version'>;

export class PitServiceProcessor implements TelemetryProcessor<PitServiceSnapshot> {
  readonly channel = 'pit-service.snapshot';
  readonly tickRateHz = 5;

  private readonly latest: PitServiceSnapshot = { version: 0 };

  init(): void {
    // Everything comes from telemetry.
  }

  onFrame(frame: Telemetry): void {
    const changes = [
      this.set('flags', numberValue(frame, 'PitSvFlags')),
      this.set('plannedFuel', round(numberValue(frame, 'PitSvFuel'), 10)),
      this.set('plannedCompound', numberValue(frame, 'PitSvTireCompound')),
      this.set('currentCompound', numberValue(frame, 'PlayerTireCompound')),
      this.set('pitStatus', numberValue(frame, 'PlayerCarPitSvStatus')),
      this.set('trackWetness', numberValue(frame, 'TrackWetness')),
      this.set(
        'precipitation',
        round(numberValue(frame, 'Precipitation'), 100)
      ),
      this.set('fuelLevel', round(numberValue(frame, 'FuelLevel'), 10)),
      this.set('fuelLevelPct', round(numberValue(frame, 'FuelLevelPct'), 100)),
    ];
    if (changes.includes(true)) this.latest.version += 1;
  }

  onLifecycle(event: SessionLifecycleEvent): void {
    if (event.type === 'enter') return;
    this.latest.flags = undefined;
    this.latest.plannedFuel = undefined;
    this.latest.plannedCompound = undefined;
    this.latest.currentCompound = undefined;
    this.latest.pitStatus = undefined;
    this.latest.trackWetness = undefined;
    this.latest.precipitation = undefined;
    this.latest.fuelLevel = undefined;
    this.latest.fuelLevelPct = undefined;
    this.latest.version += 1;
  }

  snapshot(): PitServiceSnapshot {
    return this.latest;
  }

  private set(key: DataKey, value: number | undefined): boolean {
    if (this.latest[key] === value) return false;
    this.latest[key] = value;
    return true;
  }
}
