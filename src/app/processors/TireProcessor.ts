import type {
  Session,
  SessionLifecycleEvent,
  Telemetry,
  TireCorner,
  TireCornerSnapshot,
  TireSnapshot,
} from '@irdashies/types';
import {
  calibrationKey,
  fromTelemetryFrame,
  isSavable,
  MODEL_VERSION,
  OverlayModel,
  startingGains,
  type ModelEvent,
  type TelemetryFrame,
  type TireCalibrationStore,
} from 'iracing-tire-lab/model';
import { SdkDump } from './sdkDump';
import { startTyreRun, stamp, tyreFile, tyreLog } from '../tyreLog';
import type { TelemetryProcessor } from './TelemetryProcessor';
import { TireStintStats, TireTraceSecond } from './TireStintStats';
import { NO_SLIP, SPIN_GRACE, TireSlipEstimator } from './TireSlipEstimator';

const CORNERS: readonly [TireCorner, string][] = [
  ['lf', 'LF'],
  ['rf', 'RF'],
  ['lr', 'LR'],
  ['rr', 'RR'],
];
/** The sim's variable prefix of each tire: LF, RF, LR, RR. */
const PREFIX = Object.fromEntries(CORNERS) as Record<TireCorner, string>;

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

const sameInEveryZone = (value: number): Zones => [value, value, value];

/** A stint shorter than this is too noisy to derive a wear rate from. */
const MIN_STINT_LAPS = 2;

/** What the overlay tracks per tire between readings; the temperature estimate is the model's. */
interface WearState {
  /** Tread at the start of the current stint, percent. */
  baseline: Zones;
  /** Fractional lap count when the stint began. */
  baselineLap: number;
  /** Percentage points lost per lap over the last measured stint. */
  rate?: Zones;
}

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
      // Caster is not used by any model yet; it is only logged to see the values.
      if (/caster/i.test(key))
        found.seen.push(`${[...path, key].join('/')}=${value}`);
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

