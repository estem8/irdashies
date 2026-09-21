import { describe, expect, it } from 'vitest';
import { evaluateProximity, type ProximityThresholds } from './radarProximity';

/** The overlay's own numbers: engage at 7 m, clear at 10 m, red at 1.5 m. */
const thresholds: ProximityThresholds = {
  nearbyRange: 7,
  clearRange: 10,
  criticalRange: 1.5,
};

const at = (gapM: number, alongside = false, wasEngaged = false) =>
  evaluateProximity(gapM, alongside, wasEngaged, thresholds);

describe('evaluateProximity', () => {
  it('leaves a car beyond the engage range alone', () => {
    expect(at(8)).toEqual({ engaged: false, level: 'far' });
    expect(at(15)).toEqual({ engaged: false, level: 'far' });
  });

  it('engages a car inside the engage range as nearby', () => {
    expect(at(7)).toEqual({ engaged: true, level: 'nearby' });
    expect(at(3)).toEqual({ engaged: true, level: 'nearby' });
  });

  it('turns a car critical inside the critical range', () => {
    expect(at(1.5)).toEqual({ engaged: true, level: 'critical' });
    expect(at(0.4)).toEqual({ engaged: true, level: 'critical' });
  });

  it('holds an engaged car until it clears the release range', () => {
    // 8 m sits between the two thresholds: new cars are ignored there, but a
    // car already engaged stays engaged, which is the whole point of the gap.
    expect(at(8, false, false).engaged).toBe(false);
    expect(at(8, false, true)).toEqual({ engaged: true, level: 'nearby' });

    expect(at(10, false, true).engaged).toBe(true);
    expect(at(10.1, false, true)).toEqual({ engaged: false, level: 'far' });
  });

  it('engages a car alongside, but grades it by its real gap', () => {
    // The sim reports overlap across the whole pass, out to about five metres
    // of stagger, so an alongside car is only critical once it is level.
    expect(at(0, true)).toEqual({ engaged: true, level: 'critical' });
    expect(at(1, true)).toEqual({ engaged: true, level: 'critical' });
    expect(at(4, true)).toEqual({ engaged: true, level: 'nearby' });
    expect(at(6, true)).toEqual({ engaged: true, level: 'nearby' });
  });

  it('engages an alongside car even when it sat outside the engage range', () => {
    // The sim only reports overlap for cars beside us, so its verdict is
    // honoured on its own rather than being second-guessed by the gap.
    expect(at(9, true).engaged).toBe(true);
  });

  it('reports a car with no usable gap as far rather than NaN', () => {
    expect(at(Number.NaN)).toEqual({ engaged: false, level: 'far' });
    expect(at(Number.POSITIVE_INFINITY)).toEqual({
      engaged: false,
      level: 'far',
    });
  });

  it('does not flicker while a car sits on the engage threshold', () => {
    // Walk a car in and out around 7 m once it is already tracked: the level
    // must not alternate. Starting from engaged is the case that matters — a
    // new car outside the engage range is correctly ignored.
    let engaged = true;
    const levels: string[] = [];
    for (const gap of [7.05, 6.98, 7.03, 6.95, 7.02, 6.99]) {
      const verdict = evaluateProximity(gap, false, engaged, thresholds);
      engaged = verdict.engaged;
      levels.push(verdict.level);
    }

    expect(new Set(levels).size).toBe(1);
    expect(levels[0]).toBe('nearby');
  });
});
