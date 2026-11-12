import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  NumericSampleStats,
  RendererPerfSample,
} from '../../src/types/performance';
import {
  compareSummaries,
  comparisonMarkdown,
  parseCliArgs,
  parsePerfLog,
  summarizeCapture,
  summaryMarkdown,
} from './analyze';

const stats = (
  avg: number,
  overrides: Partial<NumericSampleStats> = {}
): NumericSampleStats => ({
  count: 100,
  avg,
  min: avg - 5,
  max: avg + 5,
  p1: avg - 4,
  p50: avg,
  p95: avg + 3,
  p99: avg + 4,
  ...overrides,
});

function mainSample(
  seconds: number,
  memoryMB: number,
  fps = 100,
  privateMemoryMB = memoryMB,
  intervalMs?: number
) {
  return {
    timestamp: new Date(seconds * 1000).toISOString(),
    runId: 'run',
    scenario: 'full',
    overlayMode: 'full',
    intervalMs,
    tickRateHz: 24,
    sections: {
      processTelemetry: { count: 100, avgMs: 1, maxMs: 4, p99Ms: 2 },
      broadcast: { count: 100, avgMs: 0.2, maxMs: 1, p99Ms: 0.5 },
    },
    eventLoopDelayMs: { mean: 20, max: 30, p99: 25 },
    iracing: {
      frameRate: stats(fps),
      cpuUsageForeground: stats(40),
      cpuUsageBackground: stats(5),
      gpuUsage: stats(70),
    },
    totalAppCpuPercent: 12,
    totalAppMemoryMB: memoryMB,
    totalAppPrivateMemoryMB: privateMemoryMB,
    scenarioMetadata: {
      activeWidgetTypes: ['standings'],
      widgetInputRequirements: {
        standings: ['standings.snapshot'],
      },
    },
    channelMetrics: {
      processorExecutions: { 'standings.snapshot': 100 },
      publications: { 'standings.snapshot': 20 },
      deliveries: { 'standings.snapshot': 20 },
    },
  };
}

type TestMainSample = Omit<
  ReturnType<typeof mainSample>,
  'totalAppPrivateMemoryMB'
> & {
  totalAppPrivateMemoryMB?: number;
};

const capture = (
  main: TestMainSample[],
  visibility: {
    timestamp: string;
    runId: string;
    index: number;
    visibility: 'visible' | 'hidden';
    durationSeconds: number;
  }[] = [],
  originSeconds = 0,
  runtimeTopologies: {
    timestamp: string;
    runId: string;
    complete: boolean;
    timedOut: boolean;
    topologyChanged: boolean;
    processMetricsAvailable: boolean;
    windows: {
      id: number;
      rendererPid: number;
      route: string;
      role: 'display' | 'widget' | 'gantry' | 'settings' | 'other';
      bounds: { x: number; y: number; width: number; height: number };
      visible: boolean;
      ready: boolean;
    }[];
    processCounts: Record<string, number>;
  }[] = []
) => ({
  main,
  renderer: [] as RendererPerfSample[],
  visibility,
  origins: [
    {
      timestamp: new Date(originSeconds * 1000).toISOString(),
      runId: 'run',
    },
  ],
  runtimeTopologies,
});

const conclusiveSamples = (fps = 100) =>
  Array.from({ length: 6 }, (_, index) =>
    mainSample(index * 60, 100 + index, fps, 200 + index * 2)
  );

