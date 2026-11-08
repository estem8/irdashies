import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from 'react';
import * as ReactRuntime from 'react';
import * as JSXRuntime from 'react/jsx-runtime';
import { useChannelSnapshot, useDashboard } from '@irdashies/context';
import type { ChannelName } from '@irdashies/types';
import { WidgetRuntimeProvider } from './widgetRuntime';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import logger from './utils/logger';
import {
  applyPluginConfigPatch,
  getPluginRuntimeDefinition,
  getTrustedPluginAssetOrigin,
  resolvePluginConfig,
} from './pluginRegistry';
import {
  getPluginGlobalExport,
  WIDGET_PLUGIN_HOST_GLOBAL,
  type InstalledWidgetPlugin,
  type PluginWidgetProps,
} from '../types/plugins';

interface PluginReactRuntime {
  React: typeof ReactRuntime;
  jsxRuntime: typeof JSXRuntime;
}

type PluginGlobalWindow = Window & Record<string, unknown>;

const EMPTY_PLUGIN_THEME: Readonly<Record<string, string>> = Object.freeze({});
const loadedComponents = new Map<
  string,
  Promise<ComponentType<PluginWidgetProps>>
>();
const loadedStyles = new Set<string>();

const pluginWindow = () => window as unknown as PluginGlobalWindow;

const exposeReactRuntime = () => {
  const host = pluginWindow();
  const current = host[WIDGET_PLUGIN_HOST_GLOBAL] as
    Readonly<PluginReactRuntime> | undefined;
  if (current) {
    if (current.React !== ReactRuntime || current.jsxRuntime !== JSXRuntime)
      throw new Error('Plugin React runtime is not the host runtime');
    return;
  }
  Object.defineProperty(host, WIDGET_PLUGIN_HOST_GLOBAL, {
    value: Object.freeze({ React: ReactRuntime, jsxRuntime: JSXRuntime }),
    configurable: false,
    enumerable: false,
    writable: false,
  });
};

const validatePluginAssetUrl = (value: string): string => {
  const url = new URL(value);
  if (url.protocol === 'file:') return url.href;
  const trustedOrigin = getTrustedPluginAssetOrigin();
  if (
    trustedOrigin &&
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.origin === trustedOrigin
  )
    return url.href;
  throw new Error('Invalid plugin asset URL');
};

const loadPluginStyles = (plugin: InstalledWidgetPlugin) => {
  for (const styleUrl of plugin.styleUrls ?? []) {
    try {
      const href = validatePluginAssetUrl(styleUrl);
      if (loadedStyles.has(href)) continue;
      loadedStyles.add(href);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onerror = () => {
        logger.warn(
          `[WidgetPlugin:${plugin.manifest.id}] Stylesheet failed to load`
        );
      };
      document.head.append(link);
    } catch {
      logger.warn(
        `[WidgetPlugin:${plugin.manifest.id}] Invalid stylesheet URL`
      );
    }
  }
};

const isComponent = (
  value: unknown
): value is ComponentType<PluginWidgetProps> =>
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && '$$typeof' in value);

const loadPluginComponent = (
  plugin: InstalledWidgetPlugin
): Promise<ComponentType<PluginWidgetProps>> => {
  const { id } = plugin.manifest;
  const cached = loadedComponents.get(id);
  if (cached) return cached;

  const { promise, resolve, reject } =
    Promise.withResolvers<ComponentType<PluginWidgetProps>>();
  try {
    exposeReactRuntime();
    loadPluginStyles(plugin);
    const src = validatePluginAssetUrl(plugin.entryUrl);
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.onload = () => {
      script.remove();
      const component = pluginWindow()[getPluginGlobalExport(id)];
      if (!isComponent(component)) {
        reject(new Error('Plugin entry did not export a React component'));
        return;
      }
      resolve(component);
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('Plugin entry failed to load'));
    };
    document.head.append(script);
  } catch (error) {
    reject(error);
  }
  loadedComponents.set(id, promise);
  void promise.catch(() => loadedComponents.delete(id));
  return promise;
};

const ChannelSnapshot = ({
  channel,
  onSnapshot,
}: {
  channel: ChannelName;
  onSnapshot: (channel: ChannelName, value: unknown) => void;
}) => {
  const snapshot = useChannelSnapshot(channel);
  useEffect(
    () => onSnapshot(channel, snapshot),
    [channel, onSnapshot, snapshot]
  );
  return null;
};

const LoadingPlugin = ({ name }: { name: string }) => (
  <div className="flex h-full w-full items-center justify-center bg-slate-950/60 p-3 text-center text-sm text-slate-300">
    Loading {name}…
  </div>
);

const FailedPlugin = ({ name }: { name: string }) => (
  <div className="flex h-full w-full items-center justify-center bg-slate-950/60 p-3 text-center text-sm text-slate-300">
    {name} could not be displayed.
  </div>
);

