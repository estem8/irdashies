import type { WidgetManifest } from './types';

export * from './types';

const discovered = import.meta.glob<{ default: WidgetManifest }>(
  ['./*.ts', '!./index.ts', '!./types.ts', '!./*.spec.ts'],
  { eager: true }
);

export const WIDGET_MANIFESTS: readonly WidgetManifest[] = Object.values(
  discovered
)
  .map((module) => module.default)
  .sort((a, b) => a.id.localeCompare(b.id));

/** Accepts a raw string; unknown and prototype keys return undefined. */
export const getWidgetManifest = (id: string): WidgetManifest | undefined =>
  WIDGET_MANIFESTS.find((manifest) => manifest.id === id);
