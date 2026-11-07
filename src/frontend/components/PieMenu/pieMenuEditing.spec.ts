import { describe, expect, it } from 'vitest';
import { getWidgetDefaultConfig } from '@irdashies/types';
import {
  actionsFor,
  emptySubmenu,
  getPieSlot,
  setPieSlot,
} from './pieMenuEditing';

const { menu } = getWidgetDefaultConfig('piemenu');

describe('pie menu editing', () => {
  it('reads a slot of the main ring or of a submenu', () => {
    expect(getPieSlot(menu, null, 'up').action).toBe('tearoff');
    expect(getPieSlot(menu, 'left', 'up').action).toBe('compoundDry');
    expect(getPieSlot(menu, 'up', 'left').action).toBe('none');
  });

  it('changes one slot and leaves the rest alone', () => {
    const next = setPieSlot(menu, 'left', 'up', { action: 'tiresClear' });
    expect(next.left.sub?.up.action).toBe('tiresClear');
    expect(next.left.sub?.down.action).toBe('compoundWet');
    expect(menu.left.sub?.up.action).toBe('compoundDry');
  });

  it('gives a slot that becomes a submenu an empty menu with Back opposite', () => {
    const next = setPieSlot(menu, null, 'up', { action: 'submenu' });
    expect(next.up.sub).toEqual(emptySubmenu('up'));
    expect(next.up.sub?.down.action).toBe('back');
    expect(next.up.label).toBe('Menu');
  });

  it('keeps an existing submenu when the slot is switched back', () => {
    const away = setPieSlot(menu, null, 'left', { action: 'repair' });
    const back = setPieSlot(away, null, 'left', { action: 'submenu' });
    expect(back.left.sub?.up.action).toBe('compoundDry');
  });

  it('allows submenus at any depth', () => {
    const all = ['none', 'submenu', 'repair'] as const;
    expect(actionsFor(all)).toContain('submenu');
  });

  it('edits arbitrarily nested submenu slots', () => {
    const nested = setPieSlot(menu, ['left', 'right'], 'right', { action: 'repair' });
    expect(getPieSlot(nested, ['left', 'right'], 'right').action).toBe('repair');
  });
});
