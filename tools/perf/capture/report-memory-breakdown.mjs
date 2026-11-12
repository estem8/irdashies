import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { summarizeMemoryBreakdown } from './memory-breakdown.mjs';

const root = resolve(process.argv[2]);
const read = async (path) =>
  JSON.parse(await readFile(resolve(root, path), 'utf8'));
for (const file of ['failed.json', 'cancelled.json']) {
  let exists = false;
  try {
    await readFile(resolve(root, file));
    exists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  assert.equal(exists, false, 'Terminal failure marker: ' + file);
}
const runs = await read('runs.json');
assert.deepEqual(
  runs.map((r) => r.sequence),
  ['on1', 'off1', 'off2', 'on2']
);
const cpu = await read('collection-overhead-summary.json');
assert.deepEqual(
  cpu.results.map((r) => r.sequence),
  runs.map((r) => r.sequence)
);
const points = [],
  hashes = {};
let matched;
for (const run of runs) {
  assert.equal(run.status.code, 0);
  const manifest = await read(run.sequence + '/manifest.json');
  const environment = await read(run.sequence + '/environment.json');
  const fingerprint = {
    source: manifest.source,
    sources: manifest.sources,
    seedSha256: manifest.seedSha256,
    expectedViewport: manifest.expectedViewport,
    environment,
  };
  if (matched)
    assert.deepEqual(fingerprint, matched, 'Mismatched capture inputs');
  else matched = fingerprint;
  assert.equal(manifest.source, cpu.manifest.source);
  assert.equal(manifest.seedSha256, cpu.manifest.seedSha256);
  const raw = await readFile(
    resolve(root, run.sequence, 'linux-private-memory.json')
  );
  hashes[run.sequence + '/linux-private-memory.json'] = createHash('sha256')
    .update(raw)
    .digest('hex');
  const samples = JSON.parse(raw);
  const preflight = await read(run.sequence + '/preflight.json');
  const external = await read(run.sequence + '/external-cpu.json');
  const firstCpu = external.find((s) => s.elapsedSeconds >= 60);
  assert.ok(firstCpu, 'Missing process inventory');
  const roles = {};
  let utility = 0;
  for (const p of firstCpu.processes) {
    const window = preflight.windows.find((w) => w.pid === p.pid);
    const role =
      p.type === 'Browser'
        ? 'main'
        : p.type === 'GPU'
          ? 'gpu'
          : window && /:\d+\/$/.test(window.url)
            ? 'overlay'
            : window?.url.endsWith('#/tape-replay')
              ? 'tape-controls'
              : `${p.type.toLowerCase()}-${++utility}`;
    assert.ok(!roles[role], 'Duplicate role ' + role);
    roles[role] = summarizeMemoryBreakdown(samples, {
      pid: p.pid,
      origin: run.origin,
    });
  }
  assert.ok(
    roles.main && roles.overlay && roles.gpu && roles['tape-controls'],
    'Incomplete role inventory'
  );
  const totals = {};
  for (const field of Object.keys(roles.main.fields)) {
    const list = Object.values(roles);
    const complete = list.every(
      (r) => r.fields[field].availableSamples === r.sampleCount
    );
    totals[field] = complete
      ? {
          first: list.reduce((n, r) => n + r.fields[field].first, 0),
          last: list.reduce((n, r) => n + r.fields[field].last, 0),
          delta: list.reduce((n, r) => n + r.fields[field].delta, 0),
        }
      : null;
  }
  points.push({
    sequence: run.sequence,
    collection: run.collection,
    roles,
    totals,
  });
}
const report = {
  scope:
    'Per-run six-minute Linux smaps composition in untraced collection on/off scenarios. Private clean/dirty, anonymous RSS and PSS are distinct accounting views, not additive allocation categories. This cannot backfill absent breakdowns in the earlier 20-minute diagnostic, identify allocation stacks, or establish a leak.',
  matched,
  cpuCadenceMatched: cpu.cadenceMatched,
  points,
  artifactHashes: hashes,
};
await writeFile(
  resolve(root, 'memory-breakdown-summary.json'),
  JSON.stringify(report, null, 2) + '\n'
);
process.stdout.write(
  JSON.stringify(
    points.map((p) => ({
      sequence: p.sequence,
      mainDeltaMiB: Object.fromEntries(
        Object.entries(p.roles.main.fields).map(([k, v]) => [k, v.delta])
      ),
      overlayDeltaMiB: Object.fromEntries(
        Object.entries(p.roles.overlay.fields).map(([k, v]) => [k, v.delta])
      ),
    })),
    null,
    2
  ) + '\n'
);
