import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTINGS_THEMES, SETTINGS_TITLE_BAR } from '@irdashies/types';
import { widgetItems } from './menuItems';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');
const themeCss = read('../../theme.css');
const settingsLayoutSource = read('SettingsLayout.tsx');

// Settings component sources (no stories or specs), for the colour guards.
const componentSources = Object.fromEntries(
  Object.entries(
    import.meta.glob('./**/*.tsx', {
      eager: true,
      query: '?raw',
      import: 'default',
    }) as Record<string, string>
  ).filter(([path]) => !path.includes('.stories.') && !path.includes('.spec.'))
);

/** Custom properties a CSS rule block sets, e.g. `--color-slate-700`. */
const tokensIn = (selector: string) =>
  [
    ...(themeCss
      .match(new RegExp(`${selector.replace(/\./g, '\\.')} \\{([^}]*)\\}`))?.[1]
      .matchAll(/(--[\w-]+):/g) ?? []),
  ].map(([, name]) => name);

describe('settings theme', () => {
  // Uncategorised widgets silently fall into "Extras" in the settings menu.
  // Items hidden from the menu (their settings live on another page) need none.
  it('gives every widget menu item a category', () => {
    const missing = widgetItems
      .filter((item) => item.widgetType && !item.hideInMenu && !item.category)
      .map((item) => item.label);
    expect(missing).toEqual([]);
  });

  // Settings themes only remap slate-* and accent-*; these palettes ignore
  // the selected theme. Use slate-* for neutrals and accent-* for highlights.
  it('uses only themeable colours in settings components', () => {
    const offenders = Object.entries(componentSources).flatMap(
      ([path, source]) =>
        [...source.matchAll(/\b[a-z]+-(?:gray|blue|sky|cyan|indigo)-\d+/g)].map(
          ([match]) => `${path}: ${match}`
        )
    );
    expect(offenders).toEqual([]);
  });

  // Solid accent can be light (Carbon's amber): text on it must be
  // text-on-accent, never text-white.
  it('uses text-on-accent on solid accent backgrounds', () => {
    const offenders = Object.entries(componentSources).flatMap(
      ([path, source]) =>
        source
          .split(/["'`]/)
          .filter(
            (literal) =>
              /\bbg-accent-(?:400|500|600|700)(?![\w/-])/.test(literal) &&
              /\btext-white\b/.test(literal)
          )
          .map((literal) => `${path}: ${literal.trim().slice(0, 80)}`)
    );
    expect(offenders).toEqual([]);
  });

  // The main process paints the native window controls itself and can't read
  // theme.css, so its colours are a copy that must follow the theme palette.
  it.each(SETTINGS_THEMES)('title bar colours match the %s theme', (theme) => {
    const block = themeCss.match(
      new RegExp(`\\.settings-theme-${theme} \\{([^}]*)\\}`)
    )?.[1];
    const token = (name: string) =>
      block?.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1];
    expect(SETTINGS_TITLE_BAR[theme]).toEqual({
      color: token('slate-700'),
      symbolColor: token('slate-300'),
    });
  });

  // The window uses titleBarStyle 'hidden': without a drag region in the
  // header it can't be moved.
  it('keeps a drag region in the settings header', () => {
    expect(settingsLayoutSource).toContain('[-webkit-app-region:drag]');
  });

  // Widget previews render real overlay components: every token a theme
  // changes must be reset there, or the preview stops matching the overlay.
  it.each(SETTINGS_THEMES)(
    'overlay previews reset every token the %s theme sets',
    (theme) => {
      const reset = tokensIn('.settings-theme .overlay-preview');
      const themed = [
        ...tokensIn('.settings-theme'),
        ...tokensIn(`.settings-theme-${theme}`),
      ];
      expect(themed.length).toBeGreaterThan(10);
      expect(themed.filter((token) => !reset.includes(token))).toEqual([]);
    }
  );
});
