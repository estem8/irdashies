import { describe, expect, it } from 'vitest';
import { advanceFade, carFadeAt } from './radarFade';

describe('advanceFade', () => {
  it('ramps up and down at the rate the duration sets', () => {
    // A half second fade: one tenth of a second moves opacity by 0.2.
    expect(advanceFade(0, 1, 0.1, 0.5)).toBeCloseTo(0.2, 6);
    expect(advanceFade(0.8, 1, 0.1, 0.5)).toBe(1);
    expect(advanceFade(1, 0, 0.1, 0.5)).toBeCloseTo(0.8, 6);
    expect(advanceFade(0.2, 0, 0.1, 0.5)).toBe(0);
  });

  it('stops exactly on the target rather than overshooting', () => {
    expect(advanceFade(0.95, 1, 1, 0.1)).toBe(1);
    expect(advanceFade(0.05, 0, 1, 0.1)).toBe(0);
  });

  it('does not move when there is nowhere to go', () => {
    expect(advanceFade(0.5, 1, 0, 0.5)).toBe(0.5);
    expect(advanceFade(1, 1, 1, 0.5)).toBe(1);
    expect(advanceFade(0, 0, 1, 0.5)).toBe(0);
  });

  it('jumps straight to the target when the fade is switched off', () => {
    expect(advanceFade(0, 1, 0.001, 0)).toBe(1);
    expect(advanceFade(1, 0, 0.001, 0)).toBe(0);
  });

  it('ignores a clock that has not advanced', () => {
    expect(advanceFade(0.25, 1, 0, 0.5)).toBe(0.25);
  });
});

describe('carFadeAt', () => {
  it('keeps a car at or beyond the range edge dim rather than absent', () => {
    expect(carFadeAt(15, 15, 3)).toBeGreaterThanOrEqual(0.15);
    expect(carFadeAt(20, 15, 3)).toBe(0.15);
  });

  it('leaves a car solid once it is inside the fade band', () => {
    expect(carFadeAt(0, 15, 3)).toBe(1);
    expect(carFadeAt(12, 15, 3)).toBe(1);
  });

  it('treats no band as no fade', () => {
    expect(carFadeAt(0, 15, 0)).toBe(1);
    expect(carFadeAt(15, 15, 0)).toBe(1);
    expect(carFadeAt(100, 15, 0)).toBe(1);
  });

  it('keeps the linear ramp but reaches the floor exactly at the range', () => {
    expect(carFadeAt(13.5, 15, 3)).toBeCloseTo(0.575, 6);
    expect(carFadeAt(15, 15, 3)).toBe(0.15);
  });
});
