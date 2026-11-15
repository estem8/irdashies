import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { CDP } from './cdp-client.mjs';

const runId = process.argv[2];
assert.match(runId ?? '', /^[a-z0-9-]+$/);
const out = resolve('perf-results', runId, 'probe');
const controller = spawn(
  process.execPath,
  ['tools/perf/capture/long-matrix.mjs', runId, 'probe'],
  { stdio: 'inherit', env: { ...process.env, PERF_GANTRY_DIAGNOSTIC: '1' } }
);
let exited = false;
const exit = new Promise((resolve, reject) => {
  controller.once('error', reject);
  controller.once('close', (code) => {
    exited = true;
    resolve(code);
  });
});
const electron = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;
const gantryWindow = `${electron}.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#/gantry'))`;
let main, overlay, gantry;
const records = [];
const poll = async (fn, attempts = 30) => {
  for (let i = 0; i < attempts; i++) {
    assert.equal(exited, false, 'Capture ended early');
    const value = await fn();
    if (value) return value;
    await sleep(500);
  }
  throw new Error('Gantry probe readiness timeout');
};
const disableGantry = async () => {
  if (overlay)
    await overlay.evaluate(
      `(async()=>{const profile=await window.dashboardBridge.getCurrentProfile();const dashboard=await window.dashboardBridge.getDashboardForProfile(profile.id);if(!dashboard)throw new Error('No dashboard');window.dashboardBridge.saveDashboard({...dashboard,widgets:dashboard.widgets.map(w=>w.id==='gantry'?{...w,enabled:false}:w)});return true})()`
    );
};
try {
  await poll(async () => {
    try {
      await readFile(resolve(out, 'preflight.json'));
      return true;
    } catch {
      return false;
    }
  }, 360);
  const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  main = await CDP.connect(targets[0].webSocketDebuggerUrl);
  assert.equal(
    await main.evaluate('process.env.PERF_RUN_ID'),
    runId + '-probe'
  );
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = pages.find((p) => p.type === 'page' && /:\d+\/$/.test(p.url));
  assert.ok(page, 'Missing isolated overlay');
  overlay = await CDP.connect(page.webSocketDebuggerUrl);
  await overlay.evaluate(
    `(async()=>{const profile=await window.dashboardBridge.getCurrentProfile();const dashboard=await window.dashboardBridge.getDashboardForProfile(profile.id);if(!dashboard?.widgets.find(w=>w.id==='gantry')?.enabled)throw new Error('Gantry diagnostic seed not active');return true})()`
  );
  const windowState = () =>
    main.evaluate(
      `(()=>{const w=${gantryWindow};return w?{id:w.id,pid:w.webContents.getOSProcessId(),visible:w.isVisible(),destroyed:w.isDestroyed(),bounds:w.getBounds(),backgroundThrottling:w.webContents.getBackgroundThrottling()}:null})()`
    );
  const created = await poll(async () => {
    const value = await windowState();
    return value?.pid > 1 && value.visible ? value : null;
  });
  const gantryPage = await poll(async () => {
    const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
    return list.find((p) => p.type === 'page' && p.url.endsWith('#/gantry'));
  });
  gantry = await CDP.connect(gantryPage.webSocketDebuggerUrl);
  await gantry.evaluate(
    `(async()=>{const {getChannelSnapshotStore}=await import('/src/frontend/context/ChannelStore/ChannelSnapshotStore.ts');const {useSessionStore}=await import('/src/frontend/context/SessionStore/SessionStore.tsx');window.__perfGantryRead=()=>{const track=getChannelSnapshotStore('track-state.snapshot',window.channelBridge).snapshot;const history=getChannelSnapshotStore('lap-history.snapshot',window.channelBridge).snapshot;const session=useSessionStore.getState().session;return {track:track?{version:track.version,sessionTime:track.sessionTime,slots:track.carIdxLapDistPct.length}:null,history:history?{version:history.version,totalCrossings:history.count.reduce((n,c)=>n+c,0),carsWithCrossings:history.count.filter(c=>c>0).length,sessionNum:history.sessionNum}:null,sessionPresent:!!session,sessionCount:session?.SessionInfo?.Sessions?.length??0}};return true})()`
  );
  await poll(async () => {
    const value = await gantry.evaluate('window.__perfGantryRead()');
    return value.track && value.history && value.sessionPresent;
  });
  const record = async (label) => {
    const value = {
      label,
      at: new Date().toISOString(),
      window: await windowState(),
      data: await gantry.evaluate('window.__perfGantryRead()'),
    };
    assert.equal(value.window?.id, created.id, 'Gantry window changed');
    assert.equal(value.window?.pid, created.pid, 'Gantry renderer changed');
    assert.equal(value.window?.backgroundThrottling, false);
    records.push(value);
    return value;
  };
  const before = await record('visible-before-close');
  assert.equal(before.window.visible, true);
  await main.evaluate(`${gantryWindow}.close()`);
  await sleep(1000);
  const hiddenStart = await record('closed-to-tray-start');
  assert.equal(hiddenStart.window.visible, false);
  assert.equal(hiddenStart.window.destroyed, false);
  await sleep(20000);
  const hidden20 = await record('closed-to-tray-20s');
  assert.equal(hidden20.window.visible, false);
  assert.ok(
    hidden20.data.track.version > hiddenStart.data.track.version,
    'Hidden Gantry track data stopped'
  );
  assert.ok(
    hidden20.data.track.sessionTime > hiddenStart.data.track.sessionTime,
    'Hidden Gantry time stopped'
  );
  await sleep(160000);
  const hiddenEnd = await record('closed-to-tray-180s');
  assert.equal(hiddenEnd.window.visible, false);
  assert.ok(
    hiddenEnd.data.track.version > hidden20.data.track.version,
    'Hidden Gantry stopped receiving'
  );
  assert.ok(
    hiddenEnd.data.history.version > hiddenStart.data.history.version,
    'Lap history was not exercised while hidden'
  );
  assert.ok(
    hiddenEnd.data.history.totalCrossings >
      hiddenStart.data.history.totalCrossings,
    'No new lap crossings exercised during hidden interval'
  );
  assert.equal(hiddenEnd.data.sessionPresent, true);
  assert.equal(
    hiddenEnd.data.history.sessionNum,
    hiddenStart.data.history.sessionNum,
    'Session changed during history probe'
  );
  assert.equal(
    hiddenEnd.data.sessionCount,
    before.data.sessionCount,
    'Session names lost while hidden'
  );
  await main.evaluate(`${gantryWindow}.showInactive()`);
  await sleep(2000);
  const shown = await record('shown');
  assert.equal(shown.window.visible, true);
  assert.ok(
    shown.data.history.totalCrossings >= hiddenEnd.data.history.totalCrossings,
    'Gantry lost retained history'
  );
  gantry.ws.close();
  gantry = undefined;
  await disableGantry();
  await poll(async () => !(await windowState()));
  await writeFile(
    resolve(out, 'gantry.json'),
    JSON.stringify(
      {
        scope:
          'Isolated Linux tape runtime diagnostic; hidden Gantry live snapshots/history retention, not CPU acceptance or full incident/event coverage',
        passed: true,
        created,
        records,
        disabledWindowDestroyed: true,
      },
      null,
      2
    ) + '\n'
  );
  process.stdout.write(
    JSON.stringify({ stage: 'gantry-passed', runId, records: records.length }) +
      '\n'
  );
  overlay.ws.close();
  overlay = undefined;
  main.ws.close();
  main = undefined;
  assert.equal(await exit, 0, 'Capture controller failed');
} catch (error) {
  await mkdir(out, { recursive: true });
  await writeFile(
    resolve(out, 'gantry-failed.json'),
    JSON.stringify({ error: String(error), records }, null, 2) + '\n'
  );
  throw error;
} finally {
  if (!exited)
    try {
      await disableGantry();
    } catch {
      /* Isolated process may already be shutting down. */
    }
  gantry?.ws.close();
  overlay?.ws.close();
  main?.ws.close();
  if (!exited) {
    controller.kill('SIGTERM');
    await exit;
  }
}
