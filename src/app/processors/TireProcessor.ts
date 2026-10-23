import type {
  Session,
  SessionLifecycleEvent,
  Telemetry,
  TireCorner,
  TireCornerSnapshot,
  TireSnapshot,
} from '@irdashies/types';
import logger from '../logger';
import type { TelemetryProcessor } from './TelemetryProcessor';
import { TireStintStats } from './TireStintStats';
import { TireThermalModel } from './TireThermalModel';

const CORNERS: readonly [TireCorner, string][] = [
  ['lf', 'LF'],
  ['rf', 'RF'],
  ['lr', 'LR'],
  ['rr', 'RR'],
];

/** How often the diagnostic line is written while nothing changes. */
const DIAG_INTERVAL_S = 2;

const number = (frame: Telemetry, key: string): number | undefined => {
  const value = (frame as Record<string, { value?: unknown[] } | undefined>)[
    key
  ]?.value?.[0];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
};

const flag = (frame: Telemetry, key: string): number => {
  const value = (frame as Record<string, { value?: unknown[] } | undefined>)[
    key
  ]?.value?.[0];
  return value === true ? 1 : 0;
};

const zones = (
  frame: Telemetry,
  prefix: string,
  suffixes: readonly string[]
): [number, number, number] | undefined => {
  const [l, m, r] = suffixes.map((s) => number(frame, `${prefix}${s}`));
  return l === undefined || m === undefined || r === undefined
    ? undefined
    : [l, m, r];
};

type Zones = [number, number, number];

/** PitSvFlags bits that order a tire change, per corner. */
const TIRE_CHANGE_BIT: Record<TireCorner, number> = {
  lf: 0x1,
  rf: 0x2,
  lr: 0x4,
  rr: 0x8,
};

/** A stint shorter than this is too noisy to derive a wear rate from. */
const MIN_STINT_LAPS = 2;

interface CornerState {
  /** Tread at the start of the current stint, percent. */
  baseline: Zones;
  /** Fractional lap count when the stint began. */
  baselineLap: number;
  /** Percentage points lost per lap over the last measured stint. */
  rate?: Zones;
  /** Mean temperature at the previous reading, for the fit log. */
  lastMean: number;
  /** How each zone differs from the tire's mean temperature at the last reading. */
  tempOffset: Zones;
}

const mean = (z: Zones) => (z[0] + z[1] + z[2]) / 3;
const offsets = (z: Zones): Zones => {
  const m = mean(z);
  return [z[0] - m, z[1] - m, z[2] - m];
};
/**
 * Fresh tires start well over ambient: the cockpit dash read 34 C on leaving
 * the pits with 21 C air. Fitted stops tolerate it (3.4 C RMS against 2.2 C).
 */
const FRESH_TIRE_OFFSET = 13;
/** Used for ambient when the frame carries neither air nor track temperature. */
const DEFAULT_AMBIENT = 25;

const SETUP_CORNERS: Record<string, TireCorner> = {
  LeftFront: 'lf',
  RightFront: 'rf',
  LeftRear: 'lr',
  RightRear: 'rr',
};

/**
 * Camber per tire from the car setup. The layout of CarSetup differs between
 * cars, so rather than hard-code a path this takes the Camber of the first
 * LeftFront/RightFront/LeftRear/RightRear section found anywhere in it.
 */
