import { expect, it } from 'vitest';
import { parsePrivateMemory } from './memory.mjs';
import { parseReplayOptions } from './options';
it('preserves unavailable private-memory fields instead of fabricating zeros', () => {
  expect(
    parsePrivateMemory(
      'Rss: 1024 kB\nPrivate_Clean: 5 kB\nPrivate_Dirty: 7 kB\n'
    )
  ).toMatchObject({
    rssBytes: 1048576,
    privateBytes: 12288,
    anonymousBytes: null,
  });
  expect(parsePrivateMemory('Rss: 0 kB\n')).toMatchObject({
    rssBytes: 0,
    privateBytes: null,
  });
});
it('validates bounded diagnostic modes and cycle counts', () => {
  expect(
    parseReplayOptions([
      'replay',
      'race.irdt',
      '--repeat',
      '10',
      '--memory',
      'allocations',
      '--collection',
      'off',
    ])
  ).toMatchObject({ repeat: 10, memory: 'allocations', collection: 'off' });
  for (const flags of [
    ['--repeat', '0'],
    ['--repeat', '1.5'],
    ['--repeat', '21'],
    ['--memory', 'unknown'],
    ['--collection', 'unknown'],
  ])
    expect(() =>
      parseReplayOptions(['replay', 'race.irdt', ...flags])
    ).toThrow();
});

import { summarizeReplayMemory } from './memorySummary.mjs';
it('excludes startup phase and refuses to join different process lifetimes', () => {
  const point = (cycle: number, pid: number, size: number) => ({
    cycle,
    heaps: [{ role: 'main', url: 'node', pid, heap: { usedSize: size } }],
    resources: [
      {
        pid,
        creationTime: pid,
        type: 'Browser',
        memory: { privateBytes: size },
      },
    ],
  });
  const stable = summarizeReplayMemory([
    point(0, 1, 10000),
    point(1, 1, 100),
    point(2, 1, 200),
  ]);
  expect(stable.heaps[0].usedHeap.delta).toBe(100);
  const changed = summarizeReplayMemory([point(1, 1, 100), point(2, 2, 200)]);
  expect(changed.heaps[0].continuous).toBe(false);
  expect(changed.heaps[0].usedHeap.delta).toBeNull();
  expect(changed.processes[0].privateBytes.delta).toBeNull();
});
