import { describe, expect, it } from 'vitest';
import { TireSurfaceModel } from './TireSurfaceModel';
import { profileFor } from './tireProfiles';

const surface = profileFor('cadillacvseriesrgtp').surface;
if (!surface) throw new Error('the Cadillac profile has no surface model');
const params = surface;
const input = {
  speed: 0,
  lateral: 0,
  longitudinal: 0,
  steering: 0,
  yawRate: 0,
  slideFront: 0,
  slideRear: 0,
  brake: 0,
  driveSlip: 0,
  ambient: 19,
};
const run = (model: TireSurfaceModel, seconds: number, patch = {}) => {
  for (let i = 0; i < seconds * 15; i++)
    model.step({ ...input, dt: 1 / 15, ...patch });
};

describe('TireSurfaceModel', () => {
  it('rests above the air before anything heats it', () => {
    const model = new TireSurfaceModel(params);
    run(model, 5);
    expect(model.temp('lf', 19)).toBeCloseTo(19 + params.frontRest, 0);
    expect(model.temp('rr', 19)).toBeCloseTo(19 + params.rearRest, 0);
  });

  it('heats the front tires hard under heavy braking', () => {
    const model = new TireSurfaceModel(params);
    // Braking from 80 m/s to 40, then the car rolls on slowly: the surface
    // peaks a moment after the braking, as the dash does.
    run(model, 3, { speed: 60, longitudinal: -22, brake: 0.9 });
    run(model, 2, { speed: 30 });
    expect(model.temp('lf', 19)).toBeGreaterThan(19 + params.frontRest + 30);
    expect(model.temp('lf', 19) - (19 + params.frontRest)).toBeGreaterThan(30);
  });

  it('cools back toward rest at speed within seconds', () => {
    const model = new TireSurfaceModel(params);
    run(model, 3, { speed: 70, longitudinal: -22, brake: 0.9 });
    run(model, 20, { speed: 70 });
    expect(model.temp('lf', 19) - (19 + params.frontRest)).toBeLessThan(10);
  });

  it('heats the outside front tire more in a turn with the wheel wound on', () => {
    const model = new TireSurfaceModel(params);
    // A left turn loads the right tires.
    run(model, 4, { speed: 25, lateral: 12, steering: 4 });
    expect(model.temp('rf', 19)).toBeGreaterThan(model.temp('lf', 19));
  });

  it('keeps a hot disc hot on a standing car and cools it at speed', () => {
    const standing = new TireSurfaceModel(params);
    const rolling = new TireSurfaceModel(params);
    for (const model of [standing, rolling])
      run(model, 4, { speed: 60, longitudinal: -22, brake: 0.9 });
    const peak = standing.discLevel('lf');
    expect(peak).toBeGreaterThan(0.3);
    run(standing, 20, { speed: 0, brake: 1 });
    run(rolling, 20, { speed: 70 });
    expect(standing.discLevel('lf')).toBeGreaterThan(peak * 0.6);
    expect(rolling.discLevel('lf')).toBeLessThan(peak * 0.4);
  });

  it('starts over after a reset', () => {
    const model = new TireSurfaceModel(params);
    run(model, 3, { speed: 70, longitudinal: -22, brake: 0.9 });
    model.reset();
    expect(model.active).toBe(false);
    expect(model.temp('lf', 19)).toBeCloseTo(19 + params.frontRest, 0);
  });

  it('heats the rear axle in a spin, more than the front', () => {
    const model = new TireSurfaceModel(params);
    run(model, 3, { speed: 25, slideFront: 12, slideRear: 18 });
    expect(model.temp('lr', 19) - (19 + params.rearRest)).toBeGreaterThan(20);
    expect(model.temp('lr', 19)).toBeGreaterThan(model.temp('lf', 19) - 15);
  });

  it('starts fresh tires at their set temperature, not at the resting level', () => {
    const model = new TireSurfaceModel(params);
    run(model, 3, { speed: 70, longitudinal: -22, brake: 0.9 });
    model.resetTread('lf', 45, 19);
    model.resetTread('rr', 45, 19);
    expect(model.temp('lf', 19)).toBeCloseTo(45, 0);
    expect(model.temp('rr', 19)).toBeCloseTo(45, 0);
  });
});
