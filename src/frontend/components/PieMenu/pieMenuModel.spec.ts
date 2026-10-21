import { describe, expect, it } from 'vitest';
import {
  PIT_SV_FLAGS,
  getWidgetDefaultConfig,
  type FuelProjectionSnapshot,
} from '@irdashies/types';
import {
  EMPTY_PIE_CONTEXT,
  INITIAL_PIE_STATE,
  commandsFor,
  compoundIndexes,
  compoundStyle,
  describePitService,
  fuelToFinish,
  pieCenter,
  stepPieMenu,
  type PieContext,
  type PieState,
} from './pieMenuModel';

const config = getWidgetDefaultConfig('piemenu');
const tireSession = [
  { TireIndex: 0, TireCompoundType: 'Hard' },
  { TireIndex: 1, TireCompoundType: 'Wet' },
];
const context: PieContext = {
  flags: 0,
  compounds: compoundIndexes(tireSession),
  fuelToAdd: 23.2,
};
const root: PieState = { level: 'root' };
const tires: PieState = { level: 'sub', entry: 'left' };
const fuel: PieState = { level: 'sub', entry: 'down' };

describe('stepPieMenu', () => {
  it('opens the main menu on open and closes it again', () => {
    const opened = stepPieMenu(INITIAL_PIE_STATE, 'open', config).state;
    expect(opened.level).toBe('root');
    expect(stepPieMenu(opened, 'open', config).state.level).toBe('closed');
  });

  it('opens the tires menu on the left, directly from closed too', () => {
    expect(stepPieMenu(INITIAL_PIE_STATE, 'left', config).state).toEqual({
      level: 'sub',
      entry: 'left',
    });
    expect(stepPieMenu(root, 'left', config).state.entry).toBe('left');
  });

  it('puts replace all on the left, Dry above and Wet below', () => {
    expect(
      stepPieMenu(tires, 'left', config, context).commands.map((c) => c.command)
    ).toEqual(['lf', 'rf', 'lr', 'rr']);
    expect(stepPieMenu(tires, 'up', config, context).commands[0]).toEqual({
      command: 'tc',
      value: 0,
    });
    expect(stepPieMenu(tires, 'down', config, context).commands[0]).toEqual({
      command: 'tc',
      value: 1,
    });
  });

  it('goes back to the main menu on the opposite side', () => {
    expect(stepPieMenu(tires, 'right', config).state.level).toBe('root');
    expect(stepPieMenu(fuel, 'up', config).state.level).toBe('root');
    expect(stepPieMenu(tires, 'open', config).state.level).toBe('root');
  });

  it('shows the result of what was picked instead of the menu', () => {
    const { state } = stepPieMenu(tires, 'up', config, context);
    expect(state).toEqual({
      level: 'result',
      feedback: 'tires',
      entry: 'left',
    });
    expect(stepPieMenu(root, 'right', config, context).state).toEqual({
      level: 'result',
      feedback: 'repair',
    });
  });

  it('acts on the main menu from a result without opening it', () => {
    const result: PieState = { level: 'result', feedback: 'tires' };
    expect(stepPieMenu(result, 'left', config).state.level).toBe('sub');
  });

  it('ignores a side that has nothing', () => {
    const empty = {
      ...config,
      menu: { ...config.menu, up: { action: 'none' as const } },
    };
    expect(stepPieMenu(INITIAL_PIE_STATE, 'up', empty)).toEqual({
      state: INITIAL_PIE_STATE,
      commands: [],
    });
  });

  it('does not open a submenu from inside a submenu', () => {
    const nested = {
      ...config,
      menu: {
        ...config.menu,
        left: {
          ...config.menu.left,
          sub: {
            up: { action: 'submenu' as const, label: 'Loop' },
            right: { action: 'back' as const },
            down: { action: 'none' as const },
            left: { action: 'none' as const },
          },
        },
      },
    };
    expect(stepPieMenu(tires, 'up', nested).state).toEqual(tires);
  });
});

describe('pieCenter', () => {
  it('shows the logo in the main menu', () => {
    expect(pieCenter(root, config).kind).toBe('main');
  });

  it('shows the menu we are in inside a submenu', () => {
    expect(pieCenter(tires, config).kind).toBe('tires');
    expect(pieCenter(fuel, config).kind).toBe('fuel');
  });
});

describe('the pilot flows', () => {
  it('cancels the tires with two presses left, no confirmation', () => {
    const checked: PieContext = { ...context, flags: PIT_SV_FLAGS.lf };
    const opened = stepPieMenu(INITIAL_PIE_STATE, 'left', config, checked);
    expect(opened.commands).toEqual([]);
    const cancelled = stepPieMenu(opened.state, 'left', config, checked);
    expect(cancelled.commands).toEqual([{ command: 'clearTires' }]);
    expect(cancelled.state.level).toBe('result');
  });

  it('goes wet with left then down, checking all four tires', () => {
    const opened = stepPieMenu(INITIAL_PIE_STATE, 'left', config, context);
    const wet = stepPieMenu(opened.state, 'down', config, context);
    expect(wet.commands.map((c) => c.command)).toEqual([
      'tc',
      'lf',
      'rf',
      'lr',
      'rr',
    ]);
    expect(wet.commands[0]).toEqual({ command: 'tc', value: 1 });
  });
});

