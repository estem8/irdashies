import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const exec = promisify(execFile);
const reporter = new URL('./report-native-memory.mjs', import.meta.url);
const viewport = { width: 1549, height: 1009, dpr: 1 };
const scalar = (value) => ({
  type: 'scalar',
  units: 'bytes',
  value: value.toString(16),
});
async function fixture(mutate = (value) => value) {
  const root = await mkdtemp(join(tmpdir(), 'irdashies-native-report-'));
  await mkdir(join(root, 'memory'));
  const json = (file, value) =>
    writeFile(join(root, file), JSON.stringify(value));
  const records = [],
    privateSamples = [];
  for (const [index, seconds] of [120, 420, 720, 1020, 1320].entries()) {
    const at = new Date(1000000 + seconds * 1000).toISOString(),
      label = 'steady-' + seconds;
    const record = {
      label,
      at,
      elapsedSeconds: seconds,
      overlayViewport: viewport,
      processes: [
        { pid: 1, type: 'Browser', creationTime: 1 },
        { pid: 2, type: 'Tab', creationTime: 2 },
        { pid: 3, type: 'Tab', creationTime: 3 },
      ],
      windows: [
        { pid: 2, url: 'http://localhost:5173/' },
        { pid: 3, url: 'http://localhost:5173/#/settings' },
      ],
      mainHeap: { usedSize: 1000 + index },
      overlayHeap: { usedSize: 2000 + index },
      heap: { usedSize: 3000 + index },
    };
    const trace = {
      traceEvents: [1, 2, 3].map((pid) => {
        const allocators = {
          malloc: {
            attrs: {
              size: scalar(10000 + index),
              allocated_objects_size: scalar(5000 + index),
            },
          },
          v8: { attrs: { size: scalar(2000 + index) } },
          opaque_resource_123: { attrs: { size: scalar(999999) } },
        };
        if (pid !== 1)
          allocators.partition_alloc = {
            attrs: { size: scalar(3000 + index) },
          };
        return {
          ph: 'v',
          id: '1',
          pid,
          args: {
            dumps: {
              allocators,
              process_totals: {
                private_footprint_bytes: (1000 + index).toString(16),
              },
            },
          },
        };
      }),
    };
    const completion = { completed: { dataLossOccurred: false } };
    const sample = {
      timestamp: at,
      processes: [1, 2, 3].map((pid) => ({
        pid,
        privateMB: 100 + pid + index,
      })),
    };
    mutate({ index, record, trace, completion, sample });
    records.push(record);
    privateSamples.push(sample);
    await json('memory/' + label + '.memory-infra.trace.json', trace);
    await json('memory/' + label + '.memory-trace-completion.json', completion);
  }
  await json('runs.json', [{ status: { code: 0 } }]);
  await json('memory/settings.json', {
    passed: true,
    nativeAllocatorDiagnostics: true,
    records,
  });
  await json('memory/manifest.json', { expectedViewport: viewport });
  await json('memory/environment.json', {});
  await json('memory/linux-private-memory.json', privateSamples);
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
      await readFile(join(root, 'native-memory-summary.json'), 'utf8')
    );
    assert.equal(report.changes.main.privateDeltaMiB, 4);
    assert.equal(report.changes.main.nativePrivateFootprintDeltaBytes, 4);
    assert.equal(
      report.changes.overlay.counters.malloc.allocated_objects_size.deltaBytes,
      4
    );
    assert.equal(
      report.points[0].roles.main.allocators.partition_alloc,
      undefined
    );
    assert.equal(
      report.points[0].roles.overlay.allocators.opaque_resource_123,
      undefined
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('native report keeps bounded aggregate counters and absence distinct from zero', () =>
  check());
test('native report rejects lost trace data', () =>
  check(({ index, completion }) => {
    if (index === 2) completion.completed.dataLossOccurred = true;
  }, /AssertionError/));
test('native report rejects missing private-memory evidence', () =>
  check(({ sample }) => {
    sample.processes = sample.processes.filter((p) => p.pid !== 2);
  }, /No valid private-memory sample/));
test('native report rejects missing critical allocator evidence', () =>
  check(({ index, trace }) => {
    if (index === 2)
      delete trace.traceEvents[1].args.dumps.allocators.partition_alloc;
  }, /Missing required overlay partition_alloc size/));
test('native report rejects process-lifetime changes between endpoints', () =>
  check(({ index, record }) => {
    if (index === 2) record.processes[1].creationTime = 200;
  }, /Process lifetime changed/));
