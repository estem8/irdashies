import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWriteStream } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { CDP } from './cdp-client.mjs';

const out = resolve('perf-results/blindspot-visual');
await mkdir(out, { recursive: true });
const file =
  'src/frontend/components/BlindSpotMonitor/components/BlindSpotMonitorIndicator.tsx';
const baseline = await readFile(
  resolve('perf-results/long-matrix-sources/baseline', file),
  'utf8'
);
const candidate = await readFile(
  resolve('perf-results/long-matrix-sources/candidate', file),
  'utf8'
);
const log = createWriteStream(resolve(out, 'console.log'));
const children = [];
const launch = (command, args, env = process.env) => {
  const c = spawn(command, args, {
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  c.stdout.pipe(log, { end: false });
  c.stderr.pipe(log, { end: false });
  children.push(c);
  return c;
};
let cdp;
const results = [];
try {
  const server = launch(
    'npm',
    ['run', 'storybook', '--', '--ci', '--no-open', '--quiet'],
    { ...process.env, STORYBOOK_DISABLE_TELEMETRY: '1' }
  );
  let ready = false;
  for (let i = 0; i < 180; i++) {
    if (server.exitCode !== null) throw new Error('Storybook exited');
    try {
      const r = await fetch('http://127.0.0.1:6006/index.json');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Startup polling and best-effort cleanup may race process shutdown. */
    }
    await sleep(1000);
  }
  if (!ready) throw new Error('Storybook not ready');
  launch('chromium', [
    '--headless',
    '--remote-debugging-port=9223',
    `--user-data-dir=${resolve(out, 'browser-profile')}`,
    '--no-first-run',
    '--disable-default-apps',
    'about:blank',
  ]);
  let pages;
  for (let i = 0; i < 60; i++) {
    try {
      pages = await (await fetch('http://127.0.0.1:9223/json/list')).json();
      if (pages.length) break;
    } catch {
      /* Startup polling and best-effort cleanup may race process shutdown. */
    }
    await sleep(1000);
  }
  if (!pages?.length) throw new Error('No browser target');
  cdp = await CDP.connect(pages[0].webSocketDebuggerUrl);
  await cdp.call('Page.enable');
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 1100,
    height: 850,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const [version, source] of [
    ['before', baseline],
    ['after', candidate],
  ]) {
    await writeFile(file, source);
    await sleep(1500);
    for (const height of [300, 500])
      for (const percent of [-1, -0.5, 0, 0.5, 1]) {
        const url = new URL('http://127.0.0.1:6006/iframe.html');
        url.searchParams.set(
          'id',
          'widgets-blindspotmonitor--cars-on-both-sides'
        );
        url.searchParams.set('viewMode', 'story');
        url.searchParams.set(
          'args',
          `disableTransition:!true;leftPercent:${percent};rightPercent:${-percent};width:24;borderSize:3`
        );
        url.searchParams.set('capture', String(Date.now()));
        await cdp.call('Page.navigate', { url: url.href });
        let data;
        for (let attempt = 0; attempt < 240; attempt++) {
          data = await cdp.evaluate(
            `(() => {const root=document.getElementById('storybook-root');const host=[...(root?.querySelectorAll('div')??[])].find(e=>e.classList.contains('h-[300px]'));const bars=[...(root?.querySelectorAll('div')??[])].filter(e=>e.classList.contains('h-[50%]'));if(!host||bars.length!==2)return null;host.style.height='${height}px';const expected='${version}'==='after';if(bars.some(e=>!!e.style.transform!==expected))return null;return bars.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,transform:e.style.transform,top:e.style.top,transition:e.style.transition};});})()`
          );
          if (data) break;
          await sleep(500);
        }
        if (!data) {
          await writeFile(
            resolve(out, 'failure.html'),
            await cdp.evaluate('document.documentElement.outerHTML')
          );
          throw new Error('Story did not settle: ' + version);
        }
        await cdp.evaluate('document.fonts.ready.then(()=>true)');
        // Freeze unrelated blinking labels; the movement transition is disabled
        // by this story's args for deterministic static geometry comparison.
        await cdp.evaluate(
          `(() => {const s=document.createElement('style');s.textContent='* {animation:none!important}';document.head.appendChild(s);})()`
        );
        await sleep(100);
        results.push({ version, height, percent, bars: data });
        if (height === 500 && percent === 0) {
          const shot = await cdp.call('Page.captureScreenshot', {
            format: 'png',
            clip: { x: 0, y: 0, width: 540, height: 540, scale: 1 },
          });
          await writeFile(
            resolve(out, version + '.png'),
            Buffer.from(shot.data, 'base64')
          );
        }
      }
    process.stdout.write(
      JSON.stringify({
        version,
        cases: results.filter((r) => r.version === version).length,
      }) + '\n'
    );
  }
  let maximumDifference = 0;
  for (const before of results.filter((r) => r.version === 'before')) {
    const after = results.find(
      (r) =>
        r.version === 'after' &&
        r.height === before.height &&
        r.percent === before.percent
    );
    assert.ok(after);
    for (let i = 0; i < before.bars.length; i++)
      for (const key of ['x', 'y', 'width', 'height']) {
        const difference = Math.abs(before.bars[i][key] - after.bars[i][key]);
        maximumDifference = Math.max(maximumDifference, difference);
        assert.ok(
          difference < 0.02,
          `${before.height}/${before.percent}/${i}/${key}: ${difference}`
        );
      }
  }
  await writeFile(
    resolve(out, 'geometry.json'),
    JSON.stringify({ maximumDifference, results }, null, 2)
  );
  process.stdout.write(
    JSON.stringify({ maximumDifference, passed: true }) + '\n'
  );
} finally {
  await writeFile(file, candidate);
  cdp?.ws.close();
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* Startup polling and best-effort cleanup may race process shutdown. */
    }
  }
  log.end();
}
