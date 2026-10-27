import fs from 'fs';
import type { Session, Telemetry } from '@irdashies/types';
import { TireProcessor } from '../../src/app/processors/TireProcessor';
import {
  parseDiskSubHeader,
  parseHeader,
  parseVarHeaders,
  readVarValue,
} from '../../src/app/ibt/ibtBinary';

const CORNERS = ['LF', 'RF', 'LR', 'RR'] as const;
const KEYS = ['lf', 'rf', 'lr', 'rr'] as const;
const BOOL = new Set([
  'BrakeABSactive',
  'IsOnTrack',
  'OnPitRoad',
  'PitstopActive',
  'PlayerCarInPitStall',
]);
/** The widget is validated on 20 Hz frames; the sim writes 60 Hz. */
const STRIDE = 3;

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

export const replay = (path: string): Replay => {
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
  const real = () =>
    (
      p as unknown as {
        real?: { dash(c: string): number; temp(c: string): number };
      }
    ).real;
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
    ) as Replay['corners'],
  };
  const records = Math.min(
    sub.sessionRecordCount,
    Math.floor((buf.length - header.bufOffset) / header.bufLen)
  );
  for (let i = 0; i < records; i += STRIDE) {
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
    p.onFrame(frame as unknown as Telemetry);
    out.t.push(val.SessionTime);
    out.speed.push(val.Speed * 3.6);
    const r = real();
    CORNERS.forEach((c, j) => {
      const k = KEYS[j];
      out.corners[k].tread.push(
        (val[`${c}tempL`] + val[`${c}tempM`] + val[`${c}tempR`]) / 3
      );
      out.corners[k].carcass.push(val[`${c}tempCM`]);
      out.corners[k].real.push(r?.temp(k) ?? NaN);
      out.corners[k].dash.push(r?.dash(k) ?? NaN);
    });
  }
  return out;
};
