import type { TireCorner } from '@irdashies/types';
import type { SurfaceParams } from './tireProfiles';
import { YawGrip } from './YawGrip';

const CORNERS: readonly TireCorner[] = ['lf', 'rf', 'lr', 'rr'];

export interface SurfaceInput {
  dt: number;
  /** m/s */
  speed: number;
  /** m/s2; positive in a left turn, which loads the right tires. */
  lateral: number;
  /** m/s2, negative when braking. */
  longitudinal: number;
  /** Steering wheel angle magnitude, radians. */
  steering: number;
  /** Yaw rate magnitude, rad/s. */
  yawRate: number;
  /** How fast the front and rear axle slide sideways beyond cornering, m/s. */
  slideFront: number;
  slideRear: number;
  /** Brake pedal, 0 to 1. */
  brake: number;
  /** Driven-wheel slip beyond ordinary traction, m/s, times throttle. */
  driveSlip: number;
}

/**
 * The tread surface temperature some cars show on their dash: it jumps by
 * tens of degrees within seconds of heavy braking or a turn with the wheel
 * wound on, and falls back within seconds, faster at speed (airflow).
 *
 * Braking heats a disc first, in a fast and a slow part, which feed the tire
 * surface a moment and tens of seconds later, as the dash does; the front tires also heat from steering angle
 * times speed (scrub); the driven rear tires from wheelspin.
 * Everything is an excess over a resting surface temperature that follows the
 * air.
 */
export class TireSurfaceModel {
  private fast: Record<TireCorner, number> = { lf: 0, rf: 0, lr: 0, rr: 0 };
  private slow: Record<TireCorner, number> = { lf: 0, rf: 0, lr: 0, rr: 0 };
  private surface: Record<TireCorner, number> = { lf: 0, rf: 0, lr: 0, rr: 0 };
  private integrated = false;
  private readonly grip = new YawGrip();

  constructor(private params: SurfaceParams) {}

  configure(params: SurfaceParams): void {
    this.params = params;
  }

  get active(): boolean {
    return this.integrated;
  }

  /** How hot a brake disc is, 0 (cold) to 1 (as hot as the testing made it). */
  discLevel(corner: TireCorner): number {
    return Math.min(1, this.slow[corner] / this.params.discFull);
  }

  /** The surface temperature of a tire, in degrees Celsius. */
  temp(corner: TireCorner, ambient: number): number {
    const front = corner === 'lf' || corner === 'rf';
    const p = this.params;
    return ambient + (front ? p.frontRest : p.rearRest) + this.surface[corner];
  }

  step({
    dt,
    speed,
    lateral,
    longitudinal,
    steering,
    yawRate,
    slideFront,
    slideRear,
    brake: pedal,
    driveSlip,
  }: SurfaceInput): void {
    if (!(dt > 0)) return;
    const p = this.params;
    const h = Math.min(dt, 0.25);
    const braking = Math.max(0, -longitudinal) * speed;
    this.grip.learn(h, speed, Math.abs(lateral), steering, yawRate);
    const scrub = this.grip.unexplained(speed, steering, yawRate) * speed;
    const cornering = 0.25 * Math.abs(lateral) * speed;

    for (const corner of CORNERS) {
      const front = corner === 'lf' || corner === 'rf';
      const right = corner === 'rf' || corner === 'rr';
      // The outside tires of the turn take more of the heat.
      const outside =
        Math.abs(lateral) < 1 ? 0 : lateral > 0 === right ? 1 : -1;
      const share = 1 + outside * p.loadTransfer;
      const hot = front
        ? (p.frontScrub * scrub + p.frontCornering * cornering) * share +
          p.frontSlide * slideFront
        : p.rearSpin * driveSlip + p.rearSlide * slideRear;
      const brake = front
        ? p.frontBrake * braking + p.frontPedal * pedal * pedal * speed
        : p.rearBrake * braking;
      const slowAir = p.slowCool + p.slowCoolSpeed * speed;
      const fastAir = p.fastCool + p.fastCoolSpeed * speed;
      this.fast[corner] = Math.max(
        0,
        this.fast[corner] +
          h * (p.fastShare * brake - this.fast[corner] * fastAir)
      );
      this.slow[corner] = Math.max(
        0,
        this.slow[corner] +
          h * ((1 - p.fastShare) * brake - this.slow[corner] * slowAir)
      );
      const decay = front
        ? 1 / p.frontTau + p.frontCoolSpeed * speed
        : 1 / p.rearTau + p.rearCoolSpeed * speed;
      this.surface[corner] = Math.max(
        0,
        this.surface[corner] +
          h *
            (hot +
              p.fastToTire * this.fast[corner] +
              p.slowToTire * this.slow[corner] -
              this.surface[corner] * decay)
      );
    }
    this.integrated = true;
  }

  reset(): void {
    this.fast = { lf: 0, rf: 0, lr: 0, rr: 0 };
    this.slow = { lf: 0, rf: 0, lr: 0, rr: 0 };
    this.surface = { lf: 0, rf: 0, lr: 0, rr: 0 };
    this.integrated = false;
    this.grip.reset();
  }

  /**
   * Fresh tires: the tread starts at the temperature they were set at, about
   * 34 C on the dash, and settles to its resting level from there; the brake
   * discs stay as hot as they are.
   */
  resetTread(corner: TireCorner, start: number, ambient: number): void {
    const front = corner === 'lf' || corner === 'rf';
    const rest = front ? this.params.frontRest : this.params.rearRest;
    this.surface[corner] = Math.max(0, start - ambient - rest);
  }
}
