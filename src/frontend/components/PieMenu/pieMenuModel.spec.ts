import { describe, expect, it } from 'vitest';
import { INITIAL_PIE_STATE, stepPieMenu, type PieState } from './pieMenuModel';

const config = { fuelStep: 10 };
const root: PieState = { ...INITIAL_PIE_STATE, level: 'root' };

describe('stepPieMenu', () => {
  it('opens the root on open and closes it again', () => {
    const opened = stepPieMenu(INITIAL_PIE_STATE, 'open', config).state;
    expect(opened.level).toBe('root');
    expect(stepPieMenu(opened, 'open', config).state.level).toBe('closed');
  });

  it('opens a submenu directly from closed with a direction', () => {
    expect(stepPieMenu(INITIAL_PIE_STATE, 'left', config).state.level).toBe(
      'tires'
    );
    expect(stepPieMenu(INITIAL_PIE_STATE, 'down', config).state.level).toBe(
      'fuel'
    );
  });

  it('returns from a submenu in the opposite direction', () => {
    const tires = stepPieMenu(INITIAL_PIE_STATE, 'left', config).state;
    expect(stepPieMenu(tires, 'right', config)).toEqual({
      state: { ...tires, level: 'root' },
      commands: [],
    });
    const fuel = stepPieMenu(INITIAL_PIE_STATE, 'down', config).state;
    expect(stepPieMenu(fuel, 'up', config).state.level).toBe('root');
  });

  it('open also backs out of a submenu', () => {
    const tires = stepPieMenu(root, 'left', config).state;
    expect(stepPieMenu(tires, 'open', config).state.level).toBe('root');
  });

  it('sends all four tires from the tires submenu and returns to root', () => {
    const tires = stepPieMenu(root, 'left', config).state;
    const { state, commands } = stepPieMenu(tires, 'up', config);
    expect(commands.map((c) => c.command)).toEqual(['lf', 'rf', 'lr', 'rr']);
    expect(state.level).toBe('root');
  });

  it('runs a leaf sector pressed while closed', () => {
    const first = stepPieMenu(INITIAL_PIE_STATE, 'right', config);
    expect(first.commands).toEqual([{ command: 'fr' }]);
    expect(first.state.level).toBe('root');
  });

  it('toggles repair between fr and clearFr', () => {
    const first = stepPieMenu(root, 'right', config);
    const second = stepPieMenu(first.state, 'right', config);
    expect(second.commands).toEqual([{ command: 'clearFr' }]);
  });

  it('scales the fuel sectors by fuelStep', () => {
    const fuel = stepPieMenu(root, 'down', { fuelStep: 7 }).state;
    expect(stepPieMenu(fuel, 'down', { fuelStep: 7 }).commands).toEqual([
      { command: 'fuel', value: 14 },
    ]);
  });
});
