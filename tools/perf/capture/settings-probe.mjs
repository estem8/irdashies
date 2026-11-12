import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { CDP } from './cdp-client.mjs';
import { startMemoryDumpTrace } from './memory-dump-trace.mjs';

const id = process.argv[2];
const native = ['native', 'native-smoke'].includes(process.argv[3]);
const memory = ['memory', 'native'].includes(process.argv[3]);
assert.ok(
  !process.argv[3] || memory || native,
  'Expected memory, native or native-smoke mode'
);
const mode = memory ? 'memory' : 'probe';
assert.match(id ?? '', /^[a-z0-9-]+$/);
const root = resolve('perf-results', id);
try {
  await access(root);
  throw new Error('Output exists');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const out = resolve(root, mode);
const child = spawn(
  process.execPath,
  ['tools/perf/capture/long-matrix.mjs', id, mode],
  {
    stdio: 'inherit',
    env: { ...process.env, PERF_NATIVE_MEMORY_DIAGNOSTIC: native ? '1' : '0' },
  }
);
let exited = false;
const exit = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => {
    exited = true;
    resolve(code);
  });
});
let main, overlay, settings;
let nativeTrace;
const records = [];
const electron = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;
const settingsWindow = `${electron}.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('#/settings'))`;
const poll = async (fn, attempts = 120) => {
  for (let i = 0; i < attempts; i++) {
    assert.equal(exited, false, 'Capture ended early');
    const result = await fn();
    if (result) return result;
    await sleep(500);
  }
  throw new Error('Settings probe timeout');
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
  assert.equal(await main.evaluate('process.env.PERF_RUN_ID'), id + '-' + mode);
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  overlay = await CDP.connect(
    pages.find((p) => p.type === 'page' && /:\d+\/$/.test(p.url))
      .webSocketDebuggerUrl
  );
  if (native) nativeTrace = await startMemoryDumpTrace(out);
  const inventory = () =>
    main.evaluate(
      `${electron}.app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,name:p.name,creationTime:p.creationTime,cpu:p.cpu,memory:p.memory}))`
    );
  const record = async (label) => {
    const windows = await main.evaluate(
      `${electron}.BrowserWindow.getAllWindows().map(w=>({id:w.id,pid:w.webContents.getOSProcessId(),url:w.webContents.getURL(),visible:w.isVisible(),bounds:w.getBounds(),hideListeners:w.listenerCount('hide'),showListeners:w.listenerCount('show')}))`
    );
    const value = {
      label,
      at: new Date().toISOString(),
      windows,
      processes: await inventory(),
    };
    if (settings) {
      await settings.call('HeapProfiler.collectGarbage');
      value.heap = await settings.call('Runtime.getHeapUsage');
      value.dom = await settings.call('Memory.getDOMCounters');
      value.preview = await settings.evaluate(
        `({frames:document.querySelectorAll('iframe[src*="index-widget-preview"]').length,pause:!!document.querySelector('button[aria-label="Pause preview"]'),play:!!document.querySelector('button[aria-label="Play preview"]')})`
      );
      if (memory || native) {
        await main.call('HeapProfiler.collectGarbage');
        value.mainHeap = await main.call('Runtime.getHeapUsage');
        await overlay.call('HeapProfiler.collectGarbage');
        value.overlayHeap = await overlay.call('Runtime.getHeapUsage');
        value.overlayDOM = await overlay.call('Memory.getDOMCounters');
      }
      if (nativeTrace) value.nativeDump = await nativeTrace.dump(label);
    }
    records.push(value);
    await writeFile(
      resolve(out, 'settings-progress.json'),
      JSON.stringify({ memory, native, records }, null, 2) + '\n'
    );
    process.stdout.write(
      JSON.stringify({
        stage: 'settings-observation',
        label,
        heap: value.heap,
        dom: value.dom,
        preview: value.preview,
      }) + '\n'
    );
    return value;
  };
  await record('settings-absent');
  await overlay.evaluate(
    `window.dashboardBridge.openWidgetSettings('standings')`
  );
  const page = await poll(async () => {
    const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
    return pages.find(
      (p) => p.type === 'page' && p.url.includes('#/settings/standings')
    );
  });
  settings = await CDP.connect(page.webSocketDebuggerUrl);
  await poll(() =>
    settings.evaluate(
      `!!document.querySelector('iframe[src*="index-widget-preview"]:not(.invisible)')`
    )
  );
  await sleep(2000);
  const active = await record('preview-active');
  assert.equal(active.preview.frames, 1);
  if (memory) {
    const { origin } = JSON.parse(
      await readFile(resolve(out, 'preflight.json'), 'utf8')
    );
    for (const seconds of [120, 420, 720, 1020, 1320]) {
      const deadline = origin + seconds * 1000;
      while (Date.now() < deadline) {
        assert.equal(exited, false, 'Memory capture ended before checkpoint');
        await sleep(Math.min(30000, deadline - Date.now()));
      }
      assert.ok(
        Date.now() - deadline < 5000,
        'Memory checkpoint missed its timing window'
      );
      const checkpoint = await record('steady-' + seconds);
      checkpoint.elapsedSeconds = (Date.parse(checkpoint.at) - origin) / 1000;
      assert.equal(checkpoint.preview.frames, 1);
      assert.equal(
        checkpoint.windows.find((w) => w.url.includes('#/settings')).visible,
        true
      );
      await writeFile(
        resolve(out, 'settings-progress.json'),
        JSON.stringify({ memory, native, records }, null, 2) + '\n'
      );
    }
  } else {
    for (let cycle = 1; cycle <= 3; cycle++) {
      await settings.evaluate(
        `document.querySelector('button[aria-label="Pause preview"]').click()`
      );
      await poll(() =>
        settings.evaluate(
          `!document.querySelector('iframe[src*="index-widget-preview"]')`
        )
      );
      const paused = await record('preview-paused-' + cycle);
      assert.equal(paused.preview.frames, 0);
      await settings.evaluate(
        `document.querySelector('button[aria-label="Play preview"]').click()`
      );
      await poll(() =>
        settings.evaluate(
          `!!document.querySelector('iframe[src*="index-widget-preview"]:not(.invisible)')`
        )
      );
      await sleep(1000);
      const playing = await record('preview-resumed-' + cycle);
      assert.equal(playing.preview.frames, 1);
    }
    await main.evaluate(`${settingsWindow}.close()`);
    await sleep(3000);
    const closed = await record('settings-closed-to-tray');
    assert.equal(
      closed.windows.find((w) => w.url.includes('#/settings')).visible,
      false
    );
    await overlay.evaluate(
      `window.dashboardBridge.openWidgetSettings('standings')`
    );
    await sleep(2000);
    const reopened = await record('settings-reopened');
    assert.equal(
      reopened.windows.find((w) => w.url.includes('#/settings')).visible,
      true
    );
    assert.equal(reopened.preview.frames, 1);
    await settings.evaluate(
      `document.querySelector('button[aria-label="Pause preview"]').click()`
    );
    await poll(() =>
      settings.evaluate(
        `!document.querySelector('iframe[src*="index-widget-preview"]')`
      )
    );
    await record('preview-paused-final');
  }
  await nativeTrace?.stop();
  nativeTrace = undefined;
  await writeFile(
    resolve(out, 'settings.json'),
    JSON.stringify(
      {
        scope: memory
          ? 'Settings Standings preview active; post-GC checkpoints span 20 minutes; tape loops at 10 minutes; memory diagnostic, not CPU acceptance'
          : 'Short Settings preview cleanup diagnostic with forced GC; not a long-session leak test or CPU acceptance',
        passed: true,
        nativeAllocatorDiagnostics: native,
        records,
      },
      null,
      2
    ) + '\n'
  );
  for (const c of [settings, overlay, main]) c.ws.close();
  settings = overlay = main = undefined;
  assert.equal(await exit, 0);
} catch (error) {
  await writeFile(
    resolve(out, 'settings-failed.json'),
    JSON.stringify({ error: String(error), records }, null, 2) + '\n'
  );
  throw error;
} finally {
  try {
    await nativeTrace?.stop();
  } finally {
    for (const c of [settings, overlay, main]) c?.ws.close();
    if (!exited) {
      child.kill('SIGTERM');
      await exit;
    }
  }
}
