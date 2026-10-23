import type { TireCorner } from '@irdashies/types';

const CORNERS: readonly TireCorner[] = ['lf', 'rf', 'lr', 'rr'];

/** Heat input per unit of speed times load, in degrees per second. */
const HEAT = 0.0025;
/** Base cooling rate toward ambient, per second; airflow adds to it with speed. */
const COOL = 0.0025;
const COOL_SPEED = 50;
/** Lateral g, in m/s2, at which the outside tires carry their full extra load. */
const FULL_LATERAL = 20;
/** Share of the lateral load moved from the inside to the outside tires. */
const LOAD_TRANSFER = 0.08;
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
 * speed. The constants were fitted to five recorded stints (20 tire readings,
 * about 1.3 degrees RMS), which is few enough that they may not carry over to
 * another car or track. What keeps the result honest is calibration: at every pit stop the prediction is compared with the
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
      const heat =
        HEAT * this.gain[corner] * speed * load * (front ? 1 : REAR_HEAT);
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
