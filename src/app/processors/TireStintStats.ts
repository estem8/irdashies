const PREFIXES = ['LF', 'RF', 'LR', 'RR'] as const;
const STEER_DEADBAND = 0.05;
/** Steps arrive at the processor's 5 Hz tick; only a hitch is clipped. */
const MAX_DT = 0.5;

type Getter = (key: string) => number | undefined;

interface CornerSums {
  defl: number;
  deflVel: number;
  brakePress: number;
  rumble: number;
}

const f = (v: number, digits = 1) => v.toFixed(digits);

/**
 * TEMPORARY: sums what happened to the car over one stint, so tire temperature
 * can be fitted offline against the reading taken at the next pit stop.
 *
 * Everything is an integral over time on track (value times dt), so a stint of
 * any length can be normalised afterwards. Lateral work is split by steering
 * direction because that decides which side's tires are outside.
 */
export class TireStintStats {
  private time = 0;
  private pit = 0;
  private distance = 0;
  private latLeft = 0;
  private latRight = 0;
  private braking = 0;
  private driving = 0;
  private throttle = 0;
  private brake = 0;
  private slip = 0;
  private yaw = 0;
  private absTime = 0;
  private throttleInCorner = 0;
  private air = 0;
  private track = 0;
  private corners: Record<string, CornerSums> = this.emptyCorners();

  private emptyCorners(): Record<string, CornerSums> {
    return Object.fromEntries(
      PREFIXES.map((p) => [
        p,
        { defl: 0, deflVel: 0, brakePress: 0, rumble: 0 },
      ])
    );
  }

  add(get: Getter, rawDt: number, onPitRoad: boolean, absOn: boolean): void {
    if (!(rawDt > 0)) return;
    const dt = Math.min(rawDt, MAX_DT);
    const speed = get('Speed') ?? 0;
    const lat = Math.abs(get('LatAccel') ?? 0);
    const lon = get('LongAccel') ?? 0;
    const steer = get('SteeringWheelAngle') ?? 0;
    const throttle = get('Throttle') ?? 0;

    this.time += dt;
    this.distance += speed * dt;
    if (steer > STEER_DEADBAND) this.latLeft += lat * speed * dt;
    else if (steer < -STEER_DEADBAND) this.latRight += lat * speed * dt;
    if (lon < 0) this.braking += -lon * speed * dt;
    else this.driving += lon * speed * dt;
    this.throttle += throttle * dt;
    this.brake += (get('Brake') ?? 0) * dt;
    if (speed > 5) {
      this.slip +=
        Math.abs(Math.atan2(get('VelocityY') ?? 0, get('VelocityX') ?? 0)) * dt;
    }
    this.yaw += Math.abs(get('YawRate') ?? 0) * dt;
    if (lat > 5) this.throttleInCorner += throttle * dt;
    if (onPitRoad) this.pit += dt;
    if (absOn) this.absTime += dt;
    this.air += (get('AirTemp') ?? 0) * dt;
    this.track += (get('TrackTemp') ?? 0) * dt;

    for (const p of PREFIXES) {
      const c = this.corners[p];
      c.defl += (get(`${p}shockDefl`) ?? 0) * dt;
      c.deflVel += Math.abs(get(`${p}shockVel`) ?? 0) * dt;
      c.brakePress += (get(`${p}brakeLinePress`) ?? 0) * dt;
      c.rumble += (get(`Tire${p}_RumblePitch`) ?? 0) * dt;
    }
  }

  get seconds(): number {
    return this.time;
  }

  /** Stint-wide sums as `key=value` pairs. */
  summary(): string {
    const t = this.time || 1;
    return [
      `dur=${f(this.time)}`,
      `pit=${f(this.pit)}`,
      `dist=${f(this.distance, 0)}`,
      `latL=${f(this.latLeft, 0)}`,
      `latR=${f(this.latRight, 0)}`,
      `brk=${f(this.braking, 0)}`,
      `acc=${f(this.driving, 0)}`,
      `thr=${f(this.throttle)}`,
      `brkPedal=${f(this.brake)}`,
      `slipDeg=${f((this.slip * 180) / Math.PI)}`,
      `yaw=${f(this.yaw, 2)}`,
      `abs=${f(this.absTime)}`,
      `thrCorner=${f(this.throttleInCorner)}`,
      `air=${f(this.air / t)}`,
      `track=${f(this.track / t)}`,
    ].join(' ');
  }

