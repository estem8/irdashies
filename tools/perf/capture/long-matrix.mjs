import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { cpus, release } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { CDP } from './cdp-client.mjs';
import { terminateCaptureChild } from './terminateCaptureChild.mjs';
import { readWidgetInputRequirements } from '../widgetInputMetadata.ts';

const matrix = process.argv[2] ?? 'normal-final-r1';
const smoke = process.argv[3] === 'smoke';
if (process.argv[3] && !smoke) throw new Error('Expected optional smoke mode');
const durationSeconds = smoke ? 90 : 420;
if (!/^[a-z0-9-]+$/.test(matrix)) throw new Error('Unsafe matrix ID');
const out = resolve('perf-results', matrix);
await mkdir(out);
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const sourceRoot = resolve('perf-results/long-matrix-sources');
const sources = JSON.parse(
  await readFile(resolve(sourceRoot, 'manifest.json'), 'utf8')
);
const seed = JSON.stringify(
  JSON.parse(
    await readFile(
      new URL('../fixtures/reconstructed-ten-widget.json', import.meta.url),
      'utf8'
    )
  )
);
const sourceScript = await readFile(new URL(import.meta.url), 'utf8');
await writeFile(resolve(out, 'controller.mjs'), sourceScript);
await writeFile(resolve(out, 'seed.json'), seed);
await writeFile(resolve(out, 'sources.json'), JSON.stringify(sources, null, 2));
const ids = JSON.parse(seed)
  .dashboards.default.widgets.filter((w) => w.enabled)
  .map((w) => w.id)
  .sort();
