// Counts React renders in every window of a running irDashies, over the Chrome
// DevTools Protocol. No dependencies; needs Node >= 22 (global WebSocket/fetch).
//
// Per window it reports commits, component renders and mounts. Inside a window
// everything is attributed to its widget through the `data-widget-id` wrapper
// that DashboardView renders, together with DOM mutations (what the browser has
// to lay out and paint) and long tasks (>50 ms of renderer main thread).
//
// 1. Start the packaged app with a debugging port (PowerShell), plus a replay
//    and the main-process report:
//      $env:IRDASHIES_TELEMETRY_REPLAY = 'D:\...\ai-race-10min.irdt'
//      $env:IRDASHIES_TELEMETRY_REPLAY_LOOP = '1'
//      $env:PERF_METRICS = '1'; $env:PERF_REPORT_INTERVAL_MS = '5000'
//      $env:PERF_LOG_PATH = 'D:\...\perf-label.log'
//      .\irdashies.exe --remote-debugging-port=9222
// 2. Run this (from WSL or Windows):
//      node tools/perf/render-count.mjs --warmup 20 --duration 120 \
//        --perf-log /mnt/d/.../perf-label.log --explain SessionBar --out r.json
//
// --explain A,B   for those components, say why each render happened (which
//                 props or hooks changed, or "parent only": same props values
//                 in a new object, i.e. a memo would have skipped it).
// --no-attach     do not connect to the app; wait and report the main process
//                 only. For an empty overlay, which has no React windows.
// --perf-log F    fold in the main process report written under PERF_METRICS=1:
//                 telemetry ticks/s, CPU per process, channel deliveries/s.
//
// From WSL2 in the default NAT mode, Windows' 127.0.0.1 is not reachable.
// Either set `networkingMode=mirrored` under [wsl2] in %UserProfile%\.wslconfig
// (then `wsl --shutdown`), or add a proxy from an elevated prompt and pass
// --port 9223:
//   netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9223 connectaddress=127.0.0.1 connectport=9222
//
// Windows are reloaded once after attaching so the React hook is installed
// before React starts. Names are only readable in a build with keep_fnames.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const log = (text = '') => process.stdout.write(`${text}\n`);
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const PORT = Number(opt('port', 9222));
const WARMUP_S = Number(opt('warmup', 20));
const DURATION_S = Number(opt('duration', 120));
const TOP = Number(opt('top', 6));
const OUT = opt('out');
const PERF_LOG = opt('perf-log');
const EXPLAIN = (opt('explain', '') || '').split(',').filter(Boolean);
const NO_ATTACH = args.includes('--no-attach');

