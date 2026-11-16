import { expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { RendererHeapSampler } from './rendererHeapSampler';

function windowFor(id: number, initiallyAttached = false) {
  let attached = initiallyAttached;
  const debuggerApi = {
    isAttached: () => attached,
    attach: vi.fn(() => {
      attached = true;
    }),
    detach: vi.fn(() => {
      attached = false;
    }),
    sendCommand: vi.fn(async (method: string) =>
      method === 'Runtime.getHeapUsage'
        ? { usedSize: 1048576, totalSize: 2097152 }
        : {}
    ),
  };
  const window = {
    isDestroyed: () => false,
    webContents: {
      id,
      debugger: debuggerApi,
      isDestroyed: () => false,
      getOSProcessId: () => id * 10,
      getURL: () => 'about:blank#ibt-memory-controller',
    },
  } as unknown as BrowserWindow;
  return { window, debuggerApi };
}
it('samples hidden controllers and detaches only owned debugger sessions', async () => {
  const own = windowFor(1),
    other = windowFor(2, true);
  const sampler = new RendererHeapSampler(() => [own.window, other.window]);
  expect(sampler.start()).toEqual({ attachedTargets: 1, skippedTargets: 1 });
  await expect(sampler.sample()).resolves.toMatchObject([
    { pid: 10, route: 'ibt-memory-controller', usedHeapMB: 1, totalHeapMB: 2 },
  ]);
  await sampler.collectGarbageAndSample();
  expect(own.debuggerApi.sendCommand).toHaveBeenCalledWith(
    'HeapProfiler.collectGarbage'
  );
  sampler.stop();
  expect(own.debuggerApi.detach).toHaveBeenCalledOnce();
  expect(other.debuggerApi.detach).not.toHaveBeenCalled();
});
it('bounds stalled heap commands and marks the measurement unknown', async () => {
  vi.useFakeTimers();
  const own = windowFor(1);
  own.debuggerApi.sendCommand.mockImplementation(
    () => new Promise(() => undefined)
  );
  const sampler = new RendererHeapSampler(() => [own.window]);
  try {
    sampler.start();
    const result = sampler.sample();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toMatchObject([{ usedHeapMB: null }]);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    sampler.stop();
    vi.useRealTimers();
  }
});
