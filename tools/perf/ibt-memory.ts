import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import WebSocket from 'ws';
import type { IbtInspectorStatus } from '../../src/types/ibtInspector.ts';
import type { TapeReplayStatus } from '../../src/types/tapeReplay.ts';
import {
  requirePausedReplay,
  requireSameProcesses,
  validateAdvance,
} from './ibt-memory-model.ts';

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const usage =
  'Usage: npm run perf:ibt-memory -- --app <packaged executable> --profile <config.json> --recording <name.irdt> --output <new directory> [--frames 10000] [--cycles 3] [--warmup-frames 5000] [--repeat-prefix] [--close-settings]';
const { values } = parseArgs({
  options: {
    app: { type: 'string' },
    profile: { type: 'string' },
    recording: { type: 'string' },
    output: { type: 'string' },
    frames: { type: 'string', default: '10000' },
    cycles: { type: 'string', default: '3' },
    'warmup-frames': { type: 'string', default: '5000' },
    'repeat-prefix': { type: 'boolean', default: false },
    'close-settings': { type: 'boolean', default: false },
  },
});
function integer(value: string | undefined, maximum: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum)
    throw new Error(`Invalid bounded integer: ${value}`);
  return parsed;
}

class Protocol {
  private socket: WebSocket;
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (data) => {
      const message = JSON.parse(String(data)) as {
        id?: number;
        result?: unknown;
        error?: unknown;
      };
      if (message.id === undefined) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error)
        request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    socket.on('close', () =>
      this.rejectPending(new Error('Diagnostic connection closed'))
    );
    socket.on('error', (error) => this.rejectPending(error));
  }
  private rejectPending(error: Error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
  static async connect(url: string) {
    const socket = new WebSocket(url);
    const protocol = new Protocol(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error('Diagnostic connection timed out'));
      }, 10000);
      socket.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return protocol;
  }
  call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 10000
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate<T>(expression: string, timeoutMs = 10000): Promise<T> {
    const result = await this.call<{
      result?: { value?: T };
      exceptionDetails?: unknown;
    }>(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      timeoutMs
    );
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value as T;
  }
  close() {
    this.rejectPending(new Error('Diagnostic connection disposed'));
    this.socket.close();
  }
}

interface Page {
  id: string;
  url: string;
  webSocketDebuggerUrl: string;
}
async function shutdown(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  for (
    let i = 0;
    i < 50 && child.exitCode === null && child.signalCode === null;
    i++
  )
    await delay(100);
  if (child.exitCode === null && child.signalCode === null)
    child.kill('SIGKILL');
}

