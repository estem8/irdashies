import { ipcMain } from 'electron';
import { PIE_PIT_COMMANDS } from '@irdashies/types';
import type { IrSdkSourceBridge, PiePitCommand } from '@irdashies/types';

const MAX_COMMANDS = 8;
const MAX_FUEL_LITRES = 999;

export function isPiePitCommands(value: unknown): value is PiePitCommand[] {
  if (!Array.isArray(value) || value.length > MAX_COMMANDS) return false;
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const { command, value: amount } = item as Record<string, unknown>;
    return (
      (PIE_PIT_COMMANDS as readonly unknown[]).includes(command) &&
      (amount === undefined ||
        (typeof amount === 'number' &&
          Number.isInteger(amount) &&
          amount >= 0 &&
          amount <= MAX_FUEL_LITRES))
    );
  });
}

/** Pit-menu commands from the Pie Menu widget; the same as `#lf rf$` in chat. */
export function setupPieMenuBridge(
  getBridge: () => Pick<IrSdkSourceBridge, 'sendPitCommands'> | undefined
) {
  ipcMain.handle('pieMenu:pit', (_event, commands: unknown) => {
    if (!isPiePitCommands(commands)) {
      throw new Error('Invalid pit commands');
    }
    getBridge()?.sendPitCommands?.(commands);
  });
}