// React DevTools hook: React calls onCommitFiberRoot after every commit, in
// production builds too. A function fiber with PerformedWork actually ran its
// body this commit; subtrees without it are pruned from the walk.
const HOOK = `(() => {
  if (window.__renderStats) return;
  const EXPLAIN = new Set(${JSON.stringify(EXPLAIN)});
  const PerformedWork = 1;
  const FunctionComponent = 0, ClassComponent = 1, HostComponent = 5,
    ForwardRef = 11, MemoComponent = 14, SimpleMemoComponent = 15;
  const fresh = () => ({
    commits: 0, renders: 0, mounts: 0, mutations: 0, longTasks: 0, longTaskMs: 0,
    byName: Object.create(null), mountsByName: Object.create(null),
    widgets: Object.create(null), reasons: Object.create(null),
  });
  let stats = (window.__renderStats = fresh());
  window.__renderReset = () => { stats = window.__renderStats = fresh(); return 1; };
  const widget = (id) => stats.widgets[id] || (stats.widgets[id] = {
    commits: 0, renders: 0, mounts: 0, mutations: 0,
    byName: Object.create(null), mountsByName: Object.create(null),
  });
  const bump = (map, key) => { map[key] = (map[key] || 0) + 1; };
  const nameOf = (f) => {
    const t = f.type;
    if (!t) return 'anonymous';
    return t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) ||
      (t.type && (t.type.displayName || t.type.name)) || 'anonymous';
  };
  const isComponent = (tag) => tag === FunctionComponent || tag === ClassComponent ||
    tag === ForwardRef || tag === MemoComponent || tag === SimpleMemoComponent;
  const widgetOf = (f) => {
    for (let p = f.return; p; p = p.return) {
      if (p.tag === HostComponent) {
        const id = p.memoizedProps && p.memoizedProps['data-widget-id'];
        if (id) return id;
      }
    }
    return '(outside widgets)';
  };
  const typeHint = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  // Why did this component run? Compare with the previous committed fiber.
  const reasonOf = (f) => {
    const prev = f.alternate;
    const a = prev.memoizedProps, b = f.memoizedProps;
    const parts = [];
    if (a !== b && a && b) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      const changed = [...keys].filter((k) => !Object.is(a[k], b[k]));
      if (changed.length) parts.push('props[' + changed.join(',') + ']');
    }
    if (f.tag === ClassComponent) {
      if (prev.memoizedState !== f.memoizedState) parts.push('state');
    } else {
      let x = prev.memoizedState, y = f.memoizedState, i = 0;
      const hooks = [];
      while (x && y) {
        if (!Object.is(x.memoizedState, y.memoizedState)) hooks.push('#' + i + ':' + typeHint(y.memoizedState));
        x = x.next; y = y.next; i++;
      }
      if (hooks.length) parts.push('hooks[' + hooks.join(',') + ']');
    }
    if (parts.length) return parts.join(' + ');
    return a !== b ? 'parent only (same prop values, new object)' : 'context or forced update';
  };
  let touched = null;
  const walk = (f) => {
    while (f) {
      const did = (f.flags & PerformedWork) !== 0;
      if (did || (f.subtreeFlags & PerformedWork) !== 0) {
        if (did && isComponent(f.tag)) {
          const name = nameOf(f);
          const w = widget(widgetOf(f));
          touched.add(w);
          if (f.alternate === null) {
            stats.mounts++; w.mounts++;
            let p = f.return;
            while (p && !isComponent(p.tag)) p = p.return;
            const key = name + ' < ' + (p ? nameOf(p) : 'root');
            bump(stats.mountsByName, key); bump(w.mountsByName, key);
          } else {
            stats.renders++; w.renders++;
            bump(stats.byName, name); bump(w.byName, name);
            if (EXPLAIN.has(name)) bump(stats.reasons, name + ': ' + reasonOf(f));
          }
        }
        if (f.child) walk(f.child);
      }
      f = f.sibling;
    }
  };
  let nextId = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(r) { const id = nextId++; this.renderers.set(id, r); return id; },
    checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      stats.commits++;
      touched = new Set();
      walk(root.current.child);
      touched.forEach((w) => { w.commits++; });
    },
  };
  try {
    new MutationObserver((records) => {
      for (const r of records) {
        stats.mutations++;
        const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        const host = el && el.closest && el.closest('[data-widget-id]');
        widget(host ? host.getAttribute('data-widget-id') : '(outside widgets)').mutations++;
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  } catch (e) { /* no DOM yet */ }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { stats.longTasks++; stats.longTaskMs += e.duration; }
    }).observe({ type: 'longtask', buffered: false });
  } catch (e) { /* unsupported */ }
})()`;

