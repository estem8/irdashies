import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('performance runner window-mode validation', () => {
  it.each([
    ['--window-mode'],
    ['--window-mode', '--target', 'dev'],
    ['--window-mode', 'invalid'],
  ])('rejects invalid arguments %j before launching the app', (...args) => {
    const result = spawnSync(
      process.execPath,
      [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        resolve('tools/perf/run.ts'),
        ...args,
      ],
      { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--window-mode must be display or widget');
    expect(result.stdout).not.toContain('Performance run:');
  });
});

describe('performance runner user-data directory validation', () => {
  it.each([
    ['--user-data-dir', '/tmp/perf profile'],
    ['--user-data-dir=/tmp/perf profile'],
  ])('rejects unsafe paths before launching the app: %j', (...args) => {
    const result = spawnSync(
      process.execPath,
      [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        resolve('tools/perf/run.ts'),
        ...args,
      ],
      { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '--user-data-dir requires a path without shell metacharacters or spaces.'
    );
    expect(result.stdout).not.toContain('Performance run:');
  });
  it.each([
    ['--user-data-dir'],
    ['--user-data-dir', '--mode', 'empty'],
    ['--user-data-dir='],
  ])('rejects a missing path before launching the app: %j', (...args) => {
    const result = spawnSync(
      process.execPath,
      [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        resolve('tools/perf/run.ts'),
        ...args,
      ],
      { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--user-data-dir requires a path value.');
    expect(result.stdout).not.toContain('Performance run:');
  });
});
