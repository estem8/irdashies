import type { TireCorner } from '@irdashies/types';

const CORNERS: readonly TireCorner[] = ['lf', 'rf', 'lr', 'rr'];

/** Heat input per unit of speed times load, in degrees per second. */
const HEAT = 0.0035;
/** Base cooling rate toward ambient, per second; airflow adds to it with speed. */
const COOL = 0.003;
const COOL_SPEED = 50;
/** Lateral g, in m/s2, at which the outside tires carry their full extra load. */
const FULL_LATERAL = 20;
/** Share of the lateral load moved from the inside to the outside tires. */
const LOAD_TRANSFER = 0.3;
/**
 * Heat per unit of driven-wheel slip (m/s beyond ordinary traction, times
 * throttle), degrees per second. Rough: set from a burnout that took the rear
 * tires from 27 to 51 C in a few seconds; refine from the trace log.
 */
const SPIN_HEAT = 0.25;
/** Rear tires took a little more heat than the front in the recorded stints. */
const REAR_HEAT = 1.1;
/** Steering angle, in radians, under which a corner is treated as straight. */
const STEER_DEADBAND = 0.05;
/**
 * The longest step integrated; a hitch in telemetry must not heat a tire.
 * ProcessorHost runs this processor at its tick rate (5 Hz), so ordinary steps
 * are 0.2 s and must pass through whole.
 */
const MAX_DT = 0.5;
const GAIN_LIMITS = [0.4, 2.5] as const;

export interface ThermalInput {
  dt: number;
  /** m/s */
  speed: number;
  /** m/s2, magnitude only. */
  lateral: number;
  /** Radians; positive is a left turn, so the right tires are outside. */
  steer: number;
  /**
   * Driven (rear) wheel slip beyond ordinary traction, m/s, times throttle:
   * wheelspin heats the rear tires even with the car standing still.
   */
  driveSlip: number;
  ambient: number;
}

/**
 * Estimates the mean carcass temperature of each tire between pit stops, when
 * iRacing publishes no live reading.
 *
 * It is a lumped model, not a simulation: heat goes in as speed times the
 * lateral load a tire carries, shared between tires by the direction of the
 * turn, and leaves toward ambient faster at speed. Braking and driving force
 * are left out on purpose: fitted over 27 recorded stints on an oval and a road
 * course, both made the fit worse. The fit is still weakest on the oval, where
 * the outside tires run hotter than lateral load explains (banking and
 * downforce load them vertically, which this model does not see yet). What
 * keeps the result honest is calibration: at every pit stop the prediction is compared with the
 * reading the sim provides and that tire's heat gain is corrected, so the model
 * learns the car and track over a few stints.
 */
export class TireThermalModel {
  private temp: Partial<Record<TireCorner, number>> = {};
  /** What each tire would read had it only cooled since it was last set. */
  private passive: Partial<Record<TireCorner, number>> = {};
  private gain: Record<TireCorner, number> = { lf: 1, rf: 1, lr: 1, rr: 1 };
  private integrated = false;

  /** Whether any driving has been integrated since the last reset. */
  get active(): boolean {
    return this.integrated;
  }

  gainOf(corner: TireCorner): number {
    return this.gain[corner];
  }

  /** How much of the tire's temperature came from heating since it was set. */
  heated(corner: TireCorner): number {
    return (this.temp[corner] ?? 0) - (this.passive[corner] ?? 0);
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
    this.passive[corner] = value;
  }

  /**
   * Compares the prediction with a reading and corrects the tire's gain.
   *
   * Only the part of the temperature that came from heating scales with the
   * gain; the part left over from where the tire started does not. Judging the
   * whole rise above ambient let a tire that began the stint warm teach the
   * model that its heating was too strong. A tire that has barely heated says
   * too little to learn from, so the gain is left alone.
   */
  calibrate(corner: TireCorner, measured: number): void {
    const predicted = this.temp[corner];
    const passive = this.passive[corner];
    if (predicted === undefined || passive === undefined) return;
    const heated = predicted - passive;
    const needed = measured - passive;
    if (heated < 3 || needed <= 0) return;
    const next = this.gain[corner] * (needed / heated) ** 0.8;
    this.gain[corner] = Math.min(
      GAIN_LIMITS[1],
      Math.max(GAIN_LIMITS[0], next)
    );
  }

  step({ dt, speed, lateral, steer, driveSlip, ambient }: ThermalInput): void {
    if (!(dt > 0)) return;
    const h = Math.min(dt, MAX_DT);
    const latN = Math.min(1, lateral / FULL_LATERAL);
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
      const load = lateral * 0.25 * sideFactor;
      const heat =
        this.gain[corner] *
        (HEAT * speed * load * (front ? 1 : REAR_HEAT) +
          (front ? 0 : SPIN_HEAT * driveSlip));
      this.temp[corner] = t + h * (heat - cooling * (t - ambient));
      const p = this.passive[corner] ?? t;
      this.passive[corner] = p - h * cooling * (p - ambient);
    }
    this.integrated = true;
  }

  reset(): void {
    this.temp = {};
    this.passive = {};
    this.gain = { lf: 1, rf: 1, lr: 1, rr: 1 };
    this.integrated = false;
  }
}
