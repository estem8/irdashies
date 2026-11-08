import { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '@irdashies/context';
import type {
  InstalledWidgetPlugin,
  PluginSettingSpec,
} from '../../../../types/plugins';
import { SettingSliderRow } from '../components/SettingSliderRow';
import { SettingToggleRow } from '../components/SettingToggleRow';
import { PluginWidgetHost } from '../../../PluginWidgetHost';
import {
  applyPluginConfigPatch,
  resolvePluginConfig,
} from '../../../pluginRegistry';

const SettingField = ({
  setting,
  value,
  onChange,
}: {
  setting: PluginSettingSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) => {
  const fieldClass =
    'min-h-9 rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100';
  if (setting.type === 'boolean') {
    return (
      <SettingToggleRow
        title={setting.label}
        enabled={value === true}
        onToggle={(enabled) => onChange(enabled)}
      />
    );
  }
  if (setting.type === 'select') {
    return (
      <label className="flex flex-col gap-1 text-sm text-slate-200">
        <span>{setting.label}</span>
        <select
          className={fieldClass}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          {setting.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (setting.type === 'number') {
    if (setting.min !== undefined && setting.max !== undefined) {
      return (
        <SettingSliderRow
          title={setting.label}
          value={typeof value === 'number' ? value : setting.min}
          min={setting.min}
          max={setting.max}
          step={setting.step ?? 1}
          units={
            setting.key.toLowerCase().includes('opacity') ? '%' : undefined
          }
          onChange={onChange}
        />
      );
    }
    return (
      <label className="flex flex-col gap-1 text-sm text-slate-200">
        <span>{setting.label}</span>
        <input
          type="number"
          className={fieldClass}
          value={typeof value === 'number' ? value : ''}
          min={setting.min}
          max={setting.max}
          step={setting.step ?? 'any'}
          onChange={(event) => {
            if (event.currentTarget.value !== '')
              onChange(event.currentTarget.valueAsNumber);
          }}
        />
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-200">
      <span>{setting.label}</span>
      <input
        type="text"
        className={fieldClass}
        value={typeof value === 'string' ? value : ''}
        maxLength={setting.maxLength}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
};

export const PluginSettings = ({
  plugin,
  widgetId,
  previewMode = false,
}: {
  plugin: InstalledWidgetPlugin;
  widgetId: string;
  previewMode?: boolean;
}) => {
  const { currentDashboard, onDashboardUpdated } = useDashboard();
  const pluginId = plugin.manifest.id;
  const existing =
    currentDashboard?.widgets.find((widget) => widget.id === widgetId) ??
    currentDashboard?.widgets.find(
      (widget) => (widget.type ?? widget.id) === pluginId
    );
  const [config, setConfig] = useState<Record<string, unknown>>(() =>
    resolvePluginConfig(plugin, existing?.config)
  );

  useEffect(() => {
    setConfig(resolvePluginConfig(plugin, existing?.config));
  }, [existing?.config, plugin]);
  const persistConfig = useCallback(
    (patch: Record<string, unknown>) => {
      const nextConfig = applyPluginConfigPatch(plugin, config, patch);
      if (!nextConfig) return;
      setConfig(nextConfig);
      if (!existing || !currentDashboard || !onDashboardUpdated || previewMode)
        return;
      const persistedConfig = { ...existing.config, ...nextConfig };
      onDashboardUpdated({
        ...currentDashboard,
        widgets: currentDashboard.widgets.map((widget) =>
          widget.id === existing.id
            ? { ...widget, config: persistedConfig }
            : widget
        ),
      });
    },
    [
      config,
      currentDashboard,
      existing,
      onDashboardUpdated,
      plugin,
      previewMode,
    ]
  );
  const setEnabled = (enabled: boolean) => {
    if (!existing || !currentDashboard || !onDashboardUpdated || previewMode)
      return;
    onDashboardUpdated({
      ...currentDashboard,
      widgets: currentDashboard.widgets.map((widget) =>
        widget.id === existing.id ? { ...widget, enabled } : widget
      ),
    });
  };

  const addWidget = () => {
    if (!currentDashboard || !onDashboardUpdated || previewMode || existing)
      return;
    let id = pluginId;
    if (currentDashboard.widgets.some((widget) => widget.id === id)) {
      id = `${pluginId}-${crypto.randomUUID()}`;
    }
    onDashboardUpdated({
      ...currentDashboard,
      widgets: [
        ...currentDashboard.widgets,
        {
          id,
          type: pluginId,
          enabled: true,
          config,
          layout: {
            x: 50,
            y: 50,
            width: plugin.manifest.widget.defaultLayout.width,
            height: plugin.manifest.widget.defaultLayout.height,
          },
        },
      ],
    });
  };

  if (!currentDashboard) return <div className="text-slate-400">Loading…</div>;

  return (
    <div className="grid min-h-0 gap-5 overflow-y-auto pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,30rem)]">
      <section className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/40 p-4">
        <header>
          <h2 className="text-xl font-semibold text-white">
            {plugin.manifest.widget.name}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Configure {plugin.manifest.widget.name}.
          </p>
        </header>
        <div className="space-y-3">
          {existing && !previewMode && (
            <SettingToggleRow
              title="Enabled"
              description="Show this plugin on the dashboard."
              enabled={existing.enabled}
              onToggle={setEnabled}
            />
          )}
          {plugin.manifest.widget.settings.map((setting) => (
            <SettingField
              key={setting.key}
              setting={setting}
              value={
                config[setting.key] !== undefined
                  ? config[setting.key]
                  : plugin.manifest.widget.defaultConfig[setting.key]
              }
              onChange={(value) => persistConfig({ [setting.key]: value })}
            />
          ))}
        </div>
        {!existing && !previewMode && (
          <button
            type="button"
            onClick={addWidget}
            className="min-h-9 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600"
          >
            Add to dashboard
          </button>
        )}
      </section>
      <section className="flex min-h-64 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
        <div className="border-b border-slate-700 px-3 py-2 text-sm font-medium text-slate-300">
          Preview · {plugin.manifest.widget.defaultLayout.width} ×{' '}
          {plugin.manifest.widget.defaultLayout.height}
        </div>
        <div className="flex min-h-64 flex-1 items-center justify-center overflow-auto bg-slate-950/70 p-4">
          <div
            className="shrink-0 overflow-hidden"
            style={{
              width: plugin.manifest.widget.defaultLayout.width,
              height: plugin.manifest.widget.defaultLayout.height,
            }}
          >
            <PluginWidgetHost
              plugin={plugin}
              widgetId={existing?.id ?? widgetId}
              config={config}
              preview
              onConfigChange={persistConfig}
            />
          </div>
        </div>
      </section>
    </div>
  );
};
