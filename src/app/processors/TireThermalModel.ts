import type { TireCorner } from '@irdashies/types';

const CORNERS: readonly TireCorner[] = ['lf', 'rf', 'lr', 'rr'];

// Fitted second by second against cockpit-dash readings: 96 readings (about
// 380 tire values) over four fresh-tire stints of a Ferrari 296 GT3 at the
// Nordschleife and Mugello, 2.4 C RMS. The dash does not cool a standing car.

/** Heat per unit of speed times lateral load, degrees per second. */
const HEAT = 0.00274;
/** Base cooling rate toward ambient, per second; airflow adds to it with speed. */
const COOL = 0.0011;
const COOL_SPEED = 11;
/** Share of the lateral load moved from the inside to the outside tires. */
const LOAD_TRANSFER = 0.353;
/** Heat on the front tires per unit of speed times braking deceleration. */
const BRAKE_HEAT = 0.000675;
/** Heat on every tire per unit of speed cubed (thousands): aerodynamic load. */
const AERO_HEAT = 0.00051;
/**
 * Heat per unit of driven-wheel slip (m/s beyond ordinary traction, times
 * throttle) and per degree the tire is over ambient, degrees per second. The
 * dash showed rear tires heating faster the hotter they were: three burnouts
 * against a wall, 40 to 50-80 C, fit to 1.1 C RMS.
 */
const SPIN_HEAT = 0.0022;
/** Degrees over ambient beyond which wheelspin heats no faster. */
const SPIN_HEAT_CAP = 60;
/** Share of that heat when the car is held still (against a wall), m/s limit below. */
const SPIN_STILL = 0.4;
const STILL_SPEED = 2;
/** Lateral acceleration, m/s2, under which the car is treated as going straight. */
const STRAIGHT_LATERAL = 1;
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
  /** m/s2; positive in a left turn, which loads the right tires. */
  lateral: number;
  /** m/s2, negative when braking. */
  longitudinal: number;
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
 * lateral load a tire carries (more on the outside of the turn), braking on
 * the fronts, wheelspin on the rears and a little with speed cubed for the
 * aerodynamic load, and leaves toward ambient faster at speed. What keeps the
 * result honest is calibration: at every pit stop the prediction is compared with the
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

  step({
    dt,
    speed,
    lateral,
    longitudinal,
    driveSlip,
    ambient,
  }: ThermalInput): void {
    if (!(dt > 0)) return;
    const h = Math.min(dt, MAX_DT);
    const cooling = COOL * (1 + speed / COOL_SPEED);
    const cornering = Math.abs(lateral);
    const braking = Math.max(0, -longitudinal);
    const aero = (AERO_HEAT * speed * speed * speed) / 1000;

    for (const corner of CORNERS) {
      const t = this.temp[corner];
      if (t === undefined) continue;
      const right = corner === 'rf' || corner === 'rr';
      const front = corner === 'lf' || corner === 'rf';
      // A left turn (positive lateral) loads the right tires.
      const outside =
        cornering < STRAIGHT_LATERAL ? 0 : lateral > 0 === right ? 1 : -1;
      const load = cornering * 0.25 * (1 + outside * LOAD_TRANSFER);
      const heat =
        this.gain[corner] *
        (HEAT * speed * load +
          (front
            ? BRAKE_HEAT * speed * braking
            : SPIN_HEAT *
              Math.min(Math.max(0, t - ambient), SPIN_HEAT_CAP) *
              (speed < STILL_SPEED ? SPIN_STILL : 1) *
              driveSlip) +
          aero);
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
