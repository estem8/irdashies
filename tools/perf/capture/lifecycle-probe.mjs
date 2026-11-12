import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { CDP } from './cdp-client.mjs';

const runId = process.argv[2];
const lapTraceProbe = process.argv[3] === 'hidden-laptrace';
const hiddenProbe = process.argv[3] === 'hidden' || lapTraceProbe;
assert.ok(
  !process.argv[3] || hiddenProbe,
  'Expected optional hidden or hidden-laptrace mode'
);
const mode = hiddenProbe ? 'probe' : 'smoke';
assert.match(runId ?? '', /^[a-z0-9-]+$/);
const out = resolve('perf-results', runId, mode);
const controller = spawn(
  process.execPath,
  ['tools/perf/capture/long-matrix.mjs', runId, mode],
  { stdio: 'inherit' }
);
let exited = false;
const exit = new Promise((resolve, reject) => {
  controller.once('error', reject);
  controller.once('close', (code) => {
    exited = true;
    resolve(code);
  });
});
let main, overlay;
const records = [];
const electron = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;
const windowExpression = `${electron}.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith(':5173/'))`;
try {
  let ready = false;
  for (let i = 0; i < 180; i++) {
    assert.equal(exited, false, 'Controller exited before preflight');
    try {
      await readFile(resolve(out, 'preflight.json'));
      ready = true;
      break;
    } catch {
      /* Preflight not yet written. */
    }
    await sleep(1000);
  }
  assert.ok(ready, 'Missing preflight');
  const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  main = await CDP.connect(targets[0].webSocketDebuggerUrl);
  assert.equal(
    await main.evaluate('process.env.PERF_RUN_ID'),
    runId + '-' + mode
  );
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = pages.find((p) => p.type === 'page' && /:\d+\/$/.test(p.url));
  assert.ok(page, 'Missing overlay page');
  overlay = await CDP.connect(page.webSocketDebuggerUrl);
  await overlay.evaluate(
    `(()=>{const p={updates:0,track:null,events:[]};p.stopTrack=window.channelBridge.subscribe('track-state.snapshot',s=>{p.updates++;p.track={sessionTime:s.sessionTime,version:s.version,cars:s.carIdxLapDistPct.length,focus:s.focusCarIdx}});p.stopEvents=window.channelBridge.subscribe('session.lifecycle',e=>p.events.push(e));window.__perfLifecycle=p;return true})()`
  );
  if (hiddenProbe)
    await overlay.evaluate(
      `(async()=>{const {perfMetrics}=await import('/src/frontend/utils/perfMetrics.ts');const p=window.__perfLifecycle;const original=perfMetrics.measure;p.draws={};perfMetrics.measure=function(name,measured,breakdown){p.draws[name]=(p.draws[name]??0)+1;if(breakdown)p.draws[breakdown]=(p.draws[breakdown]??0)+1;return original.call(this,name,measured,breakdown)};p.stopDraws=()=>{perfMetrics.measure=original};return true})()`
    );
  const record = async (label) => {
    const value = await overlay.evaluate(
      `(async()=>({status:await window.tapeReplayBridge.getStatus(),visibility:document.visibilityState,updates:window.__perfLifecycle.updates,track:window.__perfLifecycle.track,events:window.__perfLifecycle.events,draws:{...window.__perfLifecycle.draws},rootTextLength:document.getElementById('app')?.textContent?.length??0}))()`
    );
    value.window = await main.evaluate(
      `(()=>{const w=${windowExpression};return {visible:w.isVisible(),backgroundThrottling:w.webContents.getLastWebPreferences().backgroundThrottling}})()`
    );
    records.push({ label, at: new Date().toISOString(), ...value });
    return value;
  };
  const command = (command) =>
    overlay.evaluate(
      `window.tapeReplayBridge.command(${JSON.stringify(command)})`
    );
  await sleep(1000);
  const before = await record('before');
  assert.ok(before.track?.cars > 10, 'Missing full field');
  await command({ type: 'seek', seconds: 300 });
  await sleep(2000);
  const forward = await record('seek-forward');
  assert.ok(forward.status.position >= 300 && forward.status.position < 305);
  assert.ok(
    forward.track.sessionTime > before.track.sessionTime + 200,
    'Track-state did not follow forward seek'
  );
  await command({ type: 'seek', seconds: 30 });
  await sleep(2000);
  const backward = await record('seek-backward');
  assert.ok(backward.status.position >= 30 && backward.status.position < 35);
  assert.ok(
    backward.track.sessionTime < forward.track.sessionTime - 200,
    'Track-state did not follow backward seek'
  );
  assert.deepEqual(
    backward.events.map((event) => event.type),
    ['disconnect', 'enter', 'disconnect', 'enter']
  );
  await command({ type: 'pause', paused: true });
  const paused = await record('pause-start');
  await sleep(2000);
  const still = await record('pause-end');
  assert.equal(still.status.paused, true);
  assert.ok(Math.abs(still.status.position - paused.status.position) < 0.1);
  await command({ type: 'pause', paused: false });
  await sleep(2000);
  const resumed = await record('resumed');
  assert.ok(resumed.status.position > still.status.position + 1);
  let injectedReference;
  if (lapTraceProbe) {
    injectedReference = await overlay.evaluate(`(async()=>{
      const {useLapTraceStore}=await import('/src/frontend/context/LapTraceStore/LapTraceStore.tsx');
      const {makeSyntheticLapTrace}=await import('/src/frontend/domain/lapTrace/syntheticLap.ts');
      const {hydrateLapTrace}=await import('/src/frontend/domain/lapTrace/hydrateLapTrace.ts');
      const state=useLapTraceStore.getState();
      if(!(state.trackLengthM>0)||!(state.trackId>0)||!state.carPath)throw new Error('Lap Trace store is not initialized');
      const original={referenceLap:state.referenceLap,referenceError:state.referenceError};
      const record=makeSyntheticLapTrace({trackLengthM:state.trackLengthM,trackId:state.trackId,carPath:state.carPath});
      record.source.label='Diagnostic synthetic reference';
      useLapTraceStore.setState({referenceLap:hydrateLapTrace(record),referenceError:null});
      window.__perfLifecycle.restoreReference=()=>useLapTraceStore.setState(original);
      return {trackId:record.trackId,carPath:record.carPath,trackLengthM:record.trackLengthM,samples:record.samples.length,source:'synthetic diagnostic only'};
    })()`);
    await sleep(2000);
    const seeded = await record('synthetic-reference-active');
    for (const measure of ['lapTraceFrame', 'lapTraceBrakeCue'])
      assert.ok(
        (seeded.draws[measure] ?? 0) - (resumed.draws[measure] ?? 0) > 1,
        'Unexercised ' + measure + ' before hide'
      );
    const screenshot = await overlay.call('Page.captureScreenshot', {
      format: 'png',
    });
    await writeFile(
      resolve(out, 'laptrace-active.png'),
      Buffer.from(screenshot.data, 'base64')
    );
  }
  await main.evaluate(`${windowExpression}.hide()`);
  await sleep(1000);
  const hiddenStart = await record('hidden-start');
  // Long enough to contain complete 5-second renderer metric intervals.
  // Native window visibility is authoritative; Page Visibility remains visible
  // with backgroundThrottling disabled. Inspect existing draw counters afterward.
  await sleep(hiddenProbe ? 20000 : 3000);
  const hiddenEnd = await record('hidden-end');
  assert.equal(hiddenStart.window.visible, false);
  assert.equal(hiddenEnd.window.visible, false);
  assert.ok(
    hiddenEnd.updates - hiddenStart.updates <= 1,
    'Hidden snapshot stream still active'
  );
  await main.evaluate(`${windowExpression}.showInactive()`);
  await sleep(2000);
  const shown = await record('shown');
  assert.equal(shown.window.visible, true);
  assert.equal(shown.visibility, 'visible');
  assert.ok(
    shown.updates > hiddenEnd.updates &&
      shown.track.sessionTime > hiddenEnd.track.sessionTime,
    'Snapshots did not resume after show'
  );
  assert.ok(shown.rootTextLength > 100, 'Overlay content disappeared');
  if (lapTraceProbe)
    for (const measure of ['lapTraceFrame', 'lapTraceBrakeCue']) {
      assert.equal(
        hiddenEnd.draws[measure],
        hiddenStart.draws[measure],
        measure + ' kept drawing while hidden'
      );
      assert.ok(
        shown.draws[measure] > hiddenEnd.draws[measure],
        measure + ' did not repaint after show'
      );
    }

  if (hiddenProbe) {
    assert.ok(before.draws.radarFrame > 0, 'Draw observer not connected');
    assert.ok(
      shown.draws.radarFrame > hiddenEnd.draws.radarFrame,
      'Radar did not repaint after show'
    );
  }
  await writeFile(
    resolve(out, 'lifecycle.json'),
    JSON.stringify(
      {
        scope:
          'Runtime smoke with diagnostic observers; not CPU acceptance or real simulator reconnect',
        hiddenProbe,
        lapTraceProbe,
        injectedReference,
        passed: true,
        records,
      },
      null,
      2
    ) + '\n'
  );
  process.stdout.write(
    JSON.stringify({
      stage: 'lifecycle-passed',
      runId,
      records: records.length,
    }) + '\n'
  );
  await overlay.evaluate(
    `(()=>{window.__perfLifecycle.stopDraws?.();window.__perfLifecycle.restoreReference?.();window.__perfLifecycle.stopTrack();window.__perfLifecycle.stopEvents();delete window.__perfLifecycle;return true})()`
  );
  overlay.ws.close();
  overlay = undefined;
  main.ws.close();
  main = undefined;
  assert.equal(await exit, 0, 'Capture controller failed');
} catch (error) {
  await writeFile(
    resolve(out, 'lifecycle-failed.json'),
    JSON.stringify({ error: String(error), records }, null, 2) + '\n'
  );
  throw error;
} finally {
  if (main && !exited) {
    try {
      await main.evaluate(`${windowExpression}?.showInactive()`);
    } catch {
      /* App may be shutting down. */
    }
  }
  overlay?.ws.close();
  main?.ws.close();
  if (!exited) {
    controller.kill('SIGTERM');
    await exit;
  }
}
