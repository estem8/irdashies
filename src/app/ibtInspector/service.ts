import { createWriteStream, type WriteStream } from 'node:fs';
import {
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
  TapeReplayCommand,
  TapeReplayStatus,
} from '../../types';
import { importIbt, type ReplayInputInfo } from './importIbt';
import { onPerfReport, type PerfReport } from '../perfMetrics';

export function validateIbtName(name: unknown): asserts name is string {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes(':') ||
    name.includes('\0') ||
    path.basename(name) !== name ||
    !name.toLowerCase().endsWith('.ibt')
  )
    throw new Error('Select an IBT file from the telemetry directory');
}

interface InspectorDependencies {
  directory: string;
  workDirectory: string;
  enabled: () => boolean;
  switchSource: (tape: string | null, speed?: number | 'max') => Promise<void>;
  getPlayback: () => TapeReplayStatus | null;
  command: (command: TapeReplayCommand) => void;
}

/** Owns one normalized tape and one capture. No whole-session arrays retained. */
export class IbtInspectorService {
  private file: string | null = null;
  private temporary: string | null = null;
  private warnings: string[] = [];
  private input: ReplayInputInfo | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private capture: IbtInspectorStatus['capture'] = {
    active: false,
    samples: 0,
    reportPath: null,
    error: null,
  };
  private writer: WriteStream | null = null;
  private unsubscribe?: () => void;
  private captureStart: TapeReplayStatus | null = null;
  private started = 0;
  private bytes = 0;
  private cpuSum = 0;
  private cpuSamples = 0;
  private maxWorkingSetMB: number | null = null;
  private sections: Record<
    string,
    { count: number; totalWallMs: number; maxWallMs: number }
  > = {};
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly deps: InspectorDependencies) {}

  private requireEnabled() {
    if (!this.deps.enabled())
      throw new Error('Enable Dev Tool in General settings');
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => undefined).then(action);
    this.queue = next.catch(() => undefined);
    return next;
  }
  async list() {
    this.requireEnabled();
    let entries;
    try {
      entries = await readdir(this.deps.directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { directory: this.deps.directory, files: [], truncated: false };
      throw error;
    }
    const candidates = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.ibt'))
      .sort((a, b) => a.name.localeCompare(b.name));
    const files = await Promise.all(
      candidates.slice(0, 500).map(async (entry) => {
        const info = await stat(path.join(this.deps.directory, entry.name));
        return {
          name: entry.name,
          sizeBytes: info.size,
          modifiedAt: info.mtime.toISOString(),
        };
      })
    );
    files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return {
      directory: this.deps.directory,
      files,
      truncated: candidates.length > 500,
    };
  }
  status(): IbtInspectorStatus {
    this.requireEnabled();
    return {
      file: this.file,
      playback: this.file ? this.deps.getPlayback() : null,
      warnings: [...this.warnings],
      capture: { ...this.capture },
    };
  }
  load(name: unknown, speed: unknown) {
    return this.serial(async () => {
      this.requireEnabled();
      validateIbtName(name);
      if (
        speed !== 'max' &&
        (typeof speed !== 'number' ||
          !Number.isFinite(speed) ||
          speed < 0.25 ||
          speed > 100)
      )
        throw new Error('Invalid playback speed');
      const root = await realpath(this.deps.directory);
      const input = await realpath(path.join(root, name));
      if (path.dirname(input) !== root)
        throw new Error('IBT must remain inside the telemetry directory');
      if (!(await stat(input)).isFile()) throw new Error('Not an IBT file');
      await mkdir(this.deps.workDirectory, { recursive: true });
      const temporary = await mkdtemp(
        path.join(this.deps.workDirectory, 'input-')
      );
      let switchAttempted = false;
      try {
        const info = await importIbt(input, path.join(temporary, 'input.irdt'));
        this.requireEnabled();
        await this.stopInternal();
        switchAttempted = true;
        await this.deps.switchSource(path.join(temporary, 'input.irdt'), speed);
        this.temporary = temporary;
        this.file = name;
        this.warnings = info.warnings;
        this.input = info;
      } catch (error) {
        const errors: unknown[] = [error];
        if (switchAttempted) {
          try {
            await this.deps.switchSource(null);
          } catch (cleanupError) {
            errors.push(cleanupError);
          }
        }
        try {
          await rm(temporary, { recursive: true, force: true });
        } catch (cleanupError) {
          errors.push(cleanupError);
        }
        throw new AggregateError(errors, errors.map(String).join('; '), {
          cause: error,
        });
      }
    });
  }
  command(command: TapeReplayCommand) {
    return this.serial(async () => {
      this.requireEnabled();
      if (!this.file) throw new Error('Load an IBT first');
      if (this.capture.active && command.type === 'seek')
        throw new Error('Stop capture before seeking');
      this.deps.command(command);
    });
  }
  stop() {
    return this.serial(() => this.stopInternal());
  }
  private async stopInternal() {
    let captureError: unknown;
    try {
      await this.finishCapture();
    } catch (error) {
      captureError = error;
    }
    if (this.file || this.temporary) await this.deps.switchSource(null);
    this.file = null;
    this.warnings = [];
    this.input = null;
    if (this.temporary) {
      await rm(this.temporary, { recursive: true, force: true });
      this.temporary = null;
    }
    if (captureError) throw captureError;
  }
  startCapture() {
    return this.serial(async () => {
      this.requireEnabled();
      if (!this.file || !this.deps.getPlayback())
        throw new Error('Load an IBT first');
      if (this.capture.active) throw new Error('Capture is already running');
      const runs = path.join(this.deps.workDirectory, 'runs');
      await mkdir(runs, { recursive: true });
      // Retain at most ten runs, each capped at 64 MiB / one hour.
      const previous = (await readdir(runs, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && /^\d+-[a-f0-9-]+$/.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of previous.slice(0, Math.max(0, previous.length - 9)))
        await rm(path.join(runs, entry.name), { recursive: true, force: true });
      const output = path.join(runs, `${Date.now()}-${randomUUID()}`);
      await mkdir(output);
      this.capture = {
        active: true,
        samples: 0,
        reportPath: path.join(output, 'report.json'),
        error: null,
      };
      this.captureStart = this.deps.getPlayback();
      this.started = performance.now();
      this.bytes = 0;
      this.cpuSum = 0;
      this.cpuSamples = 0;
      this.maxWorkingSetMB = null;
      this.sections = {};
      this.writer = createWriteStream(path.join(output, 'samples.ndjson'), {
        flags: 'wx',
      });
      this.writer.on('error', (error) => {
        this.capture.error = error.message;
        void this.stopCapture().catch(() => undefined);
      });
      this.unsubscribe = onPerfReport((report) => this.record(report));
      this.timer = setTimeout(() => {
        void this.stopCapture().catch(() => undefined);
      }, 3600_000);
    });
  }
  private record(report: PerfReport) {
    if (!this.writer || !this.capture.active) return;
    const line = JSON.stringify(report) + '\n';
    if (
      this.bytes + Buffer.byteLength(line) > 64 * 1024 * 1024 ||
      this.writer.writableLength > 1024 * 1024
    ) {
      this.capture.error = 'Capture limit reached or disk cannot keep up';
      this.unsubscribe?.();
      void this.stopCapture().catch(() => undefined);
      return;
    }
    this.bytes += Buffer.byteLength(line);
    this.writer.write(line);
    this.capture.samples++;
    const cpu = report.processes?.map((p) => p.cpuTimeMsPerSecond);
    if (cpu?.length && cpu.every((v) => typeof v === 'number')) {
      this.cpuSum += cpu.reduce<number>((sum, v) => sum + (v ?? 0), 0);
      this.cpuSamples++;
    }
    if (typeof report.totalAppMemoryMB === 'number')
      this.maxWorkingSetMB = Math.max(
        this.maxWorkingSetMB ?? 0,
        report.totalAppMemoryMB
      );
    for (const [name, value] of Object.entries(report.sections)) {
      const total = (this.sections[name] ??= {
        count: 0,
        totalWallMs: 0,
        maxWallMs: 0,
      });
      total.count += value.count;
      total.totalWallMs += value.count * value.avgMs;
      total.maxWallMs = Math.max(total.maxWallMs, value.maxMs);
    }
    const playback = this.deps.getPlayback();
    if (playback?.failed) this.capture.error = 'Replay source failed';
    if (playback?.ended || playback?.failed)
      void this.stopCapture().catch(() => undefined);
  }
  stopCapture() {
    return this.serial(() => this.finishCapture());
  }
  private async finishCapture() {
    if (!this.capture.active) return;
    this.capture.active = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    clearTimeout(this.timer);
    const writer = this.writer;
    this.writer = null;
    if (writer) {
      writer.end();
      try {
        await finished(writer);
      } catch (error) {
        this.capture.error = String(error);
      }
    }
    if (!this.capture.reportPath) return;
    const after = this.deps.getPlayback();
    const before = this.captureStart;
    try {
      await writeFile(
        this.capture.reportPath,
        JSON.stringify(
          {
            schemaVersion: 1,
            file: this.file,
            source: 'ibt',
            input: this.input,
            profile: 'current overlays',
            elapsedWallSeconds: (performance.now() - this.started) / 1000,
            samples: this.capture.samples,
            before,
            after,
            averageCpuMsPerSecond: this.cpuSamples
              ? this.cpuSum / this.cpuSamples
              : null,
            maxWorkingSetMB: this.maxWorkingSetMB,
            sections: this.sections,
            warnings: this.warnings,
            error: this.capture.error,
            limitations: [
              'Periodic main-process reports include inspector/Settings overhead and interval boundaries.',
              'No renderer draw timings, private memory, GPU engine utilization or game FPS measured.',
              'SDK frame counts do not prove one draw per sample. IBT contains one session snapshot.',
              'CPU average is over valid process samples; process churn can make coverage incomplete.',
            ],
            sdkFramesReturned:
              before?.framesDelivered !== undefined &&
              after?.framesDelivered !== undefined
                ? after.framesDelivered - before.framesDelivered
                : null,
            sourceFramesSuperseded:
              before?.framesConsumed !== undefined &&
              after?.framesConsumed !== undefined &&
              before?.framesDelivered !== undefined &&
              after?.framesDelivered !== undefined
                ? after.framesConsumed -
                  before.framesConsumed -
                  (after.framesDelivered - before.framesDelivered)
                : null,
            sourceFramesConsumed:
              before?.framesConsumed !== undefined &&
              after?.framesConsumed !== undefined
                ? after.framesConsumed - before.framesConsumed
                : null,
          },
          null,
          2
        )
      );
    } catch (error) {
      this.capture.error =
        error instanceof Error ? error.message : String(error);
      this.capture.reportPath = null;
      throw error;
    }
  }
}
