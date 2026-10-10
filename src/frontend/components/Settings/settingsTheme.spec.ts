import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_THEMES, APP_THEME_TITLE_BAR } from '@irdashies/types';
import { widgetItems } from './menuItems';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');
const themeCss = read('../../theme.css');
const settingsLayoutSource = read('SettingsLayout.tsx');

describe('settings theme', () => {
  // Uncategorised widgets silently fall into "Extras" in the settings menu.
  it('gives every widget menu item a category', () => {
    const missing = widgetItems
      .filter((item) => item.widgetType && !item.category)
      .map((item) => item.label);
    expect(missing).toEqual([]);
  });

  // App themes only remap slate-* and accent-*; these palettes ignore the
  // selected theme. Use slate-* for neutrals and accent-* for highlights.
  // Covers the settings window and the edit-layout chrome drawn over overlays.
  it('uses only themeable colours in settings and edit-mode UI', () => {
    const sources = import.meta.glob(
      [
        './**/*.tsx',
        '../EditMode/**/*.tsx',
        '../WidgetContainer/**/*.tsx',
        '../OverlayContainer/**/*.tsx',
        '../DashboardView/**/*.tsx',
      ],
      {
        eager: true,
        query: '?raw',
        import: 'default',
      }
    ) as Record<string, string>;
    const offenders = Object.entries(sources)
      .filter(
        ([path]) => !path.includes('.stories.') && !path.includes('.spec.')
      )
      .flatMap(([path, source]) =>
        [...source.matchAll(/\b[a-z]+-(?:gray|blue|sky|cyan|indigo)-\d+/g)].map(
          ([match]) => `${path}: ${match}`
        )
      );
    expect(offenders).toEqual([]);
  });

  // Solid accent can be light (Carbon's amber): text on it must be
  // text-on-accent, never text-white.
  it('uses text-on-accent on solid accent backgrounds', () => {
    const sources = import.meta.glob(
      [
        './**/*.tsx',
        '../EditMode/**/*.tsx',
        '../WidgetContainer/**/*.tsx',
        '../OverlayContainer/**/*.tsx',
        '../DashboardView/**/*.tsx',
      ],
      { eager: true, query: '?raw', import: 'default' }
    ) as Record<string, string>;
    const offenders = Object.entries(sources)
      .filter(
        ([path]) => !path.includes('.stories.') && !path.includes('.spec.')
      )
      .flatMap(([path, source]) =>
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
  // Classic uses Tailwind's own slate, which doesn't change.
  it.each(APP_THEMES.filter((theme) => theme !== 'classic'))(
    'title bar colours match the %s theme',
    (theme) => {
      const block = themeCss.match(
        new RegExp(`\\n\\.theme-${theme} \\{([^}]*)\\}`)
      )?.[1];
      const token = (name: string) =>
        block?.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1];
      expect(APP_THEME_TITLE_BAR[theme]).toEqual({
        color: token('slate-700'),
        symbolColor: token('slate-300'),
      });
    }
  );

  // The window uses titleBarStyle 'hidden': without a drag region in the
  // header it can't be moved.
  it('keeps a drag region in the settings header', () => {
    expect(settingsLayoutSource).toContain('[-webkit-app-region:drag]');
  });
});
