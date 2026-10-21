import type { PieMenuInput } from './keybindings';

/** Pit commands the Pie Menu may send; the same checkboxes as `#lf rf$` chat. */
export const PIE_PIT_COMMANDS = [
  'clear',
  'ws',
  'fuel',
  'lf',
  'rf',
  'lr',
  'rr',
  'clearTires',
  'fr',
  'clearWs',
  'clearFr',
  'clearFuel',
] as const;

export type PiePitCommandName = (typeof PIE_PIT_COMMANDS)[number];

export interface PiePitCommand {
  command: PiePitCommandName;
  /** Litres for `fuel`; 0 keeps the amount already in the pit menu. */
  value?: number;
}

export interface PieMenuBridge {
  /** Navigation input from the widget's keybindings. Returns an unsubscribe fn. */
  onInput: (callback: (input: PieMenuInput) => void) => () => void;
  sendPitCommands: (commands: PiePitCommand[]) => Promise<void>;
}
