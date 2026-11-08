import { describe, expect, it, vi } from 'vitest';
import { WIDGET_MAP, getWidget } from './WidgetIndex';
import {
  applyPluginConfigPatch,
  getInstalledWidgetPlugins,
  getPluginRuntimeDefinition,
  initializeWidgetPlugins,
  resolvePluginConfig,
} from './pluginRegistry';
import { getWidgetMenuItems } from './components/Settings/menuItems';
import type {
  InstalledWidgetPlugin,
  WidgetPluginBridge,
} from '../types/plugins';

const plugin: InstalledWidgetPlugin = {
  manifest: {
    manifestVersion: 1,
    id: 'author.example-widget',
    name: 'Example package',
    version: '1.0.0',
    apiVersion: 1,
    entry: 'dist/index.js',
    widget: {
      name: 'Example Widget',
      defaultLayout: { width: 320, height: 180 },
      defaultConfig: { units: 'metric', gain: 1 },
      settings: [
        {
          key: 'units',
          type: 'select',
          label: 'Units',
          options: ['metric', 'imperial'],
        },
        {
          key: 'gain',
          type: 'number',
          label: 'Gain',
          min: 0,
          max: 4,
          step: 0.5,
        },
      ],
    },
    requires: { channels: ['track-state.snapshot'] },
  },
  entryUrl: 'file:///user-data/plugins/author.example-widget/dist/index.js',
  styleUrls: [],
};

describe('plugin runtime registry', () => {
  it('loads descriptors before lookups and merges external widgets without widening built-in IDs', async () => {
    const bridge: WidgetPluginBridge = {
      getInstalledPlugins: vi
        .fn()
        .mockResolvedValue([
          plugin,
          { ...plugin, manifest: { ...plugin.manifest, id: 'wind' } },
        ]),
    };
    Object.defineProperty(window, 'widgetPluginBridge', {
      configurable: true,
      value: bridge,
    });

    await initializeWidgetPlugins();

    expect(bridge.getInstalledPlugins).toHaveBeenCalledOnce();
    expect(getInstalledWidgetPlugins()).toEqual([plugin]);
    expect(getWidget('author.example-widget')).toBeTypeOf('function');
    expect(getWidget('wind')).toBe(WIDGET_MAP.wind);
    expect(getWidget('__proto__')).toBeUndefined();
    expect(
      getWidgetMenuItems().find(
        (item) => item.widgetType === 'author.example-widget'
      )
    ).toMatchObject({ label: 'Example Widget', category: 'Plugins' });
    expect(getPluginRuntimeDefinition('author.example-widget')).toEqual({
      id: 'author.example-widget',
      channels: ['track-state.snapshot'],
      channelRates: { 'track-state.snapshot': 25 },
    });

    const current = { ...plugin.manifest.widget.defaultConfig, retained: true };
    expect(
      applyPluginConfigPatch(plugin, current, { units: 'imperial', gain: 2.5 })
    ).toEqual({ ...current, units: 'imperial', gain: 2.5 });
    expect(
      applyPluginConfigPatch(plugin, current, { units: 'kelvin' })
    ).toBeUndefined();
    expect(
      applyPluginConfigPatch(plugin, current, { gain: 2.25 })
    ).toBeUndefined();

    expect(
      resolvePluginConfig(plugin, {
        units: 'kelvin',
        gain: 'bad',
        unexpected: 'discard',
      })
    ).toEqual({ units: 'metric', gain: 1 });

    Reflect.deleteProperty(window, 'widgetPluginBridge');
  });
});
