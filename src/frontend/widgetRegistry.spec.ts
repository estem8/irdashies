import { describe, expect, it } from 'vitest';
import {
  WIDGET_MANIFESTS,
  WIDGET_ORDER,
  getWidgetManifest,
  defaultDashboard,
  getWidgetDefaultConfig,
} from '@irdashies/types/widgetDefaults';
import {
  widgetItems,
  widgetLabel,
  WIDGET_CATEGORIES,
} from './components/Settings/menuItems';
import { WIDGET_NAMES } from './constants/widgetNames';
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
    // Telemetry Inspector's settings live on the Advanced page.
    expect(sorted(Object.keys(WIDGET_SETTINGS))).toEqual(
      manifestIds.filter((id) => id !== 'telemetryinspector')
    );
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
      // Static and dynamic imports, either quote style.
      const specifiers = [
        ...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g),
      ].map((m) => m[1]);
      const crossImports = specifiers.filter((spec) => {
        const aliased = spec.match(/^@irdashies\/components\/([^/]+)/);
        if (aliased) return aliased[1] !== folder;
        const sibling = spec.match(/^\.\.\/([^./][^/]*)/);
        return !!sibling && sibling[1] !== folder;
      });
      // '../../WidgetIndex' (a parent, not a sibling folder) is allowed.
      expect(crossImports, path).toEqual([]);
    }
  });

  it('lists only real widget ids in WIDGET_ORDER', () => {
    expect(WIDGET_ORDER.filter((id) => !manifestIds.includes(id))).toEqual([]);
  });

  it('ignores prototype keys', () => {
    expect(getWidgetManifest('__proto__')).toBeUndefined();
    expect(getWidget('toString')).toBeUndefined();
  });
});

describe('manifest consumers', () => {
  it('produces one default widget and display name per registered manifest', () => {
    expect(sorted(defaultDashboard.widgets.map(({ id }) => id))).toEqual(
      sorted(WIDGET_MANIFESTS.map(({ id }) => id))
    );
    expect(sorted(Object.keys(WIDGET_NAMES))).toEqual(
      sorted(WIDGET_MANIFESTS.map(({ id }) => id))
    );
    for (const manifest of WIDGET_MANIFESTS) {
      expect(
        defaultDashboard.widgets.find(({ id }) => id === manifest.id)
      ).toEqual({
        id: manifest.id,
        enabled: manifest.enabled,
        ...(manifest.alwaysEnabled !== undefined && {
          alwaysEnabled: manifest.alwaysEnabled,
        }),
        layout: manifest.layout,
        config: manifest.config,
      });
      expect(getWidgetDefaultConfig(manifest.id)).toEqual(manifest.config);
      expect(WIDGET_NAMES[manifest.id]).toBe(manifest.name);
      expect(getWidgetManifest(manifest.id)).toBe(manifest);
      expect(getWidget(manifest.id)).toBeDefined();
    }
  });

  it('lists each visible widget once with its settings route and description', () => {
    const visible = WIDGET_MANIFESTS.filter(
      (manifest) => manifest.showInMenu !== false
    );
    expect(
      sorted(
        widgetItems.flatMap((item) =>
          item.widgetType ? [item.widgetType] : []
        )
      )
    ).toEqual(sorted(visible.map(({ id }) => id)));
    for (const manifest of visible) {
      expect(
        widgetItems.find((item) => item.widgetType === manifest.id)
      ).toEqual({
        to: `/settings/${manifest.id}`,
        path: `/${manifest.id}`,
        label: manifest.menuLabel ?? manifest.name,
        widgetType: manifest.id,
        category: manifest.category,
        description: manifest.description,
      });
      expect(WIDGET_CATEGORIES.map(({ id }) => id)).toContain(
        manifest.category
      );
      expect(manifest.description?.trim()).toBeTruthy();
    }
    const labels = widgetItems.map(({ label }) => label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it('keeps developer widgets registered while omitting them from the menu', () => {
    expect(getWidget('telemetryinspector')).toBeDefined();
    expect(getWidgetManifest('telemetryinspector')).toBeDefined();
    expect(
      widgetItems.some((item) => item.widgetType === 'telemetryinspector')
    ).toBe(false);
    // Not in the menu, but still named (e.g. in Key Bindings).
    expect(widgetLabel('telemetryinspector')).toBe(
      getWidgetManifest('telemetryinspector')?.name
    );
  });

  it.each([
    '',
    'unknown-widget',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
  ])(
    'rejects an unregistered id %j without resolving prototype members',
    (id) => {
      expect(getWidget(id)).toBeUndefined();
      expect(getWidgetManifest(id)).toBeUndefined();
      expect(widgetLabel(id)).toBe(id);
    }
  );
});
