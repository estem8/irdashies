import type { TireCorner } from '@irdashies/types';

const CORNERS: readonly TireCorner[] = ['lf', 'rf', 'lr', 'rr'];

/** Heat input per unit of speed times load, in degrees per second. */
const HEAT = 0.0096;
/** Base cooling rate toward ambient, per second; airflow adds to it with speed. */
const COOL = 0.02;
const COOL_SPEED = 50;
/** Lateral g, in m/s2, at which the outside tires carry their full extra load. */
const FULL_LATERAL = 20;
/** Share of the lateral load moved from the inside to the outside tires. */
const LOAD_TRANSFER = 0.4;
/** Steering angle, in radians, under which a corner is treated as straight. */
const STEER_DEADBAND = 0.05;
/** The longest step integrated; a hitch in telemetry must not heat a tire. */
const MAX_DT = 0.1;
const GAIN_LIMITS = [0.4, 2.5] as const;

export interface ThermalInput {
  dt: number;
  /** m/s */
  speed: number;
  /** m/s2, magnitude only. */
  lateral: number;
  /** m/s2, negative when braking. */
  longitudinal: number;
  /** Radians; positive is a left turn, so the right tires are outside. */
  steer: number;
  ambient: number;
}

/**
 * Estimates the mean carcass temperature of each tire between pit stops, when
 * iRacing publishes no live reading.
 *
 * It is a lumped model, not a simulation: heat goes in as speed times the load
 * a tire carries (lateral, braking or driving force, shared between tires by
 * the direction of the turn and the axle) and leaves toward ambient faster at
 * speed. The constants are plausible rather than fitted. What keeps the result
 * honest is calibration: at every pit stop the prediction is compared with the
 * reading the sim provides and that tire's heat gain is corrected, so the model
 * learns the car and track over a few stints.
 */
export class TireThermalModel {
  private temp: Partial<Record<TireCorner, number>> = {};
  private gain: Record<TireCorner, number> = { lf: 1, rf: 1, lr: 1, rr: 1 };
  private integrated = false;

  /** Whether any driving has been integrated since the last reset. */
  get active(): boolean {
    return this.integrated;
  }

  has(corner: TireCorner): boolean {
    return this.temp[corner] !== undefined;
  }

  mean(corner: TireCorner): number | undefined {
    return this.temp[corner];
  }

  /** Sets a tire's temperature, e.g. from a reading or for fresh tires. */
  set(corner: TireCorner, value: number): void {
    this.temp[corner] = value;
  }

  /**
   * Compares the prediction with a reading and corrects the tire's gain.
   * Returns nothing: a tire that has barely heated up says too little to learn
   * from, so the gain is left alone.
   */
  calibrate(corner: TireCorner, measured: number, ambient: number): void {
    const predicted = this.temp[corner];
    if (predicted === undefined) return;
    const predictedRise = predicted - ambient;
    const measuredRise = measured - ambient;
    if (predictedRise < 5 || measuredRise < 5) return;
    const next = this.gain[corner] * (measuredRise / predictedRise) ** 0.8;
    this.gain[corner] = Math.min(
      GAIN_LIMITS[1],
      Math.max(GAIN_LIMITS[0], next)
    );
  }

  step({
    dt,
    speed,
    lateral,
    longitudinal,
    steer,
    ambient,
  }: ThermalInput): void {
    if (!(dt > 0)) return;
    const h = Math.min(dt, MAX_DT);
    const latN = Math.min(1, lateral / FULL_LATERAL);
    const braking = longitudinal < 0;
    const cooling = COOL * (1 + speed / COOL_SPEED);

    for (const corner of CORNERS) {
      const t = this.temp[corner];
      if (t === undefined) continue;
      const right = corner === 'rf' || corner === 'rr';
      const front = corner === 'lf' || corner === 'rf';
      // A left turn (positive steer) loads the right tires.
      const outside =
        Math.abs(steer) < STEER_DEADBAND ? 0 : steer > 0 === right ? 1 : -1;
      const sideFactor = 1 + outside * LOAD_TRANSFER * latN;
      const axleShare = braking ? (front ? 0.65 : 0.35) : front ? 0.3 : 0.7;
      const load =
        lateral * 0.25 * sideFactor + Math.abs(longitudinal) * axleShare * 0.5;
      const heat = HEAT * this.gain[corner] * speed * load;
      this.temp[corner] = t + h * (heat - cooling * (t - ambient));
    }
    this.integrated = true;
  }

  reset(): void {
    this.temp = {};
    this.gain = { lf: 1, rf: 1, lr: 1, rr: 1 };
    this.integrated = false;
  }
}
