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

/**
 * Publishes tire carcass temperature and tread remaining, exactly as telemetry
 * reports them.
 *
 * Whether iRacing updates these while driving, or only in the pit stall, is not
 * established, so nothing is estimated yet. Values are rounded to whole degrees
 * and tenths of a percent so the snapshot only changes when a number on screen
 * would.
 *
 * TEMPORARY DIAGNOSTICS: onFrame writes a `[TireDiag]` line to main.log every
 * DIAG_INTERVAL_S seconds with the driving state and all raw tire values, plus
 * an immediate line whenever any wear value changes. Read it after a stint with
 * a pit stop to see which values are live. Remove once that is known.
 */
export class TireProcessor implements TelemetryProcessor<TireSnapshot> {
  readonly channel = 'tires.snapshot';
  readonly tickRateHz = 5;

  private enabled = true;
  private lastDiagTime = -Infinity;
  private lastWear = '';
  private readonly latest: TireSnapshot = { corners: {}, version: 0 };

  init(session: Session): void {
    void session;
  }

  onFrame(frame: Telemetry): void {
    if (!this.enabled) return;

    const corners: Partial<Record<TireCorner, TireCornerSnapshot>> = {};
    for (const [corner, prefix] of CORNERS) {
      const temp = zones(frame, `${prefix}tempC`, ['L', 'M', 'R']);
      const wear = zones(frame, `${prefix}wear`, ['L', 'M', 'R']);
      if (temp && wear) {
        corners[corner] = {
          temp: temp.map(Math.round) as [number, number, number],
          wear: wear.map((w) => Math.round(w * 1000) / 10) as [
            number,
            number,
            number,
          ],
        };
      }
    }

    if (this.changed(corners)) {
      this.latest.corners = corners;
      this.latest.version += 1;
    }

    this.logDiagnostics(frame);
  }

  private changed(next: Partial<Record<TireCorner, TireCornerSnapshot>>) {
    const current = this.latest.corners;
    return CORNERS.some(([corner]) => {
      const a = current[corner];
      const b = next[corner];
      if (!a || !b) return a !== b;
      return (
        a.temp.some((v, i) => v !== b.temp[i]) ||
        a.wear.some((v, i) => v !== b.wear[i])
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
  }

  snapshot(): TireSnapshot {
    return this.latest;
  }
}
