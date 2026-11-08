import {
  channelRegistry,
  WIDGET_MANIFESTS,
  type ChannelName,
} from '@irdashies/types';
import type {
  InstalledWidgetPlugin,
  PluginSettingSpec,
  WidgetPluginBridge,
} from '../types/plugins';
import logger from './utils/logger';
const builtInIds = new Set(WIDGET_MANIFESTS.map(({ id }) => id));
const installed = new Map<string, InstalledWidgetPlugin>();
const runtimeDefinitions = new Map<
  string,
  {
    id: string;
    channels: readonly ChannelName[];
    channelRates: Partial<Record<ChannelName, number>>;
  }
>();
let initialization: Promise<void> | undefined;
let trustedPluginAssetOrigin: string | undefined;

export const getTrustedPluginAssetOrigin = () => trustedPluginAssetOrigin;

const buildRuntimeDefinition = (
  plugin: InstalledWidgetPlugin
): {
  id: string;
  channels: readonly ChannelName[];
  channelRates: Partial<Record<ChannelName, number>>;
} => {
  const channels: ChannelName[] = [];
  const channelRates: Partial<Record<ChannelName, number>> = {};
  for (const channel of plugin.manifest.requires.channels) {
    if (!Object.hasOwn(channelRegistry, channel)) continue;
    const definition = channelRegistry[channel];
    if (definition.kind !== 'snapshot') continue;
    channels.push(channel);
    channelRates[channel] = Math.min(
      definition.defaultRateHz,
      definition.maxRateHz
    );
  }
  return { id: plugin.manifest.id, channels, channelRates };
};

const installPlugins = (plugins: readonly InstalledWidgetPlugin[]) => {
  installed.clear();
  runtimeDefinitions.clear();
  for (const plugin of plugins) {
    const id = plugin.manifest.id;
    if (
      builtInIds.has(id as (typeof WIDGET_MANIFESTS)[number]['id']) ||
      installed.has(id)
    ) {
      logger.warn(`[WidgetPlugin:${id}] Ignoring a duplicate widget ID`);
      continue;
    }
    installed.set(id, plugin);
    runtimeDefinitions.set(id, buildRuntimeDefinition(plugin));
  }
};

/**
 * Loads the validated, renderer-safe plugin descriptions before any widget
 * registry lookup. Plugin code itself stays unloaded until its widget mounts.
 */
export const initializeWidgetPlugins = (
  bridgeOverride?: WidgetPluginBridge
): Promise<void> => {
  if (initialization) return initialization;
  initialization = (async () => {
    const pluginBridge =
      bridgeOverride ??
      (window as Window & { widgetPluginBridge?: WidgetPluginBridge })
        .widgetPluginBridge;
    if (!pluginBridge) return;
    const browserBridge = pluginBridge as WidgetPluginBridge & {
      getPluginAssetOrigin?: () => string | undefined;
    };
    const assetOrigin = browserBridge.getPluginAssetOrigin?.();
    if (assetOrigin) {
      try {
        const assetUrl = new URL(assetOrigin);
        const pageUrl = new URL(window.location.href);
        if (
          (assetUrl.protocol === 'http:' || assetUrl.protocol === 'https:') &&
          assetUrl.protocol === pageUrl.protocol &&
          assetUrl.hostname === pageUrl.hostname
        ) {
          trustedPluginAssetOrigin = assetUrl.origin;
        } else {
          logger.error('[WidgetPlugins] Refusing assets from another origin');
        }
      } catch {
        trustedPluginAssetOrigin = undefined;
      }
    }
    try {
      const plugins = await pluginBridge.getInstalledPlugins();
      if (!Array.isArray(plugins)) {
        throw new Error('Invalid installed plugin response');
      }
      installPlugins(plugins);
    } catch {
      logger.error('[WidgetPlugins] Failed to load installed plugin metadata');
    }
  })();
  return initialization;
};

export const getInstalledWidgetPlugins = (): readonly InstalledWidgetPlugin[] =>
  Array.from(installed.values());

