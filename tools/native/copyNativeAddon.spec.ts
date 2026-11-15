import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { copyNativeAddon } from './copyNativeAddon.mts';
it('keeps an already-open addon intact when a changed build replaces its path', () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'native-copy-'));
  const source = path.join(directory, 'source.node'),
    destination = path.join(directory, 'loaded.node');
  fs.writeFileSync(source, 'new binary');
  fs.writeFileSync(destination, 'loaded binary');
  const loaded = fs.openSync(destination, 'r');
  try {
    copyNativeAddon(source, destination);
    expect(fs.readFileSync(destination, 'utf8')).toBe('new binary');
    expect(fs.readFileSync(loaded, 'utf8')).toBe('loaded binary');
    const inode = fs.statSync(destination).ino;
    copyNativeAddon(source, destination);
    expect(fs.statSync(destination).ino).toBe(inode);
    expect(fs.readdirSync(directory).sort()).toEqual([
      'loaded.node',
      'source.node',
    ]);
  } finally {
    fs.closeSync(loaded);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
