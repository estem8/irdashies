import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWindowCostPair,
  screenGeometry,
} from './window-cost-summary.mjs';
const shared = {
  mode: 'display',
  source: 'source',
  seedSha256: 'seed',
  tapeSha256: 'tape',
  environment: { dpr: 1 },
  geometry: [{ id: 'map', x: 20, y: 10, width: 300, height: 200, dpr: 1 }],
  tickHz: 59.8,
};
test('requires matching source, input, geometry, environment and cadence', () => {
  const widget = { ...shared, mode: 'widget', tickHz: 59.7 };
  assert.ok(
    validateWindowCostPair(shared, widget).relativeCadenceDifferencePercent <
      0.5
  );
  for (const [key, value] of [
    ['source', 'different'],
    ['seedSha256', 'different'],
    ['tapeSha256', 'different'],
    ['environment', { dpr: 2 }],
    ['geometry', []],
    ['tickHz', 58],
  ])
    assert.throws(() =>
      validateWindowCostPair(shared, { ...widget, [key]: value })
    );
});
test('compares widget screen coordinates across shared and individual windows', () => {
  const result = (bounds, widget) => ({
    snapshot: { windows: [{ bounds, dom: { dpr: 1, widgets: [widget] } }] },
  });
  assert.deepEqual(
    screenGeometry(
      result(
        { x: 0, y: 0 },
        { id: 'map', x: 20, y: 10, width: 300, height: 200 }
      )
    ),
    screenGeometry(
      result(
        { x: 20, y: 10 },
        { id: 'map', x: 0, y: 0, width: 300, height: 200 }
      )
    )
  );
});

const fixture = () => {
  const source = (position) => ({
    sourceKind: 'tape',
    status: { position, speed: 1, paused: false },
  });
  const result = {
    ...shared,
    durationSeconds: 420,
    status: { code: 0 },
    completedMarker: true,
    sourceStart: source(55),
    sourceEnd: source(410),
    snapshot: {
      windows: [
        {
          pid: 11,
          url: 'http://localhost/',
          bounds: { x: 0, y: 0 },
          dom: {
            dpr: 1,
            widgets: [{ id: 'map', x: 20, y: 10, width: 300, height: 200 }],
          },
        },
      ],
    },
  };
  const main = Array.from({ length: 65 }, (_, i) => ({
    timestamp: new Date(65000 + i * 5000).toISOString(),
    intervalMs: 5000,
    tickCount: 300,
    processes: [
      {
        pid: 10,
        creationTime: 1,
        type: 'Browser',
        cpuTimeMs: 10,
        cpuSampleIntervalMs: 5000,
        memoryMB: 20,
      },
      {
        pid: 11,
        creationTime: 2,
        type: 'Tab',
        cpuTimeMs: 20,
        cpuSampleIntervalMs: 5000,
        memoryMB: 30,
      },
    ],
    scenarioMetadata: { sourceKind: 'tape', overlayWindowMode: 'display' },
    runtimeWindows: [{ route: '/', visible: true }],
    channelMetrics: {
      publications: Object.fromEntries(
        [
          'track-state.snapshot',
          'driver-controls.snapshot',
          'radar.snapshot',
          'lap-trace.sample',
          'standings.snapshot',
        ].map((c) => [c, 100])
      ),
    },
  }));
  return { result, origin: { timestamp: new Date(0).toISOString() }, main };
};
import { summarizeWindowCost } from './window-cost-summary.mjs';
test('summarizes complete steady CPU time and working set without treating it as private memory', () => {
  const f = fixture();
  const summary = summarizeWindowCost(f.result, f.origin, f.main);
  assert.equal(summary.totalCpuMsPerSecond, 6);
  assert.equal(summary.sumMeanWorkingSetMiB, 50);
  assert.equal(summary.steadySeconds, 325);
  assert.equal(summary.tickHz, 60);
});
test('rejects lost intervals, missing CPU, process replacement, hidden work and absent required input', () => {
  for (const mutate of [
    (f) => f.main.splice(1, 1),
    (f) => {
      delete f.main[2].processes[0].cpuTimeMs;
    },
    (f) => {
      f.main[2].processes[0].creationTime = 3;
    },
    (f) => {
      f.main[2].runtimeWindows[0].visible = false;
    },
    (f) => {
      for (const row of f.main)
        row.channelMetrics.publications['driver-controls.snapshot'] = 0;
    },
    (f) => {
      f.result.sourceEnd.status.position = 55;
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => summarizeWindowCost(f.result, f.origin, f.main));
  }
});

import { parseWindowCostLog } from './window-cost-summary.mjs';
test('retains geometry events from the real wire markers and rejects changes in the measured interval', () => {
  const f = fixture();
  const text =
    'logger [PerfRunOrigin:JSON] ' +
    JSON.stringify(f.origin) +
    '\n[PerfMetrics:JSON] ' +
    JSON.stringify(f.main[0]) +
    '\n[PerfWindowGeometry:JSON] ' +
    JSON.stringify({ at: 70000, name: 'resize' }) +
    '\n';
  const parsed = parseWindowCostLog(text);
  assert.equal(parsed.samples.length, 1);
  assert.equal(parsed.geometryEvents.length, 1);
  assert.throws(() =>
    summarizeWindowCost(f.result, f.origin, f.main, parsed.geometryEvents)
  );
  assert.throws(() =>
    summarizeWindowCost(f.result, f.origin, f.main, [
      { at: 50000, name: 'overflow' },
    ])
  );
  assert.throws(() => parseWindowCostLog('[PerfMetrics:JSON] invalid'));
});
