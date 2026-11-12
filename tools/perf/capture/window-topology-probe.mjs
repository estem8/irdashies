import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { CDP } from './cdp-client.mjs';
import { createCaptureClock } from './capture-clock.mjs';
import { terminateCaptureChild } from './terminateCaptureChild.mjs';
const id = process.argv[2],
  mode = process.argv[3];
assert.match(id ?? '', /^[a-z0-9-]+$/);
assert.ok(['display', 'widget'].includes(mode));
for (const port of [9222, 9229]) {
  let occupied = false;
  try {
    await fetch(`http://127.0.0.1:${port}/json/list`);
    occupied = true;
  } catch {
    /* No inspector listening. */
  }
  assert.equal(occupied, false, `Inspector port ${port} already occupied`);
}
const out = resolve('perf-results', id);
await mkdir(out);
const seed = await readFile(
  new URL('../fixtures/reconstructed-ten-widget.json', import.meta.url),
  'utf8'
);
const dashboard = JSON.parse(seed).dashboards.default;
const ids = dashboard.widgets
  .filter((w) => w.enabled)
  .map((w) => w.id)
  .sort();
await mkdir(resolve(out, 'profile'));
await writeFile(resolve(out, 'profile/config.json'), seed);
const source = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const clock = createCaptureClock();
const log = createWriteStream(resolve(out, 'console.log'));
let buffer = '',
  origin,
  topology,
  complete = false,
  exited = false,
  main;
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
      IRDASHIES_TELEMETRY_REPLAY: resolve('perf-results/ai-race-10min.irdt'),
      IRDASHIES_TELEMETRY_REPLAY_LOOP: '0',
      IRDASHIES_TELEMETRY_REPLAY_SPEED: '1',
      PERF_METRICS: '1',
      PERF_METRICS_COLLECTION: 'on',
      PERF_RUNTIME_TOPOLOGY_TIMEOUT_MS: '30000',
      PERF_WINDOW_MODE: mode,
      PERF_OVERLAY_MODE: 'full',
      PERF_WIDGET_TYPES: ids.join(','),
      PERF_REPLAY_VISIBLE_WIDGETS: '1',
      PERF_TAPE_CONTROLS_HIDDEN: '1',
      PERF_CHANNEL_DELIVERY: 'on',
      PERF_TELEMETRY_DELIVERY: 'on',
      PERF_TELEMETRY_PAYLOAD: 'allowlisted',
      PERF_VISIBILITY_PHASES: '',
      PERF_HEAP_PROFILE_PATH: '',
      PERF_DURATION_SECONDS: '180',
      PERF_REPORT_INTERVAL_MS: '5000',
      PERF_RUN_ID: id,
      PERF_BUILD: source.slice(0, 8),
      PERF_SCENARIO: 'window-topology-readiness',
      PERF_USER_DATA_DIR: resolve(out, 'profile'),
      PERF_LOG_PATH: resolve(out, 'metrics.log'),
    },
  }
);
const exit = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code, signal) => {
    exited = true;
    resolve({ code, signal });
  });
});
const accept = (chunk) => {
  log.write(chunk);
  buffer += chunk.toString();
  for (;;) {
    const i = buffer.indexOf('\n');
    if (i < 0) break;
    const line = buffer.slice(0, i);
    buffer = buffer.slice(i + 1);
    if (line.includes('Completed fixed 180s capture')) complete = true;
    for (const [marker, set] of [
      ['[PerfRunOrigin:JSON] ', (v) => (origin = v)],
      ['[PerfRunTopology:JSON] ', (v) => (topology = v)],
    ]) {
      const at = line.indexOf(marker);
      if (at >= 0)
        try {
          set(JSON.parse(line.slice(at + marker.length)));
        } catch {
          /* Other log lines are not structured markers. */
        }
    }
  }
};
child.stdout.on('data', accept);
child.stderr.on('data', accept);
let cancelled = false;
const cancel = () => {
  cancelled = true;
  main?.ws.close();
};
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
try {
  for (let i = 0; i < 180 && !topology; i++) {
    clock.read();
    assert.equal(cancelled, false, 'Capture cancelled');
    assert.equal(exited, false, 'Exited before topology');
    await sleep(1000);
  }
  assert.ok(topology?.complete, 'Incomplete startup topology');
  assert.equal(topology.runId, id);
  assert.equal(origin?.runId, id);
  const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  main = await CDP.connect(targets[0].webSocketDebuggerUrl);
  assert.equal(await main.evaluate('process.env.PERF_RUN_ID'), id);
  const elapsed = clock.fromWallTimestamp(Date.parse(origin.timestamp));
  while (clock.read().monotonicMs < elapsed + 55000) {
    assert.equal(cancelled, false, 'Capture cancelled');
    assert.equal(exited, false);
    await sleep(500);
  }
  const electron = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;
  const dom = `(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,widgets:[...document.querySelectorAll('[data-widget-id]')].map(e=>{const r=e.getBoundingClientRect();return {id:e.getAttribute('data-widget-id'),x:r.x,y:r.y,width:r.width,height:r.height}})}))()`;
  const snapshot = await main.evaluate(
    `(async()=>({displays:${electron}.screen.getAllDisplays().map(d=>({bounds:d.bounds,workArea:d.workArea,scaleFactor:d.scaleFactor})),windows:await Promise.all(${electron}.BrowserWindow.getAllWindows().map(async w=>({id:w.id,pid:w.webContents.getOSProcessId(),title:w.getTitle(),url:w.webContents.getURL(),bounds:w.getBounds(),visible:w.isVisible(),backgroundThrottling:w.webContents.getBackgroundThrottling(),dom:await w.webContents.executeJavaScript(${JSON.stringify(dom)})})))}))()`
  );
  const overlays = snapshot.windows.filter(
    (w) => !w.url.endsWith('#/tape-replay')
  );
  assert.equal(
    overlays.length,
    mode === 'display' ? 1 : ids.length,
    'Unexpected overlay window count'
  );
  assert.deepEqual(
    overlays.flatMap((w) => w.dom.widgets.map((w) => w.id)).sort(),
    ids,
    'Rendered instance set differs'
  );
  for (const w of overlays) {
    assert.equal(w.visible, true);
    assert.equal(w.dom.dpr, 1);
    assert.equal(w.backgroundThrottling, false);
  }
  const result = {
    scope:
      'Linux window topology readiness and rendered geometry only; no CPU acceptance',
    source,
    mode,
    seedSha256: createHash('sha256').update(seed).digest('hex'),
    topology,
    snapshot,
  };
  await writeFile(
    resolve(out, 'observed.json'),
    JSON.stringify(result, null, 2) + '\n'
  );
  process.stdout.write(
    JSON.stringify({
      stage: 'topology-observed',
      id,
      mode,
      overlays: overlays.length,
    }) + '\n'
  );
  main.ws.close();
  main = undefined;
  const deadline = elapsed + 210000;
  while (!exited && clock.read().monotonicMs < deadline) {
    assert.equal(cancelled, false, 'Capture cancelled');
    await sleep(1000);
  }
  assert.ok(exited, 'Fixed duration did not exit');
  const status = await exit;
  assert.equal(status.code, 0);
  assert.ok(complete, 'No fixed-duration marker');
  await writeFile(
    resolve(out, 'result.json'),
    JSON.stringify({ ...result, status, completedMarker: complete }, null, 2) +
      '\n'
  );
} catch (error) {
  await writeFile(
    resolve(out, 'failed.json'),
    JSON.stringify({ error: String(error), origin, topology }, null, 2) + '\n'
  );
  throw error;
} finally {
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
  main?.ws.close();
  if (!exited) {
    const stopped = await terminateCaptureChild({
      childPid: child.pid,
      browserPid: origin?.browserPid,
      exit,
    });
    assert.ok(stopped.terminated, 'Child termination not verified');
  }
  log.end();
}
