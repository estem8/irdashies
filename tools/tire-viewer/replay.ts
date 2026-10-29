import fs from 'fs';
import type { Session, Telemetry } from '@irdashies/types';
import type { OverlayModel } from 'iracing-tire-lab/model';
import { TireProcessor } from '../../src/app/processors/TireProcessor';
import {
  parseDiskSubHeader,
  parseHeader,
  parseVarHeaders,
  readVarValue,
} from '../../src/app/ibt/ibtBinary';
import {
  iracingFrameClock,
  takeTick,
  type TickSchedule,
} from '../../src/app/processors/ProcessorHost';

const CORNERS = ['LF', 'RF', 'LR', 'RR'] as const;
const KEYS = ['lf', 'rf', 'lr', 'rr'] as const;
const BOOL = new Set([
  'BrakeABSactive',
  'IsOnTrack',
  'OnPitRoad',
  'PitstopActive',
  'PlayerCarInPitStall',
]);
/** The sim writes 60 Hz records. */
const SIM_HZ = 60;
/**
 * How often frames reach the processors in the app: the performance harness
 * measured 21 Hz (docs/PERFORMANCE_TEST_LOG.md), not the sim's 60 Hz. A
 * processor then runs at its own tickRateHz, picked from those frames by
 * takeTick, so its time step alternates (50 and 100 ms for 15 Hz on 20 Hz).
 */
export const APP_ARRIVAL_HZ = 20;

export interface ReplayOptions {
  /** Frames per second that reach the processor. Default: what the app sees. */
  arrivalHz?: number;
  /** Apply the processor's tickRateHz as ProcessorHost does. Default: true. */
  limit?: boolean;
}

export interface Corner {
  tread: number[];
  carcass: number[];
  real: number[];
  dash: number[];
}
export interface Replay {
  file: string;
  car: string;
  t: number[];
  speed: number[];
  corners: Record<(typeof KEYS)[number], Corner>;
}

export const replay = (path: string, options: ReplayOptions = {}): Replay => {
  const { arrivalHz = APP_ARRIVAL_HZ, limit = true } = options;
  const buf = fs.readFileSync(path);
  const header = parseHeader(buf);
  const sub = parseDiskSubHeader(buf);
  const vars = parseVarHeaders(
    buf.subarray(
      header.varHeaderOffset,
      header.varHeaderOffset + header.numVars * 144
    ),
    header.numVars
  );
  const info = buf.toString(
    'latin1',
    header.sessionInfoOffset,
    header.sessionInfoOffset + header.sessionInfoLen
  );
  const car = /CarPath:\s*(\S+)/.exec(info)?.[1] ?? 'unknown';
  const p = new TireProcessor();
  p.init({
    DriverInfo: { DriverCarIdx: 0, Drivers: [{ CarIdx: 0, CarPath: car }] },
    WeekendInfo: { TrackName: 'viewer', SubSessionID: 1 },
  } as unknown as Session);
  // What the processor's model shows for a tire: the tread surface and the
  // carcass the dash shows (the hottest zone). The model is private to it.
  const shown = (k: string) =>
    (p as unknown as { model: OverlayModel }).model.shown[
      k as 'lf' | 'rf' | 'lr' | 'rr'
    ];
  const byName = new Map(
    vars.filter((v) => v.count === 1).map((v) => [v.name, v])
  );
  const out: Replay = {
    file: path.split(/[\\/]/).pop() ?? path,
    car,
    t: [],
    speed: [],
    corners: Object.fromEntries(
      KEYS.map((k) => [k, { tread: [], carcass: [], real: [], dash: [] }])
    ) as unknown as Replay['corners'],
  };
  const records = Math.min(
    sub.sessionRecordCount,
    Math.floor((buf.length - header.bufOffset) / header.bufLen)
  );
  const stride = Math.max(
    1,
    Math.round((header.tickRate || SIM_HZ) / arrivalHz)
  );
  const schedule: TickSchedule = {};
  for (let i = 0; i < records; i += stride) {
    const rec = buf.subarray(
      header.bufOffset + i * header.bufLen,
      header.bufOffset + (i + 1) * header.bufLen
    );
    const frame: Record<string, { value: unknown[] }> = {};
    const val: Record<string, number> = {};
    for (const [name, v] of byName) {
      const x = readVarValue(rec, v);
      val[name] = x;
      frame[name] = { value: [BOOL.has(name) ? x > 0.5 : x] };
    }
    const clock = iracingFrameClock(frame as unknown as Telemetry);
    if (limit && !takeTick(schedule, p.tickRateHz, clock)) continue;
    p.onFrame(frame as unknown as Telemetry);
    out.t.push(val.SessionTime);
    out.speed.push(val.Speed * 3.6);
    CORNERS.forEach((c, j) => {
      const k = KEYS[j];
      out.corners[k].tread.push(
        (val[`${c}tempL`] + val[`${c}tempM`] + val[`${c}tempR`]) / 3
      );
      out.corners[k].carcass.push(val[`${c}tempCM`]);
      const s = shown(k);
      out.corners[k].real.push(s?.tread ?? NaN);
      out.corners[k].dash.push(s ? Math.max(...s.temp) : NaN);
    });
  }
  return out;
};
