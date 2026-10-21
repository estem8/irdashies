import { describe, expect, it } from 'vitest';
import { INITIAL_PIE_STATE, stepPieMenu, type PieState } from './pieMenuModel';

const config = { fuelStep: 10 };
const root: PieState = { ...INITIAL_PIE_STATE, level: 'root' };

describe('stepPieMenu', () => {
  it('ignores directions while closed and opens on open', () => {
    expect(stepPieMenu(INITIAL_PIE_STATE, 'up', config).state.level).toBe(
      'closed'
    );
    expect(stepPieMenu(INITIAL_PIE_STATE, 'open', config).state.level).toBe(
      'root'
    );
  });

  it('open backs out of a submenu, then closes', () => {
    const tires = stepPieMenu(root, 'left', config).state;
    expect(tires.level).toBe('tires');
    const back = stepPieMenu(tires, 'open', config).state;
    expect(back.level).toBe('root');
    expect(stepPieMenu(back, 'open', config).state.level).toBe('closed');
  });

  it('sends all four tires from the tires submenu and returns to root', () => {
    const tires = stepPieMenu(root, 'left', config).state;
    const { state, commands } = stepPieMenu(tires, 'up', config);
    expect(commands.map((c) => c.command)).toEqual(['lf', 'rf', 'lr', 'rr']);
    expect(state.level).toBe('root');
  });

  it('toggles repair between fr and clearFr', () => {
    const first = stepPieMenu(root, 'right', config);
    expect(first.commands).toEqual([{ command: 'fr' }]);
    const second = stepPieMenu(first.state, 'right', config);
    expect(second.commands).toEqual([{ command: 'clearFr' }]);
  });

  it('scales the fuel sectors by fuelStep', () => {
    const fuel = stepPieMenu(root, 'down', { fuelStep: 7 }).state;
    expect(stepPieMenu(fuel, 'right', { fuelStep: 7 }).commands).toEqual([
      { command: 'fuel', value: 14 },
    ]);
  });
});