  /** One tire's sums as `key=value` pairs. */
  corner(prefix: string): string {
    const c = this.corners[prefix];
    return [
      `defl=${f(c.defl, 3)}`,
      `deflVel=${f(c.deflVel, 3)}`,
      `brakeP=${f(c.brakePress, 1)}`,
      `rumble=${f(c.rumble, 1)}`,
    ].join(' ');
  }

  reset(): void {
    this.time = 0;
    this.pit = 0;
    this.distance = 0;
    this.latLeft = 0;
    this.latRight = 0;
    this.braking = 0;
    this.driving = 0;
    this.throttle = 0;
    this.brake = 0;
    this.slip = 0;
    this.yaw = 0;
    this.absTime = 0;
    this.throttleInCorner = 0;
    this.air = 0;
    this.track = 0;
    this.corners = this.emptyCorners();
  }
}

/**
 * TEMPORARY: one second of load inputs, summed, for fitting the thermal model
 * offline against cockpit-dash screenshots matched by timestamp.
 *
 * `latS` is lateral work signed by steering (positive in left turns) and
 * `latRaw` the plain signed LatAccel, so the sign convention can be checked.
 * `vert` is speed times vertical acceleration (banking and bumps load the
 * tires) and `v3` speed cubed (aerodynamic load grows with speed squared).
 */
export class TireTraceSecond {
  private dt = 0;
  private v = 0;
  private lat = 0;
  private latS = 0;
  private lat2 = 0;
  private latRaw = 0;
  private vert = 0;
  private v3 = 0;
  private brk = 0;
  private acc = 0;
  private pit = 0;

  add(get: Getter, rawDt: number, onPitRoad: boolean): void {
    if (!(rawDt > 0)) return;
    const dt = Math.min(rawDt, MAX_DT);
    const speed = get('Speed') ?? 0;
    const latSigned = get('LatAccel') ?? 0;
    const lat = Math.abs(latSigned);
    const lon = get('LongAccel') ?? 0;
    const steer = get('SteeringWheelAngle') ?? 0;
    const side = steer > STEER_DEADBAND ? 1 : steer < -STEER_DEADBAND ? -1 : 0;
    this.dt += dt;
    this.v += speed * dt;
    this.lat += speed * lat * dt;
    this.latS += speed * lat * side * dt;
    this.lat2 += speed * lat * lat * dt;
    this.latRaw += latSigned * dt;
    this.vert += speed * (get('VertAccel') ?? 0) * dt;
    this.v3 += (speed * speed * speed * dt) / 1000;
    if (lon < 0) this.brk += -lon * speed * dt;
    else this.acc += lon * speed * dt;
    if (onPitRoad) this.pit += dt;
  }

  get seconds(): number {
    return this.dt;
  }

  /** The second's sums as `key=value` pairs; resets for the next second. */
  flush(): string {
    const line = [
      `dt=${f(this.dt, 2)}`,
      `v=${f(this.v)}`,
      `lat=${f(this.lat, 0)}`,
      `latS=${f(this.latS, 0)}`,
      `lat2=${f(this.lat2, 0)}`,
      `latRaw=${f(this.latRaw, 2)}`,
      `vert=${f(this.vert, 0)}`,
      `v3=${f(this.v3, 0)}`,
      `brk=${f(this.brk, 0)}`,
      `acc=${f(this.acc, 0)}`,
      `pit=${f(this.pit, 1)}`,
    ].join(' ');
    this.dt = 0;
    this.v = 0;
    this.lat = 0;
    this.latS = 0;
    this.lat2 = 0;
    this.latRaw = 0;
    this.vert = 0;
    this.v3 = 0;
    this.brk = 0;
    this.acc = 0;
    this.pit = 0;
    return line;
  }
}
