import { describe, expect, it } from 'vitest';
import type { Telemetry } from '@irdashies/types';
import { PitServiceProcessor } from './PitServiceProcessor';

const frame = (values: Record<string, number>): Telemetry =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { value: [value] }])
  ) as unknown as Telemetry;

describe('PitServiceProcessor', () => {
  it('projects the requested services, tires and fuel', () => {
    const processor = new PitServiceProcessor();
    processor.onFrame(
      frame({
        PitSvFlags: 0x0011,
        PitSvFuel: 20,
        PitSvTireCompound: 1,
        PlayerTireCompound: 0,
        FuelLevel: 31.2349,
        FuelLevelPct: 0.62468,
        PlayerCarPitSvStatus: 1,
        TrackWetness: 5,
        Precipitation: 0.6049,
      })
    );
    expect(processor.snapshot()).toMatchObject({
      flags: 0x0011,
      plannedFuel: 20,
      plannedCompound: 1,
      currentCompound: 0,
      fuelLevel: 31.2,
      fuelLevelPct: 0.62,
      pitStatus: 1,
      trackWetness: 5,
      precipitation: 0.6,
    });
  });

  it('bumps the version only when something visible changes', () => {
    const processor = new PitServiceProcessor();
    processor.onFrame(frame({ FuelLevel: 31.21 }));
    const { version } = processor.snapshot();
    processor.onFrame(frame({ FuelLevel: 31.24 }));
    expect(processor.snapshot().version).toBe(version);
    processor.onFrame(frame({ FuelLevel: 31.0 }));
    expect(processor.snapshot().version).toBe(version + 1);
  });

  it('clears on disconnect', () => {
    const processor = new PitServiceProcessor();
    processor.onFrame(frame({ PitSvFlags: 1 }));
    processor.onLifecycle({ type: 'disconnect' });
    expect(processor.snapshot().flags).toBeUndefined();
  });
});
