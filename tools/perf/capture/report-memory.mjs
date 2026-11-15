import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Run after both long diagnostics finish, never during a timed capture.
const inputs = process.argv.slice(2);
assert.equal(
  inputs.length,
  2,
  'Expected two completed memory capture directories'
);
const report = [];
const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const slope = (points) => {
  const x = mean(points.map((p) => p.x));
  const y = mean(points.map((p) => p.y));
  return (
    points.reduce((sum, p) => sum + (p.x - x) * (p.y - y), 0) /
    points.reduce((sum, p) => sum + (p.x - x) ** 2, 0)
  );
};
for (const input of inputs) {
  const root = resolve(input);
  const read = async (file) =>
    JSON.parse(await readFile(resolve(root, file), 'utf8'));
  const runs = await read('runs.json');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].sequence, 'memory');
  assert.equal(runs[0].status.code, 0);
  const data = await read('memory/settings.json');
  assert.equal(data.passed, true);
  const checkpoints = data.records.filter((r) => r.label.startsWith('steady-'));
  assert.deepEqual(
    checkpoints.map((r) => r.label),
    [120, 420, 720, 1020, 1320].map((s) => 'steady-' + s)
  );
  assert.ok(
    checkpoints.at(-1).elapsedSeconds - checkpoints[0].elapsedSeconds >= 1195
  );
  const manifests = await read('memory/manifest.json');
  const environment = await read('memory/environment.json');
  const hash = async (file) =>
    createHash('sha256')
      .update(await readFile(resolve(root, file)))
      .digest('hex');
  const heaps = {};
  for (const [role, key] of [
    ['settings', 'heap'],
    ['overlay', 'overlayHeap'],
    ['main', 'mainHeap'],
  ]) {
    const points = checkpoints.map((r) => ({
      x: r.elapsedSeconds / 60,
      y: r[key].usedSize / 1e6,
    }));
    assert.ok(
      points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    );
    heaps[role] = {
      postGcMB: points.map((p) => p.y),
      deltaMB: points.at(-1).y - points[0].y,
      linearSlopeMBPerMinute: slope(points),
    };
  }
  const privateSamples = (
    await read('memory/linux-private-memory.json')
  ).filter((s) => {
    const elapsed = (Date.parse(s.timestamp) - runs[0].origin) / 1000;
    return elapsed >= 120 && elapsed <= 1320;
  });
  const expectedProcesses = checkpoints[0].processes;
  const complete = privateSamples.filter(
    (s) =>
      s.processes.length === expectedProcesses.length &&
      s.processes.every(
        (p) =>
          Number.isFinite(p.privateMB) &&
          expectedProcesses.some(
            (expected) =>
              expected.pid === p.pid && expected.creationTime === p.creationTime
          )
      )
  );
  const totals = complete.map((s) => ({
    x: (Date.parse(s.timestamp) - runs[0].origin) / 60000,
    y: s.processes.reduce((total, p) => total + p.privateMB, 0),
  }));
  report.push({
    runId: runs[0].runId,
    source: manifests.source,
    seedSha256: manifests.seedSha256,
    sources: manifests.sources,
    environment,
    scope: data.scope,
    checkpoints: checkpoints.map((r) => ({
      label: r.label,
      elapsedSeconds: r.elapsedSeconds,
      settingsDOM: r.dom,
      overlayDOM: r.overlayDOM,
      preview: r.preview,
      windows: r.windows,
    })),
    heaps,
    externalPrivateMemory: {
      unit: 'MiB (smaps kB / 1024); V8 heap MB above is decimal',
      observations: privateSamples.length,
      completeObservations: complete.length,
      meanTotalMB: totals.length ? mean(totals.map((p) => p.y)) : null,
      linearSlopeMBPerMinute: totals.length > 1 ? slope(totals) : null,
      byProcess: expectedProcesses.map((process) => {
        const window = checkpoints[0].windows.find(
          (w) => w.pid === process.pid
        );
        const role = window?.url.includes('#/settings')
          ? 'settings'
          : window?.url.includes('#/tape-replay')
            ? 'tape controls'
            : window
              ? 'overlay'
              : process.type;
        const points = complete.map((sample) => ({
          x: (Date.parse(sample.timestamp) - runs[0].origin) / 60000,
          y: sample.processes.find((p) => p.pid === process.pid).privateMB,
        }));
        return {
          role,
          type: process.type,
          pid: process.pid,
          firstMiB: points[0]?.y ?? null,
          lastMiB: points.at(-1)?.y ?? null,
          linearSlopeMiBPerMinute: points.length > 1 ? slope(points) : null,
        };
      }),
    },
    artifactHashes: Object.fromEntries(
      await Promise.all(
        [
          'memory/settings.json',
          'memory/linux-private-memory.json',
          'memory/metrics.log',
        ].map(async (file) => [file, await hash(file)])
      )
    ),
  });
}
assert.equal(report[0].seedSha256, report[1].seedSha256, 'Seeds differ');
assert.equal(
  report[0].source,
  report[1].source,
  'Source checkpoints differ; inspect before comparing'
);
assert.deepEqual(
  report[0].sources,
  report[1].sources,
  'Measured candidate sources differ'
);
assert.deepEqual(
  report[0].environment,
  report[1].environment,
  'Environments differ'
);
await writeFile(
  resolve(inputs[1], 'memory-comparison.json'),
  JSON.stringify(
    {
      scope:
        'Two repeated Settings preview memory diagnostics, forced GC; tape loops; no automatic leak verdict',
      runs: report,
    },
    null,
    2
  ) + '\n'
);
process.stdout.write(
  JSON.stringify(
    report.map(({ runId, heaps, externalPrivateMemory }) => ({
      runId,
      heaps,
      externalPrivateMemory,
    })),
    null,
    2
  ) + '\n'
);
