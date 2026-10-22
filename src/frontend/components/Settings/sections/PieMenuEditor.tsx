import { useState } from 'react';
import {
  PIE_ACTION_IDS,
  PIE_ICON_NAMES,
  getWidgetDefaultConfig,
  type PieActionId,
  type PieDirection,
  type PieIconName,
  type PieMenuConfig,
} from '@irdashies/types';
import { PieMenuView } from '../../PieMenu/PieMenuView';
import { DEMO_PIT_SERVICE, PIE_ACTIONS } from '../../PieMenu/pieMenuModel';
import {
  actionsFor,
  getPieSlot,
  setPieSlot,
} from '../../PieMenu/pieMenuEditing';
import { SettingSelectRow } from '../components/SettingSelectRow';

const SIDE_LABEL: Record<PieDirection, string> = {
  up: 'Up',
  right: 'Right',
  down: 'Down',
  left: 'Left',
};

const ICON_LABEL: Record<PieIconName, string> = {
  tires: 'Tires',
  fuel: 'Fuel',
  repair: 'Repair',
  tearoff: 'Tear-off',
  dry: 'Sun',
  wet: 'Rain',
  auto: 'Lightning',
  add: 'Plus',
  clear: 'Cross',
  cancel: 'Prohibited',
  left: 'Arrow left',
  right: 'Arrow right',
  back: 'Arrow back',
  menu: 'List',
  remove: 'Minus',
};

const ACTION_HINT: Partial<Record<PieActionId, string>> = {
  tiresAll: 'Checks all four tires for a change, or unchecks them.',
  compoundDry:
    'Picks the dry compound and checks all four tires if none is checked. Again takes the change back.',
  compoundWet:
    'Picks the wet compound and checks all four tires if none is checked. Again takes the change back.',
  fuelAuto:
    'Adds the fuel needed to finish when the race length is known, otherwise checks fuel with the amount already in the pit menu. Again to uncheck.',
  fuelAdd: 'Adds the Fuel Step litres to the fuel already requested.',
  fuelAddDouble:
    'Adds twice the Fuel Step litres to the fuel already requested.',
  fuelSub:
    'Takes the Fuel Step litres off the fuel requested, and unchecks fuel at zero.',
};

interface PieMenuEditorProps {
  menu: PieMenuConfig['menu'];
  fuelStep: number;
  onChange: (menu: PieMenuConfig['menu']) => void;
}

/** The menu as a circle: click a side to choose what it does. */
export const PieMenuEditor = ({
  menu,
  fuelStep,
  onChange,
}: PieMenuEditorProps) => {
  const [submenu, setSubmenu] = useState<PieDirection | null>(null);
  const [selected, setSelected] = useState<PieDirection | null>(null);
  const [hovered, setHovered] = useState<PieDirection | undefined>();

  const slot = selected ? getPieSlot(menu, submenu, selected) : undefined;
  const parent = submenu ? menu[submenu] : undefined;
  const actions = actionsFor(PIE_ACTION_IDS, submenu);

  const edit = (patch: Parameters<typeof setPieSlot>[3]) => {
    if (selected) onChange(setPieSlot(menu, submenu, selected, patch));
  };

  const goTo = (next: PieDirection | null) => {
    setSubmenu(next);
    setSelected(null);
  };

  return (
    <div className="flex flex-col gap-3 px-4">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <button
          type="button"
          className={`cursor-pointer ${submenu ? 'text-slate-400 hover:text-white underline' : 'font-bold'}`}
          onClick={() => goTo(null)}
        >
          Main menu
        </button>
        {submenu && (
          <>
            <span className="text-slate-500">/</span>
            <span className="font-bold">{parent?.label || 'Menu'}</span>
          </>
        )}
        <button
          type="button"
          className="ml-auto text-xs text-slate-300 hover:text-white bg-slate-600 hover:bg-slate-500 rounded px-3 py-1.5 transition-colors cursor-pointer"
          onClick={() => {
            onChange(getWidgetDefaultConfig('piemenu').menu);
            goTo(null);
          }}
        >
          Reset menu
        </button>
      </div>

      <div className="flex gap-4 items-start">
        <div className="w-[260px] h-[260px] shrink-0 bg-slate-900/60 rounded">
          <PieMenuView
            state={
              submenu ? { level: 'sub', entry: submenu } : { level: 'root' }
            }
            config={{ menu, fuelStep }}
            service={DEMO_PIT_SERVICE}
            highlight={hovered}
            selected={selected ?? undefined}
            onSelect={setSelected}
            onHighlight={setHovered}
          />
        </div>

        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {!selected || !slot ? (
            <p className="text-sm text-slate-400">
              Click a side of the circle to choose what it does. Dashed sides
              are empty.
            </p>
          ) : (
            <>
              <h4 className="text-md font-medium text-slate-300">
                {SIDE_LABEL[selected]} side
              </h4>
              <SettingSelectRow<PieActionId>
                title="Action"
                value={slot.action}
                options={actions.map((id) => ({
                  value: id,
                  label: PIE_ACTIONS[id].label,
                }))}
                onChange={(action) => edit({ action })}
              />
              {ACTION_HINT[slot.action] && (
                <p className="text-sm text-slate-500">
                  {ACTION_HINT[slot.action]}
                </p>
              )}
              {slot.action === 'submenu' && (
                <>
                  <label className="flex items-center justify-between gap-3 text-md font-medium text-slate-300">
                    Name
                    <input
                      type="text"
                      maxLength={10}
                      value={slot.label ?? ''}
                      onChange={(e) => edit({ label: e.target.value })}
                      className="bg-slate-900 border border-slate-600 focus:border-accent-500 focus:outline-none text-white rounded-md px-2 py-1 w-32"
                    />
                  </label>
                  <SettingSelectRow<PieIconName>
                    title="Icon"
                    value={slot.icon ?? 'menu'}
                    options={PIE_ICON_NAMES.map((id) => ({
                      value: id,
                      label: ICON_LABEL[id],
                    }))}
                    onChange={(icon) => edit({ icon })}
                  />
                  <button
                    type="button"
                    className="self-start text-sm text-on-accent bg-accent-600 hover:bg-accent-500 rounded px-3 py-1.5 transition-colors cursor-pointer"
                    onClick={() => goTo(selected)}
                  >
                    Edit this submenu
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
