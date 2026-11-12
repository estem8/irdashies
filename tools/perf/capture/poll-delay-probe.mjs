import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP } from './cdp-client.mjs';
const id = process.argv[2],
  mode = process.argv[3];
assert.match(id ?? '', /^[a-z0-9-]+$/);
assert.ok(['display', 'widget'].includes(mode));
const out = resolve('perf-results', id);
const child = spawn(
  process.execPath,
  ['tools/perf/capture/window-topology-probe.mjs', id, mode],
  { stdio: 'inherit' }
);
let exited = false,
  main;
const exit = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => {
    exited = true;
    resolve(code);
  });
});
const records = [];
const cancel = () => {
  child.kill('SIGTERM');
  main?.ws.close();
};
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
try {
  let observed;
  for (let i = 0; i < 180 && !observed; i++) {
    assert.equal(exited, false, 'Controller ended early');
    try {
      observed = JSON.parse(
        await readFile(resolve(out, 'observed.json'), 'utf8')
      );
    } catch {
      await sleep(1000);
    }
  }
  assert.ok(observed);
  const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  main = await CDP.connect(targets[0].webSocketDebuggerUrl);
  assert.equal(await main.evaluate('process.env.PERF_RUN_ID'), id);
  const electron = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;
  const sourceStatus = () =>
    main.evaluate(
      `(async()=>{const e=${electron};const w=e.BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().endsWith('#/tape-replay'));return {sourceKind:process.env.PERF_SOURCE_KIND,displays:e.screen.getAllDisplays().map(d=>({bounds:d.bounds,workArea:d.workArea,scaleFactor:d.scaleFactor,displayFrequency:d.displayFrequency})),status:await w.webContents.executeJavaScript('window.tapeReplayBridge.getStatus()')}})()`
    );
  const sourceBefore = await sourceStatus();
  assert.equal(sourceBefore.sourceKind, 'tape');
  assert.equal(sourceBefore.status.speed, 1);
  assert.equal(sourceBefore.status.paused, false);
  await main.evaluate(`(()=>{
    const original=globalThis.setTimeout;const cache=new WeakMap();const p={items:[],overflow:0,overlaps:0,sites:[],enabled:true};
    const instrumented=function(callback,ms,...args){
      if(typeof callback!=='function'||callback.name!=='finishDelay'||typeof ms!=='number'||args.length!==0||ms>40)return Reflect.apply(original,this,[callback,ms,...args]);
      let entry=cache.get(callback);
      if(!entry){const stack=new Error().stack;if(!stack.includes('iracingSdkBridge'))return Reflect.apply(original,this,[callback,ms]);
        entry={scheduled:0,planned:0,pending:false};
        entry.wrapped=function(){const actual=performance.now()-entry.scheduled;entry.pending=false;
          if(p.enabled){if(p.items.length<2048)p.items.push({at:performance.now(),planned:entry.planned,actual});else p.overflow++}
          return callback.call(this)};
        cache.set(callback,entry);if(p.sites.length<4)p.sites.push(stack);
      }
      if(entry.pending)p.overlaps++;
      entry.scheduled=performance.now();entry.planned=ms;entry.pending=true;
      return Reflect.apply(original,this,[entry.wrapped,ms]);
    };
    globalThis.setTimeout=instrumented;
    p.read=()=>({at:performance.now(),overflow:p.overflow,overlaps:p.overlaps,sites:[...p.sites],items:p.items.splice(0)});
    p.stop=()=>{p.enabled=false;if(globalThis.setTimeout===instrumented)globalThis.setTimeout=original};
    globalThis.__perfPollDelay=p;return true;
  })()`);
  for (let i = 0; i < 10; i++) {
    await sleep(10000);
    assert.equal(exited, false, 'Diagnostic ended early');
    const record = await main.evaluate('globalThis.__perfPollDelay.read()');
    assert.equal(record.overflow, 0, 'Lost timer samples');
    assert.equal(record.overlaps, 0, 'Unexpected overlapping SDK delay');
    assert.ok(record.items.length >= 200, 'SDK delay was not exercised');
    assert.ok(
      record.items.every(
        (v) => v.actual >= 0 && v.planned >= 0 && v.planned <= 40
      )
    );
    records.push(record);
    await writeFile(
      resolve(out, 'poll-delay-progress.json'),
      JSON.stringify(records, null, 2)
    );
  }
  await main.evaluate('globalThis.__perfPollDelay.stop()');
  const sourceAfter = await sourceStatus();
  assert.ok(
    sourceAfter.status.position - sourceBefore.status.position >= 95 &&
      sourceAfter.status.position - sourceBefore.status.position < 110
  );
  assert.equal(sourceAfter.status.paused, false);
  await writeFile(
    resolve(out, 'poll-delay.json'),
    JSON.stringify(
      {
        scope:
          'Bounded Inspector wrapper around existing SDK finishDelay timers; preserves timeout handles/callback behavior. Adds sampling overhead; not CPU acceptance.',
        mode,
        sourceBefore,
        sourceAfter,
        records,
      },
      null,
      2
    )
  );
  main.ws.close();
  main = undefined;
  assert.equal(await exit, 0);
} catch (error) {
  await writeFile(
    resolve(out, 'poll-delay-failed.json'),
    JSON.stringify({ error: String(error), records }, null, 2)
  );
  throw error;
} finally {
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
  try {
    await main?.evaluate('globalThis.__perfPollDelay?.stop()');
  } catch {
    /* Process cleanup owns remaining timers. */
  }
  main?.ws.close();
  if (!exited) {
    child.kill('SIGTERM');
    await exit;
  }
}
