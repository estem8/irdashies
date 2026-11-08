import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ReactRuntime from 'react';
import * as JSXRuntime from 'react/jsx-runtime';
import type {
  InstalledWidgetPlugin,
  PluginWidgetProps,
  WidgetPluginBridge,
} from '../types/plugins';
import {
  getPluginGlobalExport,
  WIDGET_PLUGIN_HOST_GLOBAL,
} from '../types/plugins';
import { initializeWidgetPlugins } from './pluginRegistry';
import { PluginWidgetHost } from './PluginWidgetHost';

const state = vi.hoisted(() => ({
  dashboard: {
    widgets: [
      {
        id: 'instance-1',
        type: 'author.host-test',
        enabled: true,
        config: { units: 'kelvin' },
        layout: { x: 0, y: 0, width: 320, height: 180 },
      },
    ],
  },
  onDashboardUpdated: vi.fn(),
  snapshot: { version: 7 },
}));

vi.mock('@irdashies/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@irdashies/context')>()),
  useDashboard: () => ({
    currentDashboard: state.dashboard,
    onDashboardUpdated: state.onDashboardUpdated,
  }),
  useChannelSnapshot: () => state.snapshot,
}));

const plugin: InstalledWidgetPlugin = {
  manifest: {
    manifestVersion: 1,
    id: 'author.host-test',
    name: 'Host test',
    version: '1.0.0',
    apiVersion: 1,
    entry: 'dist/index.js',
    widget: {
      name: 'Host test widget',
      defaultLayout: { width: 320, height: 180 },
      defaultConfig: { units: 'metric' },
      settings: [
        {
          key: 'units',
          type: 'select',
          label: 'Units',
          options: ['metric', 'imperial'],
        },
      ],
    },
    requires: { channels: ['track-state.snapshot'] },
  },
  entryUrl: 'file:///user-data/plugins/author.host-test/dist/index.js',
  styleUrls: ['file:///user-data/plugins/author.host-test/dist/widget.css'],
};

const TestPlugin = ({
  widgetId,
  config,
  snapshots,
  theme,
  preview,
  onConfigChange,
}: PluginWidgetProps) => {
  const trackSnapshot = snapshots['track-state.snapshot'];
  const version =
    typeof trackSnapshot === 'object' &&
    trackSnapshot !== null &&
    'version' in trackSnapshot &&
    typeof trackSnapshot.version === 'number'
      ? trackSnapshot.version
      : 'missing';
  return (
    <div>
      <span>
        {widgetId}:{String(config.units)}:{version}:{String(preview)}:
        {Object.keys(theme).length}
      </span>
      <button onClick={() => onConfigChange({ units: 'imperial' })}>
        Update config
      </button>
    </div>
  );
};

afterEach(() => {
  Reflect.deleteProperty(window, 'widgetPluginBridge');
  Reflect.deleteProperty(window, getPluginGlobalExport(plugin.manifest.id));
});

describe('PluginWidgetHost', () => {
  it('normalizes invalid saved config before rendering with the host React runtime', async () => {
    const bridge: WidgetPluginBridge = {
      getInstalledPlugins: vi.fn().mockResolvedValue([plugin]),
    };
    Object.defineProperty(window, 'widgetPluginBridge', {
      configurable: true,
      value: bridge,
    });
    await initializeWidgetPlugins();

    render(
      <PluginWidgetHost
        plugin={plugin}
        widgetId="instance-1"
        config={{ units: 'kelvin', unexpected: 'discard' }}
        preview
      />
    );
    const script = await waitFor(() => {
      const entry = document.querySelector<HTMLScriptElement>(
        `script[src="${plugin.entryUrl}"]`
      );
      expect(entry).not.toBeNull();
      if (!entry) throw new Error('Plugin entry script was not added');
      return entry;
    });
    const pluginWindow = window as unknown as Window & Record<string, unknown>;
    Object.defineProperty(
      pluginWindow,
      getPluginGlobalExport(plugin.manifest.id),
      {
        configurable: true,
        value: TestPlugin,
      }
    );
    fireEvent.load(script);

    expect(
      await screen.findByText('instance-1:metric:7:true:0')
    ).toBeInTheDocument();
    const hostRuntime = pluginWindow[WIDGET_PLUGIN_HOST_GLOBAL] as {
      React: typeof ReactRuntime;
      jsxRuntime: typeof JSXRuntime;
    };
    expect(hostRuntime.React).toBe(ReactRuntime);
    expect(hostRuntime.jsxRuntime).toBe(JSXRuntime);
    expect(
      document.querySelector<HTMLLinkElement>(
        `link[href="${plugin.styleUrls[0]}"]`
      )
    ).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Update config' }));
    expect(state.onDashboardUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        widgets: [
          expect.objectContaining({
            id: 'instance-1',
            config: { units: 'imperial' },
          }),
        ],
      })
    );
  });
});
