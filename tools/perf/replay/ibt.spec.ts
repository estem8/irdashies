import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { importIbt } from './ibt';
import { runOverlayReplay } from './runner';
import { parseReplayOptions } from './options';
import { TapeReader } from '../../telemetry-replay/tape';

function fixture(): Buffer {
  const session = Buffer.from('---\nWeekendInfo:\n TrackID: 1\n...\n\0');
  const variables = Buffer.alloc(144);
  variables.writeInt32LE(5, 0); // double
  variables.writeInt32LE(1, 8);
  variables.write('SessionTime', 16);
  const header = Buffer.alloc(144);
  header.writeInt32LE(2, 0);
  header.writeInt32LE(60, 8);
  header.writeInt32LE(session.length, 16);
  header.writeInt32LE(288, 20);
  header.writeInt32LE(1, 24);
  header.writeInt32LE(144, 28);
  header.writeInt32LE(1, 32);
  header.writeInt32LE(8, 36);
  header.writeInt32LE(288 + session.length, 52);
  header.writeInt32LE(3, 140);
  const frames = Buffer.alloc(24);
  for (let i = 0; i < 3; i++) frames.writeDoubleLE(123 + i / 60, i * 8);
  return Buffer.concat([header, variables, session, frames]);
}
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'ibt-import-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const input = () => path.join(directory, 'source.ibt');
const output = () => path.join(directory, 'normalized.irdt');

describe('IBT input adapter', () => {
  it('preserves exact frame bytes and session data through the tape reader', async () => {
    const ibt = fixture();
    await writeFile(input(), ibt);
    const info = await importIbt(input(), output());
    expect(info).toMatchObject({
      format: 'ibt',
      frames: 3,
      tickRate: 60,
      durationSeconds: 2 / 60,
    });
    const reader = await TapeReader.open(output());
    try {
      expect((await reader.readRecord())?.kind).toBe('sessionInfo');
      for (let i = 0; i < 3; i++) {
        const frame = await reader.readRecord();
        expect(frame?.kind).toBe('frame');
        expect(frame?.payload).toEqual(
          ibt.subarray(ibt.length - 24 + i * 8, ibt.length - 16 + i * 8)
        );
        expect(frame?.elapsedTicks).toBe(BigInt(Math.round((i * 1e6) / 60)));
      }
      expect((await reader.readRecord())?.kind).toBe('end');
    } finally {
      await reader.close();
    }
  });
  it.each(['truncated', 'offset', 'variable', 'overlap', 'empty'])(
    'rejects %s input without leaving a partial tape',
    async (kind) => {
      let ibt = fixture();
      if (kind === 'truncated') ibt = ibt.subarray(0, ibt.length - 1);
      if (kind === 'offset') ibt.writeInt32LE(-1, 52);
      if (kind === 'variable') ibt.writeInt32LE(1000, 144 + 4);
      if (kind === 'overlap') ibt.writeInt32LE(144, 20);
      if (kind === 'empty') ibt.writeInt32LE(0, 140);
      await writeFile(input(), ibt);
      await expect(importIbt(input(), output())).rejects.toThrow();
      await expect(readFile(output())).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  );
  it('never overwrites an existing destination', async () => {
    await writeFile(input(), fixture());
    await writeFile(output(), 'existing');
    await expect(importIbt(input(), output())).rejects.toThrow();
    expect(await readFile(output(), 'utf8')).toBe('existing');
  });
});

it('removes normalized input if profile loading fails before Electron starts', async () => {
  await writeFile(input(), fixture());
  const destination = path.join(directory, 'run');
  const options = parseReplayOptions([
    'replay',
    input(),
    '--profile',
    path.join(directory, 'missing.json'),
    '--output',
    destination,
  ]);
  await expect(runOverlayReplay(options)).rejects.toThrow('ENOENT');
  await expect(
    readFile(path.join(destination, 'input.irdt'))
  ).rejects.toMatchObject({ code: 'ENOENT' });
});
