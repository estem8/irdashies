import type { TireSlipSnapshot } from '@irdashies/types';

type Getter = (key: string) => number | undefined;

/** Below this speed, in m/s, ratios are too noisy to judge slip from. */
const MIN_SPEED = 15;
/** How fast the learned gear and steering ratios follow new samples. */
const LEARN = 0.02;
/** RPM settles for a moment after a shift; slip is not judged meanwhile. */
const SHIFT_SETTLE_S = 0.4;

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
 * - Driven (rear) wheel spin and lock compare engine speed with road speed.
 *   Each gear's ratio is learned while cruising, when the tires grip.
 * - TC is the gap between the throttle pedal and the throttle that reaches
 *   the engine.
 * - Understeer compares how fast the car rotates with what the steering asks
 *   for, against a ratio learned in gentle corners. Oversteer is only
 *   counter-steering: the wheel pointed against the way the car rotates.
 */
export class TireSlipEstimator {
  private readonly gearRatio = new Map<number, number>();
  /** Yaw rate per unit of speed times steering; its sign is learned too. */
  private steerGain: number | undefined;
  private lastGear: number | undefined;
  private sinceShift = 0;

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
    if (speed < MIN_SPEED || onPitRoad) return { ...NO_SLIP, abs };

    const rpm = get('RPM') ?? 0;
    const throttle = get('Throttle') ?? 0;
    const throttleRaw = get('ThrottleRaw') ?? throttle;
    const brake = get('Brake') ?? 0;
    const clutch = get('Clutch') ?? 1;
    const lon = get('LongAccel') ?? 0;
    const lat = Math.abs(get('LatAccel') ?? 0);
    const steer = get('SteeringWheelAngle') ?? 0;
    const yaw = get('YawRate') ?? 0;

    let spin = 0;
    let lock = 0;
    if (
      gear > 0 &&
      clutch > 0.95 &&
      rpm > 0 &&
      this.sinceShift > SHIFT_SETTLE_S
    ) {
      const ratio = rpm / speed;
      const known = this.gearRatio.get(gear);
      const cruising =
        Math.abs(lon) < 2 && throttle > 0.05 && throttle < 0.6 && brake < 0.05;
      if (cruising) {
        this.gearRatio.set(
          gear,
          known === undefined ? ratio : known + (ratio - known) * LEARN
        );
      }
      if (known !== undefined) {
        const slip = ratio / known - 1;
        // A few percent is ordinary tire slip; full scale at 15%.
        if (throttle > 0.3) spin = (slip - 0.03) / 0.12;
        if (brake > 0.2) lock = (-slip - 0.05) / 0.15;
      }
    }

    const tc = throttleRaw > 0.2 ? (throttleRaw - throttle - 0.05) / 0.3 : 0;

    let under = 0;
    let over = 0;
    if (Math.abs(steer) > 0.02) {
      const gain = yaw / (speed * steer);
      if (lat < 4 && Math.abs(steer) > 0.03) {
        this.steerGain =
          this.steerGain === undefined
            ? gain
            : this.steerGain + (gain - this.steerGain) * LEARN;
      }
      // Turning well short of what the steering asks is the front letting go.
      // The opposite (turning more) is not trusted as oversteer: on a banked
      // oval the car needs less steering for the same turn, which read as a
      // slide for a quarter of every lap in the recordings.
      if (this.steerGain !== undefined && this.steerGain !== 0 && lat >= 8) {
        under = (0.75 - gain / this.steerGain) / 0.3;
      }
      // Steering against the way the car rotates is catching the rear.
      if (
        this.steerGain !== undefined &&
        Math.abs(yaw) > 0.15 &&
        Math.abs(steer) > 0.05 &&
        Math.sign(yaw) !== Math.sign(steer) * Math.sign(this.steerGain)
      ) {
        over = Math.max(over, (Math.abs(yaw) - 0.15) / 0.35);
      }
    }

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
    this.steerGain = undefined;
    this.lastGear = undefined;
    this.sinceShift = 0;
  }
}
