import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  summarizeWindowCost,
  parseWindowCostLog,
  validateWindowCostPair,
} from './window-cost-summary.mjs';
const id = process.argv[2],
  stage = process.argv[3] ?? 'pair';
assert.match(id ?? '', /^[a-z0-9-]+$/);
assert.ok(['pair', 'finish'].includes(stage));
const out = resolve('perf-results', id);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
assert.equal(
  execFileSync('git', ['status', '--porcelain', '--', 'src'], {
    encoding: 'utf8',
  }).trim(),
  '',
  'App source must be committed'
);
const hash = (data) => createHash('sha256').update(data).digest('hex');
let results = [];
if (stage === 'pair') {
  await mkdir(out);
  await writeFile(
    resolve(out, 'manifest.json'),
    JSON.stringify(
      {
        source: revision,
        createdAt: new Date().toISOString(),
        cadenceGate: 0.005,
        scope:
          'Four normal-operation Linux development captures; 420 seconds each; existing optional metrics; no timer wrapper or work suppression',
      },
      null,
      2
    )
  );
} else {
  const manifest = JSON.parse(
    await readFile(resolve(out, 'manifest.json'), 'utf8')
  );
  assert.equal(manifest.source, revision);
  results = JSON.parse(await readFile(resolve(out, 'runs.json'), 'utf8'));
  assert.deepEqual(
    results.map((r) => r.name),
    ['display1', 'widget1']
  );
  validateWindowCostPair(results[0].summary, results[1].summary);
  for (const result of results)
    for (const [name, digest] of Object.entries(result.artifacts))
      assert.equal(
        hash(await readFile(resolve('perf-results', result.runId, name))),
        digest,
        'Recovered artifact changed'
      );
}
let child,
  exited = true;
const cancel = () => child?.kill('SIGTERM');
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
try {
  for (const [name, mode] of stage === 'pair'
    ? [
        ['display1', 'display'],
        ['widget1', 'widget'],
      ]
    : [
        ['widget2', 'widget'],
        ['display2', 'display'],
      ]) {
    assert.equal(
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      revision
    );
    assert.equal(
      execFileSync('git', ['status', '--porcelain', '--', 'src'], {
        encoding: 'utf8',
      }).trim(),
      ''
    );
    const runId = id + '-' + name;
    process.stdout.write(
      JSON.stringify({ stage: 'starting', runId, mode, durationSeconds: 420 }) +
        '\n'
    );
    child = spawn(
      process.execPath,
      ['tools/perf/capture/window-topology-probe.mjs', runId, mode, 'cost'],
      { stdio: 'inherit' }
    );
    exited = false;
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        exited = true;
        resolve(code);
      });
    });
    assert.equal(code, 0, 'Capture failed');
    const folder = resolve('perf-results', runId);
    const result = JSON.parse(
      await readFile(resolve(folder, 'result.json'), 'utf8')
    );
    const text = await readFile(resolve(folder, 'console.log'), 'utf8');
    const { origin, samples, geometryEvents } = parseWindowCostLog(text);
    const summary = summarizeWindowCost(
      result,
      origin,
      samples,
      geometryEvents
    );
    const artifacts = Object.fromEntries(
      await Promise.all(
        ['result.json', 'observed.json', 'console.log'].map(async (name) => [
          name,
          hash(await readFile(resolve(folder, name))),
        ])
      )
    );
    results.push({ name, runId, summary, artifacts });
    await writeFile(
      resolve(out, 'runs.json'),
      JSON.stringify(results, null, 2)
    );
    process.stdout.write(
      JSON.stringify({
        stage: 'complete',
        name,
        tickHz: summary.tickHz,
        totalCpuMsPerSecond: summary.totalCpuMsPerSecond,
        sumMeanWorkingSetMiB: summary.sumMeanWorkingSetMiB,
      }) + '\n'
    );
    if (results.length === 2)
      validateWindowCostPair(results[0].summary, results[1].summary);
    if (results.length === 4)
      validateWindowCostPair(results[2].summary, results[3].summary);
  }
  await writeFile(
    resolve(out, stage === 'pair' ? 'pair.json' : 'result.json'),
    JSON.stringify(
      {
        scope:
          'Observed Electron process CPU/working set with optional metrics enabled; private memory and capture overhead unavailable; not packaged/game acceptance',
        results,
      },
      null,
      2
    )
  );
} catch (error) {
  await writeFile(
    resolve(out, 'failed-' + stage + '.json'),
    JSON.stringify(
      { error: String(error), completedRuns: results.map((r) => r.name) },
      null,
      2
    )
  );
  throw error;
} finally {
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
  if (!exited) child?.kill('SIGTERM');
}