async function discover() {
  const hosts = ['127.0.0.1'];
  try {
    const gw = execSync("ip route show default | awk '{print $3}'", {
      encoding: 'utf8',
    }).trim();
    if (gw) hosts.push(gw);
  } catch {
    /* not on Linux */
  }
  for (const host of hosts) {
    try {
      const res = await fetch(`http://${host}:${PORT}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      const { webSocketDebuggerUrl } = await res.json();
      return webSocketDebuggerUrl.replace(/\/\/[^/]+/, `//${host}:${PORT}`);
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `No DevTools endpoint on port ${PORT}. Start the app with --remote-debugging-port=${PORT} (see the header for WSL notes).`
  );
}

if (NO_ATTACH) {
  log(`Not attaching; waiting ${WARMUP_S + DURATION_S}s for the main process.`);
  await new Promise((r) => setTimeout(r, (WARMUP_S + DURATION_S) * 1000));
  const main = PERF_LOG ? summariseMain(DURATION_S) : undefined;
  log('Main process: ' + JSON.stringify(main, null, 1));
  if (OUT)
    writeFileSync(
      OUT,
      JSON.stringify(
        { warmupS: WARMUP_S, durationS: DURATION_S, windows: [], main },
        null,
        2
      )
    );
  process.exit(0);
}

const ws = new WebSocket(await discover());
await new Promise((ok, fail) => {
  ws.onopen = ok;
  ws.onerror = () => fail(new Error('websocket failed'));
});
let seq = 0;
const waiting = new Map();
const handlers = [];
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && waiting.has(msg.id)) {
    const { ok, fail } = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (msg.error) fail(new Error(msg.error.message));
    else ok(msg.result);
  } else handlers.forEach((h) => h(msg));
};
const send = (method, params = {}, sessionId) =>
  new Promise((ok, fail) => {
    const id = ++seq;
    waiting.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const sessions = new Map(); // targetId -> { sessionId, url, title }
async function attach(info) {
  if (info.type !== 'page' || sessions.has(info.targetId)) return;
  if (
    !info.url ||
    info.url.startsWith('devtools://') ||
    info.url === 'about:blank'
  )
    return;
  const { sessionId } = await send('Target.attachToTarget', {
    targetId: info.targetId,
    flatten: true,
  });
  sessions.set(info.targetId, { sessionId, url: info.url, title: info.title });
  await send('Page.enable', {}, sessionId);
  await send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: HOOK },
    sessionId
  );
  await send('Page.reload', {}, sessionId);
}
handlers.push((m) => {
  if (m.method === 'Target.targetCreated')
    attach(m.params.targetInfo).catch((e) =>
      log(`attach failed: ${e.message}`)
    );
});
await send('Target.setDiscoverTargets', { discover: true });
const { targetInfos } = await send('Target.getTargets');
await Promise.all(targetInfos.map((t) => attach(t)));
if (sessions.size === 0) throw new Error('No app windows found to attach to.');
log(`Attached to ${sessions.size} window(s); reloaded to install the hook.`);

const read = (sessionId) =>
  send(
    'Runtime.evaluate',
    {
      expression: 'JSON.stringify(window.__renderStats || null)',
      returnByValue: true,
    },
    sessionId
  ).then((r) => JSON.parse(r.result.value));
const reset = (sessionId) =>
  send(
    'Runtime.evaluate',
    { expression: 'window.__renderReset && window.__renderReset()' },
    sessionId
  );

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
log(`Warm-up ${WARMUP_S}s, then measuring ${DURATION_S}s...`);
await sleep(WARMUP_S);
await Promise.all([...sessions.values()].map((s) => reset(s.sessionId)));
const measureStart = Date.now();
await sleep(DURATION_S);
const secs = (Date.now() - measureStart) / 1000;

const rate = (n) => +(n / secs).toFixed(2);
const top = (map, n = TOP) =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, perSec: rate(count) }));

const report = [];
for (const [targetId, s] of sessions) {
  const st = await read(s.sessionId);
  if (!st) {
    log(`(no React in ${s.url}; skipped)`);
    continue;
  }
  const widgets = Object.entries(st.widgets)
    .map(([id, w]) => ({
      id,
      commitsPerSec: rate(w.commits),
      rendersPerSec: rate(w.renders),
      mountsPerSec: rate(w.mounts),
      mutationsPerSec: rate(w.mutations),
      top: top(w.byName),
      topMounts: top(w.mountsByName, 3),
    }))
    .sort((a, b) => b.rendersPerSec - a.rendersPerSec);
  report.push({
    targetId,
    url: s.url,
    title: s.title,
    commitsPerSec: rate(st.commits),
    rendersPerSec: rate(st.renders),
    mountsPerSec: rate(st.mounts),
    mutationsPerSec: rate(st.mutations),
    longTasksPerSec: rate(st.longTasks),
    longTaskMsPerSec: rate(st.longTaskMs),
    widgets,
    top: top(st.byName, TOP + 4),
    topMounts: top(st.mountsByName, TOP),
    reasons: top(st.reasons, 12),
  });
}

