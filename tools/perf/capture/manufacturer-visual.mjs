import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { CDP } from './cdp-client.mjs';

const out = resolve(
  'perf-results',
  process.argv[2] ?? 'manufacturer-visual-r1'
);
await mkdir(out);
const children = [];
const launch = (cmd, args) => {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  children.push(child);
  return child;
};
const poll = async (url) => {
  for (let i = 0; i < 180; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return await response.json();
    } catch {
      /* Startup may not have bound the socket yet. */
    }
    assert.ok(
      children.every((c) => c.exitCode === null),
      'Capture child exited'
    );
    await sleep(1000);
  }
  throw new Error('Startup timeout: ' + url);
};
let cdp;
try {
  // Refuse to attach to another user's existing browser/server.
  for (const port of [6006, 9223]) {
    let occupied = false;
    try {
      await fetch(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(500),
      });
      occupied = true;
    } catch {
      /* Port not listening. */
    }
    assert.equal(occupied, false, `Port ${port} occupied`);
  }
  launch('npm', ['run', 'storybook', '--', '--ci', '--no-open', '--quiet']);
  const index = await poll('http://127.0.0.1:6006/index.json');
  const story = Object.values(index.entries).find(
    (e) =>
      e.title === 'shared/CarManufacturer' && e.name === 'All Manufacturers'
  );
  assert.ok(story, 'Manufacturer story absent');
  launch('chromium', [
    '--headless',
    '--remote-debugging-port=9223',
    `--user-data-dir=${resolve(out, 'profile')}`,
    '--no-first-run',
    'about:blank',
  ]);
  const pages = await poll('http://127.0.0.1:9223/json/list');
  const page = pages.find(
    (target) => target.type === 'page' && target.url === 'about:blank'
  );
  assert.ok(page, 'Missing blank page target');
  cdp = await CDP.connect(page.webSocketDebuggerUrl);
  await cdp.call('Page.enable');
  const navigation = await cdp.call('Page.navigate', {
    url: `http://127.0.0.1:6006/iframe.html?id=${story.id}&viewMode=story`,
  });
  await writeFile(
    resolve(out, 'navigation.json'),
    JSON.stringify({ pages, navigation }, null, 2)
  );
  assert.ok(!navigation.errorText, JSON.stringify(navigation));
  const selector = '#storybook-root span[style*="background-image"]';
  let count = 0;
  for (let i = 0; i < 120 && !count; i++) {
    count = await cdp.evaluate(
      `document.querySelectorAll(${JSON.stringify(selector)}).length`
    );
    if (!count) await sleep(500);
  }
  if (count <= 10) {
    await writeFile(
      resolve(out, 'failure.html'),
      await cdp.evaluate('document.documentElement.outerHTML')
    );
    throw new Error(`Missing manufacturer sprites: ${count}`);
  }
  assert.equal(
    await cdp.evaluate(
      `[...document.querySelectorAll(${JSON.stringify(selector)})].every(e=>e.style.transform==='scale(1.25)')`
    ),
    true,
    'Unexpected compiled candidate transform'
  );
  await cdp.evaluate(
    `(async()=>{await document.fonts.ready;const urls=[...new Set([...document.querySelectorAll(${JSON.stringify(selector)})].map(e=>getComputedStyle(e).backgroundImage.slice(5,-2)))];await Promise.all(urls.map(url=>new Promise((resolve,reject)=>{const i=new Image();i.onload=resolve;i.onerror=reject;i.src=url})));return true})()`
  );
  const results = [];
  for (const dpr of [1, 1.5, 2])
    for (const scale of [0.5, 1, 1.5, 2]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width: 1600,
        height: 1600,
        deviceScaleFactor: dpr,
        mobile: false,
      });
      await cdp.evaluate(
        `(()=>{document.body.style.display='block';const root=document.getElementById('storybook-root');Object.assign(root.style,{position:'absolute',left:'0',top:'0',width:'700px',padding:'20px',transformOrigin:'top left',transform:'scale(${scale})'});return true})()`
      );
      const shots = {};
      const geometry = {};
      // Only the removed hint is reconstructed in DOM. Candidate is the actual
      // compiled component; no source mutation or screenshot image editing.
      for (const version of ['before', 'after']) {
        geometry[version] = await cdp.evaluate(
          `(()=>{return [...document.querySelectorAll(${JSON.stringify(selector)})].map(e=>{e.style.transform=${JSON.stringify(version === 'before' ? 'scale(1.25) translateZ(0)' : 'scale(1.25)')};const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})})()`
        );
        await sleep(150);
        shots[version] = (
          await cdp.call('Page.captureScreenshot', { format: 'png' })
        ).data;
        await writeFile(
          resolve(out, `${version}-dpr${dpr}-scale${scale}.png`),
          Buffer.from(shots[version], 'base64')
        );
      }
      assert.deepEqual(geometry.before, geometry.after);
      assert.ok(
        geometry.after.every(
          (rect) =>
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= 1600 &&
            rect.y + rect.height <= 1600
        ),
        'Screenshot clips a sprite'
      );
      const pixels = await cdp.evaluate(
        `(async()=>{const load=async(s)=>{const i=new Image();i.src='data:image/png;base64,'+s;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return {data:x.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height}};const a=await load(${JSON.stringify(shots.before)}),b=await load(${JSON.stringify(shots.after)});let changed=0,max=0,total=0;for(let i=0;i<a.data.length;i+=4){let different=false;for(let j=0;j<4;j++){const d=Math.abs(a.data[i+j]-b.data[i+j]);max=Math.max(max,d);total+=d;if(d)different=true}if(different)changed++}return {width:a.width,height:a.height,changedPixels:changed,maxChannelDifference:max,meanChannelDifference:total/a.data.length}})()`
      );
      results.push({ dpr, scale, sprites: count, geometryEqual: true, pixels });
      process.stdout.write(JSON.stringify(results.at(-1)) + '\n');
    }
  await writeFile(
    resolve(out, 'results.json'),
    JSON.stringify(
      {
        scope:
          'Headless Chromium Storybook; baseline promotion reconstructed in DOM; candidate actual component',
        results,
      },
      null,
      2
    ) + '\n'
  );
} finally {
  cdp?.ws.close();
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* Child already exited. */
    }
  }
}
