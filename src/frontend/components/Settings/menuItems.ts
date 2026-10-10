import {
  SlidersHorizontalIcon,
  UsersIcon,
  TagIcon,
  ScalesIcon,
  KeyboardIcon,
  WrenchIcon,
  InfoIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { WidgetCategory } from '@irdashies/types';
import {
  WIDGET_MANIFESTS,
  getWidgetManifest,
} from '@irdashies/types/widgetDefaults';

/** Menu groups, in display order. */
export const WIDGET_CATEGORIES = [
  { id: 'race', label: 'Timing & Race' },
  { id: 'car', label: 'Car & Driver' },
  { id: 'awareness', label: 'Awareness' },
  { id: 'track', label: 'Track & Conditions' },
  { id: 'extras', label: 'Extras' },
] as const satisfies readonly { id: WidgetCategory; label: string }[];
export type { WidgetCategory };

export interface MenuItem {
  to: string;
  path: string;
  label: string;
  widgetType?: string;
  category?: WidgetCategory;
  /** One line under the label in the settings menu. */
  description?: string;
  icon?: Icon;
}

export const generalItems: MenuItem[] = [
  {
    to: '/settings/general',
    path: '/general',
    label: 'General',
    icon: SlidersHorizontalIcon,
  },
  {
    to: '/settings/profiles',
    path: '/profiles',
    label: 'Profiles',
    icon: UsersIcon,
  },
  {
    to: '/settings/keybindings',
    path: '/keybindings',
    label: 'Key Bindings',
    icon: KeyboardIcon,
  },
  {
    to: '/settings/driver-tags',
    path: '/driver-tags',
    label: 'Driver Tags',
    icon: TagIcon,
  },
  {
    to: '/settings/car-setup',
    path: '/car-setup',
    label: 'Setup Comparison',
    icon: ScalesIcon,
  },
];

export const widgetItems: MenuItem[] = WIDGET_MANIFESTS.filter(
  (manifest) => manifest.showInMenu !== false
)
  .map(({ id, name, menuLabel, category, description }) => ({
    to: `/settings/${id}`,
    path: `/${id}`,
    label: menuLabel ?? name,
    widgetType: id,
    category,
    description,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const bottomItems: MenuItem[] = [
  {
    to: '/settings/advanced',
    path: '/advanced',
    label: 'Advanced',
    icon: WrenchIcon,
  },
  { to: '/settings/about', path: '/about', label: 'About', icon: InfoIcon },
];

/**
 * Friendly label for a widget given its type: the menu label, or the manifest
 * name for widgets not in the menu; the raw type for unknown ids.
 */
export function widgetLabel(widgetType: string): string {
  const manifest = getWidgetManifest(widgetType);
  return manifest ? (manifest.menuLabel ?? manifest.name) : widgetType;
}
