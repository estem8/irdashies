import { describe, expect, it } from 'vitest';
import { TireThermalModel } from './TireThermalModel';

/** Yaw rate per speed the car has at this steering while it grips (0.012 per rad). */
const drive = (
  m: TireThermalModel,
  seconds: number,
  steering: number,
  yawPerSpeed = 0.012 * steering,
  lateral = 10
) => {
  for (let i = 0; i < seconds * 15; i++)
    m.step({
      dt: 1 / 15,
      speed: 40,
      lateral,
      longitudinal: 0,
      driveSlip: 0,
      ambient: 20,
      steering,
      yawRate: yawPerSpeed * 40,
    });
};

const heated = () => {
  const m = new TireThermalModel();
  for (const c of ['lf', 'rf', 'lr', 'rr'] as const) m.set(c, 40);
  return m;
};

describe('TireThermalModel scrub heat', () => {
  it('heats the fronts more when the car turns less than the steering says, the rears not', () => {
    const sliding = heated();
    const gripping = heated();
    drive(sliding, 60, 3.5, 0.0065);
    drive(gripping, 60, 1);
    expect(sliding.mean('rf')).toBeGreaterThan((gripping.mean('rf') ?? 0) + 15);
    expect(sliding.mean('lr')).toBeCloseTo(gripping.mean('lr') ?? 0, 0);
  });

  it('puts the extra heat on the outside tire of the turn', () => {
    const m = heated();
    drive(m, 60, 3.5, 0.0065);
    // lateral > 0 is a left turn, which loads the right tires
    expect(m.mean('rf')).toBeGreaterThan(m.mean('lf') ?? 0);
  });

  it('cools back toward the air once the car stops sliding', () => {
    const m = heated();
    drive(m, 60, 3.5, 0.0065);
    const hot = m.mean('rf') ?? 0;
    drive(m, 120, 0, 0, 0);
    expect(m.mean('rf')).toBeLessThan(hot);
  });
});

describe('TireThermalModel banking', () => {
  const run = (vertical: number) => {
    const m = heated();
    for (let i = 0; i < 60 * 15; i++)
      m.step({
        dt: 1 / 15,
        speed: 80,
        lateral: 5,
        longitudinal: 0,
        driveSlip: 0,
        ambient: 20,
        steering: 0.1,
        yawRate: 0.1 * 0.012 * 80,
        vertical,
      });
    return m;
  };

  it('heats every tire more with the extra load of a banked turn', () => {
    const flat = run(9.81);
    const banked = run(16);
    for (const c of ['lf', 'rf', 'lr', 'rr'] as const)
      expect(banked.mean(c)).toBeGreaterThan((flat.mean(c) ?? 0) + 10);
  });

  it('ignores the small vertical loads of bumps and crests', () => {
    expect(run(11.5).mean('lf')).toBeCloseTo(run(9.81).mean('lf') ?? 0, 5);
  });

  it('does not mistake a bumpy road for banking', () => {
    const smooth = run(10.5);
    const bumpy = heated();
    for (let i = 0; i < 60 * 15; i++)
      bumpy.step({
        dt: 1 / 15,
        speed: 80,
        lateral: 5,
        longitudinal: 0,
        driveSlip: 0,
        ambient: 20,
        steering: 0.1,
        yawRate: 0.1 * 0.012 * 80,
        // average 10.5, swinging far past the threshold on the crests
        vertical: i % 2 === 0 ? 17 : 4,
      });
    expect(bumpy.mean('lf')).toBeCloseTo(smooth.mean('lf') ?? 0, 0);
  });
});
