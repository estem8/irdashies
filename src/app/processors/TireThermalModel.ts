import type { TireCorner } from '@irdashies/types';
import { GT3_THERMAL, type ThermalParams } from './tireProfiles';

const CORNERS: readonly TireCorner[] = ['lf', 'rf', 'lr', 'rr'];

/** m/s under which the car counts as held still. */
const STILL_SPEED = 2;
/** Lateral acceleration, m/s2, under which the car is treated as going straight. */
const STRAIGHT_LATERAL = 1;
/**
 * The longest step integrated; a hitch in telemetry must not heat a tire.
 * ProcessorHost runs this processor at its tick rate (15 Hz), so ordinary
 * steps are about 0.07 s and pass through whole.
 */
const MAX_DT = 0.5;
const GAIN_LIMITS = [0.4, 2.5] as const;
/**
 * Yaw rate per metre per second of speed that one radian of steering wheel
 * gives while the front grips (the Grip-O-Meter's expected yaw rate), and how
 * it is learned: in a corner with real load but little steering.
 */
const DEFAULT_YAW_PER_STEER = 0.012;
const YAW_STEER_RANGE = [0.2, 1.3] as const;
const YAW_MIN_LATERAL = 5;
const YAW_MIN_SPEED = 20;
const YAW_LEARN_PER_S = 0.5;
/** m/s under which yaw per speed says nothing. */
const SCRUB_MIN_SPEED = 10;
const GRAVITY = 9.81;

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
  /** Steering wheel angle and yaw rate, rad and rad/s, absolute. */
  steering?: number;
  yawRate?: number;
  /** Vertical acceleration, m/s2, about 9.81 on a flat road. */
  vertical?: number;
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
  private yawPerSteer = DEFAULT_YAW_PER_STEER;
  private params: ThermalParams = GT3_THERMAL;

  /** Switches the constants without touching the temperatures. */
  configure(params: ThermalParams): void {
    this.params = params;
  }

  /** Whether any driving has been integrated since the last reset. */
  get active(): boolean {
    return this.integrated;
  }

  gains(): Record<TireCorner, number> {
    return { ...this.gain };
  }

  /** Starts the tires from gains learned earlier; reset() clears them. */
  setGains(gains: Record<TireCorner, number>): void {
    this.gain = { ...gains };
  }

  gainOf(corner: TireCorner): number {
    return this.gain[corner];
  }

  /** How much of the tire's temperature came from heating since it was set. */
  heated(corner: TireCorner): number {
    return (this.temp[corner] ?? 0) - (this.passive[corner] ?? 0);
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
    steering = 0,
    yawRate = 0,
    vertical = GRAVITY,
  }: ThermalInput): void {
    if (!(dt > 0)) return;
    const par = this.params;
    const h = Math.min(dt, MAX_DT);
    const cooling = par.cool * (1 + speed / par.coolSpeed);
    const cornering = Math.abs(lateral);
    const braking = Math.max(0, -longitudinal);
    const accel = Math.max(0, longitudinal);
    const aero = (par.aeroHeat * speed * speed * speed) / 1000;
    const yawPerSpeed = yawRate / Math.max(speed, 1);
    if (
      speed > YAW_MIN_SPEED &&
      cornering > YAW_MIN_LATERAL &&
      steering > YAW_STEER_RANGE[0] &&
      steering < YAW_STEER_RANGE[1]
    ) {
      this.yawPerSteer = Math.min(
        0.03,
        Math.max(
          0.006,
          this.yawPerSteer +
            (yawPerSpeed / steering - this.yawPerSteer) *
              Math.min(1, h * YAW_LEARN_PER_S)
        )
      );
    }
    // Banking presses the tires harder than the lateral acceleration says.
    const banked = par.bank
      ? Math.max(0, vertical - GRAVITY - par.bank.from) * par.bank.heat * speed
      : 0;
    // Steering the car does not turn on: the front is sliding.
    const unexplained =
      speed > SCRUB_MIN_SPEED
        ? Math.max(0, steering - yawPerSpeed / this.yawPerSteer)
        : 0;

    for (const corner of CORNERS) {
      const t = this.temp[corner];
      if (t === undefined) continue;
      const right = corner === 'rf' || corner === 'rr';
      const front = corner === 'lf' || corner === 'rf';
      // A left turn (positive lateral) loads the right tires.
      const outside =
        cornering < STRAIGHT_LATERAL ? 0 : lateral > 0 === right ? 1 : -1;
      const load = cornering * 0.25 * (1 + outside * par.loadTransfer);
      const driving =
        par.heat * speed * load * (front ? 1 : par.rearShare) +
        (front
          ? par.brakeHeat * speed * braking
          : par.accelHeat * speed * accel) +
        aero +
        banked +
        (front && par.scrub
          ? par.scrub.heat *
            unexplained *
            speed *
            Math.max(0, 1 + outside * par.scrub.outside)
          : 0);
      const spin = front
        ? 0
        : par.spinHeat *
          Math.min(Math.max(0, t - ambient), par.spinHeatCap) *
          (speed < STILL_SPEED ? par.spinStill : 1) *
          driveSlip;
      // Cold rubber heats faster, fading out as the tire reaches coldBelow.
      const cold =
        1 + par.coldBoost * Math.min(1, Math.max(0, (par.coldBelow - t) / 25));
      const heat = this.gain[corner] * (driving * cold + spin);
      this.temp[corner] = t + h * (heat - cooling * (t - ambient));
      const p = this.passive[corner] ?? t;
      this.passive[corner] = p - h * cooling * (p - ambient);
    }
    this.integrated = true;
  }

  reset(): void {
    this.temp = {};
    this.passive = {};
    this.yawPerSteer = DEFAULT_YAW_PER_STEER;
    this.gain = { lf: 1, rf: 1, lr: 1, rr: 1 };
    this.integrated = false;
  }
}