describe('performance analysis', () => {
  it.each(['mock', 'tape', 'sdk-replay'])(
    'does not present %s fixture FPS as measured game performance',
    (sourceKind) => {
      const samples = [0, 60, 120].map((seconds) => ({
        ...mainSample(seconds, 100),
        scenarioMetadata: {
          ...mainSample(seconds, 100).scenarioMetadata,
          sourceKind,
        },
      }));
      const summary = summarizeCapture(capture(samples), 0);
      summary.evidence.conclusive = true;
      const comparison = compareSummaries(summary, summary);

      expect(summaryMarkdown(summary)).toContain(
        '| iRacing average FPS | n/a |'
      );
      expect(comparisonMarkdown(comparison)).toContain(
        '| iRacing average FPS | n/a |'
      );
      expect(
        comparison.checks.slice(0, 2).every((check) => check.passed === null)
      ).toBe(true);
      expect(
        comparison.checks.find(
          ({ name }) => name === 'iRacing average FPS regression'
        )?.target
      ).toContain('unavailable');
    }
  );

  it('parses structured records mixed with normal logs', () => {
    const main = mainSample(5, 100, 100, 100, 5000);
    const contents = [
      'normal output',
      '[PerfRunOrigin:JSON] {"timestamp":"1970-01-01T00:00:00.000Z","runId":"run"}',
      `[PerfMetrics:JSON] ${JSON.stringify(main)}`,
      '[PerfRenderer:JSON] {"timestamp":"1970-01-01T00:00:05.000Z","intervalMs":5000,"frameTimeMs":{"count":1,"avg":16,"min":16,"max":16,"p1":16,"p50":16,"p95":16,"p99":16},"framesOver25Ms":0,"framesOver50Ms":0}',
      '[PerfVisibility:JSON] {"timestamp":"1970-01-01T00:00:00.000Z","runId":"run","index":0,"visibility":"visible","durationSeconds":60}',
    ].join('\n');

    expect(parsePerfLog(contents)).toMatchObject({
      main: [main],
      renderer: [{ framesOver50Ms: 0 }],
      visibility: [{ visibility: 'visible' }],
      origins: [{ runId: 'run' }],
    });
  });

  it('parses and reports runtime topology markers', () => {
    const marker = {
      timestamp: new Date(1000).toISOString(),
      runId: 'run',
      complete: true,
      timedOut: false,
      topologyChanged: false,
      processMetricsAvailable: true,
      windows: [
        {
          id: 1,
          rendererPid: 400,
          route: 'http://localhost:5173/#/overlay-widget',
          role: 'widget' as const,
          bounds: { x: 10, y: 20, width: 300, height: 200 },
          visible: true,
          ready: true,
        },
      ],
      processCounts: { Browser: 1, GPU: 1, Tab: 1, Utility: 2 },
    };
    const parsed = parsePerfLog(
      `[PerfRunTopology:JSON] ${JSON.stringify(marker)}`
    );
    const summary = summarizeCapture(
      capture(conclusiveSamples(), [], 0, [marker]),
      0
    );

    expect(parsed.runtimeTopologies).toEqual([marker]);
    expect(summary.evidence.runtimeTopologyAvailable).toBe(true);
    expect(summary.runtimeTopology?.windows[0]).toMatchObject({
      role: 'widget',
      route: 'http://localhost:5173/#/overlay-widget',
      bounds: { x: 10, y: 20, width: 300, height: 200 },
    });
    expect(summaryMarkdown(summary)).toContain('## Runtime topology');
    expect(summaryMarkdown(summary)).toContain(
      '| widget | http://localhost:5173/#/overlay-widget | 10,20 300x200 | 400 | yes | yes |'
    );
  });

  it('compares normalized window topology and ignores volatile identifiers', () => {
    const makeTopology = (
      id: number,
      rendererPid: number,
      route: string,
      visible: boolean,
      utilityCount: number,
      width = 300
    ) => ({
      timestamp: new Date(1000).toISOString(),
      runId: 'run',
      complete: true,
      timedOut: false,
      topologyChanged: false,
      processMetricsAvailable: true,
      windows: [
        {
          id,
          rendererPid,
          route,
          role: 'display' as const,
          bounds: { x: 10, y: 20, width, height: 200 },
          visible,
          ready: true,
        },
      ],
      processCounts: {
        Browser: 1,
        GPU: 1,
        Tab: 1,
        Utility: utilityCount,
      },
    });
    const baseline = summarizeCapture(
      capture(conclusiveSamples(), [], 0, [
        makeTopology(1, 400, 'http://localhost:5173/#/overlay', true, 2),
      ]),
      0
    );
    const candidate = summarizeCapture(
      capture(conclusiveSamples(), [], 0, [
        makeTopology(98, 990, 'http://localhost:9999/#/overlay', false, 5),
      ]),
      0
    );
    const matching = compareSummaries(baseline, candidate).checks.find(
      ({ name }) => name === 'Runtime window and process topology'
    );
    const changedBounds = summarizeCapture(
      capture(conclusiveSamples(), [], 0, [
        makeTopology(98, 990, 'http://localhost:9999/#/overlay', false, 2, 400),
      ]),
      0
    );
    const mismatch = compareSummaries(baseline, changedBounds).checks.find(
      ({ name }) => name === 'Runtime window and process topology'
    );

    expect(matching?.passed).toBe(true);
    expect(mismatch?.passed).toBe(false);
  });

  it('keeps legacy topology unknown and marks incomplete new evidence', () => {
    const legacy = summarizeCapture(capture(conclusiveSamples()), 0);
    const legacyTopologyCheck = compareSummaries(legacy, legacy).checks.find(
      ({ name }) => name === 'Runtime window and process topology'
    );
    const incomplete = summarizeCapture(
      capture(conclusiveSamples(), [], 0, [
        {
          timestamp: new Date(1000).toISOString(),
          runId: 'run',
          complete: false,
          timedOut: true,
          topologyChanged: false,
          processMetricsAvailable: true,
          windows: [],
          processCounts: { Browser: 1 },
        },
      ]),
      0
    );

    expect(legacy.evidence.conclusive).toBe(true);
    expect(legacy.evidence.runtimeTopologyAvailable).toBe(false);
    expect(legacyTopologyCheck?.passed).toBeNull();
    expect(summaryMarkdown(legacy)).toContain(
      'No runtime topology marker (legacy log or marker not emitted).'
    );
    expect(incomplete.evidence.conclusive).toBe(false);
    expect(incomplete.evidence.inconclusiveReasons).toContain(
      'runtime topology marker is incomplete or ambiguous'
    );
  });

  it('summarizes memory slope and telemetry metrics', () => {
    const summary = summarizeCapture(
      capture([mainSample(0, 100), mainSample(60, 102), mainSample(120, 104)]),
      0
    );

    expect(summary.app.memorySlopeMBPerMinute).toBeCloseTo(2);
    expect(summary.app.privateMemorySlopeMBPerMinute).toBeCloseTo(2);
    expect(summary.iracing.averageFps).toBe(100);
    expect(summary.telemetry.processTelemetryP99MeanMs).toBe(2);
    expect(summary.widgetInputs.standings.inputs['standings.snapshot']).toEqual(
      expect.objectContaining({ observed: true })
    );
  });

  it('weights per-process CPU time and excludes intervals crossing the window', () => {
    const samples = [
      // Starts before the 30-second analysis window and must be excluded.
      {
        ...mainSample(31, 100, 100, 100, 1000),
        processes: [
          {
            pid: 10,
            type: 'Browser',
            cpuPercent: 99,
            memoryMB: 10,
            cpuTimeMs: 500,
            cpuSampleIntervalMs: 5000,
          },
        ],
      },
      {
        ...mainSample(40, 100, 100, 100, 1000),
        processes: [
          {
            pid: 10,
            type: 'Browser',
            cpuPercent: 1,
            memoryMB: 10,
            cpuTimeMs: 20,
            cpuSampleIntervalMs: 4000,
          },
        ],
      },
      {
        ...mainSample(50, 100, 100, 100, 1000),
        processes: [
          {
            pid: 10,
            type: 'Browser',
            cpuPercent: 1,
            memoryMB: 10,
            cpuTimeMs: 120,
            cpuSampleIntervalMs: 10000,
          },
        ],
      },
      // Ends after the analysis window and must be excluded.
      {
        ...mainSample(65, 100, 100, 100, 1000),
        processes: [
          {
            pid: 10,
            type: 'Browser',
            cpuPercent: 1,
            memoryMB: 10,
            cpuTimeMs: 900,
            cpuSampleIntervalMs: 5000,
          },
        ],
      },
    ];
    const summary = summarizeCapture(capture(samples), 0, {
      startSeconds: 30,
      endSeconds: 60,
    });
    const process = summary.processes.find(({ pid }) => pid === 10);

    expect(process).toEqual(
      expect.objectContaining({
        cpuSampleCount: 2,
        sampledCpuTimeMs: 140,
        cpuSampledIntervalMs: 14_000,
        averageCpuTimeMsPerSecond: 10,
      })
    );
    expect(summaryMarkdown(summary)).toContain(
      '| Browser | 33.67% | 2 | 140.000 | 10.000 | 14.00 |'
    );
    expect(comparisonMarkdown(compareSummaries(summary, summary))).toContain(
      '| irDashies app CPU |'
    );
    expect(summaryMarkdown(summary)).toContain('| irDashies app CPU |');
    expect(summaryMarkdown(summary)).toContain(
      '| Browser | 33.67% | 2 | 140.000 | 10.000 | 14.00 |'
    );
  });

  it('excludes warmup/cooldown-only processes and out-of-window PID lifetimes', () => {
    const process = (pid: number, creationTime: number) => ({
      pid,
      creationTime,
      type: 'Tab',
      cpuPercent: 10,
      memoryMB: 123,
      cpuTimeMs: 50,
      cpuSampleIntervalMs: 5000,
    });
    const samples = [
      {
        ...mainSample(10, 100, 100, 100, 5000),
        processes: [process(10, 1), process(20, 1)],
      },
      { ...mainSample(70, 100, 100, 100, 5000), processes: [process(10, 2)] },
      {
        ...mainSample(90, 100, 100, 100, 5000),
        processes: [process(10, 3), process(30, 1)],
      },
    ];
    const summary = summarizeCapture(capture(samples), 60, { endSeconds: 80 });
    expect(summary.processes).toHaveLength(1);
    expect(summary.processes[0]).toMatchObject({
      pid: 10,
      creationTime: 2,
      averageMemoryMB: 123,
      averageCpuPercent: 10,
      sampledCpuTimeMs: 50,
      cpuSampleCount: 1,
    });
  });

  it('keeps a valid zero CPU delta distinct from unsupported legacy data', () => {
    const sample = {
      ...mainSample(40, 100),
      processes: [
        {
          pid: 10,
          type: 'Browser',
          cpuPercent: 0,
          memoryMB: 10,
          cpuTimeMs: 0,
          cpuTimeMsPerSecond: 0,
          cpuSampleIntervalMs: 10_000,
        },
        { pid: 11, type: 'Tab', cpuPercent: 0, memoryMB: 5 },
      ],
    };
    const summary = summarizeCapture(capture([sample]), 0, {
      startSeconds: 30,
    });
    const supported = summary.processes.find(({ pid }) => pid === 10);
    const legacy = summary.processes.find(({ pid }) => pid === 11);

    expect(supported).toEqual(
      expect.objectContaining({
        cpuSampleCount: 1,
        sampledCpuTimeMs: 0,
        cpuSampledIntervalMs: 10_000,
        averageCpuTimeMsPerSecond: 0,
      })
    );
    expect(legacy).toEqual(
      expect.objectContaining({
        cpuSampleCount: 0,
      })
    );
    expect(legacy?.sampledCpuTimeMs).toBeUndefined();
    expect(legacy?.cpuSampledIntervalMs).toBeUndefined();
    expect(legacy?.averageCpuTimeMsPerSecond).toBeUndefined();
    expect(summaryMarkdown(summary)).toContain(
      '| Tab | 0.00% | 0 | n/a | n/a | n/a |'
    );
    const serializedLegacy = JSON.parse(JSON.stringify(legacy)) as Record<
      string,
      unknown
    >;
    expect(serializedLegacy).not.toHaveProperty('sampledCpuTimeMs');
    expect(serializedLegacy).not.toHaveProperty('cpuSampledIntervalMs');
    expect(serializedLegacy).not.toHaveProperty('averageCpuTimeMsPerSecond');
  });

  it('summarizes renderer telemetry callback cost and rate', () => {
    const input = capture([
      mainSample(5, 100, 100, 100, 5000),
      mainSample(10, 100, 100, 100, 5000),
    ]);
    input.renderer = [
      {
        schemaVersion: 1,
        timestamp: new Date(5_000).toISOString(),
        runId: 'run',
        scenario: 'full',
        pid: 1,
        route: '/',
        visibilityState: 'visible',
        intervalMs: 5000,
        frameTimeMs: stats(16),
        telemetryCallbackMs: stats(0.2, { count: 100, p99: 0.7 }),
        trackMapAnimationFrameMs: stats(0.4, { count: 250, p99: 1.1 }),
        trackMapCommitDrawMs: stats(0.3, { count: 50, p99: 0.8 }),
        trackMapRafDrawMs: stats(0.2, { count: 100, p99: 0.6 }),
        framesOver25Ms: 0,
        framesOver50Ms: 0,
      },
    ];
    const summary = summarizeCapture(input, 0);

    expect(summary.renderer.telemetryCallbackRateHz).toBe(20);
    expect(summary.renderer.telemetryCallbackP99MeanMs).toBe(0.7);
    expect(summary.renderer.trackMapAnimationFrameRateHz).toBe(50);
    expect(summary.renderer.trackMapAnimationFrameP99MeanMs).toBe(1.1);
    expect(summary.renderer.trackMapAnimationFrameP99WorstMs).toBe(1.1);
    expect(summary.renderer.trackMapCommitDrawRateHz).toBe(10);
    expect(summary.renderer.trackMapCommitDrawP99MeanMs).toBe(0.8);
    expect(summary.renderer.trackMapRafDrawRateHz).toBe(20);
    expect(summary.renderer.trackMapRafDrawP99MeanMs).toBe(0.6);
    expect(summaryMarkdown(summary)).toContain(
      '| Track-map commit draws / second | 10.00 |'
    );
    expect(summaryMarkdown(summary)).toContain(
      '| Track-map rAF-draw p99, mean / worst interval | 0.600 / 0.600 ms |'
    );

    const candidate = {
      ...summary,
      renderer: {
        ...summary.renderer,
        trackMapAnimationFrameRateHz: 60,
        trackMapAnimationFrameP99MeanMs: 1.6,
        trackMapCommitDrawRateHz: 15,
        trackMapCommitDrawP99MeanMs: 0.5,
        trackMapCommitDrawP99WorstMs: 1.2,
        trackMapRafDrawRateHz: 30,
        trackMapRafDrawP99MeanMs: 0.4,
        trackMapRafDrawP99WorstMs: 0.9,
      },
    };
    const comparison = compareSummaries(summary, candidate);
    expect(comparison.delta.trackMapAnimationFrameRateHz).toBe(10);
    expect(comparison.delta.trackMapAnimationFrameP99Ms).toBeCloseTo(0.5);
    expect(comparison.delta.trackMapCommitDrawRateHz).toBe(5);
    expect(comparison.delta.trackMapCommitDrawP99Ms).toBeCloseTo(-0.3);
    expect(comparison.delta.trackMapCommitDrawP99WorstMs).toBeCloseTo(0.4);
    expect(comparison.delta.trackMapRafDrawRateHz).toBe(10);
    expect(comparison.delta.trackMapRafDrawP99Ms).toBeCloseTo(-0.2);
    expect(comparison.delta.trackMapRafDrawP99WorstMs).toBeCloseTo(0.3);
    expect(comparisonMarkdown(comparison)).toContain(
      '| Track-map animation-frame p99 mean | 0.500 ms |'
    );
    expect(comparisonMarkdown(comparison)).toContain(
      '| Track-map commit draws / second | 5.00 Hz |'
    );
  });

  it('keeps new Track Map breakdowns unavailable for old logs', () => {
    const input = capture([mainSample(5, 100, 100, 100, 5000)]);
    const oldRendererSample: RendererPerfSample = {
      schemaVersion: 1,
      timestamp: new Date(5000).toISOString(),
      runId: 'run',
      scenario: 'full',
      pid: 1,
      route: '/',
      visibilityState: 'visible',
      intervalMs: 5000,
      frameTimeMs: stats(16),
      trackMapAnimationFrameMs: stats(0.4, { count: 250, p99: 1.1 }),
      framesOver25Ms: 0,
      framesOver50Ms: 0,
    };
    input.renderer = [oldRendererSample];
    const oldLogSummary = summarizeCapture(input, 0);
    expect(oldLogSummary.renderer.trackMapCommitDrawRateHz).toBeNull();
    expect(oldLogSummary.renderer.trackMapRafDrawRateHz).toBeNull();
    expect(summaryMarkdown(oldLogSummary)).toContain(
      '| Track-map commit draws / second | n/a |'
    );

    const idleInput = capture([mainSample(5, 100, 100, 100, 5000)]);
    idleInput.renderer = [
      {
        ...oldRendererSample,
        trackMapCommitDrawMs: stats(0, { count: 0, p99: 0 }),
        trackMapRafDrawMs: stats(0, { count: 0, p99: 0 }),
      },
    ];
    const idleSummary = summarizeCapture(idleInput, 0);
    expect(idleSummary.renderer.trackMapCommitDrawRateHz).toBe(0);
    expect(idleSummary.renderer.trackMapRafDrawP99MeanMs).toBe(0);

    const candidate = {
      ...oldLogSummary,
      renderer: {
        ...oldLogSummary.renderer,
        trackMapCommitDrawRateHz: 10,
        trackMapCommitDrawP99MeanMs: 0.8,
        trackMapCommitDrawP99WorstMs: 0.8,
        trackMapRafDrawRateHz: 40,
        trackMapRafDrawP99MeanMs: 0.5,
        trackMapRafDrawP99WorstMs: 0.5,
      },
    };
    const comparison = compareSummaries(oldLogSummary, candidate);
    expect(comparison.delta.trackMapCommitDrawRateHz).toBeNull();
    expect(comparison.delta.trackMapRafDrawP99Ms).toBeNull();
    expect(comparisonMarkdown(comparison)).toContain(
      '| Track-map commit draws / second | n/a Hz |'
    );
  });

  it('keeps reused PIDs in separate process lifetime groups', () => {
    const samples = [
      {
        ...mainSample(40, 100),
        processes: [
          {
            pid: 42,
            creationTime: 1001,
            type: 'Browser',
            name: 'Old lifetime',
            cpuPercent: 4,
            memoryMB: 10,
            cpuTimeMs: 40,
            cpuSampleIntervalMs: 10_000,
          },
        ],
      },
      {
        ...mainSample(50, 100),
        processes: [
          {
            pid: 42,
            creationTime: 2002,
            type: 'Tab',
            name: 'New lifetime',
            cpuPercent: 6,
            memoryMB: 20,
            cpuTimeMs: 90,
            cpuSampleIntervalMs: 10_000,
          },
        ],
      },
    ];
    const summary = summarizeCapture(capture(samples), 0, {
      startSeconds: 30,
    });

    expect(summary.processes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pid: 42,
          creationTime: 1001,
          name: 'Old lifetime',
          sampledCpuTimeMs: 40,
          cpuSampleCount: 1,
        }),
        expect.objectContaining({
          pid: 42,
          creationTime: 2002,
          name: 'New lifetime',
          sampledCpuTimeMs: 90,
          cpuSampleCount: 1,
        }),
      ])
    );
    expect(summary.processes).toHaveLength(2);
  });

  it('reports Input and Radar measures without diluting them with unrelated windows', () => {
    const input = capture([mainSample(5, 100, 100, 100, 5000)]);
    const base: RendererPerfSample = {
      schemaVersion: 1,
      timestamp: new Date(5000).toISOString(),
      runId: 'run',
      scenario: 'full',
      pid: 1,
      route: '/',
      visibilityState: 'visible',
      intervalMs: 5000,
      frameTimeMs: stats(16),
      framesOver25Ms: 0,
      framesOver50Ms: 0,
    };
    input.renderer = [
      {
        ...base,
        inputTraceFrameMs: stats(0.5, { count: 300, p99: 1 }),
        radarFrameMs: stats(0.4, { count: 300, p99: 0.8 }),
      },
      { ...base, pid: 2 },
    ];
    const summary = summarizeCapture(input, 0);
    expect(summary.renderer.inputTraceFrameRateHz).toBe(60);
    expect(summary.renderer.radarFrameRateHz).toBe(60);
    expect(summary.renderer.inputTraceFrameP99WorstMs).toBe(1);
    expect(summary.renderer.radarFrameP99MeanMs).toBe(0.8);
    expect(summaryMarkdown(summary)).toContain(
      '| Radar frames / second | 60.00 |'
    );
    const candidate = {
      ...summary,
      renderer: {
        ...summary.renderer,
        radarFrameRateHz: 30,
        radarFrameP99MeanMs: 0.5,
        inputTraceFrameP99MeanMs: 0.7,
      },
    };
    const comparison = compareSummaries(summary, candidate);
    expect(comparison.delta.radarFrameRateHz).toBe(-30);
    expect(comparison.delta.radarFrameP99Ms).toBeCloseTo(-0.3);
    expect(comparison.delta.inputTraceFrameP99Ms).toBeCloseTo(-0.3);
    expect(comparisonMarkdown(comparison)).toContain(
      '| Radar frames / second | -30.00 Hz |'
    );
  });

  it('summarizes the Lap Trace frame and brake-cue measures', () => {
    const input = capture([
      mainSample(5, 100, 100, 100, 5000),
      mainSample(10, 100, 100, 100, 5000),
    ]);
    const rendererSample = (
      intervalMs: number,
      lapTrace?: { frame: number; cue: number; p99: number }
    ): RendererPerfSample => ({
      schemaVersion: 1,
      timestamp: new Date(5_000).toISOString(),
      runId: 'run',
      scenario: 'full',
      pid: 1,
      route: '/',
      visibilityState: 'visible',
      intervalMs,
      frameTimeMs: stats(16),
      lapTraceFrameMs: lapTrace
        ? stats(0.3, { count: lapTrace.frame, p99: lapTrace.p99 })
        : undefined,
      lapTraceBrakeCueMs: lapTrace
        ? stats(0.05, { count: lapTrace.cue, p99: lapTrace.p99 / 10 })
        : undefined,
      framesOver25Ms: 0,
      framesOver50Ms: 0,
    });
    input.renderer = [
      // The Lap Trace window, measured at a 144 Hz display's rate.
      rendererSample(5000, { frame: 720, cue: 720, p99: 2 }),
      // Another overlay window, which never runs the widget: it must not
      // dilute the rate.
      rendererSample(5000),
    ];
    const summary = summarizeCapture(input, 0);

    expect(summary.renderer.lapTraceFrameRateHz).toBe(144);
    expect(summary.renderer.lapTraceFrameP99MeanMs).toBe(2);
    expect(summary.renderer.lapTraceBrakeCueRateHz).toBe(144);
    expect(summary.renderer.lapTraceBrakeCueP99WorstMs).toBeCloseTo(0.2);
    expect(summaryMarkdown(summary)).toContain(
      '| Lap Trace plot frames / second | 144.00 |'
    );

    const candidate = {
      ...summary,
      renderer: {
        ...summary.renderer,
        lapTraceFrameRateHz: 60,
        lapTraceFrameP99MeanMs: 1.5,
        lapTraceBrakeCueRateHz: 25,
      },
    };
    const comparison = compareSummaries(summary, candidate);
    expect(comparison.delta.lapTraceFrameRateHz).toBe(-84);
    expect(comparison.delta.lapTraceFrameP99Ms).toBeCloseTo(-0.5);
    expect(comparison.delta.lapTraceBrakeCueRateHz).toBe(-119);
    expect(comparisonMarkdown(comparison)).toContain(
      '| Lap Trace brake-cue steps / second | -119.00 Hz |'
    );

    // The Lap Trace window idle for an interval -- reported, at a count of 0
    // -- is still its time: the rate halves, unlike for the other window,
    // which reports nothing at all.
    input.renderer.push(rendererSample(5000, { frame: 0, cue: 0, p99: 0 }));
    expect(summarizeCapture(input, 0).renderer.lapTraceFrameRateHz).toBe(72);
  });

  it('flags a material iRacing FPS regression with conclusive evidence', () => {
    const baseline = summarizeCapture(capture(conclusiveSamples(100)), 0);
    const candidate = summarizeCapture(capture(conclusiveSamples(90)), 0);

    const comparison = compareSummaries(baseline, candidate);
    expect(comparison.delta.averageFpsPercent).toBe(-10);
    expect(
      comparison.checks.find(
        ({ name }) => name === 'iRacing average FPS regression'
      )?.passed
    ).toBe(false);
  });

  it('anchors fixed windows to the explicit origin and includes overlapping intervals', () => {
    const summary = summarizeCapture(
      capture(
        [
          mainSample(100, 50, 100, 50, 10_000),
          mainSample(105, 100, 100, 100, 10_000),
          mainSample(115, 102, 100, 102, 10_000),
        ],
        [],
        100
      ),
      0,
      { startSeconds: 0, endSeconds: 12 }
    );

    expect(summary.sampleCount).toBe(2);
    expect(summary.durationMinutes).toBeCloseTo(0.2);
    expect(summary.analysisWindow).toEqual({
      startSeconds: 0,
      endSeconds: 12,
    });
  });

  it('uses private memory as the conclusive memory gate', () => {
    const samples = Array.from({ length: 6 }, (_, index) =>
      mainSample(index * 60, 100 + index * 100, 100, 200 + index * 2)
    );
    const summary = summarizeCapture(capture(samples), 0);
    const comparison = compareSummaries(summary, summary);
    const memoryCheck = comparison.checks.find((check) =>
      check.name.includes('private-memory')
    );

    expect(summary.evidence.conclusive).toBe(true);
    expect(summary.app.memorySlopeMBPerMinute).toBeCloseTo(100);
    expect(summary.app.privateMemorySlopeMBPerMinute).toBeCloseTo(2);
    expect(memoryCheck?.passed).toBe(true);
  });

  it('marks all checks inconclusive when private bytes are missing', () => {
    const samples = conclusiveSamples().map((sample) => ({
      ...sample,
      totalAppPrivateMemoryMB: undefined,
    }));
    const summary = summarizeCapture(capture(samples), 0);
    const comparison = compareSummaries(summary, summary);

    expect(summary.evidence.privateMemoryAvailable).toBe(false);
    expect(summary.evidence.conclusive).toBe(false);
    expect(comparison.checks.every((check) => check.passed === null)).toBe(
      true
    );
  });

  it('requires publication rather than processor execution for visible coverage', () => {
    const samples = conclusiveSamples().map((sample) => ({
      ...sample,
      channelMetrics: {
        ...sample.channelMetrics,
        publications: { 'standings.snapshot': 0 },
      },
    }));
    const summary = summarizeCapture(capture(samples), 0);

    expect(summary.widgetInputs.standings.covered).toBe(false);
    expect(summary.evidence.inputCoverageComplete).toBe(false);
    expect(summary.phaseEvidence[0].reasons).toContain(
      'one or more active widget inputs did not publish'
    );
  });

  it('accepts visible changes and zero hidden execution/delivery per phase', () => {
    const visibility = [
      {
        timestamp: new Date(0).toISOString(),
        runId: 'run',
        index: 0,
        visibility: 'visible' as const,
        durationSeconds: 300,
      },
      {
        timestamp: new Date(300_000).toISOString(),
        runId: 'run',
        index: 1,
        visibility: 'hidden' as const,
        durationSeconds: 300,
      },
    ];
    const samples = Array.from({ length: 10 }, (_, index) => {
      const seconds = (index + 1) * 60;
      const sample = mainSample(seconds, 100 + index, 100, 200 + index, 60_000);
      return seconds <= 300
        ? sample
        : {
            ...sample,
            channelMetrics: {
              processorExecutions: { 'standings.snapshot': 0 },
              publications: { 'standings.snapshot': 0 },
              deliveries: { 'standings.snapshot': 0 },
            },
          };
    });
    const summary = summarizeCapture(capture(samples, visibility), 0);

    expect(summary.phaseEvidence).toEqual([
      expect.objectContaining({ expectedBehaviorSatisfied: true }),
      expect.objectContaining({ expectedBehaviorSatisfied: true }),
    ]);
    expect(summary.evidence.inputCoverageComplete).toBe(true);
    expect(summary.evidence.conclusive).toBe(true);
  });

  it('rejects processor activity during a hidden phase', () => {
    const samples = conclusiveSamples().map((sample) => ({
      ...sample,
      channelMetrics: {
        processorExecutions: { 'standings.snapshot': 1 },
        publications: { 'standings.snapshot': 0 },
        deliveries: { 'standings.snapshot': 0 },
      },
    }));
    const visibility = [
      {
        timestamp: new Date(0).toISOString(),
        runId: 'run',
        index: 0,
        visibility: 'hidden' as const,
        durationSeconds: 301,
      },
    ];
    const summary = summarizeCapture(capture(samples, visibility), 0);

    expect(summary.phaseEvidence[0].expectedBehaviorSatisfied).toBe(false);
    expect(summary.phaseEvidence[0].reasons).toContain(
      'hidden phase executed demand-driven processors'
    );
  });

  it('rejects inconsistent scenario metadata', () => {
    const samples = conclusiveSamples();
    samples[1] = {
      ...samples[1],
      scenarioMetadata: {
        ...samples[1].scenarioMetadata,
        activeWidgetTypes: [],
      },
    };
    const summary = summarizeCapture(capture(samples), 0);

    expect(summary.evidence.scenarioMetadataConsistent).toBe(false);
    expect(summary.evidence.conclusive).toBe(false);
  });

  it('rejects one private observation and excessive sample gaps', () => {
    const oneSample = summarizeCapture(
      capture([mainSample(300, 100, 100, 100, 300_000)]),
      0
    );
    const sparse = summarizeCapture(
      capture([
        mainSample(60, 100, 100, 100, 60_000),
        mainSample(360, 102, 100, 102, 300_000),
      ]),
      0
    );

    expect(oneSample.evidence.privateMemorySampleCount).toBe(1);
    expect(oneSample.evidence.privateMemorySamplingAdequate).toBe(false);
    expect(oneSample.app.privateMemorySlopeMBPerMinute).toBeNaN();
    expect(sparse.evidence.privateMemoryMaxGapSeconds).toBe(300);
    expect(sparse.evidence.privateMemorySamplingAdequate).toBe(false);
  });

  it('requires conclusive evidence by default in the CLI', () => {
    expect(parseCliArgs(['candidate.log']).requireConclusive).toBe(true);
    expect(
      parseCliArgs(['candidate.log', '--allow-inconclusive']).requireConclusive
    ).toBe(false);
  });

  it('accepts value flags before the candidate path', () => {
    const options = parseCliArgs([
      '--analysis-start-seconds',
      '60',
      '--warmup-seconds',
      '10',
      'candidate.log',
      '--baseline',
      'baseline.log',
    ]);

    expect(options.candidatePath).toBe(path.resolve('candidate.log'));
    expect(options.baselinePath).toBe(path.resolve('baseline.log'));
    expect(options.warmupSeconds).toBe(10);
    expect(options.analysisWindow.startSeconds).toBe(60);
  });

  it('treats missing nested channel metrics as zero', () => {
    const sample = mainSample(0, 100);
    sample.channelMetrics = {
      processorExecutions: { 'standings.snapshot': 100 },
      publications: undefined,
      deliveries: { 'standings.snapshot': 20 },
    } as never;

    const summary = summarizeCapture(capture([sample]), 0);

    expect(summary.channels['standings.snapshot']).toMatchObject({
      processorExecutions: 100,
      publications: 0,
      deliveries: 20,
    });
    expect(summary.evidence.inputCoverageAvailable).toBe(false);
    expect(summary.evidence.conclusive).toBe(false);
    expect(summary.phaseEvidence[0].reasons).toContain(
      'phase channel metrics are incomplete'
    );
  });

  it('rejects non-numeric channel metric values', () => {
    const sample = mainSample(0, 100);
    sample.channelMetrics = {
      processorExecutions: { 'standings.snapshot': 100 },
      publications: { 'standings.snapshot': '20' },
      deliveries: { 'standings.snapshot': Number.NaN },
    } as never;

    const summary = summarizeCapture(capture([sample]), 0);

    expect(summary.channels['standings.snapshot']).toMatchObject({
      processorExecutions: 100,
      publications: 0,
      deliveries: 0,
    });
    expect(summary.evidence.inputCoverageAvailable).toBe(false);
    expect(summary.evidence.conclusive).toBe(false);
    expect(summary.phaseEvidence[0].reasons).toContain(
      'phase channel metrics are incomplete'
    );
  });
});
