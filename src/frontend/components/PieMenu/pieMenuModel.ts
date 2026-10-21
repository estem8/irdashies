import {
  PIT_SV_FLAGS,
  type PieMenuConfig,
  type PieMenuInput,
  type PiePitCommand,
  type PitServiceSnapshot,
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
  | 'right'
  | 'back';

export interface PieState {
  level: PieLevel;
  /** Last sent state of the toggles; assumes the pit menu is only changed here. */
  repair: boolean;
  tearoff: boolean;
}

export interface PieItem {
  label: string;
  icon: PieIcon;
  /** Returns to the root menu; sits opposite the sector that opened the submenu. */
  back?: true;
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
          label: 'Tear-off',
          icon: 'tearoff',
          toggle: 'tearoff',
          commands: [{ command: state.tearoff ? 'clearWs' : 'ws' }],
        },
        left: { label: 'Tires', icon: 'tires', next: 'tires' },
        down: { label: 'Fuel', icon: 'fuel', next: 'fuel' },
        right: {
          label: 'Repair',
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
        down: {
          label: 'Clear',
          icon: 'cancel',
          commands: [{ command: 'clearTires' }],
        },
        // Opened with left, so back is the opposite sector.
        right: { label: 'Back', icon: 'back', back: true },
      };
    case 'fuel':
      return {
        right: {
          label: `+${config.fuelStep} L`,
          icon: 'add',
          commands: [{ command: 'fuel', value: config.fuelStep }],
        },
        down: {
          label: `+${config.fuelStep * 2} L`,
          icon: 'add',
          commands: [{ command: 'fuel', value: config.fuelStep * 2 }],
        },
        left: {
          label: 'Clear',
          icon: 'clear',
          commands: [{ command: 'clearFuel' }],
        },
        // Opened with down, so back is the opposite sector.
        up: { label: 'Back', icon: 'back', back: true },
      };
  }
};

/**
 * Applies one navigation input; returns the next state and what to send.
 * A direction pressed while closed acts on the root menu without showing it,
 * so a submenu opens directly. `open` toggles root and backs out of a submenu.
 */
export const stepPieMenu = (
  state: PieState,
  input: PieMenuInput,
  config: Pick<PieMenuConfig, 'fuelStep'>
): { state: PieState; commands: PiePitCommand[] } => {
  const idle = { state, commands: [] };
  if (input === 'open') {
    const level: PieLevel =
      state.level === 'closed'
        ? 'root'
        : state.level === 'root'
          ? 'closed'
          : 'root';
    return { state: { ...state, level }, commands: [] };
  }
  const level = state.level === 'closed' ? 'root' : state.level;
  const item = getPieItems(level, state, config)[input];
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

export interface CompoundStyle {
  letter: string;
  color: string;
}

export interface SessionTire {
  TireIndex: number;
  TireCompoundType: string;
}

const WET: CompoundStyle = { letter: 'W', color: '#2f9bff' };
const SLICK: CompoundStyle = { letter: 'S', color: '#22c55e' };
const NAMED: Record<string, CompoundStyle> = {
  Wet: WET,
  Dry: SLICK,
  Soft: { letter: 'S', color: '#ef4444' },
  Medium: { letter: 'M', color: '#facc15' },
  Hard: { letter: 'H', color: '#f8fafc' },
  Primary: { letter: 'H', color: '#f8fafc' },
  Alternate: { letter: 'A', color: '#ef4444' },
};

/** Letter and colour of a compound index; a wet plus one dry set reads W and S. */
export const compoundStyle = (
  index: number | undefined,
  tires: readonly SessionTire[] | undefined
): CompoundStyle | undefined => {
  if (index === undefined || index < 0 || !tires) return undefined;
  const name = tires.find((tire) => tire.TireIndex === index)?.TireCompoundType;
  if (!name) return undefined;
  if (
    name !== 'Wet' &&
    tires.length === 2 &&
    tires.some((t) => t.TireCompoundType === 'Wet')
  ) {
    return SLICK;
  }
  return (
    NAMED[name] ?? { letter: name.charAt(0).toUpperCase(), color: '#94a3b8' }
  );
};

export type TireCorner = 'lf' | 'rf' | 'lr' | 'rr';
export const TIRE_CORNERS: readonly TireCorner[] = ['lf', 'rf', 'lr', 'rr'];

export interface PitServiceView {
  /** `change` is the new compound for a corner that is checked for a change. */
  tires: Record<TireCorner, { change?: CompoundStyle }>;
  current?: CompoundStyle;
  /** Compound that the checked corners switch to. */
  next?: CompoundStyle;
  anyTireChange: boolean;
  fuelLevel?: number;
  fuelPct?: number;
  /** Litres requested at the stop, when fuel is checked. */
  fuelAdd?: number;
  repair: boolean;
  tearoff: boolean;
}

export const describePitService = (
  snapshot: PitServiceSnapshot | undefined,
  tires: readonly SessionTire[] | undefined
): PitServiceView => {
  const flags = snapshot?.flags ?? 0;
  const current = compoundStyle(snapshot?.currentCompound, tires);
  const next = compoundStyle(snapshot?.plannedCompound, tires) ?? current;
  const corner = (bit: number) => (flags & bit && next ? { change: next } : {});
  const fuelAdd =
    flags & PIT_SV_FLAGS.fuel && snapshot?.plannedFuel
      ? snapshot.plannedFuel
      : undefined;
  return {
    tires: {
      lf: corner(PIT_SV_FLAGS.lf),
      rf: corner(PIT_SV_FLAGS.rf),
      lr: corner(PIT_SV_FLAGS.lr),
      rr: corner(PIT_SV_FLAGS.rr),
    },
    current,
    next,
    anyTireChange:
      (flags &
        (PIT_SV_FLAGS.lf |
          PIT_SV_FLAGS.rf |
          PIT_SV_FLAGS.lr |
          PIT_SV_FLAGS.rr)) !==
      0,
    fuelLevel: snapshot?.fuelLevel,
    fuelPct: snapshot?.fuelLevelPct,
    fuelAdd,
    repair: (flags & PIT_SV_FLAGS.repair) !== 0,
    tearoff: (flags & PIT_SV_FLAGS.tearoff) !== 0,
  };
};

/** Shown in the settings preview so the indicators can be positioned. */
export const DEMO_PIT_SERVICE: PitServiceView = {
  tires: {
    lf: { change: SLICK },
    rf: { change: SLICK },
    lr: {},
    rr: {},
  },
  current: WET,
  next: SLICK,
  anyTireChange: true,
  fuelLevel: 31.2,
  fuelPct: 0.52,
  fuelAdd: 20,
  repair: true,
  tearoff: false,
};
