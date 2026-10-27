import type { TireSlipSnapshot } from '@irdashies/types';

type Getter = (key: string) => number | undefined;

/** Below this speed, in m/s, ratios are too noisy to judge slip from. */
const MIN_SPEED = 15;
/** How fast the learned gear and steering ratios follow new samples. */
const LEARN = 0.02;
/** RPM settles for a moment after a shift; slip is not judged meanwhile. */
const SHIFT_SETTLE_S = 0.4;
/**
 * Driven-wheel slip speed, m/s, that is ordinary traction (a few percent at
 * racing speed), and the extra for full scale.
 */
export const SPIN_GRACE = 1.5;
const SPIN_FULL = 6;
/** Car slip angle, in degrees, that is ordinary cornering; full scale above it. */
const SLIP_ANGLE_GRACE = 4;
const SLIP_ANGLE_FULL = 6;

export const NO_SLIP: TireSlipSnapshot = {
  abs: false,
  tc: 0,
  spin: 0,
  lock: 0,
  under: 0,
  over: 0,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Tenths, so the snapshot only changes when the picture would. */
const tenths = (v: number) => Math.round(clamp01(v) * 10) / 10;

/**
 * Estimates where the tires are sliding, from what iRacing does publish.
 *
 * There is no per-wheel speed and no traction-control flag in the telemetry, so
 * each signal is inferred and can be wrong:
 * - ABS is the sim's own flag, for the whole car.
 * - Driven (rear) wheel spin and lock compare engine speed with road speed,
 *   as a slip speed in m/s, so a burnout standing still counts. Each gear's
 *   ratio is learned while cruising, when the tires grip.
 * - TC is the gap between the throttle pedal and the throttle that reaches
 *   the engine.
 * - Understeer is the steering going light: steering torque per unit of
 *   lateral load, against what it is in moderate corners (the Grip-o-Meter
 *   idea). Comparing the steering angle with the turn failed on an oval,
 *   where a staggered car corners with the wheel nearly straight.
 * - Oversteer is the car's slip angle beyond ordinary cornering.
 */
export class TireSlipEstimator {
  private readonly gearRatio = new Map<number, number>();
  /** Steering torque per unit of lateral acceleration with the front gripping. */
  private torquePerLoad: number | undefined;
  private lastGear: number | undefined;
  private sinceShift = 0;
  /**
   * How much faster the driven wheels' surface moves than the car, m/s, as of
   * the last update; 0 when the gear ratio is not known yet.
   */
  slipSpeed = 0;

  update(
    get: Getter,
    dt: number,
    onPitRoad: boolean,
    abs: boolean
  ): TireSlipSnapshot {
    const speed = get('Speed') ?? 0;
    const gear = get('Gear') ?? 0;
    if (gear !== this.lastGear) {
      this.lastGear = gear;
      this.sinceShift = 0;
    } else {
      this.sinceShift += Math.max(0, dt);
    }
    const rpm = get('RPM') ?? 0;
    const throttle = get('Throttle') ?? 0;
    const throttleRaw = get('ThrottleRaw') ?? throttle;
    const brake = get('Brake') ?? 0;
    const clutch = get('Clutch') ?? 1;
    const lon = get('LongAccel') ?? 0;
    const lat = Math.abs(get('LatAccel') ?? 0);

    // Driven wheels: engine speed through the gear gives the wheels' surface
    // speed; the gap to road speed is how fast the tires slide. It works
    // standing still too, which a burnout needs.
    this.slipSpeed = 0;
    let spin = 0;
    let lock = 0;
    if (
      gear > 0 &&
      clutch > 0.95 &&
      rpm > 0 &&
      this.sinceShift > SHIFT_SETTLE_S
    ) {
      const known = this.gearRatio.get(gear);
      const cruising =
        speed >= MIN_SPEED &&
        Math.abs(lon) < 2 &&
        throttle > 0.05 &&
        throttle < 0.6 &&
        brake < 0.05;
      if (cruising) {
        const ratio = rpm / speed;
        this.gearRatio.set(
          gear,
          known === undefined ? ratio : known + (ratio - known) * LEARN
        );
      }
      if (known !== undefined) {
        this.slipSpeed = rpm / known - speed;
        if (throttle > 0.2) spin = (this.slipSpeed - SPIN_GRACE) / SPIN_FULL;
        if (brake > 0.2 && speed >= MIN_SPEED) {
          lock = (-this.slipSpeed - SPIN_GRACE) / SPIN_FULL;
        }
      }
    }

    if (speed < MIN_SPEED || onPitRoad) {
      return { ...NO_SLIP, abs, spin: tenths(spin) };
    }

    const tc = throttleRaw > 0.2 ? (throttleRaw - throttle - 0.05) / 0.3 : 0;

    // Front grip: the steering goes light as the front tires saturate,
    // because the self-aligning torque falls while the cornering load holds.
    // The usual torque per unit of lateral load is learned in moderate corners.
    let under = 0;
    const torque = Math.abs(get('SteeringWheelTorque') ?? 0);
    if (lat > 3 && torque > 0) {
      const perLoad = torque / lat;
      if (lat < 7) {
        this.torquePerLoad =
          this.torquePerLoad === undefined
            ? perLoad
            : this.torquePerLoad + (perLoad - this.torquePerLoad) * LEARN;
      }
      if (this.torquePerLoad !== undefined && lat >= 8) {
        under = (0.6 - perLoad / this.torquePerLoad) / 0.3;
      }
    }

    // Rear grip: the car's own slip angle, the gap between where it points
    // and where it travels. It stays small while the rear holds.
    const sideways = Math.abs(
      (Math.atan2(get('VelocityY') ?? 0, get('VelocityX') ?? speed) * 180) /
        Math.PI
    );
    const over = (sideways - SLIP_ANGLE_GRACE) / SLIP_ANGLE_FULL;

    return {
      abs,
      tc: tenths(tc),
      spin: tenths(spin),
      lock: tenths(lock),
      under: tenths(under),
      over: tenths(over),
    };
  }

  reset(): void {
    this.gearRatio.clear();
    this.torquePerLoad = undefined;
    this.lastGear = undefined;
    this.sinceShift = 0;
    this.slipSpeed = 0;
  }
}
