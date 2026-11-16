import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PerfReport } from '../perfMetrics';
import {
  IbtInspectorService,
  validateIbtName,
  type MemoryDiagnosticDependencies,
} from './service';
const metrics = vi.hoisted(() => ({
  listener: undefined as ((report: PerfReport) => void) | undefined,
}));
vi.mock('../perfMetrics', () => ({
  onPerfReport: (listener: (report: PerfReport) => void) => {
    metrics.listener = listener;
    return () => {
      metrics.listener = undefined;
    };
  },
}));
vi.mock('./importIbt', () => ({
  importIbt: vi.fn(async (_source: string, target: string) =>
    writeFile(target, 'normalized')
  ),
  inspectLiveTape: vi.fn(),
}));
let directory: string,
  deps: MemoryDiagnosticDependencies,
  service: IbtInspectorService;
const report = {
  sections: {},
  processes: [],
  tickRateHz: 1000,
} as unknown as PerfReport;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'memory-service-'));
  await mkdir(path.join(directory, 'library'));
  await writeFile(path.join(directory, 'library/race.ibt'), 'original');
  deps = {
    directory: path.join(directory, 'library'),
    workDirectory: path.join(directory, 'work'),
    switchSource: vi.fn(async () => undefined),
    getPlayback: () => ({
      position: 0,
      duration: 100,
      speed: 1,
      paused: true,
      ended: false,
      framesRemaining: 0,
      framesConsumed: 1,
      framesDelivered: 1,
    }),
    command: vi.fn(),
    collectMainGarbage: vi.fn(async () => undefined),
    getProcessMemorySnapshot: vi.fn(async () => [
      {
        key: '20:100',
        pid: 20,
        type: 'Tab',
        cpuPercent: null,
        cpuTimeMsPerSecond: null,
        memoryMB: 40,
        privateMemoryMB: 20,
      },
    ]),
    rendererHeapSampler: {
      start: () => ({ attachedTargets: 1, skippedTargets: 0 }),
      sample: vi.fn(async () => []),
      collectGarbageAndSample: vi.fn(async () => [
        {
          key: '20:2',
          pid: 20,
          route: 'overlay',
          usedHeapMB: 3,
          totalHeapMB: 4,
        },
      ]),
      stop: vi.fn(),
    },
  };
  service = new IbtInspectorService(deps);
});
afterEach(async () => {
  await service.stop();
  await rm(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});
it.each(['../race.ibt', '/race.ibt', 'a\\race.ibt', 'a\0.ibt', 'race.txt'])(
  'rejects unsafe recording %s',
  (name) => expect(() => validateIbtName(name)).toThrow()
);
it('restores the source and releases normalized data while preserving the input', async () => {
  await service.load('race.ibt', 'max');
  await service.stop();
  expect(deps.switchSource).toHaveBeenLastCalledWith(null);
  expect(await readFile(path.join(deps.directory, 'race.ibt'), 'utf8')).toBe(
    'original'
  );
  expect(await readdir(deps.workDirectory)).toEqual([]);
});
it('removes temporary data when source initialization fails', async () => {
  vi.mocked(deps.switchSource).mockRejectedValueOnce(
    new Error('native failure')
  );
  await expect(service.load('race.ibt', 'max')).rejects.toThrow(
    'native failure'
  );
  expect(deps.switchSource).toHaveBeenLastCalledWith(null);
  expect(await readdir(deps.workDirectory)).toEqual([]);
});
it('collects all heaps and fresh private memory only on an idle replay', async () => {
  await service.load('race.ibt', 'max');
  await service.startCapture();
  metrics.listener?.(report);
  await service.checkpointMemory();
  expect(deps.collectMainGarbage).toHaveBeenCalledTimes(2);
  expect(service.status().capture.memoryCheckpoints[0]).toMatchObject({
    scope: 'application',
    appPrivateMemoryMB: 20,
  });
  deps.getPlayback = () => ({
    position: 0,
    duration: 100,
    speed: 1,
    paused: false,
    ended: false,
    framesRemaining: 1,
  });
  await expect(service.checkpointMemory()).rejects.toThrow('idle paused');
  expect(service.status().capture.memoryCheckpoints).toHaveLength(1);
});
it('keeps only one live sample and streams full reports to disk', async () => {
  await service.load('race.ibt', 'max');
  await service.startCapture();
  for (let i = 0; i < 4; i++) {
    metrics.listener?.(report);
    await vi.waitFor(() =>
      expect(service.status().capture.samples).toBe(i + 1)
    );
  }
  expect(service.status().capture.telemetry).toHaveLength(1);
  await service.stopCapture();
  const reportPath = service.status().capture.reportPath;
  if (!reportPath) throw new Error('Missing capture');
  expect(
    (
      await readFile(
        path.join(path.dirname(reportPath), 'samples.ndjson'),
        'utf8'
      )
    )
      .trim()
      .split('\n')
  ).toHaveLength(4);
});
it('bounds queued reports when a renderer is stalled', async () => {
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  deps.rendererHeapSampler.sample = vi.fn(async () => {
    await blocked;
    return [];
  });
  await service.load('race.ibt', 'max');
  await service.startCapture();
  try {
    for (let i = 0; i < 1000; i++) metrics.listener?.(report);
    expect(metrics.listener).toBeUndefined();
    expect(service.status().capture.error).toContain('cannot keep up');
  } finally {
    release();
    await service.stopCapture();
  }
  expect(service.status().capture.samples).toBe(8);
});
it('rejects a checkpoint that missed a renderer', async () => {
  deps.rendererHeapSampler.collectGarbageAndSample = async () => [];
  await service.load('race.ibt', 'max');
  await service.startCapture();
  await expect(service.checkpointMemory()).rejects.toThrow('Every renderer');
});
