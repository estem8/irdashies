import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLiveAllocations } from './summarize-live-allocations.mjs';
const node = (name, bytes, children = []) => ({
  selfSize: bytes,
  callFrame: {
    functionName: name,
    url: 'fixture',
    lineNumber: 0,
    columnNumber: 0,
  },
  children,
});
test('counts each allocation site once and preserves full caller attribution', () => {
  const result = summarizeLiveAllocations(
    {
      head: node('root', 0, [
        node('caller', 12, [node('leaf', 40)]),
        node('other', 20),
      ]),
    },
    1
  );
  assert.equal(result.totalSampledLiveBytes, 72);
  assert.equal(result.allocationSites, 3);
  assert.equal(result.top.length, 1);
  assert.deepEqual(
    result.top[0].stack.map((f) => f.functionName),
    ['root', 'caller', 'leaf']
  );
  assert.equal(result.top[0].estimatedLiveBytes, 40);
});
test('rejects absent and invalid samples rather than treating them as zero', () => {
  assert.throws(() => summarizeLiveAllocations(undefined));
  assert.throws(() => summarizeLiveAllocations({ head: node('bad', NaN) }));
  assert.throws(() => summarizeLiveAllocations({ head: node('bad', -1) }));
});