const findCamber = (
  node: unknown,
  found: Partial<Record<TireCorner, number>> = {}
): Partial<Record<TireCorner, number>> => {
  if (node === null || typeof node !== 'object') return found;
  for (const [key, value] of Object.entries(node)) {
    const corner = SETUP_CORNERS[key];
    if (
      corner &&
      found[corner] === undefined &&
      value &&
      typeof value === 'object'
    ) {
      const raw = (value as Record<string, unknown>).Camber;
      const degrees = typeof raw === 'string' ? parseFloat(raw) : NaN;
      if (Number.isFinite(degrees)) found[corner] = degrees;
    }
    findCamber(value, found);
  }
  return found;
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Publishes tire carcass temperature and tread remaining.
 *
 * Established from recorded stints: iRacing only refreshes these readings when
 * a pit stop begins, and the reading describes the tires being taken off. It
 * does not refresh after fresh tires go on, so the next reading is the first
 * to describe them. Between stops the values are frozen.
 *
 * Temperature is estimated between stops by TireThermalModel and corrected
 * against each reading; before any driving it is passed through as reported.
 * Wear is tracked
 * per tire as a baseline (100 after a tire change, the reading otherwise) and,
 * once a stint has been measured, extrapolated at that stint's rate per lap.
 * A tire change is taken from the PitSvFlags bits at the moment the reading
 * refreshes, because the TiresUsed counters did not move in the recordings.
 * The first stint has no rate yet, so its wear is not estimated.
 *
 * TEMPORARY DIAGNOSTICS: onFrame writes a `[TireDiag]` line to main.log every
 * DIAG_INTERVAL_S seconds with the driving state and all raw tire values, plus
 * an immediate line whenever any wear value changes. Remove once the estimate
 * has been checked against a real stint.
 */
export class TireProcessor implements TelemetryProcessor<TireSnapshot> {
  readonly channel = 'tires.snapshot';
  readonly tickRateHz = 5;

  private enabled = true;
  private lastDiagTime = -Infinity;
  private lastWear = '';
  private lastReading = '';
  private keysLogged = false;
  private state: Partial<Record<TireCorner, CornerState>> = {};
  private readonly thermal = new TireThermalModel();
  private readonly stats = new TireStintStats();
  private stintNumber = 0;
  private lastTime: number | undefined;
  private camber: Partial<Record<TireCorner, number>> = {};
  private readonly latest: TireSnapshot = { corners: {}, version: 0 };

  init(session: Session): void {
    this.camber = findCamber(session.CarSetup);
  }

  onFrame(frame: Telemetry): void {
    if (!this.enabled) return;

    const temps: Partial<Record<TireCorner, Zones>> = {};
    const readings: Partial<Record<TireCorner, Zones>> = {};
    for (const [corner, prefix] of CORNERS) {
      const temp = zones(frame, `${prefix}tempC`, ['L', 'M', 'R']);
      const wear = zones(frame, `${prefix}wear`, ['L', 'M', 'R']);
      if (temp && wear) {
        temps[corner] = temp;
        readings[corner] = wear.map((w) => w * 100) as Zones;
      }
    }

    const lap = this.lapsNow(frame);
    const ambient = this.ambient(frame);
    this.stepThermal(frame);
    this.trackStints(frame, readings, temps, lap);

    const corners: Partial<Record<TireCorner, TireCornerSnapshot>> = {};
    for (const [corner] of CORNERS) {
      const temp = temps[corner];
      const st = this.state[corner];
      if (!temp || !st) continue;
      const driven = Math.max(0, lap - st.baselineLap);
      const wear = st.baseline.map((b, i) =>
        st.rate ? Math.max(0, b - st.rate[i] * driven) : b
      );
      const modelled = this.thermal.active
        ? this.thermal.mean(corner)
        : undefined;
      // The zone spread seen at the last reading builds up as the tire heats,
      // so it is applied in proportion to how far this tire has warmed.
      const warmed =
        modelled !== undefined && st.lastMean > ambient + 5
          ? Math.min(
              1,
              Math.max(0, (modelled - ambient) / (st.lastMean - ambient))
            )
          : 1;
      const shown =
        modelled === undefined
          ? temp
          : (st.tempOffset.map((o) => modelled + o * warmed) as Zones);
      corners[corner] = {
        temp: shown.map(Math.round) as Zones,
        ...(this.camber[corner] !== undefined && {
          camber: this.camber[corner],
        }),
        tempEstimated: modelled !== undefined,
        wear: wear.map(round1) as Zones,
        estimated: st.rate !== undefined,
        ...(st.rate && { wearPerLap: st.rate.map(round2) as Zones }),
      };
    }

    if (this.changed(corners)) {
      this.latest.corners = corners;
      this.latest.version += 1;
    }

    this.logDiagnostics(frame);
    this.logKeys(frame);
  }

  /** One-time list of tire-ish variables the car publishes, to find a live source. */
  private logKeys(frame: Telemetry): void {
    if (this.keysLogged) return;
    const keys = Object.keys(frame);
    if (keys.length === 0) return;
    this.keysLogged = true;
    const found = keys.filter((k) =>
      /tire|tyre|temp|press|wear|^(LF|RF|LR|RR)/i.test(k)
    );
    logger.info(`[TireDiag] keys(${keys.length}): ${found.join(' ')}`);
  }

  /** Feeds the thermal model one frame of driving. */
  private stepThermal(frame: Telemetry): void {
    const time = number(frame, 'SessionTime');
    const dt =
      time !== undefined && this.lastTime !== undefined
        ? time - this.lastTime
        : 0;
    this.lastTime = time;
    if (flag(frame, 'IsOnTrack') !== 1) return;
    this.stats.add(
      (key) => number(frame, key),
      dt,
      flag(frame, 'OnPitRoad') === 1,
      flag(frame, 'BrakeABSactive') === 1
    );
    this.thermal.step({
      dt,
      speed: number(frame, 'Speed') ?? 0,
      lateral: Math.abs(number(frame, 'LatAccel') ?? 0),
      longitudinal: number(frame, 'LongAccel') ?? 0,
      steer: number(frame, 'SteeringWheelAngle') ?? 0,
      ambient: this.ambient(frame),
    });
  }

  private ambient(frame: Telemetry): number {
    return (
      number(frame, 'AirTemp') ?? number(frame, 'TrackTemp') ?? DEFAULT_AMBIENT
    );
  }

  /** Completed laps plus the fraction of the current one. */
  private lapsNow(frame: Telemetry): number {
    return (
      Math.max(0, number(frame, 'LapCompleted') ?? 0) +
      (number(frame, 'LapDistPct') ?? 0)
    );
  }

  /**
   * A reading that differs from the previous one is a refresh: it closes the
   * stint that just ended and opens the next. The first reading after a reset
   * only seeds the baseline, since it says nothing about a finished stint.
   */
  private trackStints(
    frame: Telemetry,
    readings: Partial<Record<TireCorner, Zones>>,
    temps: Partial<Record<TireCorner, Zones>>,
    lap: number
  ): void {
    const key = JSON.stringify(readings);
    if (key === '{}' || key === this.lastReading) return;
    const seeding = this.lastReading === '';
    this.lastReading = key;
    const flags = number(frame, 'PitSvFlags') ?? 0;
    const ambient = this.ambient(frame);

    for (const [corner] of CORNERS) {
      const reading = readings[corner];
      const temp = temps[corner];
      if (!reading || !temp) continue;
      const st = this.state[corner];
      if (seeding || !st) {
        this.state[corner] = {
          baseline: reading,
          baselineLap: lap,
          tempOffset: offsets(temp),
          lastMean: mean(temp),
        };
        // The reading frozen in the sim describes the tires last taken off, so a
        // hot one at start-up is stale: assume fresh tires instead of heating a
        // model from it. A cold reading is kept as it is.
        this.thermal.set(
          corner,
          Math.min(mean(temp), this.ambient(frame) + FRESH_TIRE_OFFSET)
        );
        continue;
      }
      const stintLaps = lap - st.baselineLap;
      if (stintLaps >= MIN_STINT_LAPS) {
        const rate = st.baseline.map(
          (b, i) => (b - reading[i]) / stintLaps
        ) as Zones;
        if (rate.every((r) => r >= 0)) st.rate = rate;
      }
      const changed = (flags & TIRE_CHANGE_BIT[corner]) !== 0;
      st.baseline = changed ? [100, 100, 100] : reading;
      st.baselineLap = lap;
      logger.info(
        `[TireFit] stint=${this.stintNumber} ${corner} start=${st.lastMean.toFixed(1)}` +
          ` end=${mean(temp).toFixed(1)} zones=${temp.map((z) => z.toFixed(1)).join('/')}` +
          ` changed=${(flags & TIRE_CHANGE_BIT[corner]) !== 0 ? 1 : 0}` +
          ` camber=${this.camber[corner] ?? 'n/a'}` +
          ` ${this.stats.corner(corner.toUpperCase())}`
      );
      st.lastMean = mean(temp);
      const predicted = this.thermal.mean(corner);
      this.thermal.calibrate(corner, mean(temp));
      logger.info(
        `[TireDiag] CALIB ${corner} predicted=${predicted?.toFixed(1)}` +
          ` measured=${mean(temp).toFixed(1)} ambient=${ambient.toFixed(1)}` +
          ` gain=${this.thermal.gainOf(corner).toFixed(2)} changed=${changed ? 1 : 0}`
      );
      // The reading describes the tires being removed. Fresh ones start at
      // ambient and carry no zone spread yet.
      this.thermal.set(
        corner,
        changed ? ambient + FRESH_TIRE_OFFSET : mean(temp)
      );
      st.tempOffset = offsets(temp);
    }

    if (!seeding) {
      logger.info(
        `[TireFit] stint=${this.stintNumber} ${this.stats.summary()} sv=${flags}`
      );
      this.stintNumber += 1;
    }
    this.stats.reset();
  }

  private changed(next: Partial<Record<TireCorner, TireCornerSnapshot>>) {
    const current = this.latest.corners;
    return CORNERS.some(([corner]) => {
      const a = current[corner];
      const b = next[corner];
      if (!a || !b) return a !== b;
      return (
        a.estimated !== b.estimated ||
        a.tempEstimated !== b.tempEstimated ||
        a.camber !== b.camber ||
        a.temp.some((v, i) => v !== b.temp[i]) ||
        a.wear.some((v, i) => v !== b.wear[i]) ||
        (a.wearPerLap ?? []).join() !== (b.wearPerLap ?? []).join()
      );
    });
  }

  private logDiagnostics(frame: Telemetry): void {
    const time = number(frame, 'SessionTime') ?? 0;
    const raw = CORNERS.map(([, prefix]) => {
      const t = ['L', 'M', 'R'].map((z) => number(frame, `${prefix}tempC${z}`));
      const w = ['L', 'M', 'R'].map((z) => number(frame, `${prefix}wear${z}`));
      return `${prefix} t=${t.join('/')} w=${w.join('/')}`;
    });
    const wearKey = CORNERS.flatMap(([, prefix]) =>
      ['L', 'M', 'R'].map((z) => number(frame, `${prefix}wear${z}`))
    ).join(',');

    const wearChanged = wearKey !== this.lastWear;
    if (!wearChanged && time - this.lastDiagTime < DIAG_INTERVAL_S) return;
    this.lastDiagTime = time;
    this.lastWear = wearKey;

    logger.info(
      `[TireDiag] ${wearChanged ? 'WEAR-CHANGED ' : ''}t=${time.toFixed(1)}` +
        ` onTrack=${flag(frame, 'IsOnTrack')}` +
        ` pitRoad=${flag(frame, 'OnPitRoad')}` +
        ` pitStall=${flag(frame, 'PlayerCarInPitStall')}` +
        ` service=${flag(frame, 'PitstopActive')}` +
        ` speed=${(number(frame, 'Speed') ?? -1).toFixed(1)}` +
        ` compound=${number(frame, 'PlayerTireCompound') ?? -1}` +
        ` lap=${number(frame, 'Lap') ?? -1}` +
        ` done=${number(frame, 'LapCompleted') ?? -1}` +
        ` sets=${number(frame, 'TireSetsUsed') ?? -1}` +
        ` used=${['LF', 'RF', 'LR', 'RR'].map((c) => number(frame, `${c}TiresUsed`) ?? -1).join('/')}` +
        ` svTires=${number(frame, 'PitSvFlags') ?? -1}` +
        ` | ${raw.join(' | ')}`
    );
  }

  onLifecycle(event: SessionLifecycleEvent): void {
    if (event.type === 'enter') {
      this.enabled = !event.replay;
    }
    this.latest.corners = {};
    this.latest.version += 1;
    this.lastWear = '';
    this.lastReading = '';
    this.state = {};
    this.thermal.reset();
    this.stats.reset();
    this.stintNumber = 0;
    this.lastTime = undefined;
  }

  snapshot(): TireSnapshot {
    return this.latest;
  }
}
