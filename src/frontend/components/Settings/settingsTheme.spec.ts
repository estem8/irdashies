import { describe, expect, it } from 'vitest';
import { widgetItems } from './menuItems';

describe('settings theme', () => {
  // Uncategorised widgets silently fall into "Extras" in the settings menu.
  it('gives every widget menu item a category', () => {
    const missing = widgetItems
      .filter((item) => item.widgetType && !item.category)
      .map((item) => item.label);
    expect(missing).toEqual([]);
  });

  // Settings themes only remap slate-* and accent-*; these palettes ignore
  // the selected theme. Use slate-* for neutrals and accent-* for highlights.
  it('uses only themeable colours in settings components', () => {
    const sources = import.meta.glob('./**/*.tsx', {
      eager: true,
      query: '?raw',
      import: 'default',
    }) as Record<string, string>;
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
});
