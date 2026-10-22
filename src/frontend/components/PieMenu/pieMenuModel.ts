import {
  PIT_SV_FLAGS,
  type FuelProjectionSnapshot,
  type PieActionId,
  type PieDirection,
  type PieIconName,
  type PieMenuConfig,
  type PieMenuInput,
  type PiePitCommand,
  type PieSlotConfig,
  type PitServiceSnapshot,
} from '@irdashies/types';

export type { PieDirection };

/** `result` replaces the menu with the state of what was just picked. */
export type PieLevel = 'closed' | 'root' | 'sub' | 'result';
export type PieFeedback = 'tires' | 'fuel' | 'repair' | 'tearoff';

export interface PieState {
  level: PieLevel;
  /** Side whose slot opened the open submenu. */
  entry?: PieDirection;
  /** What the result view shows. */
  feedback?: PieFeedback;
}

export const INITIAL_PIE_STATE: PieState = { level: 'closed' };

export type PieModelConfig = Pick<PieMenuConfig, 'menu' | 'fuelStep'>;

/** What the actions need to know about the sim when they are picked. */
export interface PieContext {
  /** `PitSvFlags`: the pit checkboxes now. */
  flags: number;
  /** Compound indexes of the session's dry and wet tires. */
  compounds: { dry?: number; wet?: number };
  /** Litres to add to finish, when known. */
  fuelToAdd?: number;
  /** Litres already requested (`PitSvFuel`), so the add actions add to it. */
  plannedFuel?: number;
  /** Compound requested for the new tires and the one on the car. */
  plannedCompound?: number;
  currentCompound?: number;
}

export const EMPTY_PIE_CONTEXT: PieContext = { flags: 0, compounds: {} };

export const PIE_DIRECTIONS: readonly PieDirection[] = [
  'up',
  'right',
  'down',
  'left',
];

interface ActionInfo {
  /** Full name, for the settings editor. */
  label: string;
  /** Fits a side of the ring. */
  short: string;
  icon: PieIconName;
  feedback?: PieFeedback;
}

export const PIE_ACTIONS: Record<PieActionId, ActionInfo> = {
  none: { label: 'Nothing', short: '', icon: 'menu' },
  back: { label: 'Back', short: 'Back', icon: 'back' },
  submenu: { label: 'Submenu', short: 'Menu', icon: 'menu' },
  tearoff: {
    label: 'Tear-off',
    short: 'Tear-off',
    icon: 'tearoff',
    feedback: 'tearoff',
  },
  repair: {
    label: 'Fast repair',
    short: 'Repair',
    icon: 'repair',
    feedback: 'repair',
  },
  tiresAll: {
    label: 'Replace all tires',
    short: 'All tires',
    icon: 'tires',
    feedback: 'tires',
  },
  tiresLeft: {
    label: 'Left side tires',
    short: 'Left side',
    icon: 'left',
    feedback: 'tires',
  },
  tiresRight: {
    label: 'Right side tires',
    short: 'Right side',
    icon: 'right',
    feedback: 'tires',
  },
  tiresClear: {
    label: 'Clear tires',
    short: 'Clear',
    icon: 'cancel',
    feedback: 'tires',
  },
  compoundDry: {
    label: 'Compound Dry',
    short: 'Dry',
    icon: 'dry',
    feedback: 'tires',
  },
  compoundWet: {
    label: 'Compound Wet',
    short: 'Wet',
    icon: 'wet',
    feedback: 'tires',
  },
  fuelAuto: {
    label: 'Auto fuel',
    short: 'Auto fuel',
    icon: 'auto',
    feedback: 'fuel',
  },
  fuelAdd: { label: 'Add fuel', short: 'Add', icon: 'add', feedback: 'fuel' },
  fuelAddDouble: {
    label: 'Add double fuel',
    short: 'Add',
    icon: 'add',
    feedback: 'fuel',
  },
  fuelSub: {
    label: 'Remove fuel',
    short: 'Remove',
    icon: 'remove',
    feedback: 'fuel',
  },
  fuelClear: {
    label: 'Clear fuel',
    short: 'Clear',
    icon: 'clear',
    feedback: 'fuel',
  },
};

export interface PieItem {
  action: PieActionId;
  label: string;
  icon: PieIconName;
  opensSubmenu: boolean;
}

const slotItem = (
  slot: PieSlotConfig | undefined,
  fuelStep: number,
  allowSubmenu: boolean
): PieItem | undefined => {
  if (!slot || slot.action === 'none') return undefined;
  if (slot.action === 'submenu') {
    if (!allowSubmenu) return undefined;
    return {
      action: 'submenu',
      label: slot.label || 'Menu',
      icon: slot.icon ?? 'menu',
      opensSubmenu: true,
    };
  }
  const info = PIE_ACTIONS[slot.action];
  const label =
    slot.action === 'fuelAdd'
      ? `+${fuelStep} L`
      : slot.action === 'fuelAddDouble'
        ? `+${fuelStep * 2} L`
        : slot.action === 'fuelSub'
          ? `-${fuelStep} L`
          : info.short;
  return { action: slot.action, label, icon: info.icon, opensSubmenu: false };
};

