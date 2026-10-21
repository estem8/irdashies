import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { isPiePitCommands } from './pieMenuBridge';

describe('isPiePitCommands', () => {
  it('accepts known commands with an optional litre amount', () => {
    expect(
      isPiePitCommands([{ command: 'rf' }, { command: 'fuel', value: 20 }])
    ).toBe(true);
  });

  it('rejects unknown commands, bad amounts and oversized batches', () => {
    expect(isPiePitCommands([{ command: 'format' }])).toBe(false);
    expect(isPiePitCommands([{ command: 'fuel', value: -1 }])).toBe(false);
    expect(isPiePitCommands([{ command: 'fuel', value: 1.5 }])).toBe(false);
    expect(isPiePitCommands('rf')).toBe(false);
    expect(isPiePitCommands(Array(9).fill({ command: 'clear' }))).toBe(false);
  });
});
