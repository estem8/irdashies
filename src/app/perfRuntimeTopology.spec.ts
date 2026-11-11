import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  capturePerfRuntimeTopology,
  type PerfRuntimeTopologyMarker,
  type PerfRuntimeTopologyWindow,
} from './perfRuntimeTopology';

class FakeWindow implements PerfRuntimeTopologyWindow {
  private events = new EventEmitter();
  destroyed = false;
  readFailure = false;
  loading: boolean;
  rendererPid: number;

  constructor(
    readonly id: number,
    private route: string,
    options: { loading?: boolean; rendererPid?: number } = {}
  ) {
    this.loading = options.loading ?? false;
    this.rendererPid = options.rendererPid ?? 20_000 + id;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  read() {
    if (this.readFailure || this.destroyed) {
      throw new Error('window was destroyed before its state was read');
    }
    return {
      id: this.id,
      rendererPid: this.rendererPid,
      route: this.route,
      bounds: { x: this.id * 100, y: 10, width: 400, height: 300 },
      visible: true,
      loaded: !this.loading && this.route !== 'about:blank',
      loading: this.loading,
    };
  }

  onReadinessChange(listener: () => void): () => void {
    this.events.on('change', listener);
    this.events.on('did-finish-load', listener);
    this.events.on('did-stop-loading', listener);
    return () => {
      this.events.off('change', listener);
      this.events.off('did-finish-load', listener);
      this.events.off('did-stop-loading', listener);
    };
  }

  finishLoad(rendererPid = this.rendererPid): void {
    this.loading = false;
    this.rendererPid = rendererPid;
    this.events.emit('change');
  }

  didFinishLoad(rendererPid = this.rendererPid): void {
    this.rendererPid = rendererPid;
    this.events.emit('did-finish-load');
  }

  didStopLoading(): void {
    this.loading = false;
    this.events.emit('did-stop-loading');
  }

  close(): void {
    this.destroyed = true;
    this.events.emit('change');
  }

  listenerCount(): number {
    return (
      this.events.listenerCount('change') +
      this.events.listenerCount('did-finish-load') +
      this.events.listenerCount('did-stop-loading')
    );
  }
}

const deferred = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const flushPromises = () =>
  new Promise<void>((resolve) => setImmediate(resolve));
const noOp = () => 0;

describe('capturePerfRuntimeTopology', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures loaded window roles and runtime process counts', async () => {
    const window = new FakeWindow(1, 'http://localhost:5173/#/overlay-widget');
    const markers: PerfRuntimeTopologyMarker[] = [];
    let beforeQuit: (() => void) | undefined;
    capturePerfRuntimeTopology({
      runId: 'run',
      getWindows: () => [window],
      getProcessTypes: () => ['Browser', 'GPU', 'Utility', 'Tab', 'Tab'],
      writeMarker: (marker) => markers.push(marker),
      onBeforeQuit: (listener) => {
        beforeQuit = listener;
        return () => {
          if (beforeQuit === listener) beforeQuit = undefined;
        };
      },
    });
    await flushPromises();

    expect(markers[0]).toMatchObject({
      runId: 'run',
      complete: true,
      windows: [
        {
          id: 1,
          rendererPid: 20_001,
          role: 'widget',
          route: 'http://localhost:5173/#/overlay-widget',
          ready: true,
        },
      ],
      processCounts: { Browser: 1, GPU: 1, Utility: 1, Tab: 2 },
    });
    expect(beforeQuit).toBeUndefined();
    expect(window.listenerCount()).toBe(0);
  });

  it.each([
    ['http://localhost:5173/#/settings?section=general', 'settings'],
    ['http://localhost:5173/#/overlay-widget?widgetId=input', 'widget'],
  ] as const)(
    'classifies routes with query strings: %s',
    async (route, role) => {
      const window = new FakeWindow(1, route);
      const markers: PerfRuntimeTopologyMarker[] = [];
      capturePerfRuntimeTopology({
        runId: 'run',
        getWindows: () => [window],
        getProcessTypes: () => ['Browser', 'Tab'],
        writeMarker: (marker) => markers.push(marker),
        onBeforeQuit: () => noOp,
      });
      await flushPromises();

      expect(markers[0].windows[0].role).toBe(role);
    }
  );

  it('waits for finish-load and a positive renderer PID', async () => {
    const window = new FakeWindow(2, 'file:///app/index.html', {
      loading: true,
      rendererPid: 0,
    });
    const markers: PerfRuntimeTopologyMarker[] = [];
    capturePerfRuntimeTopology({
      runId: 'run',
      getWindows: () => [window],
      getProcessTypes: () => ['Browser', 'Tab'],
      writeMarker: (marker) => markers.push(marker),
      onBeforeQuit: () => noOp,
      timeoutMs: 1000,
    });

    await flushPromises();
    expect(markers).toHaveLength(0);
    window.finishLoad(24_002);
    await Promise.resolve();
    await Promise.resolve();

    expect(markers[0]).toMatchObject({
      complete: true,
      windows: [{ id: 2, rendererPid: 24_002, role: 'display', ready: true }],
    });
    expect(window.listenerCount()).toBe(0);
  });

  it('waits for did-stop-loading after did-finish-load while still loading', async () => {
    const window = new FakeWindow(3, 'file:///app/index.html', {
      loading: true,
      rendererPid: 0,
    });
    const markers: PerfRuntimeTopologyMarker[] = [];
    capturePerfRuntimeTopology({
      runId: 'run',
      getWindows: () => [window],
      getProcessTypes: () => ['Browser', 'Tab'],
      writeMarker: (marker) => markers.push(marker),
      onBeforeQuit: () => noOp,
      timeoutMs: 1000,
    });

    await flushPromises();
    window.didFinishLoad(24_003);
    await Promise.resolve();
    expect(markers).toHaveLength(0);

    window.didStopLoading();
    await Promise.resolve();
    await Promise.resolve();

    expect(markers[0]).toMatchObject({
      complete: true,
      timedOut: false,
      windows: [{ id: 3, rendererPid: 24_003, ready: true }],
    });
    expect(window.listenerCount()).toBe(0);
  });

  it('writes an empty complete topology for observer mode', async () => {
    const markers: PerfRuntimeTopologyMarker[] = [];
    capturePerfRuntimeTopology({
      runId: 'observer',
      getWindows: () => [],
      getProcessTypes: () => ['Browser', 'GPU'],
      writeMarker: (marker) => markers.push(marker),
      onBeforeQuit: () => noOp,
    });
    await Promise.resolve();

    expect(markers[0]).toMatchObject({
      complete: true,
      topologyChanged: false,
      windows: [],
      processCounts: { Browser: 1, GPU: 1 },
    });
  });

  it('marks a window added during startup incomplete until it is ready', async () => {
    const original = new FakeWindow(1, 'file:///app/index.html');
    const added = new FakeWindow(2, 'file:///app/index.html', {
      loading: true,
      rendererPid: 0,
    });
    const markers: PerfRuntimeTopologyMarker[] = [];
    let windows = [original];
    capturePerfRuntimeTopology({
      runId: 'run',
      getWindows: () => windows,
      getProcessTypes: () => ['Browser', 'GPU', 'Tab', 'Tab'],
      writeMarker: (marker) => markers.push(marker),
      onBeforeQuit: () => noOp,
      timeoutMs: 1000,
    });

    await Promise.resolve();
    windows = [original, added];
    original.finishLoad();
    await Promise.resolve();
    await Promise.resolve();
    expect(added.listenerCount()).toBe(3);
    added.finishLoad(24_004);
    await Promise.resolve();
    await Promise.resolve();

    expect(markers[0]).toMatchObject({
      complete: true,
      topologyChanged: true,
      windows: expect.arrayContaining([
        expect.objectContaining({ id: 2, rendererPid: 24_004, ready: true }),
      ]),
    });
    expect(added.listenerCount()).toBe(0);
  });

  it('marks a destroyed startup window as changed and releases listeners', async () => {
    vi.useFakeTimers();
    const window = new FakeWindow(1, 'file:///app/index.html', {
      loading: true,
      rendererPid: 0,
    });
    const markers: PerfRuntimeTopologyMarker[] = [];
    let windows = [window];
    capturePerfRuntimeTopology({
      runId: 'run',
      getWindows: () => windows,
      getProcessTypes: () => ['Browser'],
      writeMarker: (marker) => markers.push(marker),
      onBeforeQuit: () => noOp,
      timeoutMs: 1000,
    });

    await Promise.resolve();
    windows = [];
    window.close();
    await Promise.resolve();
    await Promise.resolve();

    expect(markers[0]).toMatchObject({
      complete: true,
      topologyChanged: true,
      windows: [],
    });
    expect(window.listenerCount()).toBe(0);
  });

  it('records read failures as incomplete evidence without rejecting', async () => {
    vi.useFakeTimers();
    const window = new FakeWindow(1, 'file:///app/index.html', {
      loading: true,
      rendererPid: 0,
    });
    window.readFailure = true;
    const markers: PerfRuntimeTopologyMarker[] = [];
    capturePerfRuntimeTopology({
      runId: 'run',
      getWindows: () => [window],
      getProcessTypes: () => ['Browser', 'Tab'],
      writeMarker: (marker) => markers.push(marker),
      onBeforeQuit: () => noOp,
      timeoutMs: 500,
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    await Promise.resolve();

    expect(markers[0]).toMatchObject({
      complete: false,
      snapshotErrors: expect.arrayContaining([
        'window 1 readiness could not be read',
        'window 1 snapshot could not be read',
      ]),
      windows: [{ id: 1, ready: false, rendererPid: 0 }],
    });
    expect(window.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('writes an incomplete marker when readiness exceeds the bounded timeout', async () => {
    vi.useFakeTimers();
    const window = new FakeWindow(1, 'file:///app/index.html', {
      loading: true,
      rendererPid: 0,
    });
    const markers: PerfRuntimeTopologyMarker[] = [];
    capturePerfRuntimeTopology({
      runId: 'run',
      getWindows: () => [window],
      getProcessTypes: () => ['Browser', 'Tab'],
      writeMarker: (marker) => markers.push(marker),
      onBeforeQuit: () => noOp,
      timeoutMs: 500,
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    await Promise.resolve();

    expect(markers[0]).toMatchObject({
      complete: false,
      timedOut: true,
      windows: [{ ready: false, rendererPid: 0 }],
    });
    expect(window.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels pending readiness waits on before-quit', async () => {
    vi.useFakeTimers();
    const window = new FakeWindow(1, 'file:///app/index.html', {
      loading: true,
      rendererPid: 0,
    });
    const markers: PerfRuntimeTopologyMarker[] = [];
    const quit = deferred();
    capturePerfRuntimeTopology({
      runId: 'run',
      getWindows: () => [window],
      getProcessTypes: () => ['Browser'],
      writeMarker: (marker) => markers.push(marker),
      onBeforeQuit: (listener) => {
        const onQuit = () => listener();
        void quit.promise.then(onQuit);
        return noOp;
      },
      timeoutMs: 1000,
    });

    await Promise.resolve();
    quit.resolve(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(markers).toHaveLength(0);
    expect(window.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('emits topology after origin without changing the origin clock', async () => {
    const mainSource = await readFile('src/main.ts', 'utf8');
    const originIndex = mainSource.indexOf('PERF_CAPTURE_ORIGIN_LOG_PREFIX');
    const topologyIndex = mainSource.indexOf('capturePerfRuntimeTopology({');
    expect(originIndex).toBeGreaterThanOrEqual(0);
    expect(topologyIndex).toBeGreaterThan(originIndex);
    expect(mainSource).toMatch(
      /const captureOriginMs = Date\.now\(\);\s*const captureOrigin = new Date\(captureOriginMs\)/
    );
    expect(mainSource).toContain(
      "webContents.on('did-stop-loading', listener)"
    );
  });
});
