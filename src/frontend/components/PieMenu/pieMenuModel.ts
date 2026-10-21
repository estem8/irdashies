import type {
  PieMenuConfig,
  PieMenuInput,
  PiePitCommand,
} from '@irdashies/types';

export type PieDirection = Exclude<PieMenuInput, 'open'>;
export type PieLevel = 'closed' | 'root' | 'tires' | 'fuel';
export type PieIcon =
  | 'tearoff'
  | 'tires'
  | 'fuel'
  | 'repair'
  | 'add'
  | 'clear'
  | 'cancel'
  | 'left'
  | 'right';

export interface PieState {
  level: PieLevel;
  /** Last sent state of the toggles; assumes the pit menu is only changed here. */
  repair: boolean;
  tearoff: boolean;
}

export interface PieItem {
  label: string;
  icon: PieIcon;
  /** Opens a submenu. */
  next?: Exclude<PieLevel, 'closed' | 'root'>;
  /** Sent to the sim. */
  commands?: PiePitCommand[];
  /** Flips the matching toggle in the state when picked. */
  toggle?: 'repair' | 'tearoff';
}

export const INITIAL_PIE_STATE: PieState = {
  level: 'closed',
  repair: false,
  tearoff: false,
};

export const PIE_DIRECTIONS: readonly PieDirection[] = [
  'up',
  'right',
  'down',
  'left',
];

export const getPieItems = (
  level: Exclude<PieLevel, 'closed'>,
  state: PieState,
  config: Pick<PieMenuConfig, 'fuelStep'>
): Partial<Record<PieDirection, PieItem>> => {
  switch (level) {
    case 'root':
      return {
        up: {
          label: state.tearoff ? 'Tear-off ON' : 'Tear-off',
          icon: 'tearoff',
          toggle: 'tearoff',
          commands: [{ command: state.tearoff ? 'clearWs' : 'ws' }],
        },
        left: { label: 'Tires', icon: 'tires', next: 'tires' },
        down: { label: 'Fuel', icon: 'fuel', next: 'fuel' },
        right: {
          label: state.repair ? 'Repair ON' : 'Repair',
          icon: 'repair',
          toggle: 'repair',
          commands: [{ command: state.repair ? 'clearFr' : 'fr' }],
        },
      };
    case 'tires':
      return {
        up: {
          label: 'All four',
          icon: 'tires',
          commands: [
            { command: 'lf' },
            { command: 'rf' },
            { command: 'lr' },
            { command: 'rr' },
          ],
        },
        left: {
          label: 'Left side',
          icon: 'left',
          commands: [{ command: 'lf' }, { command: 'lr' }],
        },
        right: {
          label: 'Right side',
          icon: 'right',
          commands: [{ command: 'rf' }, { command: 'rr' }],
        },
        down: {
          label: 'Clear',
          icon: 'cancel',
          commands: [{ command: 'clearTires' }],
        },
      };
    case 'fuel':
      return {
        up: {
          label: `+${config.fuelStep} L`,
          icon: 'add',
          commands: [{ command: 'fuel', value: config.fuelStep }],
        },
        right: {
          label: `+${config.fuelStep * 2} L`,
          icon: 'add',
          commands: [{ command: 'fuel', value: config.fuelStep * 2 }],
        },
        down: {
          label: 'Pit menu',
          icon: 'fuel',
          commands: [{ command: 'fuel', value: 0 }],
        },
        left: {
          label: 'Clear',
          icon: 'clear',
          commands: [{ command: 'clearFuel' }],
        },
      };
  }
};

/** Applies one navigation input; returns the next state and what to send. */
export const stepPieMenu = (
  state: PieState,
  input: PieMenuInput,
  config: Pick<PieMenuConfig, 'fuelStep'>
): { state: PieState; commands: PiePitCommand[] } => {
  const idle = { state, commands: [] };
  if (state.level === 'closed') {
    return input === 'open'
      ? { state: { ...state, level: 'root' }, commands: [] }
      : idle;
  }
  if (input === 'open') {
    return {
      state: { ...state, level: state.level === 'root' ? 'closed' : 'root' },
      commands: [],
    };
  }
  const item = getPieItems(state.level, state, config)[input];
  if (!item) return idle;
  if (item.next) return { state: { ...state, level: item.next }, commands: [] };
  return {
    state: {
      ...state,
      level: 'root',
      ...(item.toggle ? { [item.toggle]: !state[item.toggle] } : {}),
    },
    commands: item.commands ?? [],
  };
};
