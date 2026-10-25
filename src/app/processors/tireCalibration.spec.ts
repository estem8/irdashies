import { describe, expect, it } from 'vitest';
import { startingGains, type TireCalibration } from './tireCalibration';
import { MODEL_VERSION } from './tireProfiles';

const DAY = 24 * 60 * 60 * 1000;
const saved = (patch: Partial<TireCalibration> = {}): TireCalibration => ({
  model: MODEL_VERSION,
  gains: { lf: 0.9, rf: 0.9, lr: 1.1, rr: 1.1 },
  stops: 3,
  updatedAt: 1_000_000,
  ...patch,
});

describe('startingGains', () => {
  it('applies saved gains in full after enough stops', () => {
    expect(startingGains(saved(), 1_000_000)).toEqual({
      lf: 0.9,
      rf: 0.9,
      lr: 1.1,
      rr: 1.1,
    });
  });

  it('pulls a weak estimate back toward 1', () => {
    const gains = startingGains(saved({ stops: 1 }), 1_000_000);
    expect(gains?.lf).toBeCloseTo(1 - 0.1 / 3);
  });

  it('clamps an extreme gain to the usable range', () => {
    const gains = startingGains(
      saved({ gains: { lf: 2, rf: 0.2, lr: 1, rr: 1 } }),
      1_000_000
    );
    expect(gains?.lf).toBe(1.2);
    expect(gains?.rf).toBe(0.8);
  });

  it('ignores entries from another model version or that are too old', () => {
    expect(startingGains(saved({ model: 'older' }), 1_000_000)).toBeUndefined();
    expect(startingGains(saved(), 1_000_000 + 61 * DAY)).toBeUndefined();
    expect(startingGains(undefined, 1_000_000)).toBeUndefined();
  });
});
