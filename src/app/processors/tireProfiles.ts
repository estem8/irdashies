/**
 * How a car's tires heat and cool, and where fresh ones start. Everything the
 * thermal model needs to know about a class of car lives here, so a new class
 * is one entry in PROFILES rather than a change to the model.
 */
export interface ThermalParams {
  /** Heat per unit of speed times lateral load, degrees per second. */
  heat: number;
  /** Base cooling rate toward ambient, per second. */
  cool: number;
  /** Speed (m/s) at which airflow doubles the cooling rate. */
  coolSpeed: number;
  /** Share of the cornering heat the rear tires get compared with the fronts. */
  rearShare: number;
  /** Share of the lateral load moved from the inside to the outside tires. */
  loadTransfer: number;
  /** Heat on the front tires per unit of speed times braking deceleration. */
  brakeHeat: number;
  /** Heat on the driven rear tires per unit of speed times acceleration. */
  accelHeat: number;
  /** Heat on every tire per unit of speed cubed (thousands): aerodynamic load. */
  aeroHeat: number;
  /** Extra heating of cold tires, as a share, fading out at `coldBelow` C. */
  coldBoost: number;
  coldBelow: number;
  /**
   * Heat per unit of driven-wheel slip (m/s beyond ordinary traction, times
   * throttle) and per degree the tire is over ambient.
   */
  spinHeat: number;
  /** Degrees over ambient beyond which wheelspin heats no faster. */
  spinHeatCap: number;
  /** Share of the spin heat when the car is held still against a wall. */
  spinStill: number;
  /**
   * Heat of the front tire surface from steering the car does not turn on
   * (scrub), found the Grip-O-Meter way: the yaw rate the steering angle should
   * give, learned while the front grips, against the yaw rate the car has. It
   * rides on top of the carcass temperature, what a dash that shows the
   * hottest spot reads, and does not enter the stop calibration.
   */
  scrub?: ScrubParams;
}

export interface ScrubParams {
  /** Steering angle (rad) the car may turn short of before scrub heat starts. */
  from: number;
  /** Degrees per second per rad of unexplained steering times speed. */
  heat: number;
  /** Decay time constant (s) standing, and extra decay rate per m/s. */
  tau: number;
  coolSpeed: number;
  /** Share of the heat moved from the inside to the outside tire. */
  outside: number;
}

/**
 * Names the set of constants below. Saved calibrations were learned against
 * this model, so change it whenever the numbers change.
 */
export const MODEL_VERSION = '2026-10-25-v35';

/**
 * The surface-temperature model for cars whose dash shows the tread surface,
 * which jumps and falls within seconds. See TireSurfaceModel.
 */
export interface SurfaceParams {
  /** Resting surface temperature over the air, front and rear. */
  frontRest: number;
  rearRest: number;
  /** Steering angle (rad) the scrub heat starts at, and its power. */
  scrubFrom: number;
  scrubPower: number;
  /** Front heat from steering angle times speed, and from cornering load. */
  frontScrub: number;
  frontCornering: number;
  /** Share of the cornering heat moved to the outside tires. */
  loadTransfer: number;
  /** Rear heat from wheelspin. */
  rearSpin: number;
  /** Braking heat into the disc, front and rear, per unit of speed times decel. */
  frontBrake: number;
  /** Extra front disc heat per pedal squared times speed: hard pedal heats more than deceleration says. */
  frontPedal: number;
  rearBrake: number;
  /**
   * The disc heat has a fast part, which reaches the tire within a second or
   * two (the dash jumps right after hard braking), and a slow part, which
   * keeps feeding it for tens of seconds after the car stops. This share of
   * the braking heat goes to the fast part, the rest to the slow one.
   */
  fastShare: number;
  /** Cooling of each part: base rate and extra per m/s of airflow. */
  fastCool: number;
  fastCoolSpeed: number;
  slowCool: number;
  slowCoolSpeed: number;
  /** How much of each part reaches the tire surface, per second. */
  fastToTire: number;
  slowToTire: number;
  /** Slow disc heat, in the model's own units, drawn as fully hot. */
  discFull: number;
  /** Surface decay: time constant in seconds and extra rate per m/s, front and rear. */
  frontTau: number;
  frontCoolSpeed: number;
  rearTau: number;
  rearCoolSpeed: number;
}

export interface TireProfile {
  thermal: ThermalParams;
  /**
   * Degrees over ambient that fresh tires start before the sim has reported
   * any; learned from the sim's even first reading when there is one.
   */
  freshOffset: number;
  /** Start temperature when a new session's first reading is still the last one's. */
  staleStart: number;
  /**
   * Set when the dash shows the tread surface rather than the tire: the shown
   * temperatures then come from the surface model.
   */
  surface?: SurfaceParams;
}

