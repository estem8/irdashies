import assert from 'node:assert/strict';

// selfSize estimates sampled allocations still live at stopSampling, not
// allocation traffic, exact object counts, or the complete retained heap.
export function summarizeLiveAllocations(profile, limit = 20) {
  assert.ok(profile?.head, 'Missing sampling profile');
  assert.ok(Number.isSafeInteger(limit) && limit > 0);
  const rows = [];
  let totalSampledLiveBytes = 0;
  const visit = (node, ancestors) => {
    assert.ok(Number.isFinite(node.selfSize) && node.selfSize >= 0);
    const frame = node.callFrame;
    assert.ok(frame && typeof frame.functionName === 'string');
    const stack = [
      ...ancestors,
      {
        functionName: frame.functionName,
        url: frame.url,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
      },
    ];
    totalSampledLiveBytes += node.selfSize;
    if (node.selfSize > 0)
      rows.push({ estimatedLiveBytes: node.selfSize, stack });
    for (const child of node.children ?? []) visit(child, stack);
  };
  visit(profile.head, []);
  rows.sort((a, b) => b.estimatedLiveBytes - a.estimatedLiveBytes);
  return {
    totalSampledLiveBytes,
    allocationSites: rows.length,
    top: rows.slice(0, limit),
  };
}