describe('commandsFor', () => {
  it('toggles tear-off and repair from the sim checkboxes', () => {
    expect(commandsFor('repair', EMPTY_PIE_CONTEXT, 10)).toEqual([
      { command: 'fr' },
    ]);
    expect(
      commandsFor('repair', { ...context, flags: PIT_SV_FLAGS.repair }, 10)
    ).toEqual([{ command: 'clearFr' }]);
    expect(
      commandsFor('tearoff', { ...context, flags: PIT_SV_FLAGS.tearoff }, 10)
    ).toEqual([{ command: 'clearWs' }]);
  });

  it('cancels replace all tires when any tire is checked, else checks all four', () => {
    const one = { ...context, flags: PIT_SV_FLAGS.rr };
    expect(commandsFor('tiresAll', one, 10)).toEqual([
      { command: 'clearTires' },
    ]);
    expect(commandsFor('tiresAll', context, 10).map((c) => c.command)).toEqual([
      'lf',
      'rf',
      'lr',
      'rr',
    ]);
  });

  it('checks all four tires with a compound only when none is checked', () => {
    const checked = { ...context, flags: PIT_SV_FLAGS.rf };
    expect(commandsFor('compoundWet', checked, 10)).toEqual([
      { command: 'tc', value: 1 },
    ]);
    expect(commandsFor('compoundWet', context, 10)).toHaveLength(5);
  });

  it('sends nothing for a compound the session does not have', () => {
    expect(commandsFor('compoundWet', EMPTY_PIE_CONTEXT, 10)).toEqual([]);
  });

  it('toggles auto fuel, using the litres to finish when known', () => {
    expect(commandsFor('fuelAuto', context, 10)).toEqual([
      { command: 'fuel', value: 24 },
    ]);
    expect(commandsFor('fuelAuto', EMPTY_PIE_CONTEXT, 10)).toEqual([
      { command: 'fuel', value: 0 },
    ]);
    expect(
      commandsFor('fuelAuto', { ...context, flags: PIT_SV_FLAGS.fuel }, 10)
    ).toEqual([{ command: 'clearFuel' }]);
  });

  it('scales the add fuel actions by the step', () => {
    expect(commandsFor('fuelAdd', context, 7)).toEqual([
      { command: 'fuel', value: 7 },
    ]);
    expect(commandsFor('fuelAddDouble', context, 7)).toEqual([
      { command: 'fuel', value: 14 },
    ]);
  });
});

describe('fuelToFinish', () => {
  const fuelSnapshot = {
    hasValidRaceEstimate: true,
    projectedLapUsage: 2,
    estimatedLapsRemaining: 10,
    fuelLevel: 5,
  } as FuelProjectionSnapshot;

  it('covers the remaining laps plus half a lap, minus what is in the tank', () => {
    expect(fuelToFinish(fuelSnapshot)).toBe(16);
  });

  it('is unknown without a race estimate or when the tank is enough', () => {
    expect(fuelToFinish(undefined)).toBeUndefined();
    expect(
      fuelToFinish({ ...fuelSnapshot, hasValidRaceEstimate: false })
    ).toBeUndefined();
    expect(fuelToFinish({ ...fuelSnapshot, fuelLevel: 99 })).toBeUndefined();
  });
});

describe('describePitService', () => {
  const tires = tireSession;

  it('reads a wet plus one dry set as W blue and S green', () => {
    expect(compoundStyle(1, tires)?.letter).toBe('W');
    expect(compoundStyle(0, tires)).toMatchObject({ letter: 'S' });
    expect(compoundStyle(0, tires)?.color).not.toBe(
      compoundStyle(1, tires)?.color
    );
  });

  it('marks only the checked corners and moves them to the new compound', () => {
    const view = describePitService(
      {
        version: 1,
        flags: 0x01 | 0x08 | 0x10 | 0x40,
        plannedCompound: 0,
        currentCompound: 1,
        plannedFuel: 20,
      },
      tires
    );
    expect(view.tires.lf.change?.letter).toBe('S');
    expect(view.tires.rr.change?.letter).toBe('S');
    expect(view.tires.rf.change).toBeUndefined();
    expect(view.current?.letter).toBe('W');
    expect(view.fuelAdd).toBe(20);
    expect(view.repair).toBe(true);
    expect(view.tearoff).toBe(false);
  });

  it('has no changes without a snapshot', () => {
    expect(describePitService(undefined, undefined).anyTireChange).toBe(false);
  });
});