const widgetInputRequirements = await readWidgetInputRequirements();
const print = (data) => process.stdout.write(JSON.stringify(data) + '\n');
print({
  stage: 'controller',
  pid: process.pid,
  matrix,
  smoke,
  durationSeconds,
});
const hash = (data) => createHash('sha256').update(data).digest('hex');
const electron = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;
const results = [];
let restorationSafe = true;
const cancellation = new AbortController();
const activeConnections = new Set();
const requestStop = () => {
  cancellation.abort(new Error('Capture cancelled'));
  // Interrupt pending CDP requests (for example a surface capture) as well as
  // timers, so cancellation does not wait for their regular 60-second timeout.
  for (const connection of activeConnections) connection.ws.close();
};
process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);
const wait = (ms) => sleep(ms, undefined, { signal: cancellation.signal });
const copySources = async (variant) => {
  for (const source of sources) {
    const data = await readFile(resolve(sourceRoot, variant, source.file));
    assert.equal(
      hash(data),
      variant === 'baseline' ? source.beforeSha256 : source.afterSha256
    );
    await writeFile(source.file, data);
  }
};
const ensurePortsFree = async () => {
  for (const port of [9222, 9229]) {
    let reachable = false;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1000),
      });
      reachable = response.ok;
    } catch {
      /* Startup polling and best-effort cleanup may race process shutdown. */
    }
    if (reachable) throw new Error(`Port ${port} already occupied`);
  }
};
try {
  const phases = smoke
    ? [['smoke', 'candidate']]
    : [
        ['a1', 'baseline'],
        ['b1', 'candidate'],
        ['b2', 'candidate'],
        ['a2', 'baseline'],
      ];
  for (const [sequence, variant] of phases) {
    cancellation.signal.throwIfAborted();
    await ensurePortsFree();
    await copySources(variant);
    const runId = `${matrix}-${sequence}`;
    const folder = resolve(out, sequence);
    await mkdir(resolve(folder, 'profile'), { recursive: true });
    await writeFile(resolve(folder, 'profile/config.json'), seed);
    await writeFile(
      resolve(folder, 'source.diff'),
      execFileSync('git', ['diff'], { encoding: 'utf8' })
    );
    await writeFile(
      resolve(folder, 'manifest.json'),
      JSON.stringify(
        {
          runId,
          variant,
          source: execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
          }).trim(),
          sources,
          seedSha256: hash(seed),
          node: process.version,
          os: release(),
          cpu: cpus()[0]?.model,
          instrumentation:
            'Existing PERF_METRICS reporters; no tracing, sampler, React Profiler or heap profiler',
        },
        null,
        2
      )
    );
    const consoleFile = createWriteStream(resolve(folder, 'console.log'));
    let origin,
      topology,
      latest,
      buffer = '',
      exited = false,
      completedMarker = false;
    const child = spawn(
      'npm',
      [
        'start',
        '--',
        '--',
        '--remote-debugging-port=9222',
        '--inspect=127.0.0.1:9229',
      ],
      {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_OPTIONS: '',
          VSCODE_INSPECTOR_OPTIONS: '',
          IRDASHIES_SIM: 'iracing',
          IRDASHIES_TELEMETRY_REPLAY: resolve(
            'perf-results/ai-race-10min.irdt'
          ),
          IRDASHIES_TELEMETRY_REPLAY_LOOP: '0',
          IRDASHIES_TELEMETRY_REPLAY_SPEED: '1',
          PERF_METRICS: '1',
          PERF_TAPE_CONTROLS_HIDDEN: '1',
          PERF_RUN_ID: runId,
          PERF_SCENARIO: 'reconstructed-ten-widget-final',
          PERF_DURATION_SECONDS: String(durationSeconds),
          PERF_REPORT_INTERVAL_MS: '5000',
          PERF_USER_DATA_DIR: resolve(folder, 'profile'),
          PERF_LOG_PATH: resolve(folder, 'metrics.log'),
          PERF_REPLAY_VISIBLE_WIDGETS: '1',
          PERF_WIDGET_TYPES: ids.join(','),
          PERF_BUILD: `${sourceRevision.slice(0, 8)}-${variant}`,
          PERF_SCENARIO_METADATA: JSON.stringify({
            target: 'dev',
            simulatorMode: 'replay',
            fieldCount: 40,
            classCount: 3,
            requestedWidgetTypes: ids,
            widgetInputRequirements,
            channelDelivery: 'on',
            telemetryDelivery: 'on',
            telemetryPayload: 'allowlisted',
            replayVisibleWidgets: true,
            tapeControlsVisibility: 'hidden-fixed-at-creation',
          }),
        },
      }
    );
    const exit = new Promise((resolve) =>
      child.on('close', (code, signal) => {
        exited = true;
        resolve({ code, signal });
      })
    );
    child.on('error', (error) => {
      print({ runId, error: error.message });
    });
    const accept = (chunk) => {
      consoleFile.write(chunk);
      buffer += chunk.toString();
      for (;;) {
        const pos = buffer.indexOf('\n');
        if (pos < 0) break;
        const line = buffer.slice(0, pos);
        buffer = buffer.slice(pos + 1);
        if (line.includes(`Completed fixed ${durationSeconds}s capture`))
          completedMarker = true;
        for (const [marker, receive] of [
          [
            '[PerfRunOrigin:JSON] ',
            (value) => {
              origin = Date.parse(value.timestamp);
            },
          ],
          [
            '[PerfRunTopology:JSON] ',
            (value) => {
              topology = value;
            },
          ],
          [
            '[PerfMetrics:JSON] ',
            (value) => {
              latest = value;
            },
          ],
        ]) {
          const at = line.indexOf(marker);
          if (at >= 0) {
            try {
              receive(JSON.parse(line.slice(at + marker.length)));
            } catch {
              /* Startup polling and best-effort cleanup may race process shutdown. */
            }
          }
        }
      }
      if (buffer.length > 1_000_000) throw new Error('Unbounded console line');
    };
    child.stdout.on('data', accept);
    child.stderr.on('data', accept);
    const connections = [];
    let browserPid;
    let phaseError;
    let cleanupError;
    const privateSamples = [];
    let stopMemory = false;
    let sampler;
    try {
      for (let i = 0; i < 180 && !topology; i++) {
        if (exited) throw new Error('Early app exit');
        await wait(1000);
      }
      assert.ok(
        topology?.complete && !topology?.timedOut,
        'Incomplete topology'
      );
      assert.ok(origin, 'Missing capture origin');
      const inspectorTargets = await (
        await fetch('http://127.0.0.1:9229/json/list')
      ).json();
      const main = await CDP.connect(inspectorTargets[0].webSocketDebuggerUrl);
      connections.push(main);
      activeConnections.add(main);
      cancellation.signal.throwIfAborted();
      assert.equal(await main.evaluate('process.env.PERF_RUN_ID'), runId);
      browserPid = await main.evaluate('process.pid');
      assert.ok(Number.isInteger(browserPid) && browserPid > 1);
      // The explicit capture flag fixes bounds/visibility at creation, so
      // first-paint timing cannot change auxiliary startup state between runs.
      await wait(1000);
      const pages = await (
        await fetch('http://127.0.0.1:9222/json/list')
      ).json();
      const page = pages.find((p) => /:\d+\/$/.test(p.url));
      assert.ok(page, 'Missing overlay');
      const overlay = await CDP.connect(page.webSocketDebuggerUrl);
      connections.push(overlay);
      activeConnections.add(overlay);
      cancellation.signal.throwIfAborted();
      const inventory = await main.evaluate(
        `(async()=>({versions:process.versions,gpuFeatures:${electron}.app.getGPUFeatureStatus(),gpu:await ${electron}.app.getGPUInfo('basic'),displays:${electron}.screen.getAllDisplays().map(d=>({id:d.id,bounds:d.bounds,workArea:d.workArea,scaleFactor:d.scaleFactor,displayFrequency:d.displayFrequency}))}))()`
      );
      await writeFile(
        resolve(folder, 'environment.json'),
        JSON.stringify(inventory, null, 2)
      );
      sampler = (async () => {
        while (!stopMemory) {
          const processes = latest?.processes ?? [];
          const samples = await Promise.all(
            processes.map(async (p) => {
              try {
                const text = await readFile(
                  `/proc/${p.pid}/smaps_rollup`,
                  'utf8'
                );
                const kb = (key) =>
                  Number(
                    text.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? 0
                  );
                return {
                  pid: p.pid,
                  type: p.type,
                  creationTime: p.creationTime,
                  rssMB: kb('Rss') / 1024,
                  privateMB:
                    (kb('Private_Clean') +
                      kb('Private_Dirty') +
                      kb('Private_Hugetlb')) /
                    1024,
                  pssMB: kb('Pss') / 1024,
                };
              } catch (error) {
                return { pid: p.pid, unavailable: error.code ?? String(error) };
              }
            })
          );
          privateSamples.push({
            timestamp: new Date().toISOString(),
            processes: samples,
          });
          await sleep(10000);
        }
      })();
      await wait(Math.max(0, origin + 40000 - Date.now()));
      const screenshot = await overlay.call('Page.captureScreenshot', {
        format: 'png',
      });
      await writeFile(
        resolve(folder, 'warmup.png'),
        Buffer.from(screenshot.data, 'base64')
      );
      const windowsExpression = `${electron}.BrowserWindow.getAllWindows().map(w=>({id:w.id,pid:w.webContents.getOSProcessId(),url:w.webContents.getURL(),bounds:w.getBounds(),visible:w.isVisible()}))`;
      await wait(Math.max(0, origin + 55000 - Date.now()));
      const windows = await main.evaluate(windowsExpression);
      const ui = await overlay.evaluate(
        `(async()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visibility:document.visibilityState,status:await window.tapeReplayBridge.getStatus()}))()`
      );
      assert.equal(ui.visibility, 'visible');
      assert.equal(ui.status.speed, 1);
      assert.equal(ui.status.paused, false);
      assert.equal(ui.width, 1549);
      assert.equal(ui.height, 1014);
      assert.equal(ui.dpr, 1);
      assert.ok(
        windows
          .filter((w) => w.url.endsWith('#/tape-replay'))
          .every((w) => !w.visible)
      );
      const controls = windows.filter((w) => w.url.endsWith('#/tape-replay'));
      assert.equal(controls.length, 1);
      assert.deepEqual(controls[0].bounds, {
        x: 0,
        y: 0,
        width: 620,
        height: 104,
      });
      const startupControls = topology.windows.filter(
        (w) => w.role === 'other'
      );
      assert.equal(startupControls.length, 1);
      assert.equal(startupControls[0].visible, false);
      assert.deepEqual(startupControls[0].bounds, {
        x: 0,
        y: 0,
        width: 620,
        height: 104,
      });
      await writeFile(
        resolve(folder, 'preflight.json'),
        JSON.stringify({ origin, windows, ui }, null, 2)
      );
      print({
        stage: 'measuring',
        runId,
        variant,
        ui,
        privateSampling: 'Linux smaps_rollup every 10s',
      });
      let nextProgress = origin + 90000;
      while (!exited) {
        if (completedMarker) for (const c of connections) c.ws.close();
        if (Date.now() > origin + (durationSeconds + 30) * 1000)
          throw new Error('Capture shutdown deadline exceeded');
        if (Date.now() >= nextProgress) {
          print({
            stage: 'progress',
            runId,
            elapsedSeconds: Math.round((Date.now() - origin) / 1000),
            tickHz: latest?.tickRateHz,
          });
          nextProgress += 30000;
        }
        await wait(1000);
      }
      const status = await exit;
      assert.equal(status.code, 0, 'Capture failed');
      assert.ok(completedMarker, 'Missing fixed-duration completion marker');
      results.push({
        runId,
        sequence,
        variant,
        status,
        origin,
        preflight: { windows, ui },
      });
      await writeFile(
        resolve(out, 'runs.json'),
        JSON.stringify(results, null, 2)
      );
      print({ stage: 'complete', runId, status });
    } catch (error) {
      phaseError = error;
    } finally {
      stopMemory = true;
      for (const c of connections) {
        activeConnections.delete(c);
        c.ws.close();
      }
      if (!exited) {
        const stopped = await terminateCaptureChild({
          childPid: child.pid,
          browserPid,
          exit,
        });
        if (!stopped.terminated) {
          restorationSafe = false;
          cleanupError = new Error(
            `Capture child termination unverified: ${stopped.errors.join('; ')}`
          );
        }
      }
      if (sampler) await sampler;
      await writeFile(
        resolve(folder, 'linux-private-memory.json'),
        JSON.stringify(privateSamples, null, 2)
      );
      consoleFile.end();
    }
    if (cleanupError)
      throw new AggregateError(
        [phaseError, cleanupError].filter(Boolean),
        'Capture cleanup failed'
      );
    if (phaseError) throw phaseError;
    await wait(3000);
  }
} catch (error) {
  if (cancellation.signal.aborted) {
    await writeFile(
      resolve(out, 'cancelled.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          completedRuns: results.length,
          reason: 'Controller received SIGINT/SIGTERM',
          error: String(error),
          childTerminationVerified: restorationSafe,
        },
        null,
        2
      )
    );
    process.exitCode = restorationSafe ? 130 : 1;
  } else {
    throw error;
  }
} finally {
  if (restorationSafe) await copySources('candidate');
  else
    await writeFile(
      resolve(out, 'restoration-blocked.json'),
      JSON.stringify(
        {
          reason:
            'Capture child termination is unverified; do not rewrite source used by a potentially live child',
        },
        null,
        2
      )
    );
  process.removeListener('SIGINT', requestStop);
  process.removeListener('SIGTERM', requestStop);
  print({
    stage: 'matrix-ended',
    completedRuns: results.length,
    candidateRestored: restorationSafe,
  });
}
