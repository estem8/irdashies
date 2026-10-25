import type {
  Session,
  SessionLifecycleEvent,
  Telemetry,
  TireCorner,
  TireCornerSnapshot,
  TireSnapshot,
} from '@irdashies/types';
import { startTyreRun, tyreLog } from '../tyreLog';
import {
  calibrationKey,
  startingGains,
  type TireCalibrationStore,
} from './tireCalibration';
import { TireSurfaceModel } from './TireSurfaceModel';
import {
  DEFAULT_PROFILE,
  MODEL_VERSION,
  profileFor,
  type TireProfile,
} from './tireProfiles';
import type { TelemetryProcessor } from './TelemetryProcessor';
import { TireStintStats, TireTraceSecond } from './TireStintStats';
import { NO_SLIP, TireSlipEstimator } from './TireSlipEstimator';
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
  /** Fitted new at the last stop. */
  fresh?: boolean;
  /** How each zone differs from the tire's mean temperature at the last reading. */
  tempOffset: Zones;
}

/** The cockpit dash shows the hottest zone of each tire, not the mean. */
const peak = (z: Zones) => Math.max(z[0], z[1], z[2]);
const offsets = (z: Zones): Zones => {
  const m = peak(z);
  return [z[0] - m, z[1] - m, z[2] - m];
};
/** Driven-wheel slip, m/s, below which wheelspin is ordinary traction. */
const SPIN_HEAT_GRACE = 1.5;
/** Used for ambient when the frame carries neither air nor track temperature. */
const DEFAULT_AMBIENT = 25;

const SETUP_CORNERS: Record<string, TireCorner> = {
  LeftFront: 'lf',
  RightFront: 'rf',
  LeftRear: 'lr',
  RightRear: 'rr',
};

interface Alignment {
  camber: Partial<Record<TireCorner, number>>;
  /** As the sim formats it, for display. */
  toe: Partial<Record<TireCorner, string>>;
  /** Per tire, degrees; positive is toe-in. */
  toeDeg: Partial<Record<TireCorner, number>>;
  /** Every setup value that was read, path=value, for the diagnostic log. */
  seen: string[];
}

/** Toe in mm is a length across the tire; this is the span it is measured over. */
const TOE_SPAN_MM = 600;

/**
 * One tire's toe as an angle, or undefined for a unit not understood. An axle
 * value is the total for both tires, so each gets half.
 */
const toeAngle = (text: string, perAxle: boolean): number | undefined => {
  const value = parseFloat(text);
  if (!Number.isFinite(value)) return undefined;
  const share = perAxle ? value / 2 : value;
  if (/deg|°/i.test(text)) return share;
  if (/mm/i.test(text)) return (Math.atan(share / TOE_SPAN_MM) * 180) / Math.PI;
  return undefined;
};

const cornersOf = (path: readonly string[]): readonly TireCorner[] => {
  for (const segment of [...path].reverse()) {
    const corner = SETUP_CORNERS[segment];
    if (corner) return [corner];
  }
  const joined = path.join('/');
  if (/front/i.test(joined)) return ['lf', 'rf'];
  if (/rear/i.test(joined)) return ['lr', 'rr'];
  return [];
};

/**
 * Camber and toe per tire from the car setup. The layout of CarSetup differs
 * between cars, so rather than hard-code paths this walks it: a Camber value
 * belongs to the LeftFront/RightFront/LeftRear/RightRear section it sits in,
 * and a value whose name contains "toe" to that section, or to both tires of
 * an axle when its path only says front or rear. The first value found for a
 * tire wins.
 */
const findAlignment = (
  node: unknown,
  path: string[] = [],
  found: Alignment = { camber: {}, toe: {}, toeDeg: {}, seen: [] }
): Alignment => {
  if (node === null || typeof node !== 'object') return found;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      const isCamber = key === 'Camber';
      const isToe = /toe/i.test(key);
      if (!isCamber && !isToe) continue;
      found.seen.push(`${[...path, key].join('/')}=${value}`);
      const corners = cornersOf(path);
      const perAxle = corners.length === 2;
      for (const corner of corners) {
        if (isCamber && found.camber[corner] === undefined) {
          const degrees = parseFloat(value);
          if (Number.isFinite(degrees)) found.camber[corner] = degrees;
        }
        if (isToe && found.toe[corner] === undefined) {
          found.toe[corner] = value;
          const angle = toeAngle(value, perAxle);
          if (angle !== undefined) found.toeDeg[corner] = angle;
        }
      }
    } else {
      findAlignment(value, [...path, key], found);
    }
  }
  return found;
};