// Main process: average the PerfMetrics reports that fall inside the measured
// segment (the last duration/interval reports), so the warm-up is excluded.
function summariseMain(seconds) {
  let reports;
  try {
    reports = readFileSync(PERF_LOG, 'utf8')
      .split('\n')
      .map((line) => {
        const i = line.indexOf('[PerfMetrics:JSON] ');
        if (i < 0) return null;
        try {
          return JSON.parse(line.slice(i + '[PerfMetrics:JSON] '.length));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    return { error: `cannot read ${PERF_LOG}: ${e.message}` };
  }
  if (reports.length === 0) return { error: 'no PerfMetrics reports in log' };
  const interval = reports[0].intervalMs / 1000;
  const used = reports.slice(-Math.max(1, Math.floor(seconds / interval)));
  const avg = (f) => used.reduce((s, r) => s + (f(r) ?? 0), 0) / used.length;
  const sum = (key) => {
    const total = {};
    for (const r of used) {
      for (const [k, v] of Object.entries(r.channelMetrics?.[key] ?? {})) {
        total[k] = (total[k] ?? 0) + v;
      }
    }
    return Object.fromEntries(
      Object.entries(total)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => [k, +(v / (used.length * interval)).toFixed(1)])
    );
  };
  const cpuByType = {};
  for (const r of used) {
    for (const p of r.processes ?? []) {
      cpuByType[p.type] = (cpuByType[p.type] ?? 0) + p.cpuPercent / used.length;
    }
  }
  return {
    reportsUsed: used.length,
    ticksPerSec: +avg((r) => r.tickRateHz).toFixed(1),
    appCpuPercent: +avg((r) => r.totalAppCpuPercent).toFixed(2),
    cpuPercentByProcessType: Object.fromEntries(
      Object.entries(cpuByType).map(([k, v]) => [k, +v.toFixed(2)])
    ),
    eventLoopP99Ms: +avg((r) => r.eventLoopDelayMs?.p99).toFixed(1),
    publicationsPerSec: sum('publications'),
    deliveriesPerSec: sum('deliveries'),
  };
}
const main = PERF_LOG ? summariseMain(secs) : undefined;

const pad = (v, n) => String(v).padStart(n);
const fmt = (list) => list.map((t) => `${t.name} ${t.perSec}`).join(', ');
log(`\nMeasured ${secs.toFixed(0)} s. Rates are per second.`);
let tr = 0;
for (const r of report) {
  if (r.rendersPerSec === 0 && r.commitsPerSec === 0) continue;
  tr += r.rendersPerSec;
  log(
    `\n== ${(r.title || r.url).slice(-40)}: commits ${r.commitsPerSec}, renders ${r.rendersPerSec}, mounts ${r.mountsPerSec}, DOM mutations ${r.mutationsPerSec}, long tasks ${r.longTasksPerSec} (${r.longTaskMsPerSec} ms)`
  );
  log(
    'widget'.padEnd(22) +
      pad('renders', 9) +
      pad('mounts', 8) +
      pad('commits', 9) +
      pad('mutations', 11) +
      '  top components'
  );
  for (const w of r.widgets) {
    log(
      w.id.slice(0, 21).padEnd(22) +
        pad(w.rendersPerSec, 9) +
        pad(w.mountsPerSec, 8) +
        pad(w.commitsPerSec, 9) +
        pad(w.mutationsPerSec, 11) +
        '  ' +
        fmt(w.top.slice(0, 4))
    );
  }
  if (r.topMounts.length) log('mounts: ' + fmt(r.topMounts));
  for (const x of r.reasons) log(`why  ${x.name} (${x.perSec}/s)`);
}
log(`\nTotal renders/s across windows: ${tr.toFixed(1)}`);
if (main) log('\nMain process: ' + JSON.stringify(main, null, 1));
if (OUT)
  writeFileSync(
    OUT,
    JSON.stringify(
      { warmupS: WARMUP_S, durationS: secs, windows: report, main },
      null,
      2
    )
  );
ws.close();
