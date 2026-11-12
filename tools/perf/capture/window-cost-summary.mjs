import assert from 'node:assert/strict';

export function screenGeometry(result) {
  const widgets = result.snapshot.windows.flatMap((window) =>
    window.dom.widgets.map((widget) => ({
      id: widget.id,
      x: window.bounds.x + widget.x,
      y: window.bounds.y + widget.y,
      width: widget.width,
      height: widget.height,
      dpr: window.dom.dpr,
    }))
  );
  return widgets.sort((a, b) => a.id.localeCompare(b.id));
}

export function summarizeWindowCost(
  result,
  origin,
  samples,
  geometryEvents = []
) {
  assert.equal(result.status.code, 0);
  assert.equal(result.completedMarker, true);
  assert.equal(result.durationSeconds, 420);
  assert.ok(result.tapeSha256 && result.environment);
  for (const source of [result.sourceStart, result.sourceEnd]) {
    assert.equal(source.sourceKind, 'tape');
    assert.equal(source.status.paused, false);
    assert.equal(source.status.speed, 1);
  }
  assert.ok(
    result.sourceEnd.status.position - result.sourceStart.status.position > 340
  );
  assert.ok(
    !geometryEvents.some((event) => event.name === 'overflow'),
    'Geometry event overflow'
  );
  const originMs = Date.parse(origin.timestamp);
  assert.ok(
    !geometryEvents.some(
      (event) => event.at - originMs >= 60000 && event.at - originMs < 420000
    ),
    'Window/display geometry or visibility changed during steady state'
  );
  const steady = samples.filter(
    (s) =>
      Date.parse(s.timestamp) - originMs - s.intervalMs >= 59950 &&
      Date.parse(s.timestamp) - originMs <= 420000
  );
  assert.ok(steady.length > 60, 'Missing steady intervals');
  const seconds = steady.reduce((sum, s) => sum + s.intervalMs / 1000, 0);
  assert.ok(seconds >= 300, 'Steady duration too short');
  for (let i = 1; i < steady.length; i++)
    assert.ok(
      Date.parse(steady[i].timestamp) - Date.parse(steady[i - 1].timestamp) <
        7000,
      'Observation gap'
    );
  const identities = (s) =>
    s.processes.map((p) => [p.pid, p.creationTime]).sort((a, b) => a[0] - b[0]);
  for (const sample of steady) {
    assert.deepEqual(
      identities(sample),
      identities(steady[0]),
      'Process lifetime/topology changed'
    );
    assert.ok(
      sample.processes.every(
        (p) =>
          Number.isFinite(p.cpuTimeMs) &&
          p.cpuTimeMs >= 0 &&
          p.cpuSampleIntervalMs > 0 &&
          Number.isFinite(p.memoryMB)
      ),
      'Missing CPU/memory coverage'
    );
    assert.equal(sample.scenarioMetadata.sourceKind, 'tape');
    assert.equal(sample.scenarioMetadata.overlayWindowMode, result.mode);
    assert.ok(
      sample.runtimeWindows
        .filter((w) => !w.route.endsWith('#/tape-replay'))
        .every((w) => w.visible),
      'Overlay became hidden'
    );
  }
  const publications = {};
  for (const sample of steady)
    for (const [channel, count] of Object.entries(
      sample.channelMetrics.publications
    ))
      publications[channel] = (publications[channel] ?? 0) + count;
  for (const channel of [
    'track-state.snapshot',
    'driver-controls.snapshot',
    'radar.snapshot',
    'lap-trace.sample',
    'standings.snapshot',
  ])
    assert.ok(
      publications[channel] > 0,
      'Missing required publication: ' + channel
    );
  const processes = steady[0].processes.map((process) => {
    const rows = steady.map((s) =>
      s.processes.find((p) => p.pid === process.pid)
    );
    const window = result.snapshot.windows.find((w) => w.pid === process.pid);
    const role = window
      ? window.url.endsWith('#/tape-replay')
        ? 'controls'
        : result.mode === 'display'
          ? 'display'
          : 'widget:' + window.dom.widgets.map((w) => w.id).join(',')
      : process.type;
    return {
      pid: process.pid,
      creationTime: process.creationTime,
      role,
      cpuMsPerSecond:
        rows.reduce((sum, p) => sum + p.cpuTimeMs, 0) /
        rows.reduce((sum, p) => sum + p.cpuSampleIntervalMs / 1000, 0),
      meanWorkingSetMiB:
        rows.reduce((sum, p, i) => sum + p.memoryMB * steady[i].intervalMs, 0) /
        (seconds * 1000),
      firstWorkingSetMiB: rows[0].memoryMB,
      lastWorkingSetMiB: rows.at(-1).memoryMB,
      maxWorkingSetMiB: Math.max(...rows.map((p) => p.memoryMB)),
    };
  });
  return {
    mode: result.mode,
    source: result.source,
    seedSha256: result.seedSha256,
    tapeSha256: result.tapeSha256,
    environment: result.environment,
    geometry: screenGeometry(result),
    steadySeconds: seconds,
    intervals: steady.length,
    tickHz: steady.reduce((sum, s) => sum + s.tickCount, 0) / seconds,
    publicationRates: Object.fromEntries(
      Object.entries(publications).map(([key, count]) => [key, count / seconds])
    ),
    processes,
    totalCpuMsPerSecond: processes.reduce(
      (sum, p) => sum + p.cpuMsPerSecond,
      0
    ),
    sumMeanWorkingSetMiB: processes.reduce(
      (sum, p) => sum + p.meanWorkingSetMiB,
      0
    ),
    sourceStart: result.sourceStart,
    sourceEnd: result.sourceEnd,
  };
}

export function validateWindowCostPair(a, b) {
  for (const key of [
    'source',
    'seedSha256',
    'tapeSha256',
    'environment',
    'geometry',
  ])
    assert.deepEqual(a[key], b[key], 'Comparison mismatch: ' + key);
  assert.notEqual(a.mode, b.mode);
  const relativeCadenceDifference = Math.abs(b.tickHz / a.tickHz - 1);
  assert.ok(
    relativeCadenceDifference <= 0.005,
    'Cadence difference exceeds predeclared 0.5%'
  );
  return { relativeCadenceDifferencePercent: relativeCadenceDifference * 100 };
}

export function parseWindowCostLog(text) {
  let origin;
  const samples = [],
    geometryEvents = [];
  for (const line of text.split('\n'))
    for (const marker of [
      '[PerfRunOrigin:JSON] ',
      '[PerfMetrics:JSON] ',
      '[PerfWindowGeometry:JSON] ',
    ]) {
      const at = line.indexOf(marker);
      if (at < 0) continue;
      const value = JSON.parse(line.slice(at + marker.length));
      if (marker.includes('Origin')) origin = value;
      else if (marker.includes('Geometry')) geometryEvents.push(value);
      else samples.push(value);
    }
  assert.ok(origin, 'Missing capture origin');
  return { origin, samples, geometryEvents };
}
