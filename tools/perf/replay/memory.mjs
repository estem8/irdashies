import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP } from '../capture/cdp-client.mjs';
import { summarizeReplayMemory } from './memorySummary.mjs';
import { summarizeLiveAllocations } from '../capture/summarize-live-allocations.mjs';

export function parsePrivateMemory(text) {
  const get = (key) => {
    const m = text.match(new RegExp(`^${key}:\\s+(\\d+) kB$`, 'm'));
    return m ? Number(m[1]) * 1024 : null;
  };
  const clean = get('Private_Clean'),
    dirty = get('Private_Dirty');
  return {
    rssBytes: get('Rss'),
    privateBytes: clean === null || dirty === null ? null : clean + dirty,
    privateCleanBytes: clean,
    privateDirtyBytes: dirty,
    anonymousBytes: get('Anonymous'),
    pssBytes: get('Pss'),
  };
}

const electron = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')`;
export class ReplayMemoryDiagnostic {
  constructor(main, targets, output, mode) {
    this.main = main;
    this.targets = targets;
    this.output = output;
    this.mode = mode;
    this.connections = [];
    this.checkpoints = [];
    this.sampled = false;
  }
  async start() {
    this.connections.push({
      role: 'main',
      url: 'node',
      cdp: this.main,
      owned: false,
    });
    for (const target of this.targets.filter(
      (t) => t.type === 'page' && !t.url.endsWith('#/tape-replay')
    )) {
      this.connections.push({
        role: `renderer-${this.connections.length}`,
        url: target.url,
        cdp: await CDP.connect(target.webSocketDebuggerUrl),
        owned: true,
      });
    }
    for (const item of this.connections)
      await item.cdp.call('HeapProfiler.enable');
    await this.checkpoint(0);
  }
  async checkpoint(cycle) {
    // Let deliveries/effects settle, then compare post-GC checkpoints in the
    // same ended/disconnected phase. Cycle zero is startup and is not comparable.
    await sleep(1000);
    await Promise.all(
      this.connections.map((item) =>
        item.cdp.call('HeapProfiler.collectGarbage')
      )
    );
    await sleep(100);
    const processes = await this.main.evaluate(
      `${electron}.app.getAppMetrics().map(p=>({pid:p.pid,creationTime:p.creationTime,type:p.type,workingSetBytes:p.memory.workingSetSize*1024}))`
    );
    const windows = await this.main.evaluate(
      `${electron}.BrowserWindow.getAllWindows().map(w=>({id:w.id,pid:w.webContents.getOSProcessId(),url:w.webContents.getURL(),visible:w.isVisible(),bounds:w.getBounds()}))`
    );
    const mainPid = await this.main.evaluate('process.pid');
    const heaps = [];
    for (const item of this.connections) {
      const matching = windows.filter((w) => w.url === item.url);
      const pid =
        item.role === 'main'
          ? mainPid
          : matching.length === 1
            ? matching[0].pid
            : null;
      const heap = await item.cdp.call('Runtime.getHeapUsage');
      const dom =
        item.role === 'main'
          ? null
          : await item.cdp.call('Memory.getDOMCounters');
      const node =
        item.role === 'main'
          ? await item.cdp.evaluate(
              `({memory:process.memoryUsage(),spaces:process.getBuiltinModule('v8').getHeapSpaceStatistics(),handles:process.getActiveResourcesInfo()})`
            )
          : null;
      heaps.push({ role: item.role, url: item.url, pid, heap, dom, node });
    }
    const resources = [];
    for (const process of processes) {
      let memory = null,
        error = null;
      try {
        memory = parsePrivateMemory(
          await readFile(`/proc/${process.pid}/smaps_rollup`, 'utf8')
        );
      } catch (e) {
        error = String(e);
      }
      resources.push({ ...process, memory, error });
    }
    const point = {
      cycle,
      monotonicMs: performance.now(),
      timestamp: new Date().toISOString(),
      heaps,
      resources,
      windows,
    };
    this.checkpoints.push(point);
    await writeFile(
      path.join(this.output, 'memory-checkpoints.json'),
      JSON.stringify(
        {
          scope:
            'Forced-GC replay-cycle diagnostic, not normal operation or a long-session leak verdict. Compare cycle 1 onward; cycle 0 has a different lifecycle phase.',
          mode: this.mode,
          checkpoints: this.checkpoints,
        },
        null,
        2
      )
    );
    if (cycle === 1 && this.mode === 'allocations') {
      for (const item of this.connections)
        await item.cdp.call('HeapProfiler.startSampling', {
          samplingInterval: 32768,
          includeObjectsCollectedByMajorGC: false,
          includeObjectsCollectedByMinorGC: false,
        });
      this.sampled = true;
    }
    return point;
  }
  async finish() {
    await writeFile(
      path.join(this.output, 'memory-summary.json'),
      JSON.stringify(summarizeReplayMemory(this.checkpoints), null, 2)
    );
    if (this.sampled) {
      const summaries = [];
      for (const item of this.connections) {
        const result = await item.cdp.call('HeapProfiler.stopSampling');
        await writeFile(
          path.join(this.output, `${item.role}-live-allocations.json`),
          JSON.stringify(result.profile)
        );
        summaries.push({
          role: item.role,
          allocations: summarizeLiveAllocations(result.profile),
        });
      }
      await writeFile(
        path.join(this.output, 'memory-allocation-summary.json'),
        JSON.stringify(
          {
            scope:
              'Sampled currently live allocations since cycle 1; allocation stacks are not retaining paths.',
            summaries,
          },
          null,
          2
        )
      );
      this.sampled = false;
    }
  }
  close() {
    for (const item of this.connections) if (item.owned) item.cdp.ws.close();
  }
}
