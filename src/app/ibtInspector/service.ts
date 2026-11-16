import { createWriteStream, type WriteStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  IbtInspectorStatus,
  IbtInspectorMemoryCheckpoint,
  IbtInspectorProcessSample,
  IbtInspectorTelemetrySample,
  TapeReplayCommand,
  TapeReplayStatus,
} from '../../types';
import { importIbt, inspectLiveTape } from './importIbt';
import { onPerfReport, type PerfReport } from '../perfMetrics';
import type { RendererHeapSampler } from './rendererHeapSampler';
import logger from '../logger';

export interface MemoryDiagnosticDependencies {
  directory: string;
  workDirectory: string;
  switchSource(tape: string | null, speed?: number | 'max'): Promise<void>;
  getPlayback(): TapeReplayStatus | null;
  command(command: TapeReplayCommand): void;
  getProcessMemorySnapshot(): Promise<IbtInspectorProcessSample[]>;
  collectMainGarbage(): Promise<void>;
  rendererHeapSampler: Pick<
    RendererHeapSampler,
    'start' | 'sample' | 'collectGarbageAndSample' | 'stop'
  >;
}

export function validateIbtName(name: unknown): asserts name is string {
  if (
    typeof name !== 'string' ||
    name.includes('\0') ||
    name.includes('/') ||
    name.includes('\\') ||
    name === '.' ||
    name === '..' ||
    !/\.(ibt|irdt)$/i.test(name)
  )
    throw new Error('Invalid telemetry recording filename');
}

/** CLI-only, one source and bounded capture. No charts, UI history or live recording. */
export class IbtInspectorService {
  private serialQueue: Promise<unknown> = Promise.resolve();
  private reportQueue: Promise<void> = Promise.resolve();
  private pendingReports = 0;
  private writer?: WriteStream;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private temporary?: string;
  private file: string | null = null;
  private started = 0;
  private bytes = 0;
  private captureStamp = 0;
  private latest?: IbtInspectorTelemetrySample;
  private checkpoints: IbtInspectorMemoryCheckpoint[] = [];
  private capture = {
    active: false,
    samples: 0,
    error: null as string | null,
    reportPath: null as string | null,
  };
  private captureStart: TapeReplayStatus | null = null;

