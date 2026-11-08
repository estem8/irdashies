import { describe, expect, it } from 'vitest';
import { getPluginGlobalExport, PUBLIC_PLUGIN_CHANNELS } from './plugins';
import { PUBLIC_PLUGIN_CHANNELS as SDK_PUBLIC_PLUGIN_CHANNELS } from '../../packages/plugin-api/src';

describe('PUBLIC_PLUGIN_CHANNELS', () => {
  it('contains only the explicitly supported public plugin channels', () => {
    expect(PUBLIC_PLUGIN_CHANNELS).toContain('session-bar.snapshot');
    expect(PUBLIC_PLUGIN_CHANNELS).toContain('track-state.snapshot');
    expect(PUBLIC_PLUGIN_CHANNELS).not.toContain('replay.context');
    expect(PUBLIC_PLUGIN_CHANNELS).not.toContain('session.lifecycle');
  });

  it('matches the author SDK channel list', () => {
    expect(PUBLIC_PLUGIN_CHANNELS).toEqual(SDK_PUBLIC_PLUGIN_CHANNELS);
  });
});

describe('getPluginGlobalExport', () => {
  it('derives valid JavaScript identifiers without collapsing ID separators', () => {
    expect(getPluginGlobalExport('author.weather-widget')).toBe(
      'IrdashiesPlugin_author$dot$weather$dash$widget'
    );
    expect(getPluginGlobalExport('author.a-b')).not.toBe(
      getPluginGlobalExport('author.a.b')
    );
  });

  it.each(['weather', 'author..weather', 'Author.weather', 'author.weather_1'])(
    'rejects invalid plugin ID %s',
    (id) => {
      expect(() => getPluginGlobalExport(id)).toThrow(
        'Invalid widget plugin ID'
      );
    }
  );

  it('accepts an ID of exactly 128 characters', () => {
    const id = `a.${'b'.repeat(126)}`;
    expect(id).toHaveLength(128);
    expect(getPluginGlobalExport(id)).toBe(
      `IrdashiesPlugin_a$dot$${'b'.repeat(126)}`
    );
  });

  it('rejects IDs longer than 128 characters', () => {
    expect(() => getPluginGlobalExport(`author.${'a'.repeat(122)}`)).toThrow(
      'Invalid widget plugin ID'
    );
  });
});
