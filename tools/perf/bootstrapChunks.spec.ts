// @vitest-environment node
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('bundled performance profile bootstrap', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'irdashies-bootstrap-'));
    const bootstrap = path.resolve('src/app/perfUserData.ts');
    const storage = path.join(directory, 'storage.ts');
    await writeFile(
      storage,
      "import { app } from 'electron'; export const capturedPath = app.getPath('userData');"
    );
    const entry = path.join(directory, 'entry.ts');
    await writeFile(
      entry,
      `import ${JSON.stringify(bootstrap)}; export { capturedPath } from './storage';`
    );
    const config = {
      configFile: false,
      logLevel: 'silent',
      build: {
        outDir: path.join(directory, 'out'),
        minify: false,
        lib: { entry, formats: ['cjs'], fileName: 'entry' },
        rollupOptions: {
          external: ['electron', 'node:fs', 'node:path'],
        },
      },
    };
    const script = path.join(directory, 'bundle.mjs');
    await writeFile(
      script,
      `import { build } from ${JSON.stringify(pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')).href)};
import { perfStartupChunk } from ${JSON.stringify(pathToFileURL(path.resolve('tools/perf/bootstrapChunks.mts')).href)};
const config = ${JSON.stringify(config)};
config.build.rollupOptions.output = {
  entryFileNames: 'entry.cjs',
  manualChunks: id => perfStartupChunk(id) ?? (id === ${JSON.stringify(storage)} ? 'storage' : undefined),
};
await build(config);`
    );
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '' },
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it.each([true, false])(
    'selects the correct storage path before a shared chunk loads (perf=%s)',
    (enabled) => {
      let currentPath = '/original-profile';
      const calls: string[] = [];
      const cache = new Map<string, { exports: Record<string, unknown> }>();
      const load = (file: string): Record<string, unknown> => {
        const cached = cache.get(file);
        if (cached) return cached.exports;
        const module = { exports: {} as Record<string, unknown> };
        cache.set(file, module);
        const requireModule = (specifier: string): unknown => {
          if (specifier === 'electron') {
            return {
              app: {
                setPath: (_name: string, value: string) => {
                  calls.push('setPath');
                  currentPath = value;
                },
                getPath: () => {
                  calls.push('getPath');
                  return currentPath;
                },
              },
            };
          }
          if (specifier === 'node:fs') return { mkdirSync: () => undefined };
          if (specifier === 'node:path') return path;
          if (specifier.startsWith('.')) {
            return load(path.resolve(path.dirname(file), specifier));
          }
          throw new Error(`Unexpected bundled import: ${specifier}`);
        };
        vm.runInNewContext(readFileSync(file, 'utf8'), {
          require: requireModule,
          module,
          exports: module.exports,
          process: {
            env: {
              PERF_METRICS: enabled ? '1' : '0',
              PERF_USER_DATA_DIR: '/isolated-profile',
            },
          },
        });
        return module.exports;
      };

      const result = load(path.join(directory, 'out', 'entry.cjs'));
      expect(result.capturedPath).toBe(
        enabled ? path.resolve('/isolated-profile') : '/original-profile'
      );
      expect(calls).toEqual(enabled ? ['setPath', 'getPath'] : ['getPath']);
    }
  );
});
