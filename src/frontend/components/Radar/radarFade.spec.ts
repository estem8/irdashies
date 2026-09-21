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
  it('leaves a car solid once it is inside the fade band', () => {
    // Range 15, band 3: solid from 12 m inwards.
    expect(carFadeAt(0, 15, 3)).toBe(1);
    expect(carFadeAt(12, 15, 3)).toBe(1);
  });

  it('fades a car out across the band as it reaches the range', () => {
    expect(carFadeAt(13.5, 15, 3)).toBeCloseTo(0.5, 6);
    expect(carFadeAt(15, 15, 3)).toBe(0);
    expect(carFadeAt(20, 15, 3)).toBe(0);
  });

  it('treats no band as no fade', () => {
    expect(carFadeAt(0, 15, 0)).toBe(1);
    expect(carFadeAt(15, 15, 0)).toBe(1);
    expect(carFadeAt(100, 15, 0)).toBe(1);
  });

  it('never fades over a band wider than the range itself', () => {
    // A band wider than the range would make everything translucent, including
    // a car sitting on the player.
    expect(carFadeAt(0, 15, 40)).toBeCloseTo(1, 6);
  });

  it('gives a car with no usable distance no presence', () => {
    expect(carFadeAt(Number.NaN, 15, 3)).toBe(0);
  });
});
