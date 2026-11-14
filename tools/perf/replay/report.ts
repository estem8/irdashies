import type { TapeReplayStatus } from '../../../src/types/tapeReplay.ts';
import { parsePerfLog } from '../analyze.ts';
import type { ReplayInputInfo } from './ibt.ts';

export interface ResourceSnapshot {
  pid: number;
  creationTime: number;
  type: string;
  cumulativeCPUUsage: number;
  memoryMiB: number;
}

export function createReplayReport(options: {
  input: ReplayInputInfo;
  requestedSpeed: number | 'max';
  elapsedSeconds: number;
  before: TapeReplayStatus;
  after: TapeReplayStatus;
  resourcesBefore: ResourceSnapshot[];
  resourcesAfter: ResourceSnapshot[];
  log: string;
  selectedWidgets: string[];
  mountedWidgets: string[];
  finished: boolean;
}) {
  const capture = parsePerfLog(options.log);
  const delta = (field: 'framesConsumed' | 'framesDelivered') => {
    const a = options.before[field],
      b = options.after[field];
    return typeof a === 'number' && typeof b === 'number' && b >= a
      ? b - a
      : null;
  };
  const consumed = delta('framesConsumed');
  const delivered = delta('framesDelivered');
  const processingSections: Record<
    string,
    { count: number; totalWallMs: number; maxWallMs: number }
  > = {};
  const processorExecutions: Record<string, number> = {};
  for (const sample of capture.main) {
    for (const [name, stats] of Object.entries(sample.sections ?? {})) {
      if (!stats.count) continue;
      const total = (processingSections[name] ??= {
        count: 0,
        totalWallMs: 0,
        maxWallMs: 0,
      });
      total.count += stats.count;
      total.totalWallMs += stats.avgMs * stats.count;
      total.maxWallMs = Math.max(total.maxWallMs, stats.maxMs);
    }
    for (const [name, count] of Object.entries(
      sample.channelMetrics?.processorExecutions ?? {}
    ))
      processorExecutions[name] = (processorExecutions[name] ?? 0) + count;
  }
  const channelCounts: Record<
    string,
    { publications: number; deliveries: number }
  > = {};
  for (const sample of capture.main) {
    for (const field of ['publications', 'deliveries'] as const) {
      for (const [name, value] of Object.entries(
        sample.channelMetrics?.[field] ?? {}
      )) {
        const count = (channelCounts[name] ??= {
          publications: 0,
          deliveries: 0,
        });
        count[field] += value;
      }
    }
  }
  const drawings: Record<string, number> = {};
  const observed = new Set(options.mountedWidgets);
  for (const sample of capture.renderer) {
    for (const id of sample.widgetDomIds ?? []) observed.add(id);
    for (const [name, value] of Object.entries(sample)) {
      if (
        [
          'trackMapAnimationFrameMs',
          'radarFrameMs',
          'inputTraceFrameMs',
          'lapTraceFrameMs',
        ].includes(name) &&
        typeof value === 'object' &&
        value !== null &&
        'count' in value &&
        typeof value.count === 'number'
      ) {
        drawings[name] = (drawings[name] ?? 0) + value.count;
      }
    }
  }
  const resources = options.resourcesAfter.map((process) => {
    const before = options.resourcesBefore.find(
      (p) => p.pid === process.pid && p.creationTime === process.creationTime
    );
    const cpuMs =
      before && process.cumulativeCPUUsage >= before.cumulativeCPUUsage
        ? (process.cumulativeCPUUsage - before.cumulativeCPUUsage) * 1000
        : null;
    return {
      pid: process.pid,
      creationTime: process.creationTime,
      type: process.type,
      cpuMs,
      cpuMsPerSecond:
        cpuMs === null || options.elapsedSeconds <= 0
          ? null
          : cpuMs / options.elapsedSeconds,
      endWorkingSetMiB: process.memoryMiB,
    };
  });
  const completeResources =
    options.resourcesBefore.length > 0 &&
    options.resourcesBefore.length === resources.length &&
    options.resourcesBefore.every((p) =>
      resources.some(
        (q) => q.pid === p.pid && q.creationTime === p.creationTime
      )
    ) &&
    resources.every((p) => p.cpuMsPerSecond !== null);
  return {
    schemaVersion: 1,
    finished: options.finished,
    mode: options.requestedSpeed === 1 ? 'realtime' : 'stress',
    requestedSpeed: options.requestedSpeed,
    input: options.input,
    playback: {
      elapsedSeconds: options.elapsedSeconds,
      initialSeedFrames: options.before.framesDelivered ?? null,
      sourceFramesConsumed: consumed,
      sdkFramesReturned: delivered,
      sourceFramesSuperseded:
        consumed === null || delivered === null
          ? null
          : Math.max(0, consumed - delivered),
      sdkFramesPerSecond:
        delivered === null || options.elapsedSeconds <= 0
          ? null
          : delivered / options.elapsedSeconds,
      sourceFinished: options.after.ended,
      sourceFailed: options.after.failed ?? null,
    },
    resources: {
      completeProcessCoverage: completeResources,
      processes: resources,
      totalCpuMsPerSecond: completeResources
        ? resources.reduce((sum, p) => sum + (p.cpuMsPerSecond ?? 0), 0)
        : null,
    },
    observations: {
      scope:
        'Periodic reports over startup, paused warmup, playback and drain; not exact playback-only counters.',
      mainIntervals: capture.main.length,
      rendererIntervals: capture.renderer.length,
      mainTicks: capture.main.reduce(
        (n, s) =>
          n +
          ('tickCount' in s && typeof s.tickCount === 'number'
            ? s.tickCount
            : 0),
        0
      ),
      processingSections,
      processorExecutions,
      channelCounts,
      drawCalls: Object.keys(drawings).length ? drawings : null,
    },
    widgets: options.selectedWidgets.map((id) => ({
      id,
      wrapperObserved: observed.has(id),
      coverage: observed.has(id)
        ? 'wrapper observed; rendering/activity not proven'
        : 'not observed',
    })),
    limitations: [
      'A single run is descriptive, not proof of a performance improvement or game FPS.',
      'Frame-by-frame playback preserves source frames at the SDK boundary, not one UI draw per source frame.',
      'Snapshot delivery is rate-limited/coalesced; publication and delivery counts are not interchangeable frame counts.',
      'Mounted widgets can remain idle when required telemetry/events or external services are absent.',
      'CPU includes control RPCs; short runs have monitoring/quantization overhead. No GPU engine utilization is measured.',
      ...(options.requestedSpeed !== 1
        ? [
            'Accelerated playback measures stress/throughput, not real-time smoothness or long-duration memory growth.',
          ]
        : []),
    ],
  };
}

