import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const id = process.argv[2];
assert.match(id ?? '', /^[a-z0-9-]+$/);
const resume = process.argv[3] === 'resume';
assert.ok(!process.argv[3] || resume);
const retrySuffix = process.argv[4];
assert.ok(!resume || /^[a-z0-9-]+$/.test(retrySuffix ?? ''));
const out = resolve('perf-results', id);
if (!resume) await mkdir(out);
const file = 'src/frontend/components/Radar/components/RadarDisplay.tsx';
const candidate = await readFile(file, 'utf8');
const needle = 'const nativeVisible = useNativeWindowVisibility();';
assert.equal(candidate.split(needle).length, 2, 'Native gate source changed');
const baseline = candidate.replace(
  needle,
  'useNativeWindowVisibility();\n    const nativeVisible = true;'
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
if (resume) {
  const source = JSON.parse(
    await readFile(resolve(out, 'source.json'), 'utf8')
  );
  assert.equal(source.candidateSha256, hash(candidate));
  assert.equal(source.baselineSha256, hash(baseline));
}
if (!resume)
  await writeFile(
    resolve(out, 'source.json'),
    JSON.stringify(
      {
        file,
        candidateSha256: hash(candidate),
        baselineSha256: hash(baseline),
        scope:
          'Only Radar native draw suspension differs; same visibility bridge and live source workload. Named draw work diagnostic, not CPU acceptance.',
      },
      null,
      2
    )
  );
const results = resume
  ? JSON.parse(await readFile(resolve(out, 'runs.json'), 'utf8'))
  : [];
assert.deepEqual(
  results.map((r) => r.name),
  ['a1', 'b1', 'b2', 'a2'].slice(0, results.length)
);
for (const result of results) {
  assert.equal(
    result.sourceSha256,
    hash(result.variant === 'candidate' ? candidate : baseline),
    'Recovered variant mismatch'
  );
  for (const [name, expectedHash] of Object.entries(result.artifacts))
    assert.equal(
      hash(await readFile(resolve('perf-results', result.runId, name))),
      expectedHash,
      'Recovered artifact changed: ' + name
    );
  const completion = JSON.parse(
    await readFile(resolve('perf-results', result.runId, 'result.json'), 'utf8')
  );
  assert.equal(completion.status.code, 0);
  assert.equal(completion.completedMarker, true);
}
let active,
  expected = candidate,
  cancelled = false;
const cancel = () => {
  cancelled = true;
  active?.kill('SIGTERM');
};
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
try {
  for (const [name, source] of [
    ['a1', baseline],
    ['b1', candidate],
    ['b2', candidate],
    ['a2', baseline],
  ]) {
    if (results.some((r) => r.name === name)) continue;
    assert.equal(cancelled, false, 'Cancelled');
    assert.equal(
      await readFile(file, 'utf8'),
      expected,
      'Source changed during capture'
    );
    await writeFile(file, source);
    expected = source;
    const runId = id + '-' + name + (resume ? '-' + retrySuffix : '');
    active = spawn(
      process.execPath,
      [
        'tools/perf/capture/drawing-transitions-probe.mjs',
        runId,
        source === candidate ? 'native' : 'native-baseline',
      ],
      { stdio: 'inherit' }
    );
    const code = await new Promise((resolve, reject) => {
      active.once('error', reject);
      active.once('close', resolve);
    });
    active = undefined;
    assert.equal(code, 0, 'Diagnostic capture failed');
    const drawing = JSON.parse(
      await readFile(resolve('perf-results', runId, 'drawing.json'), 'utf8')
    );
    const completion = JSON.parse(
      await readFile(resolve('perf-results', runId, 'result.json'), 'utf8')
    );
    assert.equal(drawing.minimizeSupported, true);
    assert.equal(completion.status.code, 0);
    assert.equal(completion.completedMarker, true);
    const start = drawing.observations.find(
      (o) => o.label === 'minimized-settled'
    );
    const end = drawing.observations.find(
      (o) => o.label === 'minimized-observed'
    );
    assert.ok(
      start.native.minimized &&
        end.native.minimized &&
        !start.native.visible &&
        !end.native.visible
    );
    const seconds = (end.monotonicMs - start.monotonicMs) / 1000;
    assert.ok(seconds >= 15 && seconds < 17, 'Observation gap');
    results.push({
      name,
      variant: source === candidate ? 'candidate' : 'baseline',
      runId,
      seedSha256: completion.seedSha256,
      sourceSha256: hash(source),
      startNative: start.native,
      endNative: end.native,
      seconds,
      draws: Object.fromEntries(
        [
          'radarFrame',
          'trackMapRafDraw',
          'trackMapCommitDraw',
          'inputTraceFrame',
        ].map((key) => [key, end.draws[key] - start.draws[key]])
      ),
      artifacts: Object.fromEntries(
        await Promise.all(
          ['drawing.json', 'result.json', 'console.log'].map(async (name) => [
            name,
            hash(await readFile(resolve('perf-results', runId, name))),
          ])
        )
      ),
    });
    await writeFile(
      resolve(out, 'runs.json'),
      JSON.stringify(results, null, 2)
    );
    process.stdout.write(JSON.stringify(results.at(-1)) + '\n');
  }
  assert.equal(new Set(results.map((r) => r.seedSha256)).size, 1);
  const geometry = (native) => ({
    visible: native.visible,
    minimized: native.minimized,
    bounds: native.bounds,
  });
  for (const result of results) {
    assert.deepEqual(
      geometry(result.startNative),
      geometry(results[0].startNative),
      'Mismatched minimized geometry/state'
    );
    assert.deepEqual(
      geometry(result.endNative),
      geometry(results[0].endNative),
      'Mismatched minimized geometry/state'
    );
  }
  await writeFile(
    resolve(out, 'result.json'),
    JSON.stringify(
      {
        scope:
          'Repeated native minimize drawing A-B-B-A; not CPU/memory/presentation acceptance',
        resumed: resume,
        results,
      },
      null,
      2
    )
  );
} finally {
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
  assert.equal(active, undefined, 'Child lifetime unresolved: preserve source');
  assert.equal(
    await readFile(file, 'utf8'),
    expected,
    'Source changed externally: preserve it'
  );
  await writeFile(file, candidate);
  assert.equal(
    hash(await readFile(file)),
    hash(candidate),
    'Candidate restoration failed'
  );
}
