import type { GeneralSettingsType } from './dashboardLayout';
import type { TypedDashboardWidget, WidgetConfigMap } from './widgetConfigs';
import { WIDGET_MANIFESTS, getWidgetManifest } from './widgets';

export const defaultDashboard: {
  widgets: TypedDashboardWidget[];
  generalSettings?: GeneralSettingsType;
} = {
  widgets: WIDGET_MANIFESTS.map(
    ({ id, enabled, alwaysEnabled, layout, config }) =>
      ({
        id,
        enabled,
        ...(alwaysEnabled !== undefined && { alwaysEnabled }),
        layout,
        config,
      }) as TypedDashboardWidget
  ),
  generalSettings: {
    fontType: 'lato',
    fontSize: 'sm',
    fontWeight: 'normal',
    appTheme: 'carbon' as const,
    showOnlyWhenOnTrack: true,
    highlightColor: 960745,
    skipTaskbar: true,
    disableHardwareAcceleration: false,
    enableAutoStart: false,
    startMinimized: false,
    closeToTray: true,
    compactMode: 'off' as const,
    overlayAlwaysOnTop: true,
    enableNetworkAccess: false,
    enableWebServer: true,
    editMode: {
      pixelDistances: false,
      snapToGrid: false,
    },
  },
};

export function getWidgetDefaultConfig<K extends keyof WidgetConfigMap>(
  id: K
): WidgetConfigMap[K] {
  const manifest = getWidgetManifest(id);
  if (!manifest) throw new Error(`No default config found for widget: ${id}`);
  return manifest.config as WidgetConfigMap[K];
}
