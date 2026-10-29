import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { Session, Telemetry } from '@irdashies/types';
import { TireProcessor } from './TireProcessor';
import { CARS, VARIANTS, stimulus } from './__fixtures__/tireStimulus';

vi.mock('../tyreLog', () => ({
  tyreLog: vi.fn(),
  startTyreRun: vi.fn(),
  tyreFile: vi.fn(),
  stamp: vi.fn(() => '2026-10-26 000000'),
}));

/**
 * The tire estimate moved out of this repo into iracing-tire-lab. This pins what
 * the processor publishes to what it published before it did: the golden file
 * is this processor's own output, taken at d421f67 (the last commit with the
 * physics here), on a synthetic drive with a session change and a tire change.
 * Per car and variant, per tire, one entry per frame: the rounded tread
 * temperature, the middle zone of the shown temperature, the brake disc level
 * and the pressure, plus the middle zone of the wear and whether the wear and
 * the temperature are estimates (what this processor itself keeps).
 */
type Columns = Record<string, (number | null)[]>;
const golden = JSON.parse(
  zlib
    .gunzipSync(
      fs.readFileSync(
        path.join(__dirname, '__fixtures__/tireProcessorGolden.json.gz')
      )
    )
    .toString()
) as Record<string, Columns>;

const session = (carPath: string) =>
  ({
    DriverInfo: { DriverCarIdx: 0, Drivers: [{ CarIdx: 0, CarPath: carPath }] },
    WeekendInfo: { TrackName: 'synthetic', SubSessionID: 1 },
  }) as unknown as Session;

describe('TireProcessor contract with the pre-extraction output', () => {
  for (const car of CARS) {
    it.each(VARIANTS)(`${car}: %s publishes what it did before`, (variant) => {
      const cols = golden[`${car}/${variant}`];
      const processor = new TireProcessor();
      processor.init(session(car));
      const frames = stimulus(variant);
      expect(cols['lf.tread']).toHaveLength(frames.length);
      frames.forEach((values, i) => {
        const frame = Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, { value: [v] }])
        ) as unknown as Telemetry;
        processor.onFrame(frame);
        const corners = processor.snapshot().corners;
        for (const c of ['lf', 'rf', 'lr', 'rr'] as const) {
          const got = corners[c];
          expect(got?.tempReal?.[0] ?? null, `tread ${c} ${i}`).toBe(
            cols[`${c}.tread`][i]
          );
          expect(got?.temp[1] ?? null, `temp ${c} ${i}`).toBe(
            cols[`${c}.temp`][i]
          );
          expect(got?.disc ?? null, `disc ${c} ${i}`).toBe(
            cols[`${c}.disc`][i]
          );
          expect(got?.pressure ?? null, `pressure ${c} ${i}`).toBe(
            cols[`${c}.pressure`][i]
          );
          expect(got?.wear[1] ?? null, `wear ${c} ${i}`).toBe(
            cols[`${c}.wear`][i]
          );
          expect(got ? Number(got.estimated) : null, `est ${c} ${i}`).toBe(
            cols[`${c}.estimated`][i]
          );
          expect(
            got ? Number(got.tempEstimated) : null,
            `tempEst ${c} ${i}`
          ).toBe(cols[`${c}.tempEstimated`][i]);
        }
      });
    });
  }
});
