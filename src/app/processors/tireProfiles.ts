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
}

/**
 * Names the set of constants below. Saved calibrations were learned against
 * this model, so change it whenever the numbers change.
 */
export const MODEL_VERSION = '2026-10-25-v31';

export interface TireProfile {
  thermal: ThermalParams;
  /**
   * Degrees over ambient that fresh tires start before the sim has reported
   * any; learned from the sim's even first reading when there is one.
   */
  freshOffset: number;
  /** Start temperature when a new session's first reading is still the last one's. */
  staleStart: number;
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
};

/** Scales every source of heat, keeping the cooling. */
const heatScaled = (base: ThermalParams, scale: number): ThermalParams => ({
  ...base,
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
 * Per car, by the sim's car path. Only what differs from the default is
 * listed. A car without an entry runs on the GT3 fit and learns its own heat
 * gain at each stop.
 */
const PROFILES: Readonly<Record<string, Partial<TireProfile>>> = {
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
