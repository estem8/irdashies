import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Run analyze.ts for B1/A1 and B2/A2 first. Preserve its inconclusive gates.
const root = resolve(process.argv[2]);
const read = async (file) =>
  JSON.parse(await readFile(resolve(root, file), 'utf8'));
const hash = async (file) =>
  createHash('sha256')
    .update(await readFile(resolve(root, file)))
    .digest('hex');
const runs = await read('runs.json');
assert.deepEqual(
  runs.map((r) => r.sequence),
  ['a1', 'b1', 'b2', 'a2']
);
assert.ok(runs.every((r) => r.status.code === 0));
const first = await read('b1/metrics.summary.json');
const second = await read('b2/metrics.summary.json');
const summaries = {
  a1: first.baseline,
  b1: first.candidate,
  b2: second.candidate,
  a2: second.baseline,
};
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const rows = [];
for (const run of runs) {
  const seq = run.sequence;
  const summary = summaries[seq];
  assert.equal(summary.runId, run.runId);
  const manifest = await read(`${seq}/manifest.json`);
  const memory = (await read(`${seq}/linux-private-memory.json`))
    .map((sample) => ({
      ...sample,
      elapsed: (Date.parse(sample.timestamp) - run.origin) / 1000,
    }))
    .filter((sample) => sample.elapsed >= 60 && sample.elapsed <= 420);
  const complete = memory.filter(
    (sample) =>
      sample.processes.length === summary.processes.length &&
      sample.processes.every(
        (p) =>
          Number.isFinite(p.privateMB) &&
          summary.processes.some(
            (expected) =>
              expected.pid === p.pid && expected.creationTime === p.creationTime
          )
      )
  );
  const totals = complete.map((sample) =>
    sample.processes.reduce((total, p) => total + p.privateMB, 0)
  );
  rows.push({
    sequence: seq,
    variant: run.variant,
    source: manifest.source,
    seedSha256: manifest.seedSha256,
    environment: await read(`${seq}/environment.json`),
    preflight: run.preflight,
    analysisWindow: summary.analysisWindow,
    cpuMsPerSecond: summary.processes.reduce(
      (total, p) => total + p.averageCpuTimeMsPerSecond,
      0
    ),
    processCpu: summary.processes.map((p) => ({
      type: p.type,
      name: p.name,
      cpuMsPerSecond: p.averageCpuTimeMsPerSecond,
    })),
    averageTickRateHz: summary.telemetry.averageTickRateHz,
    frameTimeP99IntervalMeanMs: summary.renderer.frameTimeP99MeanMs,
    worstFrameMs: summary.renderer.worstFrameMs,
    channels: summary.channels,
    widgetInputs: summary.widgetInputs,
    analyzerEvidence: summary.evidence,
    externalPrivateMemory: {
      completeObservations: complete.length,
      totalObservations: memory.length,
      spanSeconds: complete.length
        ? complete.at(-1).elapsed - complete[0].elapsed
        : 0,
      meanTotalMB: totals.length ? mean(totals) : null,
      peakTotalMB: totals.length ? Math.max(...totals) : null,
      note: 'External Linux smaps_rollup; not consumed by analyze.ts. Seven minutes does not prove long-session leak behavior.',
    },
    artifactHashes: Object.fromEntries(
      await Promise.all(
        [
          'metrics.log',
          'linux-private-memory.json',
          'manifest.json',
          'preflight.json',
        ].map(async (file) => [file, await hash(`${seq}/${file}`)])
      )
    ),
  });
}
assert.equal(new Set(rows.map((r) => r.seedSha256)).size, 1);
assert.equal(new Set(rows.map((r) => JSON.stringify(r.environment))).size, 1);
const pairs = [
  ['a1', 'b1'],
  ['a2', 'b2'],
].map(([a, b]) => {
  const baseline = rows.find((r) => r.sequence === a).cpuMsPerSecond;
  const candidate = rows.find((r) => r.sequence === b).cpuMsPerSecond;
  return {
    baseline: a,
    candidate: b,
    deltaCpuMsPerSecond: candidate - baseline,
    deltaCpuPercent: (candidate / baseline - 1) * 100,
  };
});
await writeFile(
  resolve(root, 'matrix-report.json'),
  JSON.stringify(
    {
      scope:
        'Linux dev, reconstructed ten-widget tape workload; overall acceptance remains inconclusive',
      rows,
      pairs,
    },
    null,
    2
  ) + '\n'
);
process.stdout.write(
  JSON.stringify(
    {
      pairs,
      rows: rows.map(({ sequence, cpuMsPerSecond, externalPrivateMemory }) => ({
        sequence,
        cpuMsPerSecond,
        externalPrivateMemory,
      })),
    },
    null,
    2
  ) + '\n'
);
