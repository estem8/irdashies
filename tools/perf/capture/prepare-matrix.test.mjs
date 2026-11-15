import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('prepares matching snapshots using only reachable baseline commits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prepare-matrix-'));
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: root });
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  try {
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL('./prepare-matrix.mjs', import.meta.url)),
        directory,
      ],
      { cwd: root }
    );
    const manifest = JSON.parse(
      await readFile(join(directory, 'manifest.json'), 'utf8')
    );
    assert.equal(manifest.length, 6);
    for (const entry of manifest) {
      // A locally retained backup object is insufficient for a fresh clone.
      git('merge-base', '--is-ancestor', entry.baselineCommit, 'HEAD');
      const before = await readFile(join(directory, 'baseline', entry.file));
      const after = await readFile(join(directory, 'candidate', entry.file));
      assert.deepEqual(
        before,
        git('show', `${entry.baselineCommit}:${entry.file}`)
      );
      assert.deepEqual(after, await readFile(join(root, entry.file)));
      assert.equal(hash(before), entry.beforeSha256);
      assert.equal(hash(after), entry.afterSha256);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
