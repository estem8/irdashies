import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindowConstructorOptions } from 'electron';

const mocks = vi.hoisted(() => {
  const once = new Map<string, () => void>();
  const window = {
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    once: vi.fn((event: string, callback: () => void) =>
      once.set(event, callback)
    ),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    showInactive: vi.fn(),
    loadURL: vi.fn(async () => undefined),
    loadFile: vi.fn(async () => undefined),
    webContents: { setWindowOpenHandler: vi.fn(), on: vi.fn() },
  };
  return {
    once,
    window,
    BrowserWindow: vi.fn(function (options: BrowserWindowConstructorOptions) {
      void options;
      return window;
    }),
  };
});

vi.mock('electron', () => ({
  BrowserWindow: mocks.BrowserWindow,
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { x: 0, y: 0, width: 2560, height: 1369 },
    }),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.once.clear();
  mocks.window.isDestroyed.mockReturnValue(false);
  vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173/');
  vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
  vi.stubEnv('PERF_METRICS', '');
  vi.stubEnv('PERF_TAPE_CONTROLS_HIDDEN', '');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('tape replay window capture isolation', () => {
  it('preserves the normal placement and ready-to-show behavior', async () => {
    const { createTapeReplayWindow } = await import('./tapeReplayWindow');
    createTapeReplayWindow();
    expect(mocks.BrowserWindow.mock.calls[0][0]).toMatchObject({
      x: 970,
      y: 1241,
      width: 620,
      height: 104,
      show: false,
    });
    mocks.once.get('ready-to-show')?.();
    expect(mocks.window.showInactive).toHaveBeenCalledOnce();
  });

  it.each([
    ['1', ''],
    ['', '1'],
    ['1', 'unexpected'],
  ])(
    'requires both explicit capture flags (%s, %s)',
    async (metrics, hidden) => {
      vi.stubEnv('PERF_METRICS', metrics);
      vi.stubEnv('PERF_TAPE_CONTROLS_HIDDEN', hidden);
      const { createTapeReplayWindow } = await import('./tapeReplayWindow');
      createTapeReplayWindow();
      expect(mocks.BrowserWindow.mock.calls[0][0]).toMatchObject({
        x: 970,
        y: 1241,
      });
      mocks.once.get('ready-to-show')?.();
      expect(mocks.window.showInactive).toHaveBeenCalledOnce();
    }
  );

  it('keeps a loaded, reusable auxiliary renderer hidden at fixed bounds', async () => {
    vi.stubEnv('PERF_METRICS', '1');
    vi.stubEnv('PERF_TAPE_CONTROLS_HIDDEN', '1');
    const { createTapeReplayWindow } = await import('./tapeReplayWindow');
    const window = createTapeReplayWindow();
    expect(mocks.BrowserWindow.mock.calls[0][0]).toMatchObject({
      x: 0,
      y: 0,
      width: 620,
      height: 104,
      show: false,
    });
    expect(mocks.window.loadURL).toHaveBeenCalledWith(
      'http://localhost:5173/#/tape-replay'
    );
    mocks.once.get('ready-to-show')?.();
    expect(mocks.window.showInactive).not.toHaveBeenCalled();
    expect(createTapeReplayWindow()).toBe(window);
    expect(mocks.BrowserWindow).toHaveBeenCalledOnce();
  });

  it('does not show a window destroyed before ready-to-show', async () => {
    const { createTapeReplayWindow } = await import('./tapeReplayWindow');
    createTapeReplayWindow();
    mocks.window.isDestroyed.mockReturnValue(true);
    mocks.once.get('ready-to-show')?.();
    expect(mocks.window.showInactive).not.toHaveBeenCalled();
  });
});
