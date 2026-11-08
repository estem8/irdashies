import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  getInstalled: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler),
  },
}));
vi.mock('../plugins/pluginLoader', () => ({
  getInstalledWidgetPlugins: mocks.getInstalled,
}));

import { WIDGET_PLUGIN_IPC } from '../../types/plugins';
import { setupWidgetPluginBridge } from './widgetPluginBridge';

beforeEach(() => {
  mocks.handlers.clear();
  mocks.getInstalled.mockReset();
});

it('lists installed plugins only to the main frame without accepting a path', () => {
  const installed = [
    {
      manifest: { id: 'author.weather' },
      entryUrl: 'file:///plugins/author.weather/dist/index.js',
      styleUrls: ['file:///plugins/author.weather/dist/style.css'],
    },
  ];
  mocks.getInstalled.mockReturnValue(installed);
  setupWidgetPluginBridge();
  const handler = mocks.handlers.get(WIDGET_PLUGIN_IPC.getInstalledPlugins);
  expect(handler).toBeDefined();
  const frame = {};
  const event = {
    sender: { mainFrame: frame },
    senderFrame: frame,
  } as unknown as Electron.IpcMainInvokeEvent;

  expect(handler?.(event, '/renderer/chosen/path')).toBe(installed);
  expect(mocks.getInstalled).toHaveBeenCalledOnce();

  const subframe = {
    sender: { mainFrame: frame },
    senderFrame: {},
  } as unknown as Electron.IpcMainInvokeEvent;
  expect(() => handler?.(subframe)).toThrow('Only the main frame');
});
