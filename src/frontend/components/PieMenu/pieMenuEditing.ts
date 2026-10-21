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
  submenu: PieDirection | null,
  direction: PieDirection
): PieSlotConfig =>
  (submenu ? menu[submenu]?.sub?.[direction] : menu[direction]) ?? {
    action: 'none',
  };

/** Replaces one slot, giving a slot that becomes a submenu its own empty menu. */
export const setPieSlot = (
  menu: Menu,
  submenu: PieDirection | null,
  direction: PieDirection,
  patch: Partial<PieSlotConfig>
): Menu => {
  if (submenu) {
    const parent = menu[submenu];
    const sub = parent.sub ?? emptySubmenu(submenu);
    return {
      ...menu,
      [submenu]: {
        ...parent,
        sub: { ...sub, [direction]: { ...sub[direction], ...patch } },
      },
    };
  }
  const current = menu[direction];
  const next: PieRootSlotConfig = { ...current, ...patch };
  if (patch.action === 'submenu') {
    next.sub = current.sub ?? emptySubmenu(direction);
    next.label = next.label || 'Menu';
    next.icon = next.icon ?? 'menu';
  }
  return { ...menu, [direction]: next };
};

/** Actions a slot can take; a submenu cannot hold another submenu. */
export const actionsFor = (
  all: readonly PieActionId[],
  submenu: PieDirection | null
): PieActionId[] => all.filter((action) => !(submenu && action === 'submenu'));