  constructor(private readonly deps: MemoryDiagnosticDependencies) {}
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const task = this.serialQueue.then(action, action);
    this.serialQueue = task.catch(() => undefined);
    return task;
  }
  status(): IbtInspectorStatus {
    return {
      file: this.file,
      playback: this.file ? this.deps.getPlayback() : null,
      capture: {
        ...this.capture,
        telemetry: this.latest ? [this.latest] : [],
        memoryCheckpoints: this.checkpoints.slice(),
      },
    };
  }
  load(name: unknown, speed: unknown) {
    return this.serial(async () => {
      validateIbtName(name);
      if (
        speed !== 'max' &&
        (typeof speed !== 'number' ||
          !Number.isFinite(speed) ||
          speed < 0.25 ||
          speed > 100)
      )
        throw new Error('Invalid replay speed');
      const root = await realpath(this.deps.directory);
      const source = await realpath(path.join(root, name));
      if (path.dirname(source) !== root || !(await stat(source)).isFile())
        throw new Error('Recording must remain inside the telemetry library');
      await mkdir(this.deps.workDirectory, { recursive: true });
      const temporary = await mkdtemp(
        path.join(this.deps.workDirectory, 'input-')
      );
      let switching = false;
      try {
        const tape = path.join(temporary, 'input.irdt');
        if (name.toLowerCase().endsWith('.irdt')) {
          await inspectLiveTape(source);
          await copyFile(source, tape);
        } else await importIbt(source, tape);
        await this.stopInternal();
        switching = true;
        await this.deps.switchSource(tape, speed);
        if (!this.deps.getPlayback() || this.deps.getPlayback()?.failed)
          throw new Error('Replay transport failed to initialize');
        this.temporary = temporary;
        this.file = name;
      } catch (error) {
        try {
          if (switching) await this.deps.switchSource(null);
        } finally {
          await rm(temporary, { recursive: true, force: true });
        }
        throw error;
      }
    });
  }
  command(command: TapeReplayCommand) {
    return this.serial(async () => {
      if (!this.file) throw new Error('Load a recording first');
      if (
        this.capture.active &&
        ['seek', 'step', 'speed', 'loop'].includes(command.type)
      )
        throw new Error('Stop capture before changing replay position');
      this.deps.command(command);
    });
  }
  startCapture() {
    return this.serial(async () => {
      if (!this.file || !this.deps.getPlayback())
        throw new Error('Load a recording first');
      if (this.capture.active) throw new Error('Capture is already running');
      const attached = this.deps.rendererHeapSampler.start();
      if (!attached.attachedTargets || attached.skippedTargets) {
        this.deps.rendererHeapSampler.stop();
        throw new Error(
          'Every renderer must be available for sampling; close DevTools'
        );
      }
      this.captureStamp = Math.max(Date.now(), this.captureStamp + 1);
      // At most 32 raw capture folders; enough for the CLI's 20 blocks + warmup.
      const runs = path.join(this.deps.workDirectory, 'runs');
      await mkdir(runs, { recursive: true });
      const previous = (await readdir(runs, { withFileTypes: true }))
        .filter(
          (entry) => entry.isDirectory() && /^\d+-[a-f0-9-]+$/.test(entry.name)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of previous.slice(0, Math.max(0, previous.length - 31)))
        await rm(path.join(runs, entry.name), { recursive: true, force: true });
      const output = path.join(runs, `${this.captureStamp}-${randomUUID()}`);
      await mkdir(output, { recursive: true });
      this.writer = createWriteStream(path.join(output, 'samples.ndjson'), {
        flags: 'wx',
      });
      this.writer.on('error', (error) => this.fail(error.message));
      this.started = performance.now();
      this.bytes = 0;
      this.latest = undefined;
      this.checkpoints = [];
      this.capture = {
        active: true,
        samples: 0,
        error: null,
        reportPath: path.join(output, 'report.json'),
      };
      this.captureStart = this.deps.getPlayback();
      this.unsubscribe = onPerfReport((report) => {
        if (this.pendingReports >= 8) {
          this.fail('Renderer sampling cannot keep up with reports');
          return;
        }
        this.pendingReports++;
        this.reportQueue = this.reportQueue
          .then(() => this.record(report))
          .catch((error) => this.fail(String(error)))
          .finally(() => this.pendingReports--);
      });
      this.timer = setTimeout(
        () => this.fail('Capture duration limit reached'),
        3600000
      );
    });
  }
  private fail(message: string) {
    this.capture.error = message;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    void this.stopCapture().catch((error) =>
      logger.warn('Memory capture cleanup failed', error)
    );
  }
  private append(value: unknown) {
    if (!this.writer) throw new Error('Capture writer is closed');
    const line = JSON.stringify(value) + '\n';
    if (
      this.bytes + Buffer.byteLength(line) > 64 * 1024 * 1024 ||
      this.writer.writableLength > 1024 * 1024
    )
      throw new Error('Capture byte limit reached or disk cannot keep up');
    this.bytes += Buffer.byteLength(line);
    this.writer.write(line);
  }
  private async record(report: PerfReport) {
    const memory = process.memoryUsage();
    this.latest = {
      elapsedSeconds: (performance.now() - this.started) / 1000,
      mainV8HeapUsedMB: memory.heapUsed / 1048576,
      mainExternalMemoryMB: memory.external / 1048576,
      rendererHeaps: await this.deps.rendererHeapSampler.sample(),
    };
    this.append({ ...report, inspectorMemory: this.latest });
    this.capture.samples++;
  }
  checkpointMemory() {
    return this.serial(async () => {
      if (!this.capture.active) throw new Error('Start a capture first');
      const task = this.reportQueue.then(async () => {
        const before = this.deps.getPlayback();
        if (
          !before?.paused ||
          before.framesRemaining !== 0 ||
          before.ended ||
          before.failed
        )
          throw new Error(
            'Checkpoint requires an idle paused replay before EOF'
          );
        let rendererHeaps = await this.deps.rendererHeapSampler.sample();
        for (let pass = 0; pass < 2; pass++) {
          rendererHeaps =
            await this.deps.rendererHeapSampler.collectGarbageAndSample();
          await this.deps.collectMainGarbage();
          await new Promise<void>((resolve) => setTimeout(resolve, 200));
        }
        const processes = await this.deps.getProcessMemorySnapshot();
        if (
          !rendererHeaps.length ||
          rendererHeaps.some(
            (heap) =>
              heap.usedHeapMB === null ||
              !processes.some((p) => p.type === 'Tab' && p.pid === heap.pid)
          ) ||
          processes.some(
            (p) =>
              p.type === 'Tab' &&
              !rendererHeaps.some((heap) => heap.pid === p.pid)
          )
        )
          throw new Error('Every renderer must complete its GC checkpoint');
        const after = this.deps.getPlayback();
        if (
          !after?.paused ||
          after.framesRemaining !== 0 ||
          after.framesConsumed !== before.framesConsumed ||
          after.framesDelivered !== before.framesDelivered
        )
          throw new Error('Replay advanced during checkpoint');
        const sum = (
          read: (sample: IbtInspectorProcessSample) => number | null
        ) => {
          const values = processes.map(read);
          return values.length && values.every((v) => v !== null)
            ? values.reduce<number>((total, v) => total + (v ?? 0), 0)
            : null;
        };
        const memory = process.memoryUsage();
        const checkpoint: IbtInspectorMemoryCheckpoint = {
          scope: 'application',
          elapsedSeconds: (performance.now() - this.started) / 1000,
          appWorkingSetMB: sum((p) => p.memoryMB),
          appPrivateMemoryMB: sum((p) => p.privateMemoryMB),
          mainV8HeapUsedMB: memory.heapUsed / 1048576,
          mainExternalMemoryMB: memory.external / 1048576,
          processes,
          rendererHeaps,
        };
        this.append({ checkpoint });
        this.checkpoints.push(checkpoint);
        if (this.checkpoints.length > 32) this.checkpoints.shift();
      });
      this.reportQueue = task.catch((error) => {
        this.capture.error = String(error);
      });
      await task;
    });
  }
  stopCapture() {
    return this.serial(() => this.finishCapture());
  }
  private async finishCapture() {
    if (!this.capture.active) return;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    clearTimeout(this.timer);
    await this.reportQueue;
    const writer = this.writer;
    this.writer = undefined;
    this.deps.rendererHeapSampler.stop();
    this.capture.active = false;
    if (writer) {
      writer.end();
      await finished(writer);
    }
    if (this.capture.reportPath)
      await writeFile(
        this.capture.reportPath,
        JSON.stringify(
          {
            file: this.file,
            ...this.capture,
            before: this.captureStart,
            after: this.deps.getPlayback(),
            memoryCheckpoints: this.checkpoints,
          },
          null,
          2
        )
      );
  }
  stop() {
    return this.serial(() => this.stopInternal());
  }
  private async stopInternal() {
    try {
      await this.finishCapture();
    } finally {
      this.deps.rendererHeapSampler.stop();
      try {
        if (this.file) await this.deps.switchSource(null);
      } finally {
        this.file = null;
        const temporary = this.temporary;
        this.temporary = undefined;
        if (temporary) await rm(temporary, { recursive: true, force: true });
      }
    }
  }
}
