/**
 * What the car turns for the steering it is given, the Grip-O-Meter way: the
 * yaw rate per metre per second of speed that one radian of steering wheel
 * gives while the front grips is learned in corners with real load but little
 * steering; steering past what the yaw rate explains is the front sliding.
 * The same for any car, which is why both tire models share it.
 */
const DEFAULT_YAW_PER_STEER = 0.012;
const STEER_RANGE = [0.2, 1.3] as const;
const MIN_LATERAL = 5;
const MIN_SPEED = 20;
const LEARN_PER_S = 0.5;
/** m/s under which yaw per speed says nothing. */
const MIN_SCRUB_SPEED = 10;

export class YawGrip {
  private perSteer = DEFAULT_YAW_PER_STEER;

  /** Learns the ratio; `lateral` is the absolute lateral acceleration. */
  learn(
    dt: number,
    speed: number,
    lateral: number,
    steering: number,
    yawRate: number
  ): void {
    if (
      speed > MIN_SPEED &&
      lateral > MIN_LATERAL &&
      steering > STEER_RANGE[0] &&
      steering < STEER_RANGE[1]
    ) {
      const sample = yawRate / Math.max(speed, 1) / steering;
      this.perSteer = Math.min(
        0.03,
        Math.max(
          0.006,
          this.perSteer +
            (sample - this.perSteer) * Math.min(1, dt * LEARN_PER_S)
        )
      );
    }
  }

  /** Radians of steering wheel the car does not turn on. */
  unexplained(speed: number, steering: number, yawRate: number): number {
    return speed > MIN_SCRUB_SPEED
      ? Math.max(0, steering - yawRate / Math.max(speed, 1) / this.perSteer)
      : 0;
  }

  reset(): void {
    this.perSteer = DEFAULT_YAW_PER_STEER;
  }
}

/** Lateral speed of an axle beyond what ordinary cornering gives, m/s. */
const SLIDE_GRACE = 0.15;
/** Distances from the centre of gravity to the front and rear axle, m. */
const FRONT_ARM = 1.4;
const REAR_ARM = 1.6;

/**
 * How fast each axle slides sideways beyond ordinary cornering (a spin, a
 * drift, a slide on lock), from the car's velocity and yaw rate. Slip angle in
 * ordinary cornering is a few degrees, so the lateral speed of an axle stays
 * under 15 percent of the forward speed; beyond that it is a slide.
 * shortcut: one wheelbase split for every car, refine per car if it matters.
 */
export const slideOf = (
  forward: number,
  lateralVelocity: number,
  yawRate: number
): { front: number; rear: number } => {
  const grace = SLIDE_GRACE * Math.max(Math.abs(forward), 8);
  return {
    front: Math.max(0, Math.abs(lateralVelocity + FRONT_ARM * yawRate) - grace),
    rear: Math.max(0, Math.abs(lateralVelocity - REAR_ARM * yawRate) - grace),
  };
};