export function replayReportMarkdown(
  report: ReturnType<typeof createReplayReport>
): string {
  return [
    '# Overlay replay report',
    '',
    `Completed: ${report.finished}. Mode: ${report.mode}. Requested speed: ${report.requestedSpeed}.`,
    '',
    `Input: ${report.input.format}, ${report.input.frames} frames, ${report.input.durationSeconds.toFixed(3)} source seconds.`,
    `Playback observed wall time: ${report.playback.elapsedSeconds.toFixed(3)} seconds.`,
    `Source frames consumed: ${report.playback.sourceFramesConsumed ?? 'unavailable'}. SDK frames returned: ${report.playback.sdkFramesReturned ?? 'unavailable'}.`,
    `Source frames superseded before SDK return: ${report.playback.sourceFramesSuperseded ?? 'unavailable'}.`,
    `Total application CPU: ${report.resources.totalCpuMsPerSecond?.toFixed(2) ?? 'unavailable'} ms/s.`,
    '',
    '## Widget coverage',
    '',
    '| Widget | Observation |',
    '| --- | --- |',
    ...report.widgets.map((w) => `| ${w.id} | ${w.coverage} |`),
    '',
    '## Report scope and limitations',
    '',
    report.observations.scope,
    '',
    ...[...report.input.warnings, ...report.limitations].map((s) => `- ${s}`),
    '',
    'See report.json for per-channel observations, draw calls and per-process resources.',
    '',
  ].join('\n');
}
