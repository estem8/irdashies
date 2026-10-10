import type { WidgetLayout } from '../dashboardLayout';
import type { WidgetConfigMap } from '../widgetConfigs';
import type { PropertySpecs } from './properties';

/** Settings-menu group a widget is listed under. */
export type WidgetCategory = 'race' | 'car' | 'awareness' | 'track' | 'extras';

/**
 * Main-safe, pure-data description of a widget. One file per widget in
 * `src/types/widgets/<id>.ts`, auto-discovered by `./index.ts`.
 */
export interface WidgetManifest<
  K extends keyof WidgetConfigMap = keyof WidgetConfigMap,
> {
  id: K;
  /** Display name, e.g. in Edit Mode. */
  name: string;
  /** Settings-menu label when it differs from `name`. */
  menuLabel?: string;
  /** Settings-menu group. Required for every widget shown in the menu. */
  category?: WidgetCategory;
  /** One line under the label in the settings menu. */
  description?: string;
  /** false = not listed in the settings widget menu (dev widgets). Default true. */
  showInMenu?: boolean;
  enabled: boolean;
  alwaysEnabled?: boolean;
  layout: WidgetLayout;
  config: WidgetConfigMap[K];
  /** Settings described once; drives SettingProp and config validation. */
  properties?: PropertySpecs;
}

export const defineWidgetManifest = <K extends keyof WidgetConfigMap>(
  manifest: WidgetManifest<K>
) => manifest;
