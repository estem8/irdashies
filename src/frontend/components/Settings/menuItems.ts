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

/** Menu groups, in display order. */
export const WIDGET_CATEGORIES = [
  { id: 'race', label: 'Timing & Race' },
  { id: 'car', label: 'Car & Driver' },
  { id: 'awareness', label: 'Awareness' },
  { id: 'track', label: 'Track & Conditions' },
  { id: 'extras', label: 'Extras' },
] as const;
export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number]['id'];

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

export const widgetItems: MenuItem[] = [
  {
    to: '/settings/battle',
    path: '/battle',
    label: 'Battle',
    widgetType: 'battle',
    category: 'race',
    description: 'Gaps to cars ahead and behind',
  },
  {
    to: '/settings/blindspotmonitor',
    path: '/blindspotmonitor',
    label: 'Blind Spot Monitor',
    widgetType: 'blindspotmonitor',
    category: 'awareness',
    description: 'Cars alongside, left and right',
  },
  {
    to: '/settings/cornername',
    path: '/cornername',
    label: 'Corner Names',
    widgetType: 'cornername',
    category: 'track',
    description: 'Current corner and section',
  },
  {
    to: '/settings/carsystems',
    path: '/carsystems',
    label: 'Car Systems',
    widgetType: 'carsystems',
    category: 'car',
    description: 'Brake bias, ABS, traction control',
  },
  {
    to: '/settings/deltaspeed',
    path: '/deltaspeed',
    label: 'Delta Speed',
    widgetType: 'deltaspeed',
    category: 'race',
    description: 'Speed versus your best lap',
  },
  {
    to: '/settings/fastercarsfrombehind',
    path: '/fastercarsfrombehind',
    label: 'Faster Cars Behind',
    widgetType: 'fastercarsfrombehind',
    category: 'awareness',
    description: 'Faster classes closing in',
  },
  {
    to: '/settings/flag',
    path: '/flag',
    label: 'Flag',
    widgetType: 'flag',
    category: 'awareness',
    description: 'Track flags',
  },
  {
    to: '/settings/flatmap',
    path: '/flatmap',
    label: 'Flat Track Map',
    widgetType: 'flatmap',
    category: 'track',
    description: 'Straight-line track map',
  },
  {
    to: '/settings/fuel',
    path: '/fuel',
    label: 'Fuel Calculator',
    widgetType: 'fuel',
    category: 'car',
    description: 'Burn rate, laps left, pit fuel',
  },
  {
    to: '/settings/gantry',
    path: '/gantry',
    label: 'Gantry',
    widgetType: 'gantry',
    category: 'race',
    description: 'Race control window',
  },
  {
    to: '/settings/garagecover',
    path: '/garagecover',
    label: 'Garage Cover',
    widgetType: 'garagecover',
    category: 'extras',
    description: 'Covers the screen in the garage',
  },
  {
    to: '/settings/heartrate',
    path: '/heartrate',
    label: 'Heart Rate',
    widgetType: 'heartrate',
    category: 'car',
    description: 'Live heart rate via HypeRate',
  },
  {
    to: '/settings/infobar',
    path: '/infobar',
    label: 'Information Bar',
    widgetType: 'infobar',
    category: 'race',
    description: 'Session and timing bar',
  },
  {
    to: '/settings/input',
    path: '/input',
    label: 'Input',
    widgetType: 'input',
    category: 'car',
    description: 'Throttle, brake and clutch traces',
  },
  {
    to: '/settings/laptimelog',
    path: '/laptimelog',
    label: 'Lap Timer',
    widgetType: 'laptimelog',
    category: 'race',
    description: 'Lap time history',
  },
  {
    to: '/settings/laptrace',
    path: '/laptrace',
    label: 'Lap Trace',
    widgetType: 'laptrace',
    category: 'car',
    description: 'Saved lap inputs along the track',
  },
  {
    to: '/settings/pitlanehelper',
    path: '/pitlanehelper',
    label: 'Pitlane Helper',
    widgetType: 'pitlanehelper',
    category: 'awareness',
    description: 'Pit entry speed and pitbox',
  },
  {
    to: '/settings/radar',
    path: '/radar',
    label: 'Radar',
    widgetType: 'radar',
  },
  {
    to: '/settings/rejoin',
    path: '/rejoin',
    label: 'Rejoin Indicator',
    widgetType: 'rejoin',
    category: 'awareness',
    description: 'Safe-to-rejoin indicator',
  },
  {
    to: '/settings/relative',
    path: '/relative',
    label: 'Relative',
    widgetType: 'relative',
    category: 'race',
    description: 'Cars ahead and behind',
  },
  {
    to: '/settings/sectordelta',
    path: '/sectordelta',
    label: 'Sector Delta',
    widgetType: 'sectordelta',
    category: 'race',
    description: 'Per-sector time deltas',
  },
  {
    to: '/settings/shiftlight',
    path: '/shiftlight',
    label: 'Shift Light',
    widgetType: 'shiftlight',
  },
  {
    to: '/settings/slowcarahead',
    path: '/slowcarahead',
    label: 'Slow Car Ahead',
    widgetType: 'slowcarahead',
    category: 'awareness',
    description: 'Slow cars ahead warning',
  },
  {
    to: '/settings/standings',
    path: '/standings',
    label: 'Standings',
    widgetType: 'standings',
    category: 'race',
    description: 'Class positions',
  },
  {
    to: '/settings/tachometer',
    path: '/tachometer',
    label: 'Tachometer',
    widgetType: 'tachometer',
    category: 'car',
    description: 'RPM and shift lights',
  },
  {
    to: '/settings/map',
    path: '/map',
    label: 'Track Map',
    widgetType: 'map',
    category: 'track',
    description: 'Circuit map with cars',
  },
  {
    to: '/settings/twitchchat',
    path: '/twitchchat',
    label: 'Twitch Chat',
    widgetType: 'twitchchat',
    category: 'extras',
    description: 'Twitch chat feed',
  },
  {
    to: '/settings/weather',
    path: '/weather',
    label: 'Weather',
    widgetType: 'weather',
    category: 'track',
    description: 'Temperatures, wind, wetness',
  },
  {
    to: '/settings/wind',
    path: '/wind',
    label: 'Wind',
    widgetType: 'wind',
    category: 'track',
    description: 'Wind direction and speed',
  },
];

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
 * Friendly label for a widget given its type (falls back to the raw type when
 * the widget isn't in the settings menu).
 */
export function widgetLabel(widgetType: string): string {
  return (
    widgetItems.find((item) => item.widgetType === widgetType)?.label ??
    widgetType
  );
}
