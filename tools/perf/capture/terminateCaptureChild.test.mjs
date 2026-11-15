import assert from 'node:assert/strict';
import { test } from 'node:test';
import { terminateCaptureChild } from './terminateCaptureChild.mjs';

test('graceful shutdown signals main without killing the process group', async () => {
  const signals = [];
  const result = await terminateCaptureChild({
    childPid: 100,
    browserPid: 101,
    exit: Promise.resolve(),
    kill: (...args) => signals.push(args),
    wait: () =>
      new Promise(() => {
        /* Intentionally pending: no exit observed. */
      }),
  });
  assert.deepEqual(signals, [[101, 'SIGTERM']]);
  assert.equal(result.terminated, true);
});

test('timeout escalates to the owned group and requires observed exit', async () => {
  const signals = [];
  const waits = [];
  const result = await terminateCaptureChild({
    childPid: 100,
    browserPid: 101,
    exit: new Promise(() => {
      /* Intentionally pending: no exit observed. */
    }),
    kill: (...args) => signals.push(args),
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  assert.deepEqual(signals, [
    [101, 'SIGTERM'],
    [-100, 'SIGKILL'],
  ]);
  assert.deepEqual(waits, [15000, 5000]);
  assert.equal(result.terminated, false);
});

test('missing process does not prove child exit', async () => {
  const result = await terminateCaptureChild({
    childPid: 100,
    exit: new Promise(() => {
      /* Intentionally pending: no exit observed. */
    }),
    kill: () => {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    },
    wait: async () => {
      /* Advance the timeout without real sleeping. */
    },
  });
  assert.deepEqual(result, { terminated: false, errors: [] });
});

test('signal errors are preserved for diagnostics', async () => {
  const result = await terminateCaptureChild({
    childPid: 100,
    exit: new Promise(() => {
      /* Intentionally pending: no exit observed. */
    }),
    kill: () => {
      throw new Error('denied');
    },
    wait: async () => {
      /* Advance the timeout without real sleeping. */
    },
  });
  assert.equal(result.terminated, false);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /denied/);
});
