import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import {
  getInstalledPluginManifest,
  readInstalledWidgetPluginAsset,
  scanInstalledWidgetPlugins,
} from './pluginLoader';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../logger', () => ({ default: loggerMocks }));

const defaultManifest = () => ({
  manifestVersion: 1,
  id: 'author.weather-widget',
  name: 'Weather Widget',
  version: '1.0.0',
  apiVersion: 1,
  entry: 'dist/index.js',
  styles: ['dist/widget.css'],
  widget: {
    name: 'Weather',
    defaultLayout: { width: 240, height: 320 },
    defaultConfig: { units: 'metric', showWind: true },
    settings: [
      {
        key: 'units',
        type: 'select',
        label: 'Units',
        options: ['metric', 'imperial'],
      },
      { key: 'showWind', type: 'boolean', label: 'Show wind' },
    ],
  },
  requires: { channels: ['session-bar.snapshot'] },
});

const makeZip = (
  manifest: Record<string, unknown> = defaultManifest(),
  extraFiles: Record<string, string> = {}
) => {
  const files: Record<string, Uint8Array> = {
    'source-folder/plugin.json': strToU8(JSON.stringify(manifest)),
    'source-folder/dist/index.js': strToU8(
      'globalThis.IrdashiesPlugin_author$dot$weather$dash$widget = {};'
    ),
    'source-folder/dist/widget.css': strToU8(
      '.plugin-widget { color: white; }'
    ),
  };
  for (const [name, body] of Object.entries(extraFiles)) {
    files[`source-folder/${name}`] = strToU8(body);
  }
  return zipSync(files);
};

let pluginsRoot: string;

beforeEach(async () => {
  pluginsRoot = await mkdtemp(path.join(tmpdir(), 'irdashies-plugins-'));
});

afterEach(async () => {
  await rm(pluginsRoot, { recursive: true, force: true });
});

const addZip = async (filename: string, contents: Uint8Array) => {
  await writeFile(path.join(pluginsRoot, filename), contents);
};

