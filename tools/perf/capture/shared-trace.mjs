import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd();
const runId = process.argv[2] ?? 'shared-attribution-r1';
const preset = process.argv[3] ?? 'groups';
if (!['groups', 'dom', 'full', 'promotion', 'logos'].includes(preset))
  throw new Error('Unknown capture preset');
if (!/^[a-z0-9-]+$/.test(runId)) throw new Error('Unsafe run ID');
const out = resolve('perf-results', runId);
await mkdir(resolve(out, 'profile'), { recursive: true });
await writeFile(
  resolve(out, 'controller.mjs'),
  await readFile(new URL(import.meta.url), 'utf8')
);
const seed = JSON.parse(
  await readFile(
    new URL('../fixtures/reconstructed-ten-widget.json', import.meta.url),
    'utf8'
  )
);
delete seed.userId;
delete seed.keybindings;
const ids = [
  'blindspotmonitor',
  'input',
  'laptimelog',
  'laptrace',
  'map',
  'radar',
  'relative',
  'sectordelta',
  'standings',
  'weather',
];
const layouts = {
  standings: [6, 10, 560, 890],
  relative: [580, 10, 420, 300],
  map: [1010, 10, 500, 300],
  weather: [1320, 330, 190, 425],
  radar: [1010, 330, 300, 300],
  input: [580, 650, 400, 92],
  laptrace: [580, 750, 400, 160],
  laptimelog: [580, 330, 400, 250],
  sectordelta: [6, 920, 560, 60],
  blindspotmonitor: [0, 0, 1529, 994],
};
const dashboard = seed.dashboards.default;
for (const widget of dashboard.widgets) {
  widget.enabled = ids.includes(widget.id);
  if (!widget.enabled) continue;
  const [x, y, width, height] = layouts[widget.id];
  widget.layout = { x, y, width, height };
  widget.config.showOnlyWhenOnTrack = false;
  if (widget.id === 'standings') widget.config.driverStandings.showAll = true;
  if (widget.id === 'radar')
    Object.assign(widget.config, {
      autoHide: false,
      hideInPit: false,
      hideInPitBox: false,
    });
}
Object.assign(dashboard.generalSettings, {
  enableAutoStart: false,
  enableWebServer: false,
  startMinimized: false,
});
const seedText = JSON.stringify(seed);
await writeFile(resolve(out, 'seed.json'), seedText);
await writeFile(resolve(out, 'profile/config.json'), seedText);
await writeFile(
  resolve(out, 'manifest.json'),
  JSON.stringify(
    {
      source: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      diff: execFileSync('git', ['diff'], { encoding: 'utf8' }),
      seedSha256: createHash('sha256').update(seedText).digest('hex'),
      tapeSha256:
        '6e23e8abab49c1a0ae7c8f6d1f298d31145a6189d3029b8ca540aad56a22b168',
      seedOrigin:
        'Reconstructed from default manifests, not the unavailable saved user seed',
    },
    null,
    2
  )
);

class CDP {
  serial = 0;
  pending = new Map();
  events = new Map();
  constructor(ws) {
    this.ws = ws;
    ws.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id) {
        const item = this.pending.get(msg.id);
        if (!item) return;
        this.pending.delete(msg.id);
        clearTimeout(item.timeout);
        if (msg.error) item.reject(new Error(JSON.stringify(msg.error)));
        else item.resolve(msg.result);
      } else for (const cb of this.events.get(msg.method) ?? []) cb(msg.params);
    });
    ws.addEventListener('close', () => {
      for (const item of this.pending.values()) {
        clearTimeout(item.timeout);
        item.reject(new Error('CDP closed'));
      }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new CDP(ws);
  }
  call(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  event(method) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.events.delete(method);
        reject(new Error(`Timeout event: ${method}`));
      }, 60_000);
      this.events.set(method, [
        (params) => {
          clearTimeout(timeout);
          this.events.delete(method);
          resolve(params);
        },
      ]);
    });
  }
  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}

const log = createWriteStream(resolve(out, 'console.log'));
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
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      VSCODE_INSPECTOR_OPTIONS: '',
      IRDASHIES_SIM: 'iracing',
      IRDASHIES_TELEMETRY_REPLAY: resolve('perf-results/ai-race-10min.irdt'),
      PERF_METRICS: '1',
      PERF_RUN_ID: runId,
      PERF_DURATION_SECONDS: '300',
      PERF_REPORT_INTERVAL_MS: '5000',
      PERF_USER_DATA_DIR: resolve(out, 'profile'),
      PERF_LOG_PATH: resolve(out, 'metrics.log'),
      PERF_REPLAY_VISIBLE_WIDGETS: '1',
      PERF_WIDGET_TYPES: ids.join(','),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
