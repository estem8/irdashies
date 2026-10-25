import { describe, expect, it } from 'vitest';
import { TireThermalModel } from './TireThermalModel';

const drive = (m: TireThermalModel, seconds: number, steering: number) => {
  for (let i = 0; i < seconds * 15; i++)
    m.step({
      dt: 1 / 15,
      speed: 40,
      lateral: 10,
      longitudinal: 0,
      driveSlip: 0,
      ambient: 20,
      steering,
    });
};

describe('TireThermalModel surface scrub', () => {
  it('heats the front surface at full lock, not the rears, and not at small angles', () => {
    const lock = new TireThermalModel();
    const gentle = new TireThermalModel();
    for (const m of [lock, gentle]) {
      for (const c of ['lf', 'rf', 'lr', 'rr'] as const) m.set(c, 40);
    }
    drive(lock, 60, 3.5);
    drive(gentle, 60, 1);
    expect(lock.surfaceExcess('rf')).toBeGreaterThan(20);
    expect(lock.surfaceExcess('rf')).toBeGreaterThan(lock.surfaceExcess('lf'));
    expect(lock.surfaceExcess('lr')).toBe(0);
    expect(gentle.surfaceExcess('rf')).toBe(0);
  });

  it('decays when the car stops steering, and a fresh tire loses it', () => {
    const m = new TireThermalModel();
    m.set('rf', 40);
    drive(m, 60, 3.5);
    const hot = m.surfaceExcess('rf');
    drive(m, 120, 0);
    expect(m.surfaceExcess('rf')).toBeLessThan(hot / 2);
    m.set('rf', 50);
    expect(m.surfaceExcess('rf')).toBeGreaterThan(0);
    m.set('rf', 20, true);
    expect(m.surfaceExcess('rf')).toBe(0);
  });
});
