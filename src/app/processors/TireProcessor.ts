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
}

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
 * Temperatures are therefore passed through as last reported. Wear is tracked
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
  private state: Partial<Record<TireCorner, CornerState>> = {};
  private readonly latest: TireSnapshot = { corners: {}, version: 0 };

  init(session: Session): void {
    void session;
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
    this.trackStints(frame, readings, lap);

    const corners: Partial<Record<TireCorner, TireCornerSnapshot>> = {};
    for (const [corner] of CORNERS) {
      const temp = temps[corner];
      const st = this.state[corner];
      if (!temp || !st) continue;
      const driven = Math.max(0, lap - st.baselineLap);
      const wear = st.baseline.map((b, i) =>
        st.rate ? Math.max(0, b - st.rate[i] * driven) : b
      );
      corners[corner] = {
        temp: temp.map(Math.round) as Zones,
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
    lap: number
  ): void {
    const key = JSON.stringify(readings);
    if (key === '{}' || key === this.lastReading) return;
    const seeding = this.lastReading === '';
    this.lastReading = key;
    const flags = number(frame, 'PitSvFlags') ?? 0;

    for (const [corner] of CORNERS) {
      const reading = readings[corner];
      if (!reading) continue;
      const st = this.state[corner];
      if (seeding || !st) {
        this.state[corner] = { baseline: reading, baselineLap: lap };
        continue;
      }
      const stintLaps = lap - st.baselineLap;
      if (stintLaps >= MIN_STINT_LAPS) {
        const rate = st.baseline.map(
          (b, i) => (b - reading[i]) / stintLaps
        ) as Zones;
        if (rate.every((r) => r >= 0)) st.rate = rate;
      }
      st.baseline =
        (flags & TIRE_CHANGE_BIT[corner]) !== 0 ? [100, 100, 100] : reading;
      st.baselineLap = lap;
    }
  }

  private changed(next: Partial<Record<TireCorner, TireCornerSnapshot>>) {
    const current = this.latest.corners;
    return CORNERS.some(([corner]) => {
      const a = current[corner];
      const b = next[corner];
      if (!a || !b) return a !== b;
      return (
        a.estimated !== b.estimated ||
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
  }

  snapshot(): TireSnapshot {
    return this.latest;
  }
}
