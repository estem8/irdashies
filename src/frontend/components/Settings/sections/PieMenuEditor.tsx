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
  compoundDry: 'Selects the dry tire compound and requests tires when none are selected.',
  compoundWet: 'Selects the wet tire compound and requests tires when none are selected.',
  fuelAuto:
    'Adds the fuel needed to finish when the race length is known, otherwise checks fuel with the amount already in the pit menu. Again to uncheck.',
  fuelAdd: 'Adds the Fuel Step litres to the fuel already requested.',
  fuelAddDouble:
    'Adds twice the Fuel Step litres to the fuel already requested.',
  fuelSub:
    'Takes the Fuel Step litres off the fuel requested, and unchecks fuel at zero.',
};

const ACTION_CATEGORIES: { title: string; actions: PieActionId[] }[] = [
  { title: 'Menu', actions: ['none', 'back', 'submenu'] },
  { title: 'Pit stop', actions: ['pitClear'] },
  { title: 'Tires', actions: ['tiresAll', 'tireLF', 'tireRF', 'tireLR', 'tireRR', 'tiresLeft', 'tiresRight', 'tiresClear', 'compoundDry', 'compoundWet'] },
  { title: 'Pit stop · fuel', actions: ['fuelAuto', 'fuelAdd', 'fuelAddDouble', 'fuelSub', 'fuelClear'] },
  { title: 'Pit stop · service', actions: ['tearoff', 'repair'] },
];

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
  const [submenu, setSubmenu] = useState<PieDirection[]>([]);
  const [selected, setSelected] = useState<PieDirection | null>(null);
  const [hovered, setHovered] = useState<PieDirection | undefined>();

  const slot = selected ? getPieSlot(menu, submenu, selected) : undefined;
  const breadcrumb = ['Main', ...submenu.map((direction) => SIDE_LABEL[direction])];
  const activeBreadcrumb = breadcrumb.length - 1;
  const actions = actionsFor(PIE_ACTION_IDS);

  const edit = (patch: Parameters<typeof setPieSlot>[3]) => {
    if (selected) onChange(setPieSlot(menu, submenu, selected, patch));
  };

  const goTo = (next: PieDirection | null) => {
    setSubmenu(next === null ? [] : [...submenu, next]);
    setSelected(null);
  };

  return (
    <div className="flex flex-col gap-3 px-4">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <button
          type="button"
          className={`rounded border px-2 py-1 ${activeBreadcrumb === 0 ? 'border-green-400/40 bg-green-500/10 font-bold text-green-300' : 'border-transparent text-slate-400 hover:text-white'}`}
          onClick={() => { setSubmenu([]); setSelected(null); }}
        >
          Main
        </button>
        {breadcrumb.slice(1).map((label, index) => {
          const active = index + 1 === activeBreadcrumb;
          return (
            <button key={`${label}-${index}`} type="button"
              onClick={() => { setSubmenu(submenu.slice(0, index + 1)); setSelected(null); }}
              className="flex items-center gap-2">
              <span className="text-slate-600">→</span>
              <span className={`rounded border px-2 py-1 ${active ? 'border-green-400/40 bg-green-500/10 font-bold text-green-300' : 'border-transparent text-slate-400 hover:text-white'}`}>
                {label}
              </span>
            </button>
          );
        })}
        {submenu.length > 0 && (
          <button type="button" className="ml-1 text-xs text-slate-400 underline hover:text-white" onClick={() => { setSubmenu(submenu.slice(0, -1)); setSelected(null); }}>Up one level</button>
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
              submenu.length ? { level: 'sub', entry: submenu[0], path: submenu } : { level: 'root' }
            }
            config={{ menu, fuelStep }}
            service={DEMO_PIT_SERVICE}
            highlight={hovered}
            selected={selected ?? undefined}
            onSelect={setSelected}
            onHighlight={setHovered}
            onDropAction={(direction, action) => onChange(setPieSlot(menu, submenu, direction, { action }))}
          />
        </div>

        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="min-w-0 flex-1">
              <p className="mb-2 text-sm text-slate-400">{selected ? `Selected sector: ${SIDE_LABEL[selected]}. Click an action to assign it, or drag it onto a sector.` : '1. Select a sector. 2. Click an action here, or drag it onto a sector.'}</p>
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {ACTION_CATEGORIES.map((category) => (
                  <section key={category.title}>
                    <h5 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{category.title}</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {category.actions.filter((id) => actions.includes(id)).map((id) => (
                        <button key={id} type="button" draggable
                          onDragStart={(event) => event.dataTransfer.setData('application/x-piemenu-action', id)}
                          onClick={() => selected && onChange(setPieSlot(menu, submenu, selected, { action: id }))}
                          className="cursor-grab rounded-sm border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 active:cursor-grabbing">
                          {PIE_ACTIONS[id].label}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
          </div>
          {selected && slot && (
            <>
              <h4 className="text-md font-medium text-slate-300">
                {SIDE_LABEL[selected]} side
              </h4>
              {['fuelAdd', 'fuelAddDouble', 'fuelSub'].includes(slot.action) && (
                <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                  {slot.action === 'fuelSub' ? 'Fuel to remove (L)' : 'Fuel to add (L)'}
                  <input type="number" min={1} max={999} step={1} value={slot.fuelAmount ?? fuelStep}
                    onChange={(event) => edit({ fuelAmount: Math.max(1, Math.min(999, Number(event.target.value) || 1)) })}
                    className="w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white" />
                </label>
              )}
              {['tiresAll', 'tireLF', 'tireRF', 'tireLR', 'tireRR', 'tiresLeft', 'tiresRight'].includes(slot.action) && (
                <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                  Tire pressure (kPa, 0 = unchanged)
                  <input type="number" min={0} max={500} step={1} value={slot.tirePressureKpa ?? 0}
                    onChange={(event) => edit({ tirePressureKpa: Math.max(0, Math.min(500, Number(event.target.value) || 0)) })}
                    className="w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white" />
                </label>
              )}
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