export const getInstalledWidgetPlugin = (
  id: string
): InstalledWidgetPlugin | undefined => installed.get(id);

export const getPluginRuntimeDefinition = (id: string) =>
  runtimeDefinitions.get(id);

const isValidSettingValue = (spec: PluginSettingSpec, value: unknown) => {
  switch (spec.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      if (spec.min !== undefined && value < spec.min) return false;
      if (spec.max !== undefined && value > spec.max) return false;
      if (spec.step !== undefined) {
        const offset = value - (spec.min ?? 0);
        const steps = offset / spec.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-8) return false;
      }
      return true;
    }
    case 'select':
      return typeof value === 'string' && spec.options.includes(value);
    case 'text':
      return (
        typeof value === 'string' &&
        (spec.maxLength === undefined || value.length <= spec.maxLength)
      );
  }
};

const normalizeByDefault = (
  fallback: unknown,
  value: unknown
): { valid: boolean; value: unknown } => {
  if (Array.isArray(fallback)) {
    if (!Array.isArray(value)) return { valid: false, value: fallback };
    if (fallback.length === 0)
      return { valid: value.length === 0, value: fallback };
    const normalized: unknown[] = [];
    for (const item of value) {
      const entry = normalizeByDefault(fallback[0], item);
      if (!entry.valid) return { valid: false, value: fallback };
      normalized.push(entry.value);
    }
    return { valid: true, value: normalized };
  }
  if (
    typeof fallback === 'object' &&
    fallback !== null &&
    !Array.isArray(fallback)
  ) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return { valid: false, value: fallback };
    const normalized = Object.fromEntries(
      Object.entries(fallback).map(([key, defaultValue]) => {
        if (!Object.hasOwn(value, key)) return [key, defaultValue];
        const storedValue = Object.getOwnPropertyDescriptor(value, key)?.value;
        return [key, normalizeByDefault(defaultValue, storedValue).value];
      })
    );
    return { valid: true, value: normalized };
  }
  if (fallback === null)
    return { valid: value === null, value: value === null ? value : fallback };
  if (typeof fallback === 'number')
    return {
      valid: typeof value === 'number' && Number.isFinite(value),
      value:
        typeof value === 'number' && Number.isFinite(value) ? value : fallback,
    };
  return {
    valid: typeof value === typeof fallback,
    value: typeof value === typeof fallback ? value : fallback,
  };
};

/** Drops unknown or malformed saved values while retaining manifest defaults. */
export const resolvePluginConfig = (
  plugin: InstalledWidgetPlugin,
  saved: unknown
): Record<string, unknown> => {
  const defaults = plugin.manifest.widget.defaultConfig;
  const resolved: Record<string, unknown> = { ...defaults };
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved))
    return resolved;
  const settings = new Map(
    plugin.manifest.widget.settings.map((setting) => [setting.key, setting])
  );
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!Object.hasOwn(saved, key)) continue;
    const value = Object.getOwnPropertyDescriptor(saved, key)?.value;
    const setting = settings.get(key);
    if (setting) {
      if (isValidSettingValue(setting, value)) resolved[key] = value;
      continue;
    }
    const normalized = normalizeByDefault(defaultValue, value);
    if (normalized.valid) resolved[key] = normalized.value;
  }
  return resolved;
};

export const applyPluginConfigPatch = (
  plugin: InstalledWidgetPlugin,
  current: Readonly<Record<string, unknown>>,
  patch: Record<string, unknown>
): Record<string, unknown> | undefined => {
  const settings = new Map(
    plugin.manifest.widget.settings.map((setting) => [setting.key, setting])
  );
  for (const [key, value] of Object.entries(patch)) {
    const spec = settings.get(key);
    if (
      !Object.hasOwn(plugin.manifest.widget.defaultConfig, key) ||
      !spec ||
      !isValidSettingValue(spec, value)
    )
      return undefined;
  }
  return {
    ...plugin.manifest.widget.defaultConfig,
    ...current,
    ...patch,
  };
};
