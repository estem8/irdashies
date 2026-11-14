import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { finished } from 'node:stream/promises';
import type { DashboardLayout } from '../../../src/types/dashboardLayout.ts';
import type { TapeReplayStatus } from '../../../src/types/tapeReplay.ts';
import { CDP } from '../capture/cdp-client.mjs';
import { terminateCaptureChild } from '../capture/terminateCaptureChild.mjs';
import { prepareReplayInput } from './input.ts';
import {
  createReplayReport,
  replayReportMarkdown,
  type ResourceSnapshot,
} from './report.ts';
import type { ReplayOptions } from './options.ts';

export function hasCompleteTopology(log: string, runId?: string): boolean {
  for (const match of log.matchAll(/\[PerfRunTopology:JSON\] (\{[^\n]+\})/g)) {
    try {
      const topology = JSON.parse(match[1]) as {
        complete?: boolean;
        timedOut?: boolean;
        runId?: string;
      };
      if (
        topology.complete === true &&
        topology.timedOut === false &&
        (runId === undefined || topology.runId === runId)
      )
        return true;
    } catch {
      /* A partial log chunk is not readiness. */
    }
  }
  return false;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No debugger port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return address.port;
}

export function configureReplayProfile(raw: unknown, selection: string) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('dashboards' in raw) ||
    !('currentProfile' in raw)
  )
    throw new Error('Expected an irDashies config.json profile');
  const config = structuredClone(raw) as {
    currentProfile: string;
    dashboards: Record<string, DashboardLayout>;
    analyticsOptOut?: boolean;
  };
  const dashboard = config.dashboards?.[config.currentProfile];
  if (!dashboard || !Array.isArray(dashboard.widgets))
    throw new Error('Profile has no active dashboard');
  const available = dashboard.widgets.map((w) => w.type || w.id);
  const wanted =
    selection === 'all'
      ? available
      : selection === 'saved'
        ? dashboard.widgets.filter((w) => w.enabled).map((w) => w.type || w.id)
        : selection.split(',');
  const unknown = wanted.filter((id) => !available.includes(id));
  if (unknown.length)
    throw new Error(`Widgets absent from profile: ${unknown.join(', ')}`);
  if (!wanted.length) throw new Error('No widgets selected');
  for (const widget of dashboard.widgets)
    widget.enabled = wanted.includes(widget.type || widget.id);
  dashboard.generalSettings = {
    ...dashboard.generalSettings,
    enableAutoStart: false,
    enableWebServer: false,
    startMinimized: false,
    enableNetworkAccess: false,
    overlayWindowMode: 'display',
  };
  config.analyticsOptOut = true;
  return {
    config,
    widgetTypes: [...new Set(wanted)],
    widgetIds: dashboard.widgets.filter((w) => w.enabled).map((w) => w.id),
  };
}

interface DebugTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}
const electron = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;

