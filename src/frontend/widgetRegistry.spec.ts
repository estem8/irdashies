import { describe, expect, it } from 'vitest';
import { WIDGET_MANIFESTS, getWidgetManifest } from '@irdashies/types';
import { WIDGET_MAP, getWidget } from './WidgetIndex';
import { WIDGET_SETTINGS } from './components/Settings/SettingsLoader';

const runtimeModules = import.meta.glob<{ default: { id: string } }>(
  './components/*/widgetRuntimeDefinition.ts',
  { eager: true }
);
const widgetModules = import.meta.glob('./components/*/widget.ts');

const sorted = (ids: string[]) => [...ids].sort();

describe('widget registry', () => {
  const manifestIds = sorted(WIDGET_MANIFESTS.map((m) => m.id));

  it('has unique manifest ids', () => {
    expect(new Set(manifestIds).size).toBe(manifestIds.length);
  });

  it('keeps manifests, components, settings and runtime definitions in sync', () => {
    expect(sorted(Object.keys(WIDGET_MAP))).toEqual(manifestIds);
    expect(sorted(Object.keys(WIDGET_SETTINGS))).toEqual(manifestIds);
    expect(
      sorted(Object.values(runtimeModules).map((m) => m.default.id))
    ).toEqual(manifestIds);
  });

  it('has a widget.ts next to every widgetRuntimeDefinition.ts', () => {
    for (const path of Object.keys(runtimeModules)) {
      expect(widgetModules).toHaveProperty([
        path.replace('widgetRuntimeDefinition.ts', 'widget.ts'),
      ]);
    }
  });

  it('ignores prototype keys', () => {
    expect(getWidgetManifest('__proto__')).toBeUndefined();
    expect(getWidget('toString')).toBeUndefined();
  });
});