describe('plugin ZIP startup loader', () => {
  it('extracts a valid package, returns only file URLs, and registers its manifest', async () => {
    await addZip('weather.zip', makeZip());

    const plugins = await scanInstalledWidgetPlugins(pluginsRoot);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.id).toBe('author.weather-widget');
    expect(plugins[0].entryUrl).toMatch(/^file:/);
    expect(plugins[0].styleUrls).toHaveLength(1);
    expect(plugins[0].styleUrls[0]).toMatch(/^file:/);
    expect(
      await readFile(fileURLToPath(plugins[0].entryUrl), 'utf8')
    ).toContain('IrdashiesPlugin_author');
    expect(
      await readFile(fileURLToPath(plugins[0].styleUrls[0]), 'utf8')
    ).toContain('.plugin-widget');
    expect(getInstalledPluginManifest('author.weather-widget')).toEqual(
      plugins[0].manifest
    );

    await expect(
      readInstalledWidgetPluginAsset('author.weather-widget', 'dist/index.js')
    ).resolves.toEqual(await readFile(fileURLToPath(plugins[0].entryUrl)));
    await expect(
      readInstalledWidgetPluginAsset('author.weather-widget', '../outside.txt')
    ).resolves.toBeUndefined();
    await expect(
      readInstalledWidgetPluginAsset('author.weather-widget', 'plugin.json')
    ).resolves.toBeUndefined();
  });

  it('returns an empty registry when the plugin root cannot be opened', async () => {
    const notDirectory = path.join(pluginsRoot, 'not-a-directory');
    await writeFile(notDirectory, 'not a directory');

    expect(await scanInstalledWidgetPlugins(notDirectory)).toEqual([]);
    expect(getInstalledPluginManifest('author.weather-widget')).toBeUndefined();
  });

  it('loads a valid ZIP when another package in the directory is malformed', async () => {
    await addZip('bad.zip', strToU8('not a ZIP archive'));
    const valid = defaultManifest();
    valid.id = 'author.other-widget';
    await addZip('good.zip', makeZip(valid));

    const installed = await scanInstalledWidgetPlugins(pluginsRoot);

    expect(installed.map((plugin) => plugin.manifest.id)).toEqual([
      'author.other-widget',
    ]);
  });

  it('rejects unsafe archive paths before extraction', async () => {
    const files = {
      'source-folder/plugin.json': strToU8(JSON.stringify(defaultManifest())),
      'source-folder/dist/index.js': strToU8('entry'),
      'source-folder/../outside.txt': strToU8('outside'),
    };
    await addZip('unsafe.zip', zipSync(files));

    expect(await scanInstalledWidgetPlugins(pluginsRoot)).toEqual([]);
    expect(await readdir(path.join(pluginsRoot, '.installed'))).toEqual([]);
  });

  it.each([
    ['event channel', ['session.lifecycle']],
    ['unknown channel', ['missing.snapshot']],
  ])(
    'rejects manifests declaring an unsupported %s',
    async (_label, channels) => {
      const manifest = defaultManifest();
      manifest.requires.channels = channels;
      await addZip('invalid-channel.zip', makeZip(manifest));

      expect(await scanInstalledWidgetPlugins(pluginsRoot)).toEqual([]);
    }
  );

  it('rejects malformed and built-in-conflicting plugin IDs', async () => {
    const malformed = defaultManifest();
    malformed.id = 'widget';
    await addZip('malformed-id.zip', makeZip(malformed));
    expect(await scanInstalledWidgetPlugins(pluginsRoot)).toEqual([]);

    await rm(path.join(pluginsRoot, 'malformed-id.zip'));
    const conflicting = defaultManifest();
    conflicting.id = 'author.weather-widget';
    await addZip('conflict.zip', makeZip(conflicting));
    expect(
      await scanInstalledWidgetPlugins(pluginsRoot, ['author.weather-widget'])
    ).toEqual([]);
  });

  it('rejects duplicate IDs instead of choosing based on ZIP filename order', async () => {
    await addZip('a.zip', makeZip());
    const other = defaultManifest();
    other.version = '2.0.0';
    await addZip('z.zip', makeZip(other));

    expect(await scanInstalledWidgetPlugins(pluginsRoot)).toEqual([]);
    expect(getInstalledPluginManifest('author.weather-widget')).toBeUndefined();
    expect(await readdir(path.join(pluginsRoot, '.installed'))).toEqual([]);
  });

  it('rejects styles that are unsafe or do not name a package file', async () => {
    const traversal = defaultManifest();
    traversal.styles = ['../widget.css'];
    await addZip('unsafe-style.zip', makeZip(traversal));
    expect(await scanInstalledWidgetPlugins(pluginsRoot)).toEqual([]);

    await rm(path.join(pluginsRoot, 'unsafe-style.zip'));
    const missing = defaultManifest();
    missing.styles = ['dist/missing.css'];
    await addZip('missing-style.zip', makeZip(missing));
    expect(await scanInstalledWidgetPlugins(pluginsRoot)).toEqual([]);
  });

  it('enforces declared uncompressed limits before starting extraction', async () => {
    const zip = Buffer.from(makeZip());
    let centralOffset = 0;
    while (centralOffset < zip.length - 46) {
      if (zip.readUInt32LE(centralOffset) === 0x02014b50) {
        const nameLength = zip.readUInt16LE(centralOffset + 28);
        const name = zip.toString(
          'utf8',
          centralOffset + 46,
          centralOffset + 46 + nameLength
        );
        if (name.endsWith('/dist/index.js')) {
          zip.writeUInt32LE(32 * 1024 * 1024 + 1, centralOffset + 24);
          break;
        }
        centralOffset +=
          46 +
          nameLength +
          zip.readUInt16LE(centralOffset + 30) +
          zip.readUInt16LE(centralOffset + 32);
      } else {
        centralOffset += 1;
      }
    }
    await addZip('oversized.zip', zip);

    expect(await scanInstalledWidgetPlugins(pluginsRoot)).toEqual([]);
  });

  it('keeps the last valid package active when a replacement ZIP is invalid', async () => {
    await addZip('weather.zip', makeZip());
    const first = await scanInstalledWidgetPlugins(pluginsRoot);
    const entry = fileURLToPath(first[0].entryUrl);
    const original = await readFile(entry, 'utf8');

    await addZip('weather.zip', strToU8('not a ZIP archive'));
    const afterInvalidUpdate = await scanInstalledWidgetPlugins(pluginsRoot);
    expect(afterInvalidUpdate).toHaveLength(1);
    expect(afterInvalidUpdate[0].manifest.version).toBe('1.0.0');
    expect(fileURLToPath(afterInvalidUpdate[0].entryUrl)).toBe(entry);
    expect(await readFile(entry, 'utf8')).toBe(original);
  });

  it('keeps a cached plugin installed after its source ZIP is removed', async () => {
    await addZip('weather.zip', makeZip());
    await scanInstalledWidgetPlugins(pluginsRoot);
    loggerMocks.info.mockClear();

    await rm(path.join(pluginsRoot, 'weather.zip'));
    const installed = await scanInstalledWidgetPlugins(pluginsRoot);

    expect(installed.map((plugin) => plugin.manifest.id)).toEqual([
      'author.weather-widget',
    ]);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      '[Plugins] Using cached package author.weather-widget; deleting its source ZIP does not uninstall it'
    );
  });
});
