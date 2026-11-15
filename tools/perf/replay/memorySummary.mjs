function stats(points) {
  const valid = points.filter((p) => Number.isFinite(p.value));
  if (valid.length !== points.length || valid.length < 2)
    return {
      samples: valid.length,
      first: null,
      last: null,
      delta: null,
      slopePerCycle: null,
    };
  const x = valid.map((p) => p.cycle),
    y = valid.map((p) => p.value),
    mx = x.reduce((a, b) => a + b, 0) / x.length,
    my = y.reduce((a, b) => a + b, 0) / y.length;
  const divisor = x.reduce((sum, v) => sum + (v - mx) ** 2, 0);
  return {
    samples: y.length,
    first: y[0],
    last: y.at(-1),
    delta: y.at(-1) - y[0],
    slopePerCycle: divisor
      ? x.reduce((sum, v, i) => sum + (v - mx) * (y[i] - my), 0) / divisor
      : null,
  };
}
/** Compare equal post-cycle phases only; do not infer a leak from a slope. */
export function summarizeReplayMemory(checkpoints) {
  const cycles = checkpoints.filter((p) => p.cycle >= 1);
  if (!cycles.length) return { cycles: 0, heaps: [], processes: [] };
  const reference = cycles[0];
  const heaps = reference.heaps.map((first) => {
    const samples = cycles.map((p) => ({
      cycle: p.cycle,
      row: p.heaps.find(
        (h) =>
          h.role === first.role && h.pid === first.pid && h.url === first.url
      ),
    }));
    const continuous = first.pid !== null && samples.every((p) => p.row);
    const series = (read) =>
      samples.map((p) => ({
        cycle: p.cycle,
        value: continuous && p.row ? read(p.row) : null,
      }));
    const used = series((r) => r.heap.usedSize);
    return {
      role: first.role,
      pid: first.pid,
      url: first.url,
      continuous,
      usedHeap: stats(used),
      lateUsedHeap: stats(
        used.filter((p) => p.cycle >= Math.ceil(cycles.at(-1).cycle / 2))
      ),
      backingStorage: stats(series((r) => r.heap.backingStorageSize)),
      nodes: stats(series((r) => r.dom?.nodes)),
      listeners: stats(series((r) => r.dom?.jsEventListeners)),
      external: stats(series((r) => r.node?.memory.external)),
      arrayBuffers: stats(series((r) => r.node?.memory.arrayBuffers)),
    };
  });
  const processes = reference.resources.map((first) => {
    const samples = cycles.map((p) => ({
      cycle: p.cycle,
      row: p.resources.find(
        (r) => r.pid === first.pid && r.creationTime === first.creationTime
      ),
    }));
    const continuous = samples.every((p) => p.row);
    const fields = {};
    for (const name of [
      'privateBytes',
      'privateDirtyBytes',
      'anonymousBytes',
      'rssBytes',
    ])
      fields[name] = stats(
        samples.map((p) => ({
          cycle: p.cycle,
          value: continuous ? p.row?.memory?.[name] : null,
        }))
      );
    return {
      pid: first.pid,
      creationTime: first.creationTime,
      type: first.type,
      continuous,
      ...fields,
    };
  });
  return {
    scope:
      'Descriptive trends after forced GC at ended replay boundaries. Excludes startup cycle 0. Positive slopes alone are not a leak verdict.',
    cycles: cycles.length,
    heaps,
    processes,
  };
}