/** Shared CLI/API runner. It never writes the developer's normal app profile. */
async function runPreparedOverlayReplay(
  options: ReplayOptions,
  signal: AbortSignal | undefined,
  prepared: Awaited<ReturnType<typeof prepareReplayInput>>
) {
  await mkdir(options.output, { recursive: true });
  // Exclusive marker also prevents accidental reuse/overwrite of an old run.
  await writeFile(
    path.join(options.output, 'run.json'),
    JSON.stringify(options, null, 2),
    { flag: 'wx' }
  );
  const raw: unknown = JSON.parse(
    await readFile(
      options.profile ??
        new URL('../fixtures/reconstructed-ten-widget.json', import.meta.url),
      'utf8'
    )
  );
  const profile = configureReplayProfile(raw, options.widgets);
  const profilePath = path.join(options.output, 'profile');
  await mkdir(profilePath);
  await writeFile(
    path.join(profilePath, 'config.json'),
    JSON.stringify(profile.config)
  );
  signal?.throwIfAborted();
  const port = await freePort();
  let mainPort = await freePort();
  while (mainPort === port) mainPort = await freePort();
  const id = `replay-${Date.now()}`;
  const args = [
    'start',
    '--',
    '--',
    `--remote-debugging-port=${port}`,
    `--inspect=127.0.0.1:${mainPort}`,
  ];
  const windows = process.platform === 'win32';
  const log = createWriteStream(path.join(options.output, 'console.log'));
  let output = '';
  let childError: Error | undefined;
  log.on('error', (error) => {
    childError ??= error;
  });
  let exited = false;
  const child = spawn(
    windows ? `npm.cmd ${args.join(' ')}` : 'npm',
    windows ? [] : args,
    {
      shell: windows,
      detached: !windows,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        VSCODE_INSPECTOR_OPTIONS: '',
        IRDASHIES_SIM: 'iracing',
        IRDASHIES_IRSDK_REPLAY: '',
        IRDASHIES_TELEMETRY_REPLAY: prepared.tapePath,
        IRDASHIES_TELEMETRY_REPLAY_SPEED: String(options.speed),
        IRDASHIES_TELEMETRY_REPLAY_EVERY_FRAME: '1',
        IRDASHIES_TELEMETRY_REPLAY_PAUSED: '1',
        IRDASHIES_TELEMETRY_REPLAY_LOOP: '0',
        PERF_METRICS: '1',
        PERF_METRICS_COLLECTION: 'on',
        PERF_RUN_ID: id,
        PERF_SCENARIO: 'cli-replay',
        PERF_OVERLAY_MODE: 'full',
        PERF_WINDOW_MODE: 'display',
        PERF_WIDGET_TYPES: profile.widgetTypes.join(','),
        PERF_REPLAY_VISIBLE_WIDGETS: '1',
        PERF_TAPE_CONTROLS_HIDDEN: '1',
        PERF_USER_DATA_DIR: profilePath,
        PERF_LOG_PATH: path.join(options.output, 'metrics.log'),
        PERF_DURATION_SECONDS: '0',
        PERF_REPORT_INTERVAL_MS: '1000',
        PERF_HEAP_PROFILE_PATH: '',
        PERF_VISIBILITY_PHASES: '',
        PERF_CHANNEL_DELIVERY: 'on',
        PERF_TELEMETRY_DELIVERY: 'on',
        PERF_TELEMETRY_PAYLOAD: 'allowlisted',
        PERF_RUNTIME_TOPOLOGY_TIMEOUT_MS: '60000',
      },
    }
  );
  const accept = (bytes: Buffer) => {
    log.write(bytes);
    output = (output + bytes.toString('utf8')).slice(-1_000_000);
  };
  child.stdout?.on('data', accept);
  child.stderr?.on('data', accept);
  child.on('error', (error) => {
    childError = error;
  });
  const exit = new Promise<number>((resolve) =>
    child.once('close', (code) => {
      exited = true;
      resolve(code ?? 1);
    })
  );
  let main: CDP | undefined;
  let overlay: CDP | undefined;
  let browserPid: number | undefined;
  let complete = false;
  const ensureRunning = () => {
    signal?.throwIfAborted();
    if (childError) throw childError;
    if (exited)
      throw new Error(
        `Application exited before completion. See ${path.join(options.output, 'console.log')}`
      );
  };
  const playback = async () => {
    const deadline = performance.now() + options.startupTimeoutSeconds * 1000;
    while (!main || !overlay) {
      ensureRunning();
      if (performance.now() > deadline)
        throw new Error('Overlay startup timed out; see console.log');
      try {
        if (!main) {
          const targets = (await (
            await fetch(`http://127.0.0.1:${mainPort}/json/list`)
          ).json()) as DebugTarget[];
          if (targets[0])
            main = await CDP.connect(targets[0].webSocketDebuggerUrl);
          if (main && (await main.evaluate('process.env.PERF_RUN_ID')) !== id)
            throw new Error('Debugger belongs to another application');
        }
        if (!overlay) {
          const targets = (await (
            await fetch(`http://127.0.0.1:${port}/json/list`)
          ).json()) as DebugTarget[];
          const target = targets.find(
            (t) => t.type === 'page' && /:\d+\/$/.test(t.url)
          );
          if (target) overlay = await CDP.connect(target.webSocketDebuggerUrl);
        }
      } catch {
        /* Ports/pages are unavailable during the initial build. */
      }
      if (!main || !overlay) await sleep(100, undefined, { signal });
    }
    if ((await main.evaluate('process.env.PERF_RUN_ID')) !== id)
      throw new Error('Debugger ownership mismatch');
    browserPid = (await main.evaluate('process.pid')) as number;
    const readyOverlay = overlay;
    const readyMain = main;
    const getStatus = async () =>
      (await readyOverlay.evaluate(
        'window.tapeReplayBridge?.getStatus()'
      )) as TapeReplayStatus | null;
    let status: TapeReplayStatus | null;
    let mountedWidgets: string[] = [];
    for (;;) {
      ensureRunning();
      if (performance.now() > deadline)
        throw new Error('Overlay/source readiness timed out; see console.log');
      status = await getStatus();
      if (status?.failed)
        throw new Error('Native replay failed; see console.log');
      if (
        status &&
        (typeof status.framesConsumed !== 'number' ||
          status.frameByFrame !== true)
      )
        throw new Error('Rebuild the native tape addon: npm run irsdk:build');
      if (
        status?.paused &&
        (status.framesDelivered ?? 0) > 0 &&
        hasCompleteTopology(output, id)
      )
        break;
      await sleep(100, undefined, { signal });
    }
    await sleep(options.warmupSeconds * 1000, undefined, { signal });
    // Observe all page renderers, including the always-fed Gantry window.
    const targets = (await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json()) as DebugTarget[];
    for (const target of targets.filter(
      (t) => t.type === 'page' && !t.url.endsWith('#/tape-replay')
    )) {
      const page = await CDP.connect(target.webSocketDebuggerUrl);
      try {
        mountedWidgets.push(
          ...((await page.evaluate(
            `Array.from(document.querySelectorAll('[data-widget-id]'), e=>e.getAttribute('data-widget-id'))`
          )) as string[])
        );
        if (
          target.url.endsWith('#/gantry') &&
          (await page.evaluate('document.body.textContent.length > 0'))
        )
          mountedWidgets.push('gantry');
      } finally {
        page.ws.close();
      }
    }
    mountedWidgets = [...new Set(mountedWidgets)];
    const resources = async () =>
      (await readyMain.evaluate(
        `${electron}.app.getAppMetrics().map(p=>({pid:p.pid,creationTime:p.creationTime,type:p.type,cumulativeCPUUsage:p.cpu.cumulativeCPUUsage,memoryMiB:p.memory.workingSetSize/1024}))`
      )) as ResourceSnapshot[];
    const image = await overlay.call('Page.captureScreenshot', {
      format: 'png',
    });
    await writeFile(
      path.join(options.output, 'overlay-ready.png'),
      Buffer.from(image.data, 'base64')
    );
    const before = await getStatus();
    if (!before) throw new Error('Replay transport unavailable');
    const resourcesBefore = await resources();
    const started = performance.now();
    await overlay.evaluate(
      `window.tapeReplayBridge.command({type:'pause',paused:false})`
    );
    process.stdout.write(
      `Playing ${prepared.info.frames} frames at ${options.speed} speed; ${profile.widgetTypes.length} widget types.\n`
    );
    const timeout = Math.max(
      60,
      options.speed === 'max'
        ? prepared.info.durationSeconds
        : prepared.info.durationSeconds / Math.min(options.speed, 1) + 30
    );
    for (;;) {
      ensureRunning();
      status = await getStatus();
      if (status?.failed)
        throw new Error('Native replay failed while reading the source');
      if (status?.ended) {
        complete = true;
        break;
      }
      const elapsed = (performance.now() - started) / 1000;
      if (options.limitSeconds !== undefined && elapsed >= options.limitSeconds)
        break;
      if (elapsed > timeout)
        throw new Error('Replay stalled or exceeded its completion deadline');
      await sleep(50, undefined, { signal });
    }
    if (!status) throw new Error('Replay status disappeared');
    if (!complete) {
      await overlay.evaluate(
        `window.tapeReplayBridge.command({type:'pause',paused:true})`
      );
      status = await getStatus();
      if (!status) throw new Error('Replay status disappeared after pause');
    }
    const elapsedSeconds = (performance.now() - started) / 1000;
    const resourcesAfter = await resources();
    // Let both reporters flush the source/renderer counters before shutdown.
    await sleep(2100, undefined, { signal });
    const logPath = path.join(options.output, 'console.log');
    if ((await stat(logPath)).size > 64 * 1024 * 1024)
      throw new Error(
        'Replay log exceeds the 64 MiB report budget; use --limit-seconds'
      );
    const capturedLog = await readFile(
      path.join(options.output, 'console.log'),
      'utf8'
    );
    const report = createReplayReport({
      input: prepared.info,
      requestedSpeed: options.speed,
      elapsedSeconds,
      before,
      after: status,
      resourcesBefore,
      resourcesAfter,
      log: capturedLog,
      selectedWidgets: profile.widgetIds,
      mountedWidgets,
      finished: complete,
    });
    let sourceCommit = 'unknown';
    let sourceDirty: boolean | null = null;
    try {
      sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim();
      sourceDirty =
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim().length > 0;
    } catch {
      /* Archive checkout. */
    }
    await writeFile(
      path.join(options.output, 'report.json'),
      JSON.stringify({ ...report, sourceCommit, sourceDirty }, null, 2)
    );
    await writeFile(
      path.join(options.output, 'report.md'),
      replayReportMarkdown(report)
    );
    return report;
  };
  const cleanup = async () => {
    try {
      if (browserPid) await main?.evaluate(`${electron}.app.quit()`);
    } catch {
      /* Quit closes inspector. */
    }
    // Node waits for attached inspectors during exit. Disconnect before
    // awaiting the child, otherwise every successful run needs a forced kill.
    overlay?.ws.close();
    main?.ws.close();
    if (!exited && child.pid) {
      if (windows) {
        // Give the shutdown coordinator time to flush before a forced fallback.
        await Promise.race([exit, sleep(10_000, undefined, { ref: false })]);
        if (!exited) {
          execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
            stdio: 'ignore',
          });
          await Promise.race([exit, sleep(5000)]);
          if (!exited)
            throw new Error('Could not stop the owned Windows process tree');
        }
      } else {
        const stopped = await terminateCaptureChild({
          childPid: child.pid,
          browserPid,
          exit,
          wait: <T = void>(ms?: number, value?: T) =>
            sleep(ms, value, { ref: false }),
        });
        if (!stopped.terminated)
          throw new Error('Could not stop the owned application process');
      }
    }
  };
  let result: Awaited<ReturnType<typeof playback>> | undefined;
  const errors: unknown[] = [];
  try {
    result = await playback();
  } catch (error) {
    errors.push(error);
  }
  try {
    await cleanup();
  } catch (error) {
    errors.push(error);
  }
  log.end();
  try {
    await finished(log);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      `Replay or cleanup failed: ${errors.map(String).join('; ')}`,
      {
        cause: errors[0],
      }
    );
  if (!result) throw new Error('Replay produced no report');
  return result;
}

export async function runOverlayReplay(
  options: ReplayOptions,
  signal?: AbortSignal
) {
  signal?.throwIfAborted();
  await mkdir(options.output, { recursive: true });
  const convertedPath = path.join(options.output, 'input.irdt');
  const prepared = await prepareReplayInput(options.input, convertedPath);
  const errors: unknown[] = [];
  let report: Awaited<ReturnType<typeof runPreparedOverlayReplay>> | undefined;
  try {
    report = await runPreparedOverlayReplay(options, signal, prepared);
  } catch (error) {
    errors.push(error);
  }
  if (prepared.info.format === 'ibt') {
    try {
      await rm(prepared.tapePath, { force: true });
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      `Replay failed: ${errors.map(String).join('; ')}`,
      { cause: errors[0] }
    );
  if (!report) throw new Error('Replay produced no report');
  return report;
}
