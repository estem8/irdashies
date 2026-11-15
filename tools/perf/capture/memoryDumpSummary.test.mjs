import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  memoryScalarBytes,
  summarizeMemoryDump,
} from './memoryDumpSummary.mjs';

const bytes = (value) => ({ type: 'scalar', units: 'bytes', value });
const event = (dumps) => ({ ph: 'v', id: '0x0', pid: 10, args: { dumps } });
test('hex byte values are decoded while object counts are not treated as bytes', () => {
  assert.equal(memoryScalarBytes(bytes('10')), 16);
  assert.equal(
    memoryScalarBytes({ type: 'scalar', units: 'objects', value: '10' }),
    undefined
  );
  assert.throws(() => memoryScalarBytes(bytes('not-a-number')));
  assert.deepEqual(memoryScalarBytes(bytes('ffffffffffffffff')), {
    exactBytes: '18446744073709551615',
  });
});
test('provider fragments merge by PID, preserving parent/child overlap', () => {
  const rows = summarizeMemoryDump({
    traceEvents: [
      event({ process_totals: { resident_set_bytes: 'ff' } }),
      event({ allocators: { malloc: { attrs: { size: bytes('20') } } } }),
      event({
        allocators: {
          'malloc/allocated_objects': { attrs: { size: bytes('10') } },
        },
      }),
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].allocators.malloc.size, 32);
  assert.equal(rows[0].allocators['malloc/allocated_objects'].size, 16);
  assert.equal(rows[0].processTotals.resident_set_bytes, 'ff');
});
test('multiple dump IDs and missing provider data cannot silently pass', () => {
  assert.throws(() => summarizeMemoryDump({ traceEvents: [] }));
  assert.throws(() =>
    summarizeMemoryDump({
      traceEvents: [event({}), { ...event({}), id: '0x1' }],
    })
  );
});
