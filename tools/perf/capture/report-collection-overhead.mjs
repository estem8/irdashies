import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(process.argv[2]);
const read = async (name) =>
  JSON.parse(await readFile(resolve(root, name), 'utf8'));
const runs = await read('runs.json');
assert.deepEqual(
  runs.map((r) => r.sequence),
  ['on1', 'off1', 'off2', 'on2']
);
const workloadChannels = [
  'track-state.snapshot',
  'driver-controls.snapshot',
  'radar.snapshot',
];
const results = [];
let referenceManifest, referenceEnvironment;
for (const run of runs) {
  assert.equal(run.status.code, 0);
  const manifest = await read(run.sequence + '/manifest.json');
  const environment = await read(run.sequence + '/environment.json');
  const comparable = {
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
      comparable,
      referenceManifest,
      'Mismatched source/seed/environment'
    );
  else referenceManifest = comparable;
  if (referenceEnvironment)
    assert.deepEqual(
      environment,
      referenceEnvironment,
      'Mismatched runtime environment'
    );
  else referenceEnvironment = environment;
  const expected = run.sequence.startsWith('off') ? 'off' : 'on';
  assert.equal(manifest.collection, expected);
  assert.equal(run.collection, expected);
  const samples = (await read(run.sequence + '/external-cpu.json')).filter(
    (s) => s.elapsedSeconds >= 60 && s.elapsedSeconds <= 420
  );
  assert.ok(samples.length >= 30, 'Insufficient external CPU samples');
  const first = samples[0],
    last = samples.at(-1);
  const spanSeconds = (last.at - first.at) / 1000;
  assert.ok(spanSeconds >= 300, 'Insufficient steady-state span');
  const identity = (p) => `${p.pid}:${p.creationTime}`;
  const identities = first.processes.map(identity).sort();
  let totalCpuMs = 0,
    totalFrames = 0,
    totalFrameSeconds = 0;
  const cpuByRole = {};
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    assert.deepEqual(
      b.processes.map(identity).sort(),
      identities,
      'Process churn invalidates comparison'
    );
    const seconds = (b.at - a.at) / 1000;
    assert.ok(seconds > 0 && seconds < 15, 'Interrupted external sampler');
    for (const p of b.processes) {
      const prev = a.processes.find((x) => identity(x) === identity(p));
      const ms = (p.cumulativeCPUUsage - prev.cumulativeCPUUsage) * 1000;
      assert.ok(
        Number.isFinite(ms) && ms >= 0,
        'Invalid cumulative CPU counter'
      );
      totalCpuMs += ms;
      const role = p.type + (p.name ? ':' + p.name : '');
      cpuByRole[role] = (cpuByRole[role] ?? 0) + ms;
    }
    assert.equal(b.ui.status.paused, false);
    assert.equal(b.ui.status.speed, 1);
    assert.equal(b.ui.visibility, 'visible');
    assert.deepEqual(
      { width: b.ui.width, height: b.ui.height, dpr: b.ui.dpr },
      manifest.expectedViewport
    );
    assert.ok(
      b.ui.status.position > a.ui.status.position,
      'Replay stopped advancing'
    );
    for (const channel of workloadChannels) {
      const before = a.ui.workload?.[channel]?.version,
        after = b.ui.workload?.[channel]?.version;
      assert.ok(
        Number.isSafeInteger(before) &&
          before >= 0 &&
          Number.isSafeInteger(after) &&
          after >= before,
        'Missing or reset workload version: ' + channel
      );
    }
    const frames = b.ui.frames - a.ui.frames,
      frameSeconds = (b.ui.now - a.ui.now) / 1000;
    assert.ok(frames > 0 && frameSeconds > 0, 'No renderer animation cadence');
    totalFrames += frames;
    totalFrameSeconds += frameSeconds;
  }
  results.push({
    sequence: run.sequence,
    collection: expected,
    sampleCount: samples.length,
    spanSeconds,
    totalCpuMsPerSecond: totalCpuMs / spanSeconds,
    cpuMsPerSecondByRole: Object.fromEntries(
      Object.entries(cpuByRole).map(([k, v]) => [k, v / spanSeconds])
    ),
    rafHz: totalFrames / totalFrameSeconds,
    snapshotVersionRateHz: Object.fromEntries(
      workloadChannels.map((channel) => [
        channel,
        (last.ui.workload[channel].version -
          first.ui.workload[channel].version) /
          spanSeconds,
      ])
    ),
  });
}
const pairs = [
  [results[0], results[1]],
  [results[3], results[2]],
].map(([on, off]) => ({
  on: on.sequence,
  off: off.sequence,
  collectionCpuDeltaMsPerSecond:
    on.totalCpuMsPerSecond - off.totalCpuMsPerSecond,
  collectionCpuDeltaPercentOfOff:
    100 * (on.totalCpuMsPerSecond / off.totalCpuMsPerSecond - 1),
  onRafHz: on.rafHz,
  offRafHz: off.rafHz,
  cadenceEvidence: Object.fromEntries(
    [
      ['rAF', on.rafHz, off.rafHz],
      ...workloadChannels.map((channel) => [
        channel,
        on.snapshotVersionRateHz[channel],
        off.snapshotVersionRateHz[channel],
      ]),
    ].map(([name, a, b]) => [
      name,
      {
        onHz: a,
        offHz: b,
        withinFivePercentOrOneHz:
          Math.abs(a - b) <= Math.max(1, 0.05 * Math.max(a, b)),
        bothInactive: a === 0 && b === 0,
      },
    ])
  ),
}));
const report = {
  scope:
    'Optional collection on/off with capture bootstrap preserved; external sampler runs equally in both modes. rAF cadence is not simulator presentation. A single matrix does not establish a universal profiler overhead.',
  cadenceMatched: pairs.every((pair) =>
    Object.values(pair.cadenceEvidence).every(
      (entry) => entry.withinFivePercentOrOneHz
    )
  ),
  workloadCounterScope:
    'Existing store snapshot version changes are production/change counters, not exact callback-delivery counts; unchanged inputs may stay at zero. No new subscriptions are added.',
  manifest: referenceManifest,
  environment: referenceEnvironment,
  results,
  pairs,
};
await writeFile(
  resolve(root, 'collection-overhead-summary.json'),
  JSON.stringify(report, null, 2) + '\n'
);
process.stdout.write(JSON.stringify({ results, pairs }, null, 2) + '\n');