async function main() {
  if (!values.app || !values.profile || !values.recording || !values.output)
    throw new Error(usage);
  if (
    path.basename(values.recording) !== values.recording ||
    !/\.(irdt|ibt)$/i.test(values.recording)
  )
    throw new Error(
      'Recording must be a filename in the Inspector telemetry library'
    );
  const frames = integer(values.frames, 1000000),
    warmup = integer(values['warmup-frames'], 1000000),
    cycles = integer(values.cycles, 20);
  const appPath = path.resolve(values.app),
    output = path.resolve(values.output);
  const profileText = await fs.readFile(values.profile, 'utf8');
  const config: unknown = JSON.parse(profileText);
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!record(config) || !record(config.dashboards))
    throw new Error('Invalid profile configuration');
  const dashboard =
    config.dashboards[
      typeof config.currentProfile === 'string'
        ? config.currentProfile
        : 'default'
    ];
  if (!record(dashboard) || !Array.isArray(dashboard.widgets))
    throw new Error('Profile must contain an active dashboard');
  const widgets: unknown[] = dashboard.widgets;
  if (
    !widgets.every(
      (widget): widget is { id: string; enabled: boolean } =>
        record(widget) &&
        typeof widget.id === 'string' &&
        typeof widget.enabled === 'boolean'
    )
  )
    throw new Error('Invalid widget configuration');
  dashboard.generalSettings = {
    ...(record(dashboard.generalSettings) ? dashboard.generalSettings : {}),
    enableWebServer: false,
  };
  await fs.access(appPath);
  await fs.mkdir(output); // Never overwrite a previous measurement.
  const userData = path.join(output, 'user-data');
  await fs.mkdir(userData);
  await fs.writeFile(
    path.join(userData, 'config.json'),
    JSON.stringify(config)
  );
  const log = createWriteStream(path.join(output, 'app.log'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PERF_METRICS: '0',
    PERF_METRICS_COLLECTION: 'off',
    IRDASHIES_MEMORY_DIAGNOSTICS: '1',
  };
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'IRDASHIES_TELEMETRY_REPLAY',
    'IRDASHIES_SIM',
    'PERF_HEAP_PROFILE_PATH',
  ])
    env[key] = undefined;
  const child = spawn(
    appPath,
    [`--user-data-dir=${userData}`, '--remote-debugging-port=0'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let spawnError: Error | undefined;
  child.on('error', (error) => {
    spawnError = error;
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  let controller: Protocol | undefined;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  const report: Record<string, unknown> = {
    schemaVersion: 1,
    model: 'paused-bounded-frame-blocks-all-process-gc',
    complete: false,
    recording: values.recording,
    framesPerBlock: frames,
    warmupFrames: warmup,
    measuredBlocks: cycles,
    settings: values['close-settings']
      ? 'close requested; any hidden process remains measured'
      : 'kept; included in application-wide GC',
    enabledWidgets: widgets.filter((w) => w.enabled).map((w) => w.id),
    repeatPrefix: values['repeat-prefix'],
    profileSha256: createHash('sha256').update(profileText).digest('hex'),
    blocks: [],
  };
  const blocks: unknown[] = [];
  const save = () =>
    fs.writeFile(
      path.join(output, 'memory.json'),
      JSON.stringify({ ...report, blocks }, null, 2) + '\n'
    );
  try {
    let port = 0;
    for (let i = 0; i < 600; i++) {
      if (spawnError) throw spawnError;
      if (cancelled || child.exitCode !== null || child.signalCode !== null)
        throw new Error('Application exited or capture cancelled');
      try {
        port = Number(
          (
            await fs.readFile(path.join(userData, 'DevToolsActivePort'), 'utf8')
          ).split('\n')[0]
        );
      } catch {
        /* Startup has not published its port yet. */
      }
      if (port) break;
      await delay(100);
    }
    if (!port)
      throw new Error('Packaged app did not expose its diagnostic endpoint');
    const pages = async () =>
      (await (
        await fetch(`http://127.0.0.1:${port}/json`, {
          signal: AbortSignal.timeout(5000),
        })
      ).json()) as Page[];
    let inspector: Page | undefined;
    for (let i = 0; i < 300; i++) {
      inspector = (await pages()).find(
        (page) => page.url === 'about:blank#ibt-memory-controller'
      );
      if (inspector) break;
      await delay(100);
    }
    if (!inspector)
      throw new Error('Hidden memory controller did not initialize');
    const inspectorClient = await Protocol.connect(
      inspector.webSocketDebuggerUrl
    );
    controller = inspectorClient;
    const invoke = <T>(expression: string) =>
      inspectorClient.evaluate<T>(expression);
    await invoke(`window.ibtInspectorBridge.version()`);
    await inspectorClient.evaluate(
      `window.ibtInspectorBridge.load(${JSON.stringify(values.recording)}, 'max')`,
      120000
    );
    await invoke(`window.ibtInspectorBridge.command({type:'loop',range:null})`);
    if (values['close-settings']) {
      const version = (await (
        await fetch(`http://127.0.0.1:${port}/json/version`, {
          signal: AbortSignal.timeout(5000),
        })
      ).json()) as { webSocketDebuggerUrl: string };
      const browser = await Protocol.connect(version.webSocketDebuggerUrl);
      try {
        for (const page of await pages()) {
          if (page.url.includes('#/settings'))
            await browser.call('Target.closeTarget', { targetId: page.id });
        }
      } finally {
        browser.close();
      }
      // closeToTray can hide the window instead of destroying it. Its preview
      // must have unmounted; hidden process memory is still included in GC.
      const deadline = Date.now() + 5000;
      let quiet = false;
      while (!quiet && Date.now() < deadline) {
        await delay(100);
        quiet = true;
        for (const page of (await pages()).filter((page) =>
          page.url.includes('#/settings')
        )) {
          const settings = await Protocol.connect(page.webSocketDebuggerUrl);
          try {
            quiet &&= await settings.evaluate<boolean>(
              "document.visibilityState === 'hidden' && document.querySelector('iframe') === null"
            );
          } finally {
            settings.close();
          }
        }
      }
      if (!quiet)
        throw new Error(
          'Settings preview is still active; isolated overlay measurement is invalid'
        );
    }
    const status = async () => {
      // Poll only transport counters, not the Inspector's growing chart payload.
      const result = await invoke<TapeReplayStatus | null>(
        'window.ibtInspectorBridge.playback()'
      );
      if (!result) throw new Error('Replay source disappeared');
      return result;
    };
    requirePausedReplay(await status());
    report.appVersion = await invoke('window.ibtInspectorBridge.version()');
    const asar =
      process.platform === 'darwin'
        ? path.resolve(appPath, '../../Resources/app.asar')
        : path.join(path.dirname(appPath), 'resources/app.asar');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(asar)) hash.update(chunk);
    report.appAsarSha256 = hash.digest('hex');
    let processKeys: string[] | undefined;
    for (let block = 0; block <= cycles; block++) {
      if (cancelled) throw new Error('Capture cancelled');
      if (block > 0 && values['repeat-prefix']) {
        const previous = await status();
        await invoke(
          "window.ibtInspectorBridge.command({type:'seek',seconds:0})"
        );
        const deadline = Date.now() + 30000;
        while ((await status()).framesDelivered === previous.framesDelivered) {
          if (cancelled || Date.now() > deadline)
            throw new Error('Paused seek did not deliver its seed frame');
          await delay(50);
        }
      }
      const before = await status();
      requirePausedReplay(before);
      const count = block === 0 ? warmup : frames;
      await invoke('window.ibtInspectorBridge.startCapture()');
      await invoke(
        `window.ibtInspectorBridge.command({type:'advance',frames:${count}})`
      );
      let after: TapeReplayStatus;
      const deadline = Date.now() + 300000;
      do {
        if (cancelled || Date.now() > deadline)
          throw new Error('Frame block cancelled or timed out');
        await delay(100);
        after = await status();
        if (after.framesRemaining === 0 && !after.paused)
          throw new Error(
            'Bounded advance was cancelled or replay was resumed externally'
          );
        if (after.failed || after.ended)
          throw new Error(
            'Recording ended or failed before completing the block; use smaller frame blocks or a longer recording'
          );
      } while (after.framesRemaining !== 0 || !after.paused);
      const frameCounts = validateAdvance(before, after, count);
      await delay(1500);
      const liveStatus = await invoke<IbtInspectorStatus>(
        'window.ibtInspectorBridge.status()'
      );
      if (liveStatus.capture.error)
        throw new Error(
          `Inspector capture failed: ${liveStatus.capture.error}`
        );
      const live = liveStatus.capture.telemetry.at(-1) ?? null;
      await invoke('window.ibtInspectorBridge.checkpointMemory()');
      const checkpointStatus = await invoke<IbtInspectorStatus>(
        'window.ibtInspectorBridge.status()'
      );
      const postGc = checkpointStatus.capture.memoryCheckpoints.at(-1);
      if (!postGc || postGc.scope !== 'application')
        throw new Error('Application-wide checkpoint is missing');
      if (postGc.appPrivateMemoryMB === null)
        throw new Error(
          'Application private memory is unavailable; cannot compare retained-memory floors'
        );
      await invoke('window.ibtInspectorBridge.stopCapture()');
      const stable = await status();
      requirePausedReplay(stable);
      if (
        stable.framesConsumed !== after.framesConsumed ||
        stable.framesDelivered !== after.framesDelivered
      )
        throw new Error('Replay advanced during a paused memory checkpoint');
      const keys = postGc.processes.map((p) => p.key);
      if (processKeys) requireSameProcesses(processKeys, keys);
      processKeys = keys;
      blocks.push({
        block,
        warmup: block === 0,
        frameCounts,
        before,
        after,
        live,
        postGc,
      });
      await save();
      process.stdout.write(
        `${block === 0 ? 'warmup' : `block ${block}`} — ${count} frames; paused post-GC private ${postGc.appPrivateMemoryMB?.toFixed(1) ?? 'unavailable'} MiB\n`
      );
    }
    await invoke('window.ibtInspectorBridge.stop()');
    report.complete = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await save();
    controller?.close();
    await shutdown(child);
    child.stdout?.unpipe(log);
    child.stderr?.unpipe(log);
    log.end();
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
