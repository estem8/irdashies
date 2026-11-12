import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { summarizeLiveAllocations } from './summarize-live-allocations.mjs';

const root = resolve(process.argv[2]);
const read = async (file) =>
  JSON.parse(await readFile(resolve(root, file), 'utf8'));
const runs = await read('runs.json');
assert.deepEqual(
  runs.map((r) => r.sequence),
  ['off-control', 'off-sampled']
);
const phases = [];
let referenceManifest;
for (const run of runs) {
  assert.equal(run.collection, 'off');
  assert.equal(run.status.code, 0);
  const prefix = run.sequence + '/';
  const manifest = await read(prefix + 'manifest.json');
  const matched = {
    source: manifest.source,
    sources: manifest.sources,
    seedSha256: manifest.seedSha256,
    expectedViewport: manifest.expectedViewport,
    node: manifest.node,
    os: manifest.os,
    cpu: manifest.cpu,
  };
  if (referenceManifest)
    assert.deepEqual(
      matched,
      referenceManifest,
      'Source/seed/environment mismatch'
    );
  referenceManifest = matched;
  assert.equal(manifest.collection, 'off');
  const start = await read(prefix + 'ownership-start.json');
  const end = await read(prefix + 'ownership.json');
  assert.ok(start.elapsedSeconds >= 55 && start.elapsedSeconds < 75);
  assert.ok(end.elapsedSeconds >= 390 && end.elapsedSeconds < 400);
  const cpu = await read(prefix + 'external-cpu.json');
  assert.ok(cpu.length >= 30);
  for (let i = 1; i < cpu.length; i++) {
    assert.ok(
      cpu[i].elapsedSeconds - cpu[i - 1].elapsedSeconds < 15,
      'Observation gap'
    );
    assert.deepEqual(
      cpu[i].processes.map((p) => [p.pid, p.creationTime]),
      cpu[0].processes.map((p) => [p.pid, p.creationTime]),
      'Process lifetime changed'
    );
  }
  const memory = await read(prefix + 'linux-private-memory.json');
  const first = memory.find(
    (s) => Date.parse(s.timestamp) - run.origin >= start.elapsedSeconds * 1000
  );
  const last = memory.filter(
    (s) => Date.parse(s.timestamp) - run.origin >= end.elapsedSeconds * 1000
  )[0];
  assert.ok(first && last, 'Missing memory observations around heap interval');
  const windows = run.preflight.windows;
  const roles = Object.fromEntries(
    windows.map((w) => [
      w.url.endsWith('#/tape-replay') ? 'controls' : 'overlay',
      w.pid,
    ])
  );
  roles.main = cpu[0].processes.find((p) => p.type === 'Browser').pid;
  const observations = end.observations.map((observation) => {
    const initial = start.observations.find((o) => o.role === observation.role);
    assert.ok(initial);
    const a = first.processes.find((p) => p.pid === roles[observation.role]);
    const b = last.processes.find((p) => p.pid === roles[observation.role]);
    assert.ok(a && b && !a.unavailable && !b.unavailable);
    return {
      role: observation.role,
      pid: roles[observation.role],
      heapStartBytes: initial.heap.usedSize,
      heapEndBytes: observation.heap.usedSize,
      heapDeltaBytes: observation.heap.usedSize - initial.heap.usedSize,
      heapCounters: Object.fromEntries(
        Object.keys(observation.heap).map((key) => [
          key,
          {
            start: initial.heap[key] ?? null,
            end: observation.heap[key],
            delta:
              typeof initial.heap[key] === 'number'
                ? observation.heap[key] - initial.heap[key]
                : null,
          },
        ])
      ),
      privateDeltaMiB: b.privateMB - a.privateMB,
      privateSampleSeconds: [first, last].map(
        (s) => (Date.parse(s.timestamp) - run.origin) / 1000
      ),
      liveAllocations: observation.profile
        ? summarizeLiveAllocations(observation.profile.profile)
        : undefined,
    };
  });
  const artifacts = {};
  for (const name of [
    'ownership-start.json',
    'ownership.json',
    'linux-private-memory.json',
    'external-cpu.json',
    'preflight.json',
    'environment.json',
  ]) {
    artifacts[name] = createHash('sha256')
      .update(await readFile(resolve(root, prefix, name)))
      .digest('hex');
  }
  phases.push({
    sequence: run.sequence,
    startSeconds: start.elapsedSeconds,
    endSeconds: end.elapsedSeconds,
    observations,
    artifacts,
  });
}
const report = {
  scope:
    'Collection-off, Settings closed, Linux development; V8 sampled live allocations exclude pre-existing and native allocations. Two short diagnostics, not leak or CPU acceptance.',
  source: await read('sources.json'),
  manifest: referenceManifest,
  phases,
};
const output = process.argv[3];
assert.ok(output, 'Output report path required');
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(
  JSON.stringify(
    phases.map((p) => ({
      sequence: p.sequence,
      observations: p.observations.map(({ liveAllocations, ...o }) => ({
        ...o,
        sampledLiveBytes: liveAllocations?.totalSampledLiveBytes,
      })),
    })),
    null,
    2
  ) + '\n'
);