export const PluginWidgetHost = ({
  plugin,
  widgetId,
  config,
  preview = false,
  onConfigChange: onConfigChangeOverride,
}: {
  plugin: InstalledWidgetPlugin;
  widgetId: string;
  config: Readonly<Record<string, unknown>>;
  preview?: boolean;
  onConfigChange?: (patch: Record<string, unknown>) => void;
}) => {
  const { currentDashboard, onDashboardUpdated } = useDashboard();
  const [component, setComponent] = useState<
    ComponentType<PluginWidgetProps> | undefined
  >();
  const [loadFailed, setLoadFailed] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, unknown>>({});
  const channels =
    getPluginRuntimeDefinition(plugin.manifest.id)?.channels ?? [];
  const resolvedConfig = useMemo(
    () => resolvePluginConfig(plugin, config),
    [plugin, config]
  );

  useEffect(() => {
    let active = true;
    setComponent(undefined);
    setLoadFailed(false);
    void loadPluginComponent(plugin).then(
      (loaded) => {
        if (active) setComponent(() => loaded);
      },
      () => {
        logger.error(
          `[WidgetPlugin:${plugin.manifest.id}] Entry failed to load`
        );
        if (active) setLoadFailed(true);
      }
    );
    return () => {
      active = false;
    };
  }, [plugin]);

  const handleSnapshot = useCallback((channel: ChannelName, value: unknown) => {
    setSnapshots((previous) => {
      if (value === undefined) {
        if (!Object.hasOwn(previous, channel)) return previous;
        const next = { ...previous };
        Reflect.deleteProperty(next, channel);
        return next;
      }
      if (Object.is(previous[channel], value)) return previous;
      return { ...previous, [channel]: value };
    });
  }, []);

  const persistConfigChange = useCallback(
    (patch: Record<string, unknown>) => {
      if (!currentDashboard || !onDashboardUpdated) return;
      const existing = currentDashboard.widgets.find(
        (widget) => widget.id === widgetId
      );
      const nextConfig = applyPluginConfigPatch(
        plugin,
        existing?.config ?? resolvedConfig,
        patch
      );
      if (!nextConfig) {
        logger.warn(
          `[WidgetPlugin:${plugin.manifest.id}] Rejected invalid configuration`
        );
        return;
      }
      if (existing) {
        onDashboardUpdated({
          ...currentDashboard,
          widgets: currentDashboard.widgets.map((widget) =>
            widget.id === widgetId ? { ...widget, config: nextConfig } : widget
          ),
        });
        return;
      }
      onDashboardUpdated({
        ...currentDashboard,
        widgets: [
          ...currentDashboard.widgets,
          {
            id: widgetId,
            type: plugin.manifest.id,
            enabled: true,
            config: nextConfig,
            layout: {
              x: 50,
              y: 50,
              width: plugin.manifest.widget.defaultLayout.width,
              height: plugin.manifest.widget.defaultLayout.height,
            },
          },
        ],
      });
    },
    [currentDashboard, onDashboardUpdated, plugin, resolvedConfig, widgetId]
  );
  const onConfigChange = onConfigChangeOverride ?? persistConfigChange;

  const readonlySnapshots = useMemo(
    () =>
      Object.freeze(
        preview
          ? {
              'session-bar.snapshot': {
                displayUnits: 1,
                trackWetness: 2,
                airTemp: 22,
                trackTemp: 31,
                windVelocity: 4.2,
                windDirection: 1.1,
                windYaw: 0.25,
                relativeHumidity: 0.58,
                precipitation: 0.08,
              },
              'track-state.snapshot': { isOnTrack: true },
              // These values only keep the settings preview populated until
              // the active preview/demo channel snapshots arrive.
              ...snapshots,
            }
          : snapshots
      ),
    [preview, snapshots]
  );

  return (
    <WidgetRuntimeProvider widgetType={plugin.manifest.id}>
      {channels.map((channel) => (
        <ChannelSnapshot
          key={channel}
          channel={channel}
          onSnapshot={handleSnapshot}
        />
      ))}
      {loadFailed ? (
        <FailedPlugin name={plugin.manifest.widget.name} />
      ) : component ? (
        <ErrorBoundary
          label={`plugin:${plugin.manifest.id}`}
          fallback={<FailedPlugin name={plugin.manifest.widget.name} />}
        >
          {ReactRuntime.createElement(component, {
            widgetId,
            config: resolvedConfig,
            snapshots: readonlySnapshots,
            theme: EMPTY_PLUGIN_THEME,
            preview,
            onConfigChange,
          })}
        </ErrorBoundary>
      ) : (
        <LoadingPlugin name={plugin.manifest.widget.name} />
      )}
    </WidgetRuntimeProvider>
  );
};
