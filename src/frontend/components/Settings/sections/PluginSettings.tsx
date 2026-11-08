import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { useDashboard, useElementSize } from '@irdashies/context';
import { previewFitScale } from '@irdashies/domain/widgetPreview/presentation';
import { ResizeHandles } from '@irdashies/domain/widgetPresentation/ResizeHandle';
import type {
  InstalledWidgetPlugin,
  PluginSettingSpec,
} from '../../../../types/plugins';
import { SettingSliderRow } from '../components/SettingSliderRow';
import { SettingToggleRow } from '../components/SettingToggleRow';
import { usePreviewResize } from '../components/usePreviewResize';
import { usePreviewViewport } from '../components/usePreviewViewport';
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

const PluginWidgetPreview = ({
  plugin,
  widgetId,
  config,
  onConfigChange,
}: {
  plugin: InstalledWidgetPlugin;
  widgetId: string;
  config: Readonly<Record<string, unknown>>;
  onConfigChange: (patch: Record<string, unknown>) => void;
}) => {
  const { currentDashboard } = useDashboard();
  const savedLayout = currentDashboard?.widgets.find(
    (widget) => widget.id === widgetId
  )?.layout;
  const baseSize = {
    width: savedLayout?.width ?? plugin.manifest.widget.defaultLayout.width,
    height: savedLayout?.height ?? plugin.manifest.widget.defaultLayout.height,
  };
  const [frameSize, setFrameSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [light, setLight] = useState(false);
  const [resizeHovered, setResizeHovered] = useState(false);
  const [resizeFocused, setResizeFocused] = useState(false);
  const [panning, setPanning] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    origin: { x: number; y: number };
  } | null>(null);
  const size = useElementSize(stage);
  const width = frameSize?.width ?? baseSize.width;
  const height = frameSize?.height ?? baseSize.height;
  const fit = previewFitScale(width, height, size.width - 32, size.height - 32);
  const { zoom, scale, pan, setPan, setZoom, freeze } = usePreviewViewport(
    stage,
    fit,
    true
  );
  const { resizing, getResizeHandleProps } = usePreviewResize({
    width,
    height,
    enabled: true,
    freeze,
    setPan,
    onSizeChange: setFrameSize,
  });
  const button =
    'rounded-md px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700 focus-visible:outline-accent-400 aria-pressed:bg-slate-700 aria-pressed:text-white';

  return (
    <section className="flex min-h-64 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          Preview
          <span className="rounded bg-accent-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent-300">
            Demo
          </span>
          <span className="text-xs font-normal text-slate-400">
            {width} × {height} · {Math.round(scale * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={button}
            aria-pressed={zoom === 'fit'}
            title="Fit and center preview"
            onClick={() => setZoom('fit')}
          >
            Fit
          </button>
          <button
            type="button"
            className={button}
            aria-pressed={zoom === 'actual'}
            onClick={() => setZoom('actual')}
          >
            100%
          </button>
          <button
            type="button"
            className={button}
            aria-label="Light preview background"
            aria-pressed={light}
            onClick={() => setLight(!light)}
          >
            Background
          </button>
        </div>
      </div>
      <div
        ref={stage}
        role="region"
        aria-label={`${plugin.manifest.widget.name} preview canvas`}
        aria-description="Scroll to zoom. Drag to pan. Use arrow keys to move and Home to center. Edges resize the preview."
        data-resizing={resizing || panning || undefined}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current || resizing) return;
          event.preventDefault();
          freeze();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            origin: pan,
          };
          setPanning(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || event.pointerId !== start.pointerId) return;
          setPan({
            x: start.origin.x + event.clientX - start.x,
            y: start.origin.y + event.clientY - start.y,
          });
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          drag.current = null;
          setPanning(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setPanning(false);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 128 : 32;
          switch (event.key) {
            case 'ArrowLeft':
              setPan((current) => ({ ...current, x: current.x - step }));
              break;
            case 'ArrowRight':
              setPan((current) => ({ ...current, x: current.x + step }));
              break;
            case 'ArrowUp':
              setPan((current) => ({ ...current, y: current.y - step }));
              break;
            case 'ArrowDown':
              setPan((current) => ({ ...current, y: current.y + step }));
              break;
            case 'Home':
              setPan({ x: 0, y: 0 });
              break;
            default:
              return;
          }
          event.preventDefault();
        }}
        className={`relative flex h-60 items-center justify-center overflow-hidden outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent-400 ${panning ? 'cursor-grabbing' : 'cursor-grab'} ${light ? 'bg-slate-300' : 'bg-slate-950'}`}
      >
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className="pointer-events-auto relative shrink-0"
            onPointerEnter={() => setResizeHovered(true)}
            onPointerLeave={() => setResizeHovered(false)}
            onFocusCapture={(event) =>
              setResizeFocused(event.target.matches(':focus-visible'))
            }
            onBlurCapture={(event) => {
              if (
                !(event.relatedTarget instanceof Node) ||
                !event.currentTarget.contains(event.relatedTarget)
              )
                setResizeFocused(false);
            }}
            style={{
              width: width * scale,
              height: height * scale,
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            <div
              className="pointer-events-none absolute left-0 top-0 origin-top-left"
              style={{ width, height, transform: `scale(${scale})` }}
            >
              <PluginWidgetHost
                plugin={plugin}
                widgetId={widgetId}
                config={config}
                preview
                onConfigChange={onConfigChange}
              />
            </div>
            <div
              className={`pointer-events-none absolute inset-0 border border-dashed border-sky-500/80 transition-opacity ${resizeHovered || resizeFocused || resizing ? 'opacity-100' : 'opacity-0'}`}
            />
            <ResizeHandles
              getResizeHandleProps={getResizeHandleProps}
              visible={resizeHovered || resizeFocused || resizing}
            />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-slate-700 px-3 py-1.5 text-xs text-slate-400">
        <p className="flex-1">
          Scroll to zoom. Drag to pan. Edges resize the preview. Overlay layout
          is unchanged.
        </p>
        <button
          type="button"
          className={button}
          aria-label="Reset preview size"
          title="Restore saved widget dimensions"
          disabled={width === baseSize.width && height === baseSize.height}
          onClick={() => {
            setFrameSize(null);
            setZoom('fit');
          }}
        >
          <ArrowCounterClockwiseIcon size={16} />
        </button>
      </div>
    </section>
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
      <PluginWidgetPreview
        key={`${existing?.id ?? widgetId}:${existing?.layout.width ?? ''}x${existing?.layout.height ?? ''}`}
        plugin={plugin}
        widgetId={existing?.id ?? widgetId}
        config={config}
        onConfigChange={persistConfig}
      />
    </div>
  );
};
