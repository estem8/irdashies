import type { PieMenuInput } from './keybindings';

export type PieDirection = Exclude<PieMenuInput, 'open'>;

/** What a slot of the menu does. `submenu` opens the slot's own menu. */
export const PIE_ACTION_IDS = [
  'none',
  'back',
  'submenu',
  'pitClear',
  'tearoff',
  'repair',
  'tireLF',
  'tireRF',
  'tireLR',
  'tireRR',
  'tiresAll',
  'tiresLeft',
  'tiresRight',
  'tiresClear',
  'compoundDry',
  'compoundWet',
  'fuelAuto',
  'fuelAdd',
  'fuelAddDouble',
  'fuelSub',
  'fuelClear',
] as const;

export type PieActionId = (typeof PIE_ACTION_IDS)[number];

export const PIE_ICON_NAMES = [
  'tires',
  'fuel',
  'repair',
  'tearoff',
  'dry',
  'wet',
  'auto',
  'add',
  'clear',
  'cancel',
  'left',
  'right',
  'back',
  'menu',
  'remove',
] as const;

export type PieIconName = (typeof PIE_ICON_NAMES)[number];

export interface PieSlotConfig {
  action: PieActionId;
  /** Label of a submenu slot; other actions are named by the action. */
  label?: string;
  /** Icon of a submenu slot; other actions have their own. */
  icon?: PieIconName;
  /** Optional fuel amount (litres) or tire pressure (kPa) for this slot. */
  fuelAmount?: number;
  tirePressureKpa?: number;
  sub?: Record<PieDirection, PieSlotConfig>;
}

/** A slot of the main ring; it may open a submenu of its own. */
export type PieRootSlotConfig = PieSlotConfig;

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
  'tc',
] as const;

export type PiePitCommandName = (typeof PIE_PIT_COMMANDS)[number];

export interface PiePitCommand {
  command: PiePitCommandName;
  /** Litres for fuel, kPa for tires, or compound index for `tc`. */
  value?: number;
}

export interface PieMenuBridge {
  /** Navigation input from the widget's keybindings. Returns an unsubscribe fn. */
  onInput: (callback: (input: PieMenuInput) => void) => () => void;
  sendPitCommands: (commands: PiePitCommand[]) => Promise<void>;
}

/** Bits of the `PitSvFlags` telemetry value (the pit-stop checkboxes). */
export const PIT_SV_FLAGS = {
  lf: 0x01,
  rf: 0x02,
  lr: 0x04,
  rr: 0x08,
  fuel: 0x10,
  tearoff: 0x20,
  repair: 0x40,
} as const;
