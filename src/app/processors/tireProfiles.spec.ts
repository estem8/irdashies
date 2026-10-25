import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, profileFor } from './tireProfiles';

describe('profileFor', () => {
  it('falls back to the default for a car it does not know', () => {
    expect(profileFor('somecar')).toEqual(DEFAULT_PROFILE);
    expect(profileFor(undefined)).toEqual(DEFAULT_PROFILE);
  });

  it('gives the Cadillac its surface model and the truck more heat', () => {
    expect(profileFor('cadillacvseriesrgtp').surface).toBeDefined();
    // The truck keeps the heat it was scaled to from the earlier GT3 fit.
    expect(profileFor('trucks ram2026').thermal.heat).toBeCloseTo(
      0.001924 * 1.2,
      6
    );
    expect(profileFor('trucks ram2026').surface).toBeUndefined();
  });
});
