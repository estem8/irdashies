import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const exec = promisify(execFile);
const reporter = new URL('./report-map-identities.mjs', import.meta.url);
const viewport = { width: 1549, height: 1009, dpr: 1 };
async function fixture(mutate = (value) => value) {
  const root = await mkdtemp(join(tmpdir(), 'irdashies-map-identity-report-'));
  const json = (path, value) =>
    writeFile(join(root, path), JSON.stringify(value));
  const runs = [
    ['a1', 'baseline'],
    ['b1', 'candidate'],
    ['b2', 'candidate'],
    ['a2', 'baseline'],
  ].map(([sequence, variant]) => ({ sequence, variant, status: { code: 0 } }));
  await json('runs.json', runs);
  for (const [index, run] of runs.entries()) {
    await mkdir(join(root, run.sequence));
    const source = 'diagnostic fixture ' + run.variant;
    const manifest = {
      source: 'same-code',
      sources: [],
      seedSha256: 'same-seed',
      expectedViewport: viewport,
      mapIdentityDiagnostic: true,
      mapIdentitySourceSha256: createHash('sha256')
        .update(source)
        .digest('hex'),
    };
    const samples = Array.from({ length: 12 }, (_, i) => {
      const computations = run.variant === 'baseline' ? 1 + i * 20 : 1;
      return {
        at: 100000 + i * 10000,
        elapsedSeconds: 60 + i * 10,
        ui: {
          ...viewport,
          visibility: 'visible',
          status: { paused: false, speed: 1, position: 60 + i * 10 },
          identityDiagnostic: {
            computations,
            computationsWithDrivers: computations,
            identityObjects: computations * 40,
            progressComputations: 1 + i * 20,
          },
        },
      };
    });
    mutate({ index, run, manifest, samples });
    await writeFile(
      join(root, run.sequence, 'map-identity-source.tsx'),
      source
    );
    await json(run.sequence + '/manifest.json', manifest);
    await json(run.sequence + '/environment.json', { versions: 'same' });
    await json(run.sequence + '/external-cpu.json', samples);
  }
  return root;
}
async function check(mutate, expectedError) {
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
    const report = JSON.parse(
      await readFile(join(root, 'map-identity-summary.json'), 'utf8')
    );
    assert.deepEqual(
      report.results.map((r) => r.ratesPerSecond.computations),
      [2, 0, 0, 2]
    );
    assert.ok(
      report.pairs.every(
        (p) =>
          p.identityComputationsDeltaPerSecond === -2 &&
          p.identityObjectsDeltaPerSecond === -80 &&
          p.baselineProgressHz === 2 &&
          p.candidateProgressHz === 2
      )
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('measure zero steady identity construction while progress continues', () =>
  check());
test('reject a source hash mismatch', () =>
  check(({ index, manifest }) => {
    if (index === 1) manifest.mapIdentitySourceSha256 = '0'.repeat(64);
  }, /Diagnostic source hash mismatch/));
test('reject counter reset', () =>
  check(({ index, samples }) => {
    if (index === 1) samples[5].ui.identityDiagnostic.identityObjects = 0;
  }, /Counter reset/));
test('reject an unexercised progress path', () =>
  check(({ index, samples }) => {
    if (index === 1)
      for (const s of samples) s.ui.identityDiagnostic.progressComputations = 0;
  }, /Progress path unexercised/));
test('reject missing diagnostic counters', () =>
  check(({ index, samples }) => {
    if (index === 2) delete samples[4].ui.identityDiagnostic.computations;
  }, /Missing computations/));
