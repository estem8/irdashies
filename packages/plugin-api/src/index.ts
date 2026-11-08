/** Snapshot channels that plugin API v1 allows authors to request. */
export const PUBLIC_PLUGIN_CHANNELS = [
  'blind-spot.snapshot',
  'car-speeds.snapshot',
  'car-systems.snapshot',
  'driver-controls.snapshot',
  'fuel.projection',
  'lap-times.snapshot',
  'lap-log.snapshot',
  'lap-history.snapshot',
  'reference-laps.snapshot',
  'radar.snapshot',
  'radio.snapshot',
  'relative-gaps.snapshot',
  'sector-timing.snapshot',
  'session-timing.snapshot',
  'session-bar.snapshot',
  'standings.snapshot',
  'track-state.snapshot',
  'lap-trace.sample',
] as const;

export type PublicChannelName = (typeof PUBLIC_PLUGIN_CHANNELS)[number];

/**
 * Public payload typings are intentionally structural and forward-compatible.
 * The stable, documented fields are named; additional host fields remain
 * unknown so plugins must narrow before relying on them.
 */
export interface PublicChannelPayloads {
  'blind-spot.snapshot': Readonly<Record<string, unknown>>;
  'car-speeds.snapshot': Readonly<Record<string, unknown>>;
  'car-systems.snapshot': Readonly<Record<string, unknown>>;
  'driver-controls.snapshot': Readonly<Record<string, unknown>>;
  'fuel.projection': Readonly<Record<string, unknown>>;
  'lap-times.snapshot': Readonly<Record<string, unknown>>;
  'lap-log.snapshot': Readonly<Record<string, unknown>>;
  'lap-history.snapshot': Readonly<Record<string, unknown>>;
  'reference-laps.snapshot': Readonly<Record<string, unknown>>;
  'radar.snapshot': Readonly<Record<string, unknown>>;
  'radio.snapshot': Readonly<Record<string, unknown>>;
  'relative-gaps.snapshot': Readonly<Record<string, unknown>>;
  'sector-timing.snapshot': Readonly<Record<string, unknown>>;
  'session-timing.snapshot': Readonly<Record<string, unknown>>;
  'session-bar.snapshot': Readonly<{
    sessionName?: string;
    trackDisplayName?: string;
    [key: string]: unknown;
  }>;
  'standings.snapshot': Readonly<Record<string, unknown>>;
  'track-state.snapshot': Readonly<{
    isOnTrack: boolean;
    speed: number;
    lapDistPct: number;
    [key: string]: unknown;
  }>;
  'lap-trace.sample': Readonly<Record<string, unknown>>;
}

export type PluginSnapshots<K extends PublicChannelName> = Partial<{
  [C in K]: PublicChannelPayloads[C];
}>;

export type PluginSettingSpec =
  | { key: string; type: 'boolean'; label: string }
  | {
      key: string;
      type: 'number';
      label: string;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      key: string;
      type: 'select';
      label: string;
      options: readonly string[];
    }
  | { key: string; type: 'text'; label: string; maxLength?: number };

export interface PluginWidgetProps<
  Config extends object,
  Snapshots extends object,
> {
  widgetId: string;
  config: Readonly<Config>;
  snapshots: Readonly<Snapshots>;
  theme: Readonly<Record<string, string>>;
  preview: boolean;
  onConfigChange(patch: Partial<Config>): void;
}

const PLUGIN_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

export const getPluginGlobalExport = (id: string): string => {
  if (id.length > 128 || !PLUGIN_ID_PATTERN.test(id)) {
    throw new Error(`Invalid widget plugin ID: ${id}`);
  }
  return `IrdashiesPlugin_${id
    .replace(/\./g, '$dot$')
    .replace(/-/g, '$dash$')}`;
};

export const WIDGET_PLUGIN_HOST_GLOBAL = '__IRDASHIES_PLUGIN_HOST__';