/**
 * Fitted second by second against cockpit-dash readings of the hottest zone of
 * each tire: about 500 readings over a Ferrari 296 GT3 at the Nordschleife,
 * Mugello and a skidpad, 2.8 C RMS, including a 20-minute stint and cool-down. Wheelspin: four wall burnouts, 1.5 C RMS.
 */
export const GT3_THERMAL: ThermalParams = {
  heat: 0.001924,
  cool: 0.0013,
  coolSpeed: 13,
  rearShare: 0.692,
  loadTransfer: 0.64,
  brakeHeat: 0.000662,
  accelHeat: 0.000974,
  aeroHeat: 0.001054,
  coldBoost: 0.178,
  coldBelow: 60,
  spinHeat: 0.0022,
  spinHeatCap: 66,
  spinStill: 0.27,
  // Two skidpad runs at full lock, fronts 20 -> 6-7 C RMS against the dash (fit on
  // one run, 10 C on the other). shortcut: one car, recheck on another track; the rears need nothing.
  scrub: { from: 0, heat: 0.0045, tau: 208, coolSpeed: 0.0351, outside: 0.16 },
};

/** Scales every source of heat, keeping the cooling. */
const heatScaled = (base: ThermalParams, scale: number): ThermalParams => ({
  ...base,
  scrub: undefined,
  heat: base.heat * scale,
  brakeHeat: base.brakeHeat * scale,
  accelHeat: base.accelHeat * scale,
  aeroHeat: base.aeroHeat * scale,
  spinHeat: base.spinHeat * scale,
});

export const DEFAULT_PROFILE: TireProfile = {
  thermal: GT3_THERMAL,
  // The dash read 34 C on leaving the pits with 21 C air, a GT3 35 C with 18.6.
  freshOffset: 16,
  // A new session started from the previous one's reading: 43 C at 18.6 C air,
  // 44 C at 23.5 C air. shortcut: two sessions of one car, recheck elsewhere.
  staleStart: 44,
};

/**
 * Cadillac V-Series.R: fitted to its dash over a skidpad run, a Monza run, a
 * Talladega stop-and-go run and a burnout test (about 1,900 readings): 14 C RMS, median 6 to 9 C. A front tire
 * the dash shows above 90 C is found by a model line at 78 C with precision and
 * recall near 0.7 on both the skidpad and Monza. Good for a warning, not for the number.
 */
const CADILLAC_SURFACE: SurfaceParams = {
  frontRest: 18.88,
  rearRest: 7.25,
  scrubFrom: 1.245,
  scrubPower: 2.19,
  frontScrub: 0.0783,
  frontCornering: 0.02196,
  loadTransfer: 0.183,
  rearSpin: 0.1213,
  frontBrake: 0.02782,
  frontPedal: 0.6285,
  rearBrake: 0.01548,
  fastShare: 0.465,
  fastCool: 0.863,
  fastCoolSpeed: 0.0017,
  slowCool: 0.0065,
  slowCoolSpeed: 0.022,
  fastToTire: 0.909,
  slowToTire: 0.187,
  discFull: 25,
  frontTau: 12.7,
  frontCoolSpeed: 0.01162,
  rearTau: 97.9,
  rearCoolSpeed: 0.00076,
};

/**
 * Per car, by the sim's car path. Only what differs from the default is
 * listed. A car without an entry runs on the GT3 fit and learns its own heat
 * gain at each stop.
 */
const PROFILES: Readonly<Record<string, Partial<TireProfile>>> = {
  cadillacvseriesrgtp: { surface: CADILLAC_SURFACE },
  // A NASCAR truck at Talladega, provisional: one 35-minute race with two
  // stops, no dash to read. The GT3 fit was 25 to 45 C low at the stop (74 to 90
  // C modelled against 98 to 125 C measured); a bit more heat, even load
  // between the sides (the left tires were as hot as the right) and more on
  // the rears brings the error from 26 C to 17 C. Not enough to say more.
  'trucks ram2026': {
    thermal: {
      ...heatScaled(GT3_THERMAL, 1.2),
      loadTransfer: 0,
      rearShare: 1.3,
    },
  },
  // No dash to fit against. Fresh tires start at 52 C with 18.8 C air, and the
  // GT3 fit overheated these tires by about 15 percent at the first stop
  // (gains 0.79 to 0.92), so the heat is scaled to match. Not dash-fitted.
  superformulasf23: {
    thermal: heatScaled(GT3_THERMAL, 0.85),
    freshOffset: 33,
  },
};

export const profileFor = (carPath: string | undefined): TireProfile => ({
  ...DEFAULT_PROFILE,
  ...(carPath ? PROFILES[carPath] : undefined),
});
