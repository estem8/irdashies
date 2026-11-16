import type { BrowserWindow } from 'electron';
import type { IbtInspectorRendererHeapSample } from '../../types/ibtInspector';

interface Target {
  window: BrowserWindow;
}
/** Per-capture debugger ownership; no injected renderer code or RAF observers. */
export class RendererHeapSampler {
  private targets = new Map<number, Target>();
  private skipped = new Set<number>();
  constructor(private readonly getWindows: () => BrowserWindow[]) {}
  start() {
    this.stop();
    this.reconcile();
    return {
      attachedTargets: this.targets.size,
      skippedTargets: this.skipped.size,
    };
  }
  private reconcile() {
    for (const [id, target] of this.targets)
      if (
        target.window.isDestroyed() ||
        target.window.webContents.isDestroyed()
      )
        this.targets.delete(id);
    for (const window of this.getWindows()) {
      if (
        window.isDestroyed() ||
        window.webContents.isDestroyed() ||
        this.targets.has(window.webContents.id)
      )
        continue;
      const { id, debugger: session } = window.webContents;
      if (this.targets.size >= 64 || session.isAttached()) {
        this.skipped.add(id);
        continue;
      }
      try {
        session.attach('1.3');
        this.targets.set(id, { window });
        this.skipped.delete(id);
      } catch {
        this.skipped.add(id);
      }
    }
  }
  private async command(target: Target, method: string): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        target.window.webContents.debugger.sendCommand(method),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Renderer heap command timed out')),
            5000
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  private async read(gc: boolean): Promise<IbtInspectorRendererHeapSample[]> {
    this.reconcile();
    return Promise.all(
      [...this.targets.values()].map(async (target) => {
        const contents = target.window.webContents;
        const pid = contents.getOSProcessId();
        let route = 'renderer';
        try {
          const url = new URL(contents.getURL());
          route = url.hash.slice(1) || url.pathname.split('/').at(-1) || route;
        } catch {
          /* Empty startup URL. */
        }
        const sample: IbtInspectorRendererHeapSample = {
          key: `${pid}:${contents.id}`,
          pid,
          route,
          usedHeapMB: null,
          totalHeapMB: null,
        };
        try {
          if (gc) await this.command(target, 'HeapProfiler.collectGarbage');
          const value = (await this.command(
            target,
            'Runtime.getHeapUsage'
          )) as { usedSize?: unknown; totalSize?: unknown };
          if (
            typeof value.usedSize === 'number' &&
            Number.isFinite(value.usedSize)
          )
            sample.usedHeapMB = value.usedSize / 1048576;
          if (
            typeof value.totalSize === 'number' &&
            Number.isFinite(value.totalSize)
          )
            sample.totalHeapMB = value.totalSize / 1048576;
        } catch {
          /* Caller rejects unknown heaps in a full checkpoint. */
        }
        return sample;
      })
    );
  }
  sample() {
    return this.read(false);
  }
  collectGarbageAndSample() {
    return this.read(true);
  }
  stop() {
    for (const { window } of this.targets.values()) {
      try {
        if (
          !window.isDestroyed() &&
          !window.webContents.isDestroyed() &&
          window.webContents.debugger.isAttached()
        )
          window.webContents.debugger.detach();
      } catch {
        /* Window can close while disposing. */
      }
    }
    this.targets.clear();
    this.skipped.clear();
  }
}