/** Pit-menu checkboxes, per tire or per side, that order a tire change. */
const TIRE_CHANGE_BOXES: readonly [string, number][] = [
  ['dpLFTireChange', 0x1],
  ['dpRFTireChange', 0x2],
  ['dpLRTireChange', 0x4],
  ['dpRRTireChange', 0x8],
  ['dpLTireChange', 0x1 | 0x4],
  ['dpRTireChange', 0x2 | 0x8],
];

/**
 * Which tires are being changed, as bits per TIRE_CHANGE_BIT. Read from the
 * service flags and the pit-menu boxes together, since cars use either.
 */
const requestedChanges = (frame: Telemetry): number => {
  let bits = (number(frame, 'PitSvFlags') ?? 0) & 0xf;
  for (const [key, bit] of TIRE_CHANGE_BOXES) {
    if ((number(frame, key) ?? 0) > 0) bits |= bit;
  }
  return bits;
};

/** The hot pressure if the sim sends one (kPa), else the cold set pressure. */
const pressureOf = (frame: Telemetry, corner: TireCorner) => {
  const prefix = CORNERS.find(([c]) => c === corner)?.[1];
  const hot = number(frame, `${prefix}pressure`);
  if (hot !== undefined && hot > 0) return { pressure: hot, pressureHot: true };
  const cold = number(frame, `${prefix}coldPressure`);
  return cold !== undefined && cold > 0 ? { pressure: cold } : {};
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
  // Fast enough for the slip highlights to follow ABS and wheelspin.
  readonly tickRateHz = 15;

  private enabled = true;
  private lastDiagTime = -Infinity;
  private lastWear = '';
  private lastReading = '';
  private keysLogged = false;
  private state: Partial<Record<TireCorner, CornerState>> = {};
  private readonly thermal = new TireThermalModel();
  /** What is known about this car's tires; the default until a session names the car. */
  private profile: TireProfile = DEFAULT_PROFILE;
  /** The tread surface, for cars whose dash shows it instead of the tire. */
  private surface: TireSurfaceModel | undefined;
  private profileCar: string | undefined;
  /** Where this car and track's learned gains are kept; none until a session names them. */
  private calibrationKey: string | undefined;
  /** Stops already counted in the saved calibration. */
  private calibratedStops = 0;
  private readonly stats = new TireStintStats();
  private readonly trace = new TireTraceSecond();
  private readonly slipEstimator = new TireSlipEstimator();
  private stintNumber = 0;
  private lastTime: number | undefined;
  private slip = NO_SLIP;
  /** Suspension travel (m) of each corner when last standing still. */
  private rest: Partial<Record<TireCorner, number>> = {};
  /**
   * How far over ambient fresh tires start. It differs by car (34 C on one,
   * 27 C on another at the same air), so it is learned from tires that were
   * fitted fresh and barely worked before their next reading.
   */
  private freshOffset = DEFAULT_PROFILE.freshOffset;
  /**
   * A stop in progress: the tire changes already applied at the reading, and
   * whether the service has been seen running.
   */
  private service: { applied: number; running: boolean } | undefined;
  /** Tire changes requested at any time while the service ran. */
  private pendingBits = 0;
  /**
   * The tire changes ordered as the car last left the track for the pits. The
   * sim clears the flags in the box, and in some cars the service never reports
   * as active, so by the time the reading refreshes only this still tells.
   */
  private orderedBits = 0;
  private alignment: Alignment = { camber: {}, toe: {}, toeDeg: {}, seen: [] };
  private loggedSetup = '';
  private readonly latest: TireSnapshot = {
    corners: {},
    slip: NO_SLIP,
    version: 0,
  };

  constructor(private readonly calibrations?: TireCalibrationStore) {}

  init(session: Session): void {
    const car = session.DriverInfo?.Drivers?.find(
      (d) => d.CarIdx === session.DriverInfo.DriverCarIdx
    );
    const track = session.WeekendInfo?.TrackName ?? 'track';
    const sub = session.WeekendInfo?.SubSessionID ?? 0;
    const label = `${car?.CarPath ?? 'car'} ${track}`;
    startTyreRun(`${label} ${sub}`, label, car?.CarPath);
    const key = car?.CarPath ? calibrationKey(car.CarPath, track) : undefined;
    if (key !== this.calibrationKey) {
      this.calibrationKey = key;
      this.applySavedGains();
    }
    if (car?.CarPath !== this.profileCar) {
      this.profileCar = car?.CarPath;
      this.profile = profileFor(car?.CarPath);
      this.thermal.configure(this.profile.thermal);
      this.surface = this.profile.surface
        ? new TireSurfaceModel(this.profile.surface)
        : undefined;
      this.freshOffset = this.profile.freshOffset;
    }
    tyreLog(
      `[TireDiag] RUN car=${car?.CarScreenName} path=${car?.CarPath} track=${track}` +
        ` subsession=${sub} airTemp=${session.WeekendInfo?.TrackAirTemp}`
    );
    this.alignment = findAlignment(session.CarSetup);
    const seen = this.alignment.seen.join(' ');
    if (seen !== this.loggedSetup) {
      this.loggedSetup = seen;
      tyreLog(`[TireDiag] SETUP ${seen || 'no camber or toe found'}`);
    }
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
    if (flag(frame, 'OnPitRoad') !== 1)
      this.orderedBits = requestedChanges(frame);
    this.trackStints(frame, readings, temps, lap);
    this.followService(frame, lap);

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
      const surface = this.surface?.active
        ? this.surface.temp(corner, ambient)
        : undefined;
      const shown =
        surface !== undefined
          ? ([surface, surface, surface] as Zones)
          : modelled === undefined
            ? temp
            : (st.tempOffset.map((o) => modelled + o * warmed) as Zones);
      corners[corner] = {
        temp: shown.map(Math.round) as Zones,
        ...(this.alignment.camber[corner] !== undefined && {
          camber: this.alignment.camber[corner],
        }),
        ...(this.alignment.toe[corner] !== undefined && {
          toe: this.alignment.toe[corner],
        }),
        ...(this.alignment.toeDeg[corner] !== undefined && {
          toeDeg: this.alignment.toeDeg[corner],
        }),
        ...pressureOf(frame, corner),
        ...this.loadOf(frame, corner),
        ...(this.surface?.active && {
          disc: Math.round(this.surface.discLevel(corner) * 20) / 20,
        }),
        tempEstimated: modelled !== undefined || surface !== undefined,
        wear: wear.map(round1) as Zones,
        estimated: st.rate !== undefined,
        ...(st.rate && { wearPerLap: st.rate.map(round2) as Zones }),
      };
    }

    const slip = this.slip;
    const slipChanged = (Object.keys(slip) as (keyof typeof slip)[]).some(
      (key) => slip[key] !== this.latest.slip?.[key]
    );
    if (this.changed(corners) || slipChanged) {
      this.latest.corners = corners;
      this.latest.slip = slip;
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
    tyreLog(`[TireDiag] keys(${keys.length}): ${found.join(' ')}`);
  }

  /** Load on a tire from its suspension travel against its standstill travel. */
  private loadOf(frame: Telemetry, corner: TireCorner) {
    const prefix = CORNERS.find(([c]) => c === corner)?.[1];
    const travel = number(frame, `${prefix}shockDefl`);
    if (travel === undefined || travel <= 0) return {};
    const speed = number(frame, 'Speed');
    if (speed !== undefined && speed < 0.5) this.rest[corner] = travel;
    const rest = this.rest[corner];
    return rest ? { load: Math.round((travel / rest) * 20) / 20 } : {};
  }

  /** Feeds the thermal model one frame of driving. */
  private stepThermal(frame: Telemetry): void {
    const time = number(frame, 'SessionTime');
    const dt =
      time !== undefined && this.lastTime !== undefined
        ? time - this.lastTime
        : 0;
    this.lastTime = time;
    if (flag(frame, 'IsOnTrack') !== 1) {
      this.slip = NO_SLIP;
      return;
    }
    this.slip = this.slipEstimator.update(
      (key) => number(frame, key),
      dt,
      flag(frame, 'OnPitRoad') === 1,
      flag(frame, 'BrakeABSactive') === 1
    );
    this.stats.add(
      (key) => number(frame, key),
      dt,
      flag(frame, 'OnPitRoad') === 1,
      flag(frame, 'BrakeABSactive') === 1
    );
    const driveSlip =
      Math.max(0, this.slipEstimator.slipSpeed - SPIN_HEAT_GRACE) *
      (number(frame, 'Throttle') ?? 0);
    this.trace.add(
      (key) => number(frame, key),
      dt,
      flag(frame, 'OnPitRoad') === 1,
      this.slip,
      driveSlip
    );
    if (this.trace.seconds >= 1) {
      const temps = CORNERS.map(
        ([corner]) => this.thermal.mean(corner)?.toFixed(1) ?? '-'
      ).join('/');
      tyreLog(
        `[TireTrace] t=${(time ?? 0).toFixed(1)} ${this.trace.flush()} T=${temps}`
      );
    }
    const input = {
      dt,
      speed: number(frame, 'Speed') ?? 0,
      lateral: number(frame, 'LatAccel') ?? 0,
      longitudinal: number(frame, 'LongAccel') ?? 0,
      driveSlip,
      ambient: this.ambient(frame),
    };
    this.thermal.step(input);
    this.surface?.step({
      ...input,
      steering: Math.abs(number(frame, 'SteeringWheelAngle') ?? 0),
      brake: number(frame, 'Brake') ?? 0,
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
   * The reading arrives as the service starts, but which tires get changed is
   * often settled in the pit menu while it runs: in recorded stops the flags
   * were still clear at the reading and the tires were changed anyway. So the
   * requested changes are collected until the service ends, and any tire
   * ordered in that time is treated as fresh from then on.
   */
  private followService(frame: Telemetry, lap: number): void {
    if (!this.service) return;
    const active = flag(frame, 'PitstopActive') === 1;
    const requested = requestedChanges(frame);
    if (active) {
      this.service.running = true;
      this.pendingBits |= requested;
      return;
    }
    const left = flag(frame, 'OnPitRoad') !== 1;
    if (!this.service.running && !left) return;
    const late = this.pendingBits & ~this.service.applied;
    const ambient = this.ambient(frame);
    for (const [corner] of CORNERS) {
      const st = this.state[corner];
      if (!st || (late & TIRE_CHANGE_BIT[corner]) === 0) continue;
      st.baseline = [100, 100, 100];
      st.baselineLap = lap;
      st.fresh = true;
      this.thermal.set(corner, ambient + this.freshOffset);
    }
    if (late) tyreLog(`[TireDiag] SERVICE late tire change bits=${late}`);
    this.service = undefined;
    this.pendingBits = 0;
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
    const gainsBefore = JSON.stringify(this.thermal.gains());
    const flags = requestedChanges(frame) || this.orderedBits;
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
          lastMean: peak(temp),
        };
        // The reading frozen in the sim describes the tires last taken off, so a
        // hot one at start-up is stale: assume fresh tires instead of heating a
        // model from it. A cold reading is kept as it is.
        // The sim reports fresh tires as one value across the zones (34.6 C
        // at 18.6 C air, matching the dash), so an even reading is the real
        // start and also teaches the offset used for later fresh sets.
        if (Math.max(...temp) - Math.min(...temp) < 1) {
          this.freshOffset = Math.min(30, Math.max(0, peak(temp) - ambient));
          this.thermal.set(corner, peak(temp));
        } else {
          this.thermal.set(
            corner,
            Math.min(peak(temp), this.profile.staleStart)
          );
        }
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
      tyreLog(
        `[TireFit] stint=${this.stintNumber} ${corner} start=${st.lastMean.toFixed(1)}` +
          ` end=${peak(temp).toFixed(1)} zones=${temp.map((z) => z.toFixed(1)).join('/')}` +
          ` changed=${(flags & TIRE_CHANGE_BIT[corner]) !== 0 ? 1 : 0}` +
          ` camber=${this.alignment.camber[corner] ?? 'n/a'}` +
          ` ${this.stats.corner(corner.toUpperCase())}`
      );
      st.lastMean = peak(temp);
      if (st.fresh && this.thermal.heated(corner) < 2) {
        const offset = Math.min(30, Math.max(0, peak(temp) - ambient));
        this.freshOffset = (this.freshOffset + offset) / 2;
        tyreLog(
          `[TireDiag] FRESH ${corner} start=${peak(temp).toFixed(1)} offset=${this.freshOffset.toFixed(1)}`
        );
      }
      const predicted = this.thermal.mean(corner);
      this.thermal.calibrate(corner, peak(temp));
      tyreLog(
        `[TireDiag] CALIB ${corner} predicted=${predicted?.toFixed(1)}` +
          ` measured=${peak(temp).toFixed(1)} ambient=${ambient.toFixed(1)}` +
          ` gain=${this.thermal.gainOf(corner).toFixed(2)} changed=${changed ? 1 : 0}`
      );
      // The reading describes the tires being removed. Fresh ones start at
      // ambient and carry no zone spread yet.
      this.thermal.set(
        corner,
        changed ? ambient + this.freshOffset : peak(temp)
      );
      st.tempOffset = offsets(temp);
      st.fresh = changed;
    }

    if (!seeding) {
      this.service = { applied: flags, running: false };
      tyreLog(
        `[TireFit] stint=${this.stintNumber} ${this.stats.summary()} sv=${flags}`
      );
      this.stintNumber += 1;
      if (JSON.stringify(this.thermal.gains()) !== gainsBefore)
        this.saveGains();
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
        a.toe !== b.toe ||
        a.toeDeg !== b.toeDeg ||
        a.pressure !== b.pressure ||
        a.disc !== b.disc ||
        a.load !== b.load ||
        a.temp.some((v, i) => v !== b.temp[i]) ||
        a.wear.some((v, i) => v !== b.wear[i]) ||
        (a.wearPerLap ?? []).join() !== (b.wearPerLap ?? []).join()
      );
    });
  }

  private logDiagnostics(frame: Telemetry): void {
    const time = number(frame, 'SessionTime') ?? 0;
    const wearKey = CORNERS.flatMap(([, prefix]) =>
      ['L', 'M', 'R'].map((z) => number(frame, `${prefix}wear${z}`))
    ).join(',');

    const wearChanged = wearKey !== this.lastWear;
    if (!wearChanged && time - this.lastDiagTime < DIAG_INTERVAL_S) return;
    this.lastDiagTime = time;
    this.lastWear = wearKey;

    const raw = CORNERS.map(([, prefix]) => {
      const t = ['L', 'M', 'R'].map((z) => number(frame, `${prefix}tempC${z}`));
      const w = ['L', 'M', 'R'].map((z) => number(frame, `${prefix}wear${z}`));
      return `${prefix} t=${t.join('/')} w=${w.join('/')} p=${number(frame, `${prefix}coldPressure`)}/${number(frame, `${prefix}pressure`)}`;
    });

    tyreLog(
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
    this.clear();
  }

  /** Starts the tires from what this car and track taught the model before. */
  private applySavedGains(): void {
    const saved =
      this.calibrationKey === undefined
        ? undefined
        : this.calibrations?.load(this.calibrationKey);
    this.calibratedStops = saved?.stops ?? 0;
    const gains = startingGains(saved, Date.now());
    if (gains) this.thermal.setGains(gains);
  }

  private saveGains(): void {
    if (!this.calibrations || this.calibrationKey === undefined) return;
    // A gain far from 1 means the model was wrong for this car (a burnout it
    // overheated by three times), not that the tire is unusual: keep nothing.
    const gains = this.thermal.gains();
    if (Object.values(gains).some((g) => g < 0.5 || g > 2)) return;
    this.calibratedStops += 1;
    this.calibrations.save(this.calibrationKey, {
      model: MODEL_VERSION,
      gains,
      stops: this.calibratedStops,
      updatedAt: Date.now(),
    });
  }

  private clear(): void {
    this.latest.corners = {};
    this.latest.version += 1;
    this.lastWear = '';
    this.lastReading = '';
    this.state = {};
    this.rest = {};
    this.thermal.reset();
    this.surface?.reset();
    this.applySavedGains();
    this.stats.reset();
    this.slipEstimator.reset();
    this.slip = NO_SLIP;
    this.service = undefined;
    this.pendingBits = 0;
    this.orderedBits = 0;
    this.freshOffset = this.profile.freshOffset;
    this.lastDiagTime = -Infinity;
    this.stintNumber = 0;
    this.lastTime = undefined;
  }

  snapshot(): TireSnapshot {
    return this.latest;
  }
}