/** The items on each side of the menu that is showing. */
export const getPieItems = (
  state: PieState,
  config: PieModelConfig
): Partial<Record<PieDirection, PieItem>> => {
  const items: Partial<Record<PieDirection, PieItem>> = {};
  const slots =
    state.level === 'sub' && state.entry
      ? config.menu[state.entry]?.sub
      : config.menu;
  for (const direction of PIE_DIRECTIONS) {
    items[direction] = slotItem(
      slots?.[direction],
      config.fuelStep,
      state.level !== 'sub'
    );
  }
  return items;
};

const ALL_TIRES =
  PIT_SV_FLAGS.lf | PIT_SV_FLAGS.rf | PIT_SV_FLAGS.lr | PIT_SV_FLAGS.rr;
const FOUR_TIRES: PiePitCommand[] = [
  { command: 'lf' },
  { command: 'rf' },
  { command: 'lr' },
  { command: 'rr' },
];

const fuelAmount = (litres: number) =>
  Math.min(999, Math.max(1, Math.ceil(litres)));

/** The pit commands of an action; toggles read the sim's checkboxes. */
export const commandsFor = (
  action: PieActionId,
  context: PieContext,
  fuelStep: number
): PiePitCommand[] => {
  const { flags, compounds } = context;
  // The add actions add to what is already requested, not replace it.
  const requested = flags & PIT_SV_FLAGS.fuel ? (context.plannedFuel ?? 0) : 0;
  switch (action) {
    case 'tearoff':
      return [{ command: flags & PIT_SV_FLAGS.tearoff ? 'clearWs' : 'ws' }];
    case 'repair':
      return [{ command: flags & PIT_SV_FLAGS.repair ? 'clearFr' : 'fr' }];
    case 'tiresAll':
      // One press cancels whatever is checked, the next checks all four.
      return flags & ALL_TIRES ? [{ command: 'clearTires' }] : FOUR_TIRES;
    case 'tiresLeft':
      return [{ command: 'lf' }, { command: 'lr' }];
    case 'tiresRight':
      return [{ command: 'rf' }, { command: 'rr' }];
    case 'tiresClear':
      return [{ command: 'clearTires' }];
    case 'compoundDry':
    case 'compoundWet': {
      const compound = action === 'compoundDry' ? compounds.dry : compounds.wet;
      if (compound === undefined) return [];
      // The same compound again takes the change back.
      if (flags & ALL_TIRES && context.plannedCompound === compound) {
        return [
          ...(context.currentCompound === undefined
            ? []
            : [{ command: 'tc' as const, value: context.currentCompound }]),
          { command: 'clearTires' },
        ];
      }
      // Picking a compound with nothing checked means change all four.
      return [
        { command: 'tc', value: compound },
        ...(flags & ALL_TIRES ? [] : FOUR_TIRES),
      ];
    }
    case 'fuelAuto':
      return flags & PIT_SV_FLAGS.fuel
        ? [{ command: 'clearFuel' }]
        : [
            {
              command: 'fuel',
              value:
                context.fuelToAdd === undefined
                  ? 0
                  : fuelAmount(context.fuelToAdd),
            },
          ];
    case 'fuelAdd':
      return [{ command: 'fuel', value: fuelAmount(requested + fuelStep) }];
    case 'fuelAddDouble':
      return [{ command: 'fuel', value: fuelAmount(requested + fuelStep * 2) }];
    case 'fuelSub':
      return requested - fuelStep > 0
        ? [{ command: 'fuel', value: fuelAmount(requested - fuelStep) }]
        : [{ command: 'clearFuel' }];
    case 'fuelClear':
      return [{ command: 'clearFuel' }];
    default:
      return [];
  }
};

/**
 * Applies one navigation input; returns the next state and what to send.
 * A direction pressed while the main menu is not showing acts on it anyway, so
 * a submenu or an action is reached without opening the menu first. `open`
 * opens the main menu and closes whatever is showing.
 */
