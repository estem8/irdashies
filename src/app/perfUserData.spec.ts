import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
const setPath = vi.hoisted(() =>
  vi.fn((name: string, value: string) => {
    calls.push(`setPath:${name}:${value}`);
  })
);
const mkdirSync = vi.hoisted(() =>
  vi.fn((value: string) => {
    calls.push(`mkdir:${value}`);
  })
);

vi.mock('electron', () => ({ app: { setPath } }));
vi.mock('node:fs', () => ({ mkdirSync }));

describe('performance user data bootstrap', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    calls.length = 0;
  });

  it('creates and selects the isolated profile synchronously during import', async () => {
    vi.stubEnv('PERF_METRICS', '1');
    vi.stubEnv('PERF_USER_DATA_DIR', './perf-profile');

    await import('./perfUserData');

    const expectedPath = path.resolve('./perf-profile');
    expect(calls).toEqual([
      `mkdir:${expectedPath}`,
      `setPath:userData:${expectedPath}`,
    ]);
    expect(mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
  });

  it('does nothing outside performance runs', async () => {
    vi.stubEnv('PERF_METRICS', '0');
    vi.stubEnv('PERF_USER_DATA_DIR', './perf-profile');

    await import('./perfUserData');

    expect(mkdirSync).not.toHaveBeenCalled();
    expect(setPath).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('does nothing when the path is %j', async (dir) => {
    vi.stubEnv('PERF_METRICS', '1');
    if (dir === undefined) delete process.env.PERF_USER_DATA_DIR;
    else vi.stubEnv('PERF_USER_DATA_DIR', dir);

    await import('./perfUserData');

    expect(mkdirSync).not.toHaveBeenCalled();
    expect(setPath).not.toHaveBeenCalled();
  });

  it('is the first dependency evaluated by the application entrypoint', async () => {
    const mainSource = await readFile('src/main.ts', 'utf8');
    expect(mainSource.trimStart()).toMatch(
      /^import ['"]\.\/app\/perfUserData['"];?/
    );
  });
});
