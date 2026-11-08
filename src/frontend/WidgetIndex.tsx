import type { ComponentType, ElementType } from 'react';
import type { PluginWidgetProps } from '../types/plugins';
import { PluginWidgetHost } from './PluginWidgetHost';
import { getInstalledWidgetPlugin } from './pluginRegistry';
import type { WidgetModule } from '@irdashies/domain';
import { WIDGET_MANIFESTS, type WidgetId } from '@irdashies/types';

export type { WidgetId };

const discoveredWidgets = import.meta.glob<{
  default: WidgetModule | readonly WidgetModule[];
}>('./components/*/widget.ts', { eager: true });

const order = new Map(WIDGET_MANIFESTS.map((m, index) => [m.id, index]));
const modules = Object.values(discoveredWidgets)
  .flatMap(({ default: m }) => (Array.isArray(m) ? m : [m]))
  .sort(
    (a, b) => (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size)
  );

// Completeness (every WidgetId has a component) is checked by
// widgetRegistry.spec.ts, not by the type: the map is built from a glob.
// Keys follow the manifest order, which lists such as the site preview use.
export const WIDGET_MAP = Object.fromEntries(
  modules.map((m: WidgetModule) => [m.id, m.component])
) as Record<WidgetId, ElementType>;

const externalWidgets = new Map<string, ComponentType<PluginWidgetProps>>();

export const isExternalWidget = (id: string): boolean =>
  getInstalledWidgetPlugin(id) !== undefined;

/**
 * Looks up a widget component by id. Built-in IDs remain statically typed;
 * external IDs exist only in the runtime plugin registry.
 */
export const getWidget = (id: string): ElementType | undefined => {
  if (Object.hasOwn(WIDGET_MAP, id))
    return WIDGET_MAP[id as WidgetId] as (typeof WIDGET_MAP)[WidgetId];

  const plugin = getInstalledWidgetPlugin(id);
  if (!plugin) return undefined;
  let component = externalWidgets.get(id);
  if (!component) {
    component = (props) => <PluginWidgetHost plugin={plugin} {...props} />;
    externalWidgets.set(id, component);
  }
  return component;
};

/** Built-ins keep their established config-as-props API; plugins receive v1 props. */
export const getWidgetRenderProps = (
  type: string,
  widgetId: string,
  config: Readonly<Record<string, unknown>> | undefined,
  preview = false
): Record<string, unknown> =>
  isExternalWidget(type)
    ? { widgetId, config: config ?? {}, preview }
    : { ...(config ?? {}) };
