import { describe, expect, it } from 'vitest';
import { WIDGET_MANIFESTS, getWidgetManifest } from '@irdashies/types';
import { WIDGET_MAP, getWidget } from './WidgetIndex';
import { WIDGET_SETTINGS } from './components/Settings/SettingsLoader';

const runtimeModules = import.meta.glob<{ default: { id: string } }>(
  './components/*/widgetRuntimeDefinition.ts',
  { eager: true }
);
const widgetModules = import.meta.glob<{
  default: { id: string } | readonly { id: string }[];
}>('./components/*/widget.ts', { eager: true });
const widgetSources = import.meta.glob<string>('./components/*/widget.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
});

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

  it('declares each widget id exactly once across widget.ts files', () => {
    const ids = Object.values(widgetModules).flatMap(({ default: m }) =>
      (Array.isArray(m) ? m : [m]).map((w) => w.id)
    );
    expect(sorted(ids)).toEqual(manifestIds);
  });

  it('keeps widget.ts files from importing other widget folders (N3)', () => {
    for (const [path, source] of Object.entries(widgetSources)) {
      const folder = path.split('/')[2];
      const crossImports = [...source.matchAll(/from '\.\.\/([^']+)'/g)]
        .map((m) => m[1])
        .filter((target) => target !== '..' && !target.startsWith('../'))
        .filter((target) => target.split('/')[0] !== folder);
      // '../../WidgetIndex' is the only allowed parent import
      expect(crossImports, path).toEqual([]);
    }
  });

  it('ignores prototype keys', () => {
    expect(getWidgetManifest('__proto__')).toBeUndefined();
    expect(getWidget('toString')).toBeUndefined();
  });
});