export const stepPieMenu = (
  state: PieState,
  input: PieMenuInput,
  config: PieModelConfig,
  context: PieContext = EMPTY_PIE_CONTEXT
): { state: PieState; commands: PiePitCommand[] } => {
  const idle = { state, commands: [] };
  if (input === 'open') {
    const level: PieLevel = state.level === 'closed' ? 'root' : 'closed';
    return { state: { level }, commands: [] };
  }
  const showing: PieState =
    state.level === 'closed' || state.level === 'result'
      ? { level: 'root' }
      : state;
  const item = getPieItems(showing, config)[input];
  if (!item) return idle;
  if (item.opensSubmenu) {
    return { state: { level: 'sub', entry: input }, commands: [] };
  }
  if (item.action === 'back') {
    return {
      state: { level: showing.level === 'sub' ? 'root' : 'closed' },
      commands: [],
    };
  }
  const commands = commandsFor(item.action, context, config.fuelStep);
  const feedback = PIE_ACTIONS[item.action].feedback;
  return {
    state: feedback
      ? {
          level: 'result',
          feedback,
          entry: showing.level === 'sub' ? showing.entry : undefined,
        }
      : { level: 'closed' },
    commands,
  };
};

export type PieCenterKind = 'main' | 'tires' | 'fuel' | 'generic';

/** What the centre shows: the menu we are in, or the main menu's logo. */
export const pieCenter = (
  state: PieState,
  config: PieModelConfig
): { kind: PieCenterKind; icon: PieIconName } => {
  if (state.level === 'sub' && state.entry) {
    const icon = config.menu[state.entry]?.icon ?? 'menu';
    return {
      kind: icon === 'tires' || icon === 'fuel' ? icon : 'generic',
      icon,
    };
  }
  return { kind: 'main', icon: 'menu' };
};

/** Litres to add to reach the finish, with half a lap of margin; undefined when unknown. */
export const fuelToFinish = (
  fuel: FuelProjectionSnapshot | undefined
): number | undefined => {
  if (!fuel?.hasValidRaceEstimate || !(fuel.projectedLapUsage > 0)) {
    return undefined;
  }
  const needed =
    fuel.estimatedLapsRemaining * fuel.projectedLapUsage +
    fuel.projectedLapUsage / 2 -
    fuel.fuelLevel;
  return needed > 0 ? needed : undefined;
};

/** The session's wet compound and its first dry one. */
export const compoundIndexes = (
  tires: readonly SessionTire[] | undefined
): PieContext['compounds'] => {
  const sorted = [...(tires ?? [])].sort((a, b) => a.TireIndex - b.TireIndex);
  return {
    wet: sorted.find((tire) => tire.TireCompoundType === 'Wet')?.TireIndex,
    dry: sorted.find((tire) => tire.TireCompoundType !== 'Wet')?.TireIndex,
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
  /** Laps the fuel in the tank lasts, when known. */
  fuelLaps?: number;
  /** Laps of fuel beyond the finish; negative when it will not last. */
  fuelMargin?: number;
  /** Litres per lap the margin is worked out with. */
  lapUsage?: number;
  /** `TrackWetness`: 1 dry to 7 extremely wet. */
  wetness?: number;
  /** Precipitation, 0 to 1. */
  precipitation?: number;
  /** Litres to add to reach the finish (0 when the tank is enough), when known. */
  fuelToFinish?: number;
  /** The crew is working on the car. */
  stopInProgress: boolean;
  /** Litres requested at the stop, when fuel is checked. */
  fuelAdd?: number;
  repair: boolean;
  tearoff: boolean;
  fuelOn: boolean;
  /** Colours of the session's dry and wet compounds, for the compound sectors. */
  styles: { dry?: CompoundStyle; wet?: CompoundStyle };
}

export const describePitService = (
  snapshot: PitServiceSnapshot | undefined,
  tires: readonly SessionTire[] | undefined,
  fuel: {
    laps?: number;
    marginLaps?: number;
    lapUsage?: number;
    toFinish?: number;
  } = {}
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
    fuelLaps: fuel.laps,
    fuelMargin: fuel.marginLaps,
    lapUsage: fuel.lapUsage,
    wetness: snapshot?.trackWetness,
    precipitation: snapshot?.precipitation,
    fuelToFinish: fuel.toFinish,
    // PlayerCarPitSvStatus 1 is irsdk_PitSvInProgress.
    stopInProgress: snapshot?.pitStatus === 1,
    fuelAdd,
    repair: (flags & PIT_SV_FLAGS.repair) !== 0,
    tearoff: (flags & PIT_SV_FLAGS.tearoff) !== 0,
    fuelOn: (flags & PIT_SV_FLAGS.fuel) !== 0,
    styles: {
      dry: compoundStyle(compoundIndexes(tires).dry, tires),
      wet: compoundStyle(compoundIndexes(tires).wet, tires),
    },
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
  fuelLaps: 8.2,
  fuelMargin: 2.2,
  lapUsage: 3.8,
  wetness: 3,
  precipitation: 0.2,
  fuelToFinish: 12,
  stopInProgress: false,
  fuelAdd: 20,
  repair: true,
  tearoff: false,
  fuelOn: true,
  styles: { dry: SLICK, wet: WET },
};