/** Whether a tire would draw the same: every field a card shows, compared. */
const sameCorner = (a: TireCornerSnapshot, b: TireCornerSnapshot) =>
  a.estimated === b.estimated &&
  a.tempEstimated === b.tempEstimated &&
  a.camber === b.camber &&
  a.toe === b.toe &&
  a.toeDeg === b.toeDeg &&
  a.pressure === b.pressure &&
  a.pressureHot === b.pressureHot &&
  a.pressureEstimated === b.pressureEstimated &&
  a.disc === b.disc &&
  (a.tempReal ?? []).join() === (b.tempReal ?? []).join() &&
  a.load === b.load &&
  a.temp.every((v, i) => v === b.temp[i]) &&
  a.wear.every((v, i) => v === b.wear[i]) &&
  (a.wearPerLap ?? []).join() === (b.wearPerLap ?? []).join();

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
  private keysLogged = false;
  /**
   * The temperature, tread, brake disc and pressure estimate: the tire physics
   * and the pit-stop state machine that reconciles it with the sim's readings.
   * It lives in iracing-tire-lab, where it is measured against recordings.
   */
  private model: OverlayModel;
  private wear: Partial<Record<TireCorner, WearState>> = {};
  private profileCar: string | undefined;
  /** Where this car and track's learned gains are kept; none until a session names them. */
  private calibrationKey: string | undefined;
  /** Stops already counted in the saved calibration. */
  private calibratedStops = 0;
  /** The model's gains as of the last stop, to tell whether a stop changed them. */
  private gainsKey = '';
  private readonly stats = new TireStintStats();
  private readonly trace = new TireTraceSecond();
  private readonly sdkDump = new SdkDump();
  private readonly slipEstimator = new TireSlipEstimator();
  private stintNumber = 0;
  private lastTime: number | undefined;
  private slip = NO_SLIP;
  /** Suspension travel (m) of each corner when last standing still. */
  private rest: Partial<Record<TireCorner, number>> = {};
  private alignment: Alignment = { camber: {}, toe: {}, toeDeg: {}, seen: [] };
  private loggedSetup = '';
  private readonly latest: TireSnapshot = {
    corners: {},
    slip: NO_SLIP,
    version: 0,
  };

  /** The session (practice, qualifying, race) the frames belong to. */
  private sessionNum: number | undefined;

  /** `demo`: mock data, which must not leave run folders or train the model. */
  constructor(
    private readonly calibrations?: TireCalibrationStore,
    private readonly demo = false
  ) {
    this.model = this.makeModel(undefined);
    this.rememberGains();
  }

  private makeModel(carPath: string | undefined): OverlayModel {
    return new OverlayModel(carPath, {
      startingGains: () => this.savedGains(),
    });
  }

  private rememberGains(): void {
    this.gainsKey = JSON.stringify(this.model.gains());
  }

  /** The gains this car and track taught the model before, if they still apply. */
  private savedGains() {
    const saved =
      this.calibrationKey === undefined
        ? undefined
        : this.calibrations?.load(this.calibrationKey);
    this.calibratedStops = saved?.stops ?? 0;
    return startingGains(saved, Date.now());
  }

  init(session: Session): void {
    const car = session.DriverInfo?.Drivers?.find(
      (d) => d.CarIdx === session.DriverInfo.DriverCarIdx
    );
    const track = session.WeekendInfo?.TrackName ?? 'track';
    const sub = session.WeekendInfo?.SubSessionID ?? 0;
    const label = `${car?.CarPath ?? 'car'} ${track}`;
    if (!this.demo) startTyreRun(`${label} ${sub}`, label, car?.CarPath);
    const key = car?.CarPath ? calibrationKey(car.CarPath, track) : undefined;
    if (car?.CarPath !== this.profileCar) {
      this.profileCar = car?.CarPath;
      // The new model asks for its starting gains as it is made, so the key it
      // asks under, and the stops counted for it, must be this car's already.
      this.calibrationKey = key;
      this.calibratedStops = 0;
      this.model = this.makeModel(car?.CarPath);
    } else if (key !== this.calibrationKey) {
      this.calibrationKey = key;
      this.model.applyStartingGains();
    }
    this.rememberGains();
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

    // A new session starts on other tires: the reading frozen in the sim is the
    // last session's, so begin again as at a sim start (a race on the grid
    // starts warm). The model starts over by itself on the same signal. A frame
    // without SessionNum says nothing.
    const sessionNum = number(frame, 'SessionNum');
    if (sessionNum !== undefined) {
      if (this.sessionNum !== undefined && sessionNum !== this.sessionNum)
        this.clearOverlay();
      this.sessionNum = sessionNum;
    }

    // The wear readings (percent) of the tires whose temperature is also read.
    const readings: Partial<Record<TireCorner, Zones>> = {};
    for (const [corner, prefix] of CORNERS) {
      const temp = zones(frame, `${prefix}tempC`, ['L', 'M', 'R']);
      const wear = zones(frame, `${prefix}wear`, ['L', 'M', 'R']);
      if (temp && wear) readings[corner] = wear.map((w) => w * 100) as Zones;
    }

    const lap = this.lapsNow(frame);
    const driveSlip = this.stepSlip(frame);
    const { events = [] } = this.model.step(
      fromTelemetryFrame(frame as unknown as TelemetryFrame),
      { driveSlip }
    );
    this.followEvents(events, readings, lap);

    const corners: Partial<Record<TireCorner, TireCornerSnapshot>> = {};
    for (const [corner] of CORNERS) {
      const shown = this.model.shown[corner];
      const st = this.wear[corner];
      if (!shown || !st) continue;
      const driven = Math.max(0, lap - st.baselineLap);
      const wear = st.baseline.map((b, i) =>
        st.rate ? Math.max(0, b - st.rate[i] * driven) : b
      );
      const next: TireCornerSnapshot = {
        temp: shown.temp.map(Math.round) as Zones,
        ...(this.alignment.camber[corner] !== undefined && {
          camber: this.alignment.camber[corner],
        }),
        ...(this.alignment.toe[corner] !== undefined && {
          toe: this.alignment.toe[corner],
        }),
        ...(this.alignment.toeDeg[corner] !== undefined && {
          toeDeg: this.alignment.toeDeg[corner],
        }),
        ...(shown.pressure !== undefined && {
          pressure: shown.pressure,
          ...(shown.pressureHot && { pressureHot: true }),
          ...(shown.pressureEstimated && { pressureEstimated: true }),
        }),
        ...this.loadOf(frame, corner),
        // One surface node per tire: it has no zone spread, so the three
        // entries are the same number, kept only to match the shape of `temp`.
        ...(shown.tread !== undefined && {
          tempReal: sameInEveryZone(Math.round(shown.tread)),
        }),
        ...(shown.disc !== undefined && { disc: shown.disc }),
        tempEstimated: shown.estimated,
        wear: wear.map(round1) as Zones,
        estimated: st.rate !== undefined,
        ...(st.rate && { wearPerLap: st.rate.map(round2) as Zones }),
      };
      const before = this.latest.corners[corner];
      corners[corner] = before && sameCorner(before, next) ? before : next;
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
    const prefix = PREFIX[corner];
    // Some cars (NASCAR) name the shock travel LFSHshockDefl.
    const travel =
      number(frame, `${prefix}shockDefl`) ??
      number(frame, `${prefix}SHshockDefl`);
    if (travel === undefined || travel <= 0) return {};
    const speed = number(frame, 'Speed');
    if (speed !== undefined && speed < 0.5) this.rest[corner] = travel;
    const rest = this.rest[corner];
    return rest ? { load: Math.round((travel / rest) * 10) / 10 } : {};
  }

  /** Every wheel's load against its standstill load, where the car reports shock travel. */
  private loads(frame: Telemetry): Partial<Record<TireCorner, number>> {
    const out: Partial<Record<TireCorner, number>> = {};
    for (const [corner] of CORNERS) {
      const prefix = PREFIX[corner];
      const travel =
        number(frame, `${prefix}shockDefl`) ??
        number(frame, `${prefix}SHshockDefl`);
      const rest = this.rest[corner];
      if (travel !== undefined && travel > 0 && rest)
        out[corner] = travel / rest;
    }
    return out;
  }

  /**
   * Updates the slip estimate and the diagnostics for one frame of driving, and
   * returns the heat the driven wheels' spin adds (slip speed beyond ordinary
   * traction, times throttle) for the model; 0 off the track.
   */
  private stepSlip(frame: Telemetry): number {
    const time = number(frame, 'SessionTime');
    const dt =
      time !== undefined && this.lastTime !== undefined
        ? time - this.lastTime
        : 0;
    this.lastTime = time;
    if (flag(frame, 'IsOnTrack') !== 1) {
      this.slip = NO_SLIP;
      return 0;
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
      Math.max(0, this.slipEstimator.slipSpeed - SPIN_GRACE) *
      (number(frame, 'Throttle') ?? 0);
    this.trace.add(
      (key) => number(frame, key),
      dt,
      flag(frame, 'OnPitRoad') === 1,
      this.slip,
      driveSlip
    );
    if (!this.demo) {
      this.sdkDump.add(frame, dt);
      if (this.sdkDump.seconds >= 1) {
        const { header, line } = this.sdkDump.flush(
          stamp(new Date()).slice(11)
        );
        tyreFile('sdk.csv', line, header);
      }
    }
    if (this.trace.seconds >= 1) {
      const shown = CORNERS.map(([corner]) => this.model.shown[corner]);
      const temps = shown.map((s) => s?.temp[1].toFixed(1) ?? '-').join('/');
      tyreLog(
        `[TireTrace] t=${(time ?? 0).toFixed(1)} ${this.trace.flush()} T=${temps}` +
          (shown.some((s) => s?.tread !== undefined)
            ? ` R=${shown.map((s) => s?.tread?.toFixed(1) ?? '-').join('/')}`
            : '')
      );
    }
    return driveSlip;
  }

  /** Completed laps plus the fraction of the current one. */
  private lapsNow(frame: Telemetry): number {
    return (
      Math.max(0, number(frame, 'LapCompleted') ?? 0) +
      (number(frame, 'LapDistPct') ?? 0)
    );
  }

  /**
   * Keeps what the overlay tracks per stint, the wear baseline and its rate, in
   * step with what the model did on this frame: the first reading starts a
   * tire's stint, a later one (a pit stop began) closes it and opens the next,
   * and a tire ordered changed only while the service ran starts again at 100.
   */
  private followEvents(
    events: readonly ModelEvent[],
    readings: Partial<Record<TireCorner, Zones>>,
    lap: number
  ): void {
    let refreshed = false;
    let seeded = false;
    for (const event of events) {
      if (event.kind === 'clear') {
        // The model started over and asked for its starting gains again.
        this.rememberGains();
        continue;
      }
      const corner = event.corner;
      const reading = readings[corner];
      const st = this.wear[corner];
      if (event.kind === 'seed') {
        seeded = true;
        if (reading)
          this.wear[corner] = { baseline: reading, baselineLap: lap };
      } else if (event.kind === 'refresh') {
        refreshed = true;
        if (!st || !reading) continue;
        const stintLaps = lap - st.baselineLap;
        if (stintLaps >= MIN_STINT_LAPS) {
          const rate = st.baseline.map(
            (b, i) => (b - reading[i]) / stintLaps
          ) as Zones;
          if (rate.every((r) => r >= 0)) st.rate = rate;
        }
        st.baseline = event.changed ? [100, 100, 100] : reading;
        st.baselineLap = lap;
      } else if (st) {
        st.baseline = [100, 100, 100];
        st.baselineLap = lap;
      }
    }
    if (refreshed) {
      tyreLog(`[TireFit] stint=${this.stintNumber} ${this.stats.summary()}`);
      this.stintNumber += 1;
      // Only a stop can teach the model, so the gains are compared here, not every frame.
      const gains = JSON.stringify(this.model.gains());
      if (gains !== this.gainsKey) this.saveGains();
      this.gainsKey = gains;
    }
    if (refreshed || seeded) this.stats.reset();
  }

  private changed(next: Partial<Record<TireCorner, TireCornerSnapshot>>) {
    const current = this.latest.corners;
    return CORNERS.some(([corner]) => current[corner] !== next[corner]);
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
    this.sessionNum = undefined;
    this.clear();
  }

  private saveGains(): void {
    if (!this.calibrations || this.calibrationKey === undefined) return;
    // A gain far from 1 means the model was wrong for the car (a burnout it
    // overheated by three times), not that the tire is unusual: keep nothing.
    const gains = this.model.gains();
    if (!isSavable(gains)) return;
    this.calibratedStops += 1;
    this.calibrations.save(this.calibrationKey, {
      model: MODEL_VERSION,
      gains,
      stops: this.calibratedStops,
      updatedAt: Date.now(),
    });
  }

  /** Starts everything over, the model included. */
  private clear(): void {
    this.clearOverlay();
    this.model.reset();
    this.rememberGains();
  }

  /** What the overlay keeps beside the model; the model clears itself on a new session. */
  private clearOverlay(): void {
    this.latest.corners = {};
    this.latest.version += 1;
    this.lastWear = '';
    this.wear = {};
    this.rest = {};
    this.stats.reset();
    this.slipEstimator.reset();
    this.slip = NO_SLIP;
    this.lastDiagTime = -Infinity;
    this.stintNumber = 0;
    this.lastTime = undefined;
  }

  snapshot(): TireSnapshot {
    return this.latest;
  }
}
