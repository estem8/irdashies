import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { PerfReport } from '../perfMetrics';
import { importIbt } from './importIbt';
import { IbtInspectorService, validateIbtName } from './service';
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
  importIbt: vi.fn(async (_input: string, output: string) => {
    await writeFile(output, 'normalized');
    return { warnings: ['IBT snapshot'], frames: 10 };
  }),
}));
let directory: string;
let deps: ConstructorParameters<typeof IbtInspectorService>[0];
let service: IbtInspectorService;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'ibt-inspector-'));
  await mkdir(path.join(directory, 'telemetry'));
  deps = {
    directory: path.join(directory, 'telemetry'),
    workDirectory: path.join(directory, 'work'),
    enabled: () => true,
    switchSource: vi.fn(async () => undefined),
    getPlayback: () => ({
      position: 0,
      duration: 10,
      speed: 1,
      paused: true,
      ended: false,
      framesConsumed: 1,
      framesDelivered: 1,
    }),
    command: vi.fn(),
  };
  service = new IbtInspectorService(deps);
  await writeFile(path.join(deps.directory, 'race.ibt'), 'original');
});
afterEach(async () => {
  await service.stop();
  await rm(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});
it.each([
  '../race.ibt',
  'C:\\race.ibt',
  '/race.ibt',
  'race.irdt',
  'race.ibt/other',
  'a\0.ibt',
])('rejects unsafe file name %s', (name) =>
  expect(() => validateIbtName(name)).toThrow()
);
it('lists only local IBT files and treats a missing directory as empty', async () => {
  await writeFile(path.join(deps.directory, 'notes.txt'), 'text');
  await symlink(
    path.join(deps.directory, 'race.ibt'),
    path.join(deps.directory, 'link.ibt')
  );
  expect((await service.list()).files.map((file) => file.name)).toEqual([
    'race.ibt',
  ]);
  deps.directory = path.join(directory, 'missing');
  expect((await service.list()).files).toEqual([]);
});
it('rejects disabled tools and paths escaping through symlinks', async () => {
  deps.enabled = () => false;
  await expect(service.load('race.ibt', 1)).rejects.toThrow('Enable Dev Tool');
  deps.enabled = () => true;
  await writeFile(path.join(directory, 'outside.ibt'), 'secret');
  await symlink(
    path.join(directory, 'outside.ibt'),
    path.join(deps.directory, 'escape.ibt')
  );
  await expect(service.load('escape.ibt', 1)).rejects.toThrow('inside');
  expect(deps.switchSource).not.toHaveBeenCalled();
});
it('serializes source replacement and stop, preserving the original recording', async () => {
  await Promise.all([service.load('race.ibt', 4), service.stop()]);
  expect(
    vi
      .mocked(deps.switchSource)
      .mock.calls.map((args) => (args[0] === null ? 'live' : 'tape'))
  ).toEqual(['tape', 'live']);
  expect(service.status().file).toBeNull();
  expect(await readFile(path.join(deps.directory, 'race.ibt'), 'utf8')).toBe(
    'original'
  );
  expect(await readdir(deps.workDirectory)).toEqual([]);
});
it('restores source and removes temporary data after source initialization fails', async () => {
  vi.mocked(deps.switchSource).mockRejectedValueOnce(
    new Error('native failure')
  );
  await expect(service.load('race.ibt', 'max')).rejects.toThrow(
    'native failure'
  );
  expect(deps.switchSource).toHaveBeenLastCalledWith(null);
  expect(await readdir(deps.workDirectory)).toEqual([]);
});
it('captures bounded periodic data and prevents seek during capture', async () => {
  await service.load('race.ibt', 1);
  await service.startCapture();
  await expect(service.command({ type: 'seek', seconds: 0 })).rejects.toThrow(
    'Stop capture'
  );
  metrics.listener?.({
    sections: { sdkWait: { count: 2, avgMs: 3, maxMs: 4 } },
    processes: [{ cpuTimeMsPerSecond: 10 }],
    totalAppMemoryMB: 100,
  } as unknown as PerfReport);
  await service.stopCapture();
  const status = service.status();
  expect(status.capture).toMatchObject({
    active: false,
    samples: 1,
    error: null,
  });
  const report = JSON.parse(
    await readFile(status.capture.reportPath ?? '', 'utf8')
  );
  expect(report.sections.sdkWait).toEqual({
    count: 2,
    totalWallMs: 6,
    maxWallMs: 4,
  });
  expect(report.averageCpuMsPerSecond).toBe(10);
  expect(metrics.listener).toBeUndefined();
  await service.command({ type: 'seek', seconds: 0 });
  expect(deps.command).toHaveBeenCalled();
});
it('keeps unavailable CPU measurements unknown', async () => {
  await service.load('race.ibt', 1);
  await service.startCapture();
  await service.stopCapture();
  const report = JSON.parse(
    await readFile(service.status().capture.reportPath ?? '', 'utf8')
  );
  expect(report.averageCpuMsPerSecond).toBeNull();
  expect(report.samples).toBe(0);
});

it('keeps an existing replay when a replacement recording fails validation', async () => {
  await service.load('race.ibt', 1);
  vi.mocked(importIbt).mockRejectedValueOnce(new Error('Truncated IBT'));
  await expect(service.load('race.ibt', 4)).rejects.toThrow('Truncated IBT');
  expect(service.status().file).toBe('race.ibt');
  expect(deps.switchSource).toHaveBeenCalledTimes(1);
});
it('retains at most ten completed captures', async () => {
  await service.load('race.ibt', 1);
  for (let i = 0; i < 12; i++) {
    await service.startCapture();
    await service.stopCapture();
  }
  expect((await readdir(path.join(deps.workDirectory, 'runs'))).length).toBe(
    10
  );
});

it('rejects native startup failure with its reason and restores the prior source', async () => {
  deps.getPlayback = () => ({
    position: 0,
    duration: 0,
    speed: 1,
    paused: false,
    ended: false,
    failed: true,
    error: 'IRDASHIES_TELEMETRY_REPLAY is not set',
  });
  await expect(service.load('race.ibt', 1)).rejects.toThrow(
    'IRDASHIES_TELEMETRY_REPLAY is not set'
  );
  expect(deps.switchSource).toHaveBeenLastCalledWith(null);
  expect(service.status().file).toBeNull();
  expect(await readdir(deps.workDirectory)).toEqual([]);
});
