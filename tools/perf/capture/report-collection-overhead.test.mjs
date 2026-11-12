import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const exec = promisify(execFile);
const reporter = new URL('./report-collection-overhead.mjs', import.meta.url);
const sequences = ['on1', 'off1', 'off2', 'on2'];
const viewport = { width: 1549, height: 1009, dpr: 1 };

async function fixture(mutate = (value) => value) {
  const root = await mkdtemp(join(tmpdir(), 'irdashies-overhead-report-'));
  const json = (path, value) =>
    writeFile(join(root, path), JSON.stringify(value));
  const runs = sequences.map((sequence) => ({
    sequence,
    collection: sequence.startsWith('off') ? 'off' : 'on',
    status: { code: 0 },
  }));
  await json('runs.json', runs);
  for (const [index, run] of runs.entries()) {
    await mkdir(join(root, run.sequence));
    const manifest = {
      source: 'fixture',
      sources: [],
      seedSha256: 'same-seed',
      expectedViewport: viewport,
      node: 'fixture',
      os: 'fixture',
      cpu: 'fixture',
      collection: run.collection,
    };
    // One CPU second per wall second on, half a CPU second off.
    const rate = run.collection === 'on' ? 1 : 0.5;
    const samples = Array.from({ length: 36 }, (_, i) => ({
      at: 100000 + i * 10000,
      elapsedSeconds: 60 + i * 10,
      processes: [
        {
          pid: 10 + index,
          creationTime: 1,
          type: 'Browser',
          cumulativeCPUUsage: i * 10 * rate,
        },
      ],
      ui: {
        ...viewport,
        visibility: 'visible',
        status: { paused: false, speed: 1, position: 60 + i * 10 },
        workload: Object.fromEntries(
          [
            'track-state.snapshot',
            'driver-controls.snapshot',
            'radar.snapshot',
          ].map((channel) => [channel, { version: i * 250 }])
        ),
        frames: i * 600,
        now: i * 10000,
      },
    }));
    mutate({ run, index, manifest, samples });
    await json(run.sequence + '/manifest.json', manifest);
    await json(run.sequence + '/environment.json', { versions: 'same' });
    await json(run.sequence + '/external-cpu.json', samples);
  }
  return root;
}

async function check(mutate, expectedError, cadenceMatched = true) {
  const root = await fixture(mutate);
  try {
    if (expectedError) {
      await assert.rejects(
        exec(process.execPath, [reporter.pathname, root]),
        expectedError
      );
      return;
    }
    await exec(process.execPath, [reporter.pathname, root]);
    const summary = JSON.parse(
      await readFile(join(root, 'collection-overhead-summary.json'), 'utf8')
    );
    assert.equal(summary.cadenceMatched, cadenceMatched);
    assert.deepEqual(
      summary.results.map((r) => r.totalCpuMsPerSecond),
      [1000, 500, 500, 1000]
    );
    assert.ok(summary.results.every((r) => r.rafHz === 60));
    assert.ok(
      summary.pairs.every(
        (p) =>
          p.collectionCpuDeltaMsPerSecond === 500 &&
          p.collectionCpuDeltaPercentOfOff === 100
      )
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('external CPU deltas use seconds and pair reversed order correctly', () =>
  check());
test('reject a missing source match', () =>
  check(({ index, manifest }) => {
    if (index === 2) manifest.source = 'different';
  }, /Mismatched source/));
test('reject process replacement without averaging it as zero', () =>
  check(({ samples, index }) => {
    if (index === 1) samples[10].processes[0].creationTime = 2;
  }, /Process churn/));
test('reject a CPU reset', () =>
  check(({ samples, index }) => {
    if (index === 0) samples[10].processes[0].cumulativeCPUUsage = 0;
  }, /Invalid cumulative CPU/));
test('reject a stalled replay', () =>
  check(({ samples, index }) => {
    if (index === 0)
      samples[10].ui.status.position = samples[9].ui.status.position;
  }, /Replay stopped advancing/));
test('reject an interrupted sampler', () =>
  check(({ samples, index }) => {
    if (index === 0) samples[10].at += 6000;
  }, /Interrupted external sampler/));
test('reject too short a steady-state window', () =>
  check(({ samples, index }) => {
    if (index === 0) samples.splice(20);
  }, /Insufficient external CPU samples/));

test('reject missing workload evidence', () =>
  check(({ samples, index }) => {
    if (index === 0) delete samples[10].ui.workload;
  }, /Missing or reset workload version/));

test('mark a valid CPU series incomparable when snapshot cadence changes', () =>
  check(
    ({ samples, index }) => {
      if (index === 1)
        for (const [i, s] of samples.entries())
          s.ui.workload['track-state.snapshot'].version = i * 300;
    },
    undefined,
    false
  ));
