import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP } from './cdp-client.mjs';

const id = process.argv[2];
assert.match(id ?? '', /^[a-z0-9-]+$/);
const nativeOnly = ['native', 'native-baseline'].includes(process.argv[3]);
const expectedBaseline = process.argv[3] === 'native-baseline';
assert.ok(!process.argv[3] || nativeOnly);
const out = resolve('perf-results', id);
const child = spawn(
  process.execPath,
  [
    'tools/perf/capture/window-topology-probe.mjs',
    id,
    'display',
    ...(nativeOnly ? ['short'] : []),
  ],
  { stdio: 'inherit' }
);
let exited = false;
const exit = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => {
    exited = true;
    resolve(code);
  });
});
let main, overlay;
const observations = [];
const cancel = () => {
  child.kill('SIGTERM');
  overlay?.ws.close();
  main?.ws.close();
};
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
const electron = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;
const nativeWindow = `${electron}.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().match(/:\\d+\\/$/))`;
const poll = async (fn) => {
  for (let i = 0; i < 180; i++) {
    assert.equal(exited, false, 'Controller ended early');
    const result = await fn();
    if (result) return result;
    await sleep(1000);
  }
  throw new Error('Diagnostic readiness timeout');
};
try {
  await poll(async () => {
    try {
      await readFile(resolve(out, 'observed.json'));
      return true;
    } catch {
      return false;
    }
  });
  const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  main = await CDP.connect(targets[0].webSocketDebuggerUrl);
  assert.equal(await main.evaluate('process.env.PERF_RUN_ID'), id);
  assert.equal(
    await main.evaluate('process.env.PERF_USER_DATA_DIR'),
    resolve(out, 'profile')
  );
  assert.equal(
    await main.evaluate(`${electron}.app.getPath('userData')`),
    resolve(out, 'profile')
  );
  await main.evaluate(
    `(()=>{const w=${nativeWindow};const p={events:[],methods:{},listeners:{}};const record=(kind,name)=>{if(p.events.length<64)p.events.push({at:Date.now(),kind,name,visible:w.isVisible(),minimized:w.isMinimized(),stack:kind==='method'?new Error().stack:undefined})};for(const name of ['show','showInactive','restore','setBounds']){const original=w[name];p.methods[name]=original;w[name]=function(...args){record('method',name);return Reflect.apply(original,this,args)}}for(const name of ['show','hide','minimize','restore']){const fn=()=>record('event',name);p.listeners[name]=fn;w.on(name,fn)}p.stop=()=>{for(const [name,original] of Object.entries(p.methods))w[name]=original;for(const [name,fn] of Object.entries(p.listeners))w.removeListener(name,fn)};w.__perfNativeVisibility=p;return true})()`
  );
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  overlay = await CDP.connect(
    pages.find((p) => /:\d+\/$/.test(p.url)).webSocketDebuggerUrl
  );
  await overlay.evaluate(`(async()=>{
    const {perfMetrics}=await import('/src/frontend/utils/perfMetrics.ts');
    const original=perfMetrics.measure;
    const p={seed:await window.dashboardBridge.getDashboardForProfile('default'),draws:{},frames:[],handle:0};
    perfMetrics.measure=function(name,fn,breakdown){p.draws[name]=(p.draws[name]??0)+1;if(breakdown)p.draws[breakdown]=(p.draws[breakdown]??0)+1;return original.call(this,name,fn,breakdown)};
    p.reset=()=>window.dashboardBridge.saveDashboard(p.seed,{skipWindowRefresh:true});p.restore=()=>{cancelAnimationFrame(p.handle);perfMetrics.measure=original;p.reset()};
    p.observe=()=>{cancelAnimationFrame(p.handle);p.frames=[];const frame=()=>{
      const c=document.querySelector('[data-widget-id="map"] canvas');
      if(c){const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let populated=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]){populated=true;break}
      p.frames.push({at:performance.now(),width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,dpr:devicePixelRatio,populated});}
      if(p.frames.length<90)p.handle=requestAnimationFrame(frame);
    };p.handle=requestAnimationFrame(frame)};
    if(!p.seed)throw new Error('Missing isolated dashboard seed');window.__perfDrawing=p;return true;
  })()`);
  const record = async (label) => {
    const value = await overlay.evaluate(
      `(()=>{const p=window.__perfDrawing;const c=document.querySelector('[data-widget-id="map"] canvas');return {draws:{...p.draws},frames:[...p.frames],canvas:c?{width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}:null,dpr:devicePixelRatio,scale:document.querySelector('[data-widget-id="map"] [data-widget-scale]')?.getAttribute('data-widget-scale')}})()`
    );
    value.native = await main.evaluate(
      `(()=>{const w=${nativeWindow};return {visible:w.isVisible(),minimized:w.isMinimized(),bounds:w.getBounds(),events:[...w.__perfNativeVisibility.events]}})()`
    );
    observations.push({ label, monotonicMs: performance.now(), ...value });
    await writeFile(
      resolve(out, 'drawing-progress.json'),
      JSON.stringify(observations, null, 2)
    );
    return value;
  };
  await sleep(2000);
  const moving = await record('moving');
  assert.ok(moving.draws.trackMapRafDraw > 0 && moving.draws.radarFrame > 0);
  if (!nativeOnly) {
    await overlay.evaluate(
      `window.tapeReplayBridge.command({type:'pause',paused:true})`
    );
    await sleep(2000);
    const settled = await record('paused-settled');
    await sleep(1000);
    const idle = await record('paused-idle');
    assert.equal(
      idle.draws.trackMapRafDraw,
      settled.draws.trackMapRafDraw,
      'Map interpolation did not settle'
    );
    const transition = async (label, expression) => {
      await overlay.evaluate('window.__perfDrawing.observe()');
      await overlay.evaluate(expression);
      await sleep(1800);
      const value = await record(label);
      assert.ok(value.frames.length >= 30, 'Insufficient frame observations');
      assert.ok(
        value.frames.every((f) => f.populated),
        'Observed blank map canvas: ' + label
      );
      const screenshot = await overlay.call('Page.captureScreenshot', {
        format: 'png',
      });
      await writeFile(
        resolve(out, label + '.png'),
        Buffer.from(screenshot.data, 'base64')
      );
      return value;
    };
    const update = (body) =>
      `(()=>{const d=structuredClone(window.__perfDrawing.seed);const w=d.widgets.find(w=>w.id==='map');${body};window.dashboardBridge.saveDashboard(d,{skipWindowRefresh:true})})()`;
    const resized = await transition(
      'resize',
      update('w.layout.width+=37;w.layout.height+=23')
    );
    assert.notEqual(resized.canvas.width, idle.canvas.width);
    const scaled = await transition('scale-125', update('w.scale=125'));
    assert.equal(scaled.scale, '125');
    const colors = await transition(
      'colors-labels',
      update(
        'w.config.invertTrackColors=!w.config.invertTrackColors;w.config.showCarNumbers=!w.config.showCarNumbers'
      )
    );
    assert.ok(
      colors.draws.trackMapCommitDraw > scaled.draws.trackMapCommitDraw
    );
    await overlay.evaluate(
      `(async()=>{const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='#ff00fd';ctx.fillRect(0,0,32,32);const data=Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]),ch=>ch.charCodeAt(0));window.__perfDrawing.iconName=await window.dashboardBridge.savePlayerIconImage(data)})()`
    );
    await transition(
      'player-icon',
      update(
        'w.config.playerIcon={enabled:true,fileName:window.__perfDrawing.iconName}'
      )
    );
    const icon = await overlay.evaluate(
      `(()=>{const img=document.querySelector('[data-widget-id="map"] img');return img?{complete:img.complete,naturalWidth:img.naturalWidth,display:getComputedStyle(img).display,width:img.getBoundingClientRect().width}:null})()`
    );
    assert.ok(
      icon?.complete &&
        icon.naturalWidth === 32 &&
        icon.display !== 'none' &&
        icon.width > 0,
      'Player icon not displayed'
    );
    observations.at(-1).icon = icon;
    await overlay.evaluate('window.__perfDrawing.observe()');
    await overlay.call('Emulation.setDeviceMetricsOverride', {
      width: 1549,
      height: 1009,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await sleep(1800);
    const dpr = await record('emulated-dpr-2');
    assert.equal(dpr.dpr, 2);
    assert.equal(dpr.canvas.width, dpr.canvas.cssWidth * 2);
    assert.ok(dpr.frames.length >= 30 && dpr.frames.every((f) => f.populated));
    await overlay.call('Emulation.clearDeviceMetricsOverride');
    await overlay.evaluate('window.__perfDrawing.reset()');
    await overlay.evaluate(
      `window.tapeReplayBridge.command({type:'pause',paused:false})`
    );
    await sleep(2000);
  }
  const beforeMinimize = await record('before-minimize');
  await main.evaluate(`${nativeWindow}.minimize()`);
  await sleep(1500);
  const minimized = await record('minimized-settled');
  if (minimized.native.minimized) {
    await sleep(nativeOnly ? 15000 : 3000);
    const hidden = await record('minimized-observed');
    assert.ok(
      hidden.native.minimized && !hidden.native.visible,
      'Window left minimized state during observation'
    );
    for (const name of [
      'trackMapCommitDraw',
      'trackMapRafDraw',
      'inputTraceFrame',
      ...(expectedBaseline ? [] : ['radarFrame']),
    ])
      assert.equal(
        hidden.draws[name],
        minimized.draws[name],
        'Draws during native minimize: ' + name
      );
    if (expectedBaseline)
      assert.ok(
        hidden.draws.radarFrame > minimized.draws.radarFrame,
        'Baseline radar was not exercised'
      );
  }
  await main.evaluate(`${nativeWindow}.restore()`);
  await sleep(2000);
  const resumed = await record('restored');
  assert.equal(resumed.native.minimized, false);
  for (const name of ['trackMapRafDraw', 'inputTraceFrame', 'radarFrame'])
    assert.ok(
      resumed.draws[name] > beforeMinimize.draws[name],
      'Missing resumed drawing: ' + name
    );
  await writeFile(
    resolve(out, 'drawing.json'),
    JSON.stringify(
      {
        scope:
          'Linux paused-map static transitions and native minimize; emulated DPR is not physical high-refresh coverage; observed rAF canvas content is not compositor presentation',
        observations,
        minimizeSupported: minimized.native.minimized,
        expectedBaseline,
        passed: true,
      },
      null,
      2
    )
  );
  await overlay.evaluate('window.__perfDrawing.restore()');
  overlay.ws.close();
  main.ws.close();
  overlay = main = undefined;
  assert.equal(await exit, 0);
} catch (error) {
  await writeFile(
    resolve(out, 'drawing-failed.json'),
    JSON.stringify({ error: String(error), observations }, null, 2)
  );
  throw error;
} finally {
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
  try {
    await overlay?.evaluate('window.__perfDrawing?.restore()');
  } catch {
    /* Controller cleanup owns the isolated process. */
  }
  overlay?.ws.close();
  main?.ws.close();
  if (!exited) {
    child.kill('SIGTERM');
    await exit;
  }
}
