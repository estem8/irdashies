import type {
  PieActionId,
  PieDirection,
  PieMenuConfig,
  PieRootSlotConfig,
  PieSlotConfig,
} from '@irdashies/types';

type Menu = PieMenuConfig['menu'];
type SubMenu = NonNullable<PieRootSlotConfig['sub']>;

const OPPOSITE: Record<PieDirection, PieDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** A new submenu: empty except for Back, opposite the side that opens it. */
export const emptySubmenu = (entry: PieDirection): SubMenu => ({
  up: { action: 'none' },
  right: { action: 'none' },
  down: { action: 'none' },
  left: { action: 'none' },
  [OPPOSITE[entry]]: { action: 'back' },
});

/** The slot being edited: a side of the main ring or of one submenu. */
export const getPieSlot = (
  menu: Menu,
  submenu: PieDirection | readonly PieDirection[] | null,
  direction: PieDirection
): PieSlotConfig => {
  const path: readonly PieDirection[] = submenu == null ? [] : typeof submenu === 'string' ? [submenu] : submenu;
  let slots: Record<PieDirection, PieSlotConfig> = menu;
  for (const segment of path) slots = slots[segment]?.sub ?? emptySubmenu(segment);
  return slots[direction] ?? { action: 'none' };
};

/** Replaces one slot, giving a slot that becomes a submenu its own empty menu. */
export const setPieSlot = (
  menu: Menu,
  submenu: PieDirection | readonly PieDirection[] | null,
  direction: PieDirection,
  patch: Partial<PieSlotConfig>
): Menu => {
  const path: readonly PieDirection[] = submenu == null ? [] : typeof submenu === 'string' ? [submenu] : submenu;
  const update = (slots: Record<PieDirection, PieSlotConfig>, depth: number): Record<PieDirection, PieSlotConfig> => {
    const key = path[depth];
    if (key) {
      const parent = slots[key];
      return { ...slots, [key]: { ...parent, sub: update(parent.sub ?? emptySubmenu(key), depth + 1) } };
    }
    const current = slots[direction] ?? { action: 'none' as const };
    const next: PieSlotConfig = { ...current, ...patch };
    if (patch.action === 'submenu') {
      next.sub = current.sub ?? emptySubmenu(direction);
      next.label = next.label || 'Menu';
      next.icon = next.icon ?? 'menu';
    }
    return { ...slots, [direction]: next };
  };
  return update(menu, 0) as Menu;
};

/** Actions a slot can take; a submenu cannot hold another submenu. */
export const actionsFor = (all: readonly PieActionId[]): PieActionId[] => [...all];
