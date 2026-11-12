import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMemoryBreakdown } from './memory-breakdown.mjs';
const origin = 1000000;
const input = () =>
  Array.from({ length: 36 }, (_, i) => ({
    timestamp: new Date(origin + 60000 + i * 10000).toISOString(),
    processes: [
      {
        pid: 10,
        creationTime: 1,
        privateMB: 30 + i,
        privateCleanMiB: 10 + i,
        privateDirtyMiB: 20,
        privateHugetlbMiB: 0,
        anonymousMiB: 20,
        pssMB: 25 + i,
      },
    ],
  }));
const summarize = (samples) =>
  summarizeMemoryBreakdown(samples, { pid: 10, origin });
test('separate private clean growth from stable dirty/anonymous memory', () => {
  const result = summarize(input());
  assert.equal(result.fields.privateMiB.delta, 35);
  assert.equal(result.fields.privateCleanMiB.delta, 35);
  assert.equal(result.fields.privateDirtyMiB.delta, 0);
  assert.equal(result.fields.anonymousMiB.delta, 0);
  assert.ok(
    Math.abs(result.fields.privateCleanMiB.slopeMiBPerMinute - 6) < 1e-10
  );
  assert.equal(result.decompositionMaxErrorMiB, 0);
});
test('missing optional counter is absent evidence rather than zero growth', () => {
  const result = summarize(input());
  assert.equal(result.fields.pssFileMiB.availableSamples, 0);
  assert.equal(result.fields.pssFileMiB.delta, null);
});
test('reject missing process observations', () => {
  const s = input();
  s[10].processes = [];
  assert.throws(() => summarize(s), /Missing private-memory process/);
});
test('reject process replacement', () => {
  const s = input();
  s[10].processes[0].creationTime = 2;
  assert.throws(() => summarize(s), /Memory process lifetime changed/);
});
test('reject inconsistent private accounting', () => {
  const s = input();
  s[10].processes[0].privateMB += 1;
  assert.throws(() => summarize(s), /components do not match/);
});
