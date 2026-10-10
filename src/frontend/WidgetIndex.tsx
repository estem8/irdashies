import type { ElementType } from 'react';
import type { WidgetId } from '@irdashies/types';

export type { WidgetId };

/** Shape of each `components/<Folder>/widget.ts` default export. */
export interface WidgetModule {
  id: WidgetId;
  component: ElementType;
}

const discoveredWidgets = import.meta.glob<{ default: WidgetModule }>(
  './components/*/widget.ts',
  { eager: true }
);

export const WIDGET_MAP = Object.fromEntries(
  Object.values(discoveredWidgets).map(({ default: m }) => [m.id, m.component])
) as Record<WidgetId, ElementType>;

/**
 * Looks up a widget component by id. Accepts a raw string because dashboard
 * config is user-supplied and may contain unknown ids; returns undefined
 * when no widget is registered for that id.
 *
 * Uses Object.hasOwn so prototype-chain keys (e.g. "__proto__", "toString")
 * never resolve to truthy non-component values that React would try to render.
 */
export const getWidget = (id: string) =>
  Object.hasOwn(WIDGET_MAP, id)
    ? (WIDGET_MAP[id as WidgetId] as (typeof WIDGET_MAP)[WidgetId])
    : undefined;
