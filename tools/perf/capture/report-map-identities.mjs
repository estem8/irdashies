import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = resolve(process.argv[2]);
const read = async (path) =>
  JSON.parse(await readFile(resolve(root, path), 'utf8'));
const runs = await read('runs.json');
assert.deepEqual(
  runs.map((r) => [r.sequence, r.variant]),
  [
    ['a1', 'baseline'],
    ['b1', 'candidate'],
    ['b2', 'candidate'],
    ['a2', 'baseline'],
  ]
);
const counters = [
  'computations',
  'computationsWithDrivers',
  'identityObjects',
  'progressComputations',
];
const results = [];
let reference;
for (const run of runs) {
  assert.equal(run.status.code, 0);
  const manifest = await read(run.sequence + '/manifest.json');
  assert.equal(manifest.mapIdentityDiagnostic, true);
  assert.match(manifest.mapIdentitySourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    createHash('sha256')
      .update(
        await readFile(resolve(root, run.sequence, 'map-identity-source.tsx'))
      )
      .digest('hex'),
    manifest.mapIdentitySourceSha256,
    'Diagnostic source hash mismatch'
  );
  const matched = {
    source: manifest.source,
    sources: manifest.sources,
    seedSha256: manifest.seedSha256,
    expectedViewport: manifest.expectedViewport,
    environment: await read(run.sequence + '/environment.json'),
  };
  if (reference)
    assert.deepEqual(matched, reference, 'Unmatched diagnostic inputs');
  else reference = matched;
  const samples = (await read(run.sequence + '/external-cpu.json')).filter(
    (s) => s.elapsedSeconds >= 60 && s.elapsedSeconds <= 180
  );
  assert.ok(samples.length >= 10, 'Insufficient diagnostic observations');
  const first = samples[0],
    last = samples.at(-1),
    spanSeconds = (last.at - first.at) / 1000;
  assert.ok(spanSeconds >= 90, 'Insufficient diagnostic span');
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    assert.equal(s.ui.visibility, 'visible');
    assert.equal(s.ui.status.paused, false);
    assert.equal(s.ui.status.speed, 1);
    assert.deepEqual(
      { width: s.ui.width, height: s.ui.height, dpr: s.ui.dpr },
      manifest.expectedViewport
    );
    for (const key of counters) {
      assert.ok(
        Number.isSafeInteger(s.ui.identityDiagnostic?.[key]),
        'Missing ' + key
      );
      if (i)
        assert.ok(
          s.ui.identityDiagnostic[key] >=
            samples[i - 1].ui.identityDiagnostic[key],
          'Counter reset'
        );
    }
    if (i) {
      assert.ok(
        s.at > samples[i - 1].at && s.at - samples[i - 1].at < 15000,
        'Sampling gap'
      );
      assert.ok(
        s.ui.status.position > samples[i - 1].ui.status.position,
        'Replay stopped'
      );
    }
  }
  const totals = Object.fromEntries(
    counters.map((k) => [
      k,
      last.ui.identityDiagnostic[k] - first.ui.identityDiagnostic[k],
    ])
  );
  assert.ok(totals.progressComputations > 0, 'Progress path unexercised');
  assert.ok(
    last.ui.identityDiagnostic.identityObjects > 0,
    'Identity path unexercised'
  );
  results.push({
    sequence: run.sequence,
    variant: run.variant,
    sourceSha256: manifest.mapIdentitySourceSha256,
    spanSeconds,
    totals,
    ratesPerSecond: Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, v / spanSeconds])
    ),
  });
}
const pairs = [
  [results[0], results[1]],
  [results[3], results[2]],
].map(([a, b]) => ({
  baseline: a.sequence,
  candidate: b.sequence,
  identityComputationsDeltaPerSecond:
    b.ratesPerSecond.computations - a.ratesPerSecond.computations,
  identityObjectsDeltaPerSecond:
    b.ratesPerSecond.identityObjects - a.ratesPerSecond.identityObjects,
  baselineProgressHz: a.ratesPerSecond.progressComputations,
  candidateProgressHz: b.ratesPerSecond.progressComputations,
}));
const report = {
  scope:
    'Direct useMemo computations and specific identity object constructions in instrumented hooks. Counts include discarded React work. Not total allocations, retained bytes, CPU acceptance, or simulator presentation. Progress computations are separate.',
  matched: reference,
  results,
  pairs,
};
await writeFile(
  resolve(root, 'map-identity-summary.json'),
  JSON.stringify(report, null, 2) + '\n'
);
process.stdout.write(JSON.stringify({ results, pairs }, null, 2) + '\n');
