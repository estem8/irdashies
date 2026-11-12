import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { summarizeMemoryDump } from './memoryDumpSummary.mjs';

// Deliberately analyze only after a complete diagnostic, not while it runs.
const root = resolve(process.argv[2]);
const read = async (file) =>
  JSON.parse(await readFile(resolve(root, file), 'utf8'));
const runs = await read('runs.json');
assert.equal(runs.length, 1);
assert.equal(runs[0].status.code, 0);
const data = await read('memory/settings.json');
const manifest = await read('memory/manifest.json');
const environment = await read('memory/environment.json');
assert.equal(data.passed, true);
assert.equal(data.nativeAllocatorDiagnostics, true);
const checkpoints = data.records.filter((r) => r.label.startsWith('steady-'));
assert.deepEqual(
  checkpoints.map((r) => r.label),
  [120, 420, 720, 1020, 1320].map((s) => 'steady-' + s)
);
const privateSamples = await read('memory/linux-private-memory.json');
const points = [];
const artifacts = {};
for (const checkpoint of checkpoints) {
  const file = 'memory/' + checkpoint.label + '.memory-infra.trace.json';
  const raw = await readFile(resolve(root, file));
  artifacts[file] = createHash('sha256').update(raw).digest('hex');
  const completion = await read(
    'memory/' + checkpoint.label + '.memory-trace-completion.json'
  );
  assert.equal(completion.completed.dataLossOccurred, false);
  const processes = summarizeMemoryDump(JSON.parse(raw));
  const roles = {
    main: checkpoint.processes.find((p) => p.type === 'Browser')?.pid,
    overlay: checkpoint.windows.find((w) => /:\d+\/$/.test(w.url))?.pid,
    settings: checkpoint.windows.find((w) => w.url.includes('#/settings'))?.pid,
  };
  const selected = {};
  for (const [role, pid] of Object.entries(roles)) {
    assert.ok(pid, 'Missing ' + role + ' PID');
    const process = processes.find((p) => p.pid === pid);
    assert.ok(process, 'Missing ' + role + ' allocator providers');
    const nearest = privateSamples
      .filter((s) => s.processes.some((p) => p.pid === pid))
      .reduce((best, sample) =>
        Math.abs(Date.parse(sample.timestamp) - Date.parse(checkpoint.at)) <
        Math.abs(Date.parse(best.timestamp) - Date.parse(checkpoint.at))
          ? sample
          : best
      );
    const deltaSeconds =
      Math.abs(Date.parse(nearest.timestamp) - Date.parse(checkpoint.at)) /
      1000;
    assert.ok(deltaSeconds <= 15, 'Private sample too far from checkpoint');
    const allocators = Object.fromEntries(
      Object.entries(process.allocators).filter(
        ([name, attrs]) =>
          name.split('/').length <= 3 &&
          !/0x[0-9a-f]+/i.test(name) &&
          Object.keys(attrs).length > 0
      )
    );
    selected[role] = {
      pid,
      processTotals: process.processTotals,
      privateMiB: nearest.processes.find((p) => p.pid === pid).privateMB,
      privateSampleOffsetSeconds: deltaSeconds,
      postGcHeap:
        checkpoint[
          role === 'main'
            ? 'mainHeap'
            : role === 'overlay'
              ? 'overlayHeap'
              : 'heap'
        ],
      allocators,
    };
  }
  points.push({
    label: checkpoint.label,
    elapsedSeconds: checkpoint.elapsedSeconds,
    overlayViewport: checkpoint.overlayViewport,
    roles: selected,
  });
}
const changes = {};
for (const role of ['main', 'overlay', 'settings']) {
  const first = points[0].roles[role],
    last = points.at(-1).roles[role];
  assert.equal(first.pid, last.pid, 'PID changed during diagnostic');
  const counters = {};
  for (const name of new Set([
    ...Object.keys(first.allocators),
    ...Object.keys(last.allocators),
  ])) {
    const values = {};
    for (const key of new Set([
      ...Object.keys(first.allocators[name] ?? {}),
      ...Object.keys(last.allocators[name] ?? {}),
    ])) {
      const a = first.allocators[name]?.[key],
        b = last.allocators[name]?.[key];
      values[key] = {
        first: a ?? null,
        last: b ?? null,
        deltaBytes:
          Number.isSafeInteger(a) && Number.isSafeInteger(b) ? b - a : null,
      };
    }
    counters[name] = values;
  }
  changes[role] = {
    privateDeltaMiB: last.privateMiB - first.privateMiB,
    postGcHeapDeltaBytes: last.postGcHeap.usedSize - first.postGcHeap.usedSize,
    counters,
  };
}
await writeFile(
  resolve(root, 'native-memory-summary.json'),
  JSON.stringify(
    {
      scope:
        'Single long MemoryInfra diagnostic; counters overlap, exact oversized values preserved; no automatic leak verdict',
      manifest,
      environment,
      points,
      changes,
      artifactHashes: artifacts,
    },
    null,
    2
  ) + '\n'
);
process.stdout.write(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(changes).map(([role, value]) => [
        role,
        {
          privateDeltaMiB: value.privateDeltaMiB,
          postGcHeapDeltaBytes: value.postGcHeapDeltaBytes,
          counters: Object.fromEntries(
            Object.entries(value.counters).filter(([name]) =>
              [
                'malloc',
                'partition_alloc',
                'v8',
                'devtools',
                'cc',
                'skia',
                'canvas',
                'blink_gc',
              ].includes(name)
            )
          ),
        },
      ])
    ),
    null,
    2
  ) + '\n'
);