let origin;
let topology;
let text = '';
let exited = false;
const exit = new Promise((resolve) =>
  child.on('exit', (code, signal) => {
    exited = true;
    resolve({ code, signal });
  })
);
const accept = (data) => {
  log.write(data);
  text = (text + data.toString()).slice(-100_000);
  if (!origin && text.includes('[PerfRunOrigin:JSON]')) origin = Date.now();
  if (!topology) {
    const matched = text.match(/\[PerfRunTopology:JSON\] (\{[^\n]+\})/);
    if (matched) {
      try {
        topology = JSON.parse(matched[1]);
      } catch {
        /* Startup polling and best-effort cleanup may race process shutdown. */
      }
    }
  }
};
child.stdout.on('data', accept);
child.stderr.on('data', accept);
const connections = [];
let main, overlay;
let overlayId;
const phases = [];
let tracing = false;
const electronExpression = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;
const print = (message) => process.stdout.write(JSON.stringify(message) + '\n');
const hideExcept = async (keep) => {
  const expression = `(() => {const e = ${electronExpression}; const w=e.BrowserWindow.fromId(${overlayId}); ${ids.map((id) => `w.webContents.send('widget-toggle-hide',${JSON.stringify(id)},${!keep.includes(id)});`).join('')} return w.webContents.getOSProcessId();})()`;
  return main.evaluate(expression);
};
try {
  for (let n = 0; n < 180 && !topology; n++) {
    if (exited) throw new Error('Application exited during startup');
    await sleep(1000);
  }
  if (!origin || !topology?.complete)
    throw new Error('No complete capture topology');
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = pages.find((p) => /:\d+\/$/.test(p.url));
  if (!page) throw new Error('No overlay page');
  overlay = await CDP.connect(page.webSocketDebuggerUrl);
  connections.push(overlay);
  const inspectors = await (
    await fetch('http://127.0.0.1:9229/json/list')
  ).json();
  main = await CDP.connect(inspectors[0].webSocketDebuggerUrl);
  connections.push(main);
  if ((await main.evaluate('process.env.PERF_RUN_ID')) !== runId)
    throw new Error('Inspector belongs to a different application');
  const windows = await main.evaluate(
    `${electronExpression}.BrowserWindow.getAllWindows().map(w=>({id:w.id,pid:w.webContents.getOSProcessId(),url:w.webContents.getURL(),bounds:w.getBounds(),visible:w.isVisible()}))`
  );
  print({ stage: 'ready', windows, pageUrl: page.url, topology });
  overlayId = windows.find((w) => w.url === page.url)?.id;
  if (overlayId === undefined) throw new Error('No matched overlay window');
  print({ stage: 'warmup', windows });
  await writeFile(
    resolve(out, 'windows.json'),
    JSON.stringify(windows, null, 2)
  );
  await sleep(Math.max(0, origin + 60_000 - Date.now()));
  const browserVersion = await (
    await fetch('http://127.0.0.1:9222/json/version')
  ).json();
  await writeFile(
    resolve(out, 'browser-version.json'),
    JSON.stringify(browserVersion, null, 2)
  );
  const browser = await CDP.connect(browserVersion.webSocketDebuggerUrl);
  connections.push(browser);
  const groups = [
    ['full1', ids],
    ['no-radar', ids.filter((id) => id !== 'radar')],
    ['radar-only', ['radar']],
    [
      'without-dom-group',
      ids.filter((id) => !['standings', 'relative', 'weather'].includes(id)),
    ],
    ['dom-group', ['standings', 'relative', 'weather']],
    ['full2', ids],
  ];
  const dom = [
    ['full1', ids],
    ['standings-only', ['standings']],
    ['relative-weather', ['relative', 'weather']],
    ['weather-only', ['weather']],
    ['full-no-masks', ids],
    ['full2', ids],
  ];
  const selectedPhases =
    preset === 'logos'
      ? [
          ['full1', ids],
          ['demoted-logos1', ids],
          ['full2', ids],
          ['demoted-logos2', ids],
        ]
      : preset === 'promotion'
        ? [
            ['full1', ids],
            ['promoted-input1', ids],
            ['full2', ids],
            ['promoted-input2', ids],
          ]
        : preset === 'full'
          ? [
              ['full1', ids],
              ['full2', ids],
            ]
          : preset === 'dom'
            ? dom
            : groups;
  for (const [name, keep] of selectedPhases) {
    await overlay.evaluate(
      `document.getElementById('perf-mask-control')?.remove()`
    );
    await overlay.evaluate(
      `document.getElementById('perf-promotion-control')?.remove()`
    );
    await overlay.evaluate(
      `document.getElementById('perf-logo-control')?.remove()`
    );
    await hideExcept(ids);
    await overlay.evaluate(
      `window.tapeReplayBridge.command({type:'pause',paused:true})`
    );
    await overlay.evaluate(
      `window.tapeReplayBridge.command({type:'seek',seconds:55})`
    );
    await overlay.evaluate(
      `window.tapeReplayBridge.command({type:'pause',paused:false})`
    );
    await sleep(5000);
    const pid = await hideExcept(keep);
    if (name === 'full-no-masks')
      await overlay.evaluate(
        `(() => {const s=document.createElement('style');s.id='perf-mask-control';s.textContent='[class*="mask-"] {mask-image:none!important}';document.head.appendChild(s);return document.querySelectorAll('[class*="mask-"]').length;})()`
      );
    if (name.startsWith('promoted-input'))
      await overlay.evaluate(
        `(() => {const s=document.createElement('style');s.id='perf-promotion-control';s.textContent='[data-testid^="input-bar-fill-"] {will-change:transform}';document.head.appendChild(s);return [...document.querySelectorAll('[data-testid^="input-bar-fill-"]')].map(e=>getComputedStyle(e).willChange);})()`
      );
    if (name.startsWith('demoted-logos'))
      await overlay.evaluate(
        `(() => {const s=document.createElement('style');s.id='perf-logo-control';s.textContent='[data-column="carManufacturer"] span[style*="background-image"] {transform:scale(1.25)!important}';document.head.appendChild(s);return [...document.querySelectorAll('[data-column="carManufacturer"] span[style*="background-image"]')].map(e=>getComputedStyle(e).transform);})()`
      );
    await sleep(5000);
    const before = await overlay.evaluate(
      `(async()=>({wall:Date.now(),status:await window.tapeReplayBridge.getStatus(),width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visibility:document.visibilityState,ids:[...document.querySelectorAll('[id]')].map(n=>n.id).filter(Boolean)}))()`
    );
    const screenshot = await overlay.call('Page.captureScreenshot', {
      format: 'png',
    });
    await writeFile(
      resolve(out, `${name}.png`),
      Buffer.from(screenshot.data, 'base64')
    );
    const layerEvent = overlay.event('LayerTree.layerTreeDidChange');
    await overlay.call('LayerTree.enable');
    const layerTree = await layerEvent;
    await overlay.call('LayerTree.disable');
    await writeFile(
      resolve(out, `${name}.layers.json`),
      JSON.stringify(layerTree, null, 2)
    );
    await browser.call('Tracing.start', {
      transferMode: 'ReturnAsStream',
      categories:
        'devtools.timeline,v8.execute,disabled-by-default-v8.cpu_profiler,blink,cc,gpu,toplevel',
      options: 'record-as-much-as-possible',
    });
    tracing = true;
    const startedAt = Date.now();
    print({
      stage: 'tracing',
      name,
      pid,
      before,
      layers: layerTree.layers?.length,
    });
    await sleep(15000);
    const traceEndRequestedAt = Date.now();
    const completion = browser.event('Tracing.tracingComplete');
    await browser.call('Tracing.end');
    const completed = await completion;
    tracing = false;
    if (!completed.stream) throw new Error('No completed trace stream');
    const trace = await import('node:fs/promises').then((fs) =>
      fs.open(resolve(out, `${name}.trace.json`), 'wx')
    );
    let bytes = 0;
    try {
      while (true) {
        const chunk = await browser.call('IO.read', {
          handle: completed.stream,
          size: 1024 * 1024,
        });
        const data = Buffer.from(
          chunk.data,
          chunk.base64Encoded ? 'base64' : 'utf8'
        );
        await trace.write(data);
        bytes += data.length;
        if (chunk.eof) break;
      }
    } finally {
      await trace.close();
      await browser.call('IO.close', { handle: completed.stream });
    }
    const after = await overlay.evaluate(
      `(async()=>({wall:Date.now(),status:await window.tapeReplayBridge.getStatus()}))()`
    );
    phases.push({
      name,
      keep,
      pid,
      before,
      after,
      startedAt,
      traceEndRequestedAt,
      completionAt: Date.now(),
      completion: completed,
      bytes,
    });
    await writeFile(
      resolve(out, 'phases.json'),
      JSON.stringify(phases, null, 2)
    );
    print({ stage: 'completed', name, bytes, completion: completed });
  }
} finally {
  if (tracing) {
    try {
      await connections.at(-1).call('Tracing.end');
    } catch {
      /* Startup polling and best-effort cleanup may race process shutdown. */
    }
  }
  if (main && overlayId !== undefined) {
    try {
      await hideExcept(ids);
    } catch {
      /* Startup polling and best-effort cleanup may race process shutdown. */
    }
  }
  if (overlay) {
    try {
      await overlay.evaluate(
        `document.getElementById('perf-mask-control')?.remove()`
      );
    } catch {
      /* Startup polling and best-effort cleanup may race process shutdown. */
    }
  }
  if (overlay) {
    try {
      await overlay.evaluate(
        `document.getElementById('perf-promotion-control')?.remove()`
      );
    } catch {
      /* Startup polling and best-effort cleanup may race process shutdown. */
    }
  }
  if (overlay) {
    try {
      await overlay.evaluate(
        `document.getElementById('perf-logo-control')?.remove()`
      );
    } catch {
      /* Startup polling and best-effort cleanup may race process shutdown. */
    }
  }
  for (const c of connections) c.ws.close();
  child.kill('SIGINT');
  const result = await Promise.race([
    exit,
    sleep(15000).then(() => ({ timeout: true })),
  ]);
  log.end();
  print({ stage: 'exit', result, phases: phases.length });
  if (result.timeout) {
    child.kill('SIGTERM');
    process.exitCode = 1;
    print({ stage: 'error', error: 'Shutdown timeout' });
  }
}
