// Run with: node tools/perf/session-array-compare.mts
// Microbenchmark only: this does not measure renderer or application CPU.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { shallow } from 'zustand/shallow';
import { arrayShallowCompare } from '../../src/frontend/context/SessionStore/arrayShallowCompare.ts';

const previous = (a?: unknown[], b?: unknown[]) => {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!shallow(a[i], b[i])) return false;
  }
  return true;
};

const synthetic = Array.from({ length: 64 }, (_, CarIdx) => ({
  CarIdx,
  UserName: `Driver ${CarIdx}`,
  CarClassID: CarIdx % 3,
  IRating: 2000 + CarIdx,
}));
const fixtureText = await readFile(
  new URL(
    '../../src/app/irsdk/node/utils/mock-data/session.json',
    import.meta.url
  ),
  'utf8'
);
const fixture = JSON.parse(fixtureText) as {
  DriverInfo: { Drivers: Record<string, unknown>[] };
};
const repetitions = 7;
const results = [];

for (const [workload, drivers, iterations] of [
  ['synthetic 64 drivers', synthetic, 20_000],
  ['repository fixture 41 drivers', fixture.DriverInfo.Drivers, 2_000],
] as const) {
  const cloned = structuredClone(drivers);
  const changed = structuredClone(drivers);
  changed[changed.length - 1].IRating = -1;
  for (const [name, right, expected] of [
    ['same reference', drivers, true],
    ['equal IPC clone', cloned, true],
    ['changed last driver', changed, false],
  ] as const) {
    const before: number[] = [];
    const after: number[] = [];
    const measure = (compare: typeof previous) => {
      let matches = 0;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        if (compare(drivers, right)) matches++;
      }
      const elapsed = performance.now() - start;
      assert.equal(matches, expected ? iterations : 0);
      return (elapsed * 1e6) / iterations;
    };
    // Warm both functions, then alternate order to reduce order bias.
    measure(previous);
    measure(arrayShallowCompare);
    for (let run = 0; run < repetitions; run++) {
      if (run % 2) {
        after.push(measure(arrayShallowCompare));
        before.push(measure(previous));
      } else {
        before.push(measure(previous));
        after.push(measure(arrayShallowCompare));
      }
    }
    const median = (values: number[]) =>
      values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
    results.push({
      workload,
      drivers: drivers.length,
      iterations,
      name,
      beforeNs: median(before),
      afterNs: median(after),
      beforeRunsNs: before,
      afterRunsNs: after,
    });
  }
}
process.stdout.write(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      release: release(),
      cpu: cpus()[0]?.model,
      fixtureSha256: createHash('sha256').update(fixtureText).digest('hex'),
      repetitions,
      results,
    },
    null,
    2
  ) + '\n'
);
