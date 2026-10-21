import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BroomIcon,
  GasPumpIcon,
  PlusCircleIcon,
  ProhibitIcon,
  TireIcon,
  WrenchIcon,
  XCircleIcon,
  XIcon,
  ArrowUUpLeftIcon,
  type Icon,
} from '@phosphor-icons/react';
import { useDashboard } from '@irdashies/context';
import logger from '@irdashies/utils/logger';
import type { PieMenuConfig } from '@irdashies/types';
import {
  INITIAL_PIE_STATE,
  PIE_DIRECTIONS,
  getPieItems,
  stepPieMenu,
  type PieDirection,
  type PieIcon,
  type PieLevel,
  type PieState,
} from './pieMenuModel';

const ICONS: Record<PieIcon, Icon> = {
  tearoff: BroomIcon,
  tires: TireIcon,
  fuel: GasPumpIcon,
  repair: WrenchIcon,
  add: PlusCircleIcon,
  clear: XCircleIcon,
  cancel: ProhibitIcon,
  left: ArrowLeftIcon,
  right: ArrowRightIcon,
  back: ArrowUUpLeftIcon,
};

const ANGLE: Record<PieDirection, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180,
};

const INNER = 46;
const OUTER = 112;
const DEFAULT_CONFIG: PieMenuConfig = { timeoutSeconds: 5, fuelStep: 10 };
const MAX_FADE_MS = 1000;

const polar = (radius: number, degrees: number) => {
  const rad = (degrees * Math.PI) / 180;
  return [radius * Math.cos(rad), radius * Math.sin(rad)] as const;
};

const sectorPath = (degrees: number) => {
  const [a0, a1] = [degrees - 44, degrees + 44];
  const [x0, y0] = polar(OUTER, a0);
  const [x1, y1] = polar(OUTER, a1);
  const [x2, y2] = polar(INNER, a1);
  const [x3, y3] = polar(INNER, a0);
  return `M${x0} ${y0}A${OUTER} ${OUTER} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${INNER} ${INNER} 0 0 0 ${x3} ${y3}Z`;
};

export interface PieMenuViewProps {
  level: Exclude<PieLevel, 'closed'>;
  state: PieState;
  fuelStep: number;
}

export const PieMenuView = memo(
  ({ level, state, fuelStep }: PieMenuViewProps) => {
    const items = getPieItems(level, state, { fuelStep });
    const CenterIcon = level === 'root' ? XIcon : ArrowUUpLeftIcon;

    return (
      <svg viewBox="-130 -130 260 260" className="w-full h-full">
        {PIE_DIRECTIONS.map((direction) => {
          const item = items[direction];
          if (!item) return null;
          const SectorIcon = ICONS[item.icon];
          const [x, y] = polar((INNER + OUTER) / 2, ANGLE[direction]);
          return (
            <g key={direction}>
              <path
                d={sectorPath(ANGLE[direction])}
                className="fill-slate-800/90 stroke-slate-600"
              />
              <SectorIcon
                x={x - 12}
                y={y - 20}
                size={24}
                weight="fill"
                className="text-white"
              />
              <text
                x={x}
                y={y + 14}
                textAnchor="middle"
                className="fill-white text-[11px] font-bold"
              >
                {item.label}
              </text>
            </g>
          );
        })}
        <circle r={38} className="fill-slate-950 stroke-slate-600" />
        <CenterIcon
          x={-13}
          y={-13}
          size={26}
          weight="fill"
          className="text-white"
        />
      </svg>
    );
  }
);
PieMenuView.displayName = 'PieMenuView';

export const PieMenu = () => {
  const { currentDashboard, isDemoMode } = useDashboard();
  const savedConfig = currentDashboard?.widgets.find(
    (widget) => widget.id === 'piemenu'
  )?.config as Partial<PieMenuConfig> | undefined;
  const { timeoutSeconds, fuelStep } = { ...DEFAULT_CONFIG, ...savedConfig };

  const [state, setState] = useState<PieState>(INITIAL_PIE_STATE);
  const [activity, setActivity] = useState(0);
  const [fading, setFading] = useState(false);
  const stateRef = useRef(state);
  const fuelStepRef = useRef(fuelStep);
  fuelStepRef.current = fuelStep;

  const timeoutMs = timeoutSeconds * 1000;
  const fadeMs = Math.min(MAX_FADE_MS, timeoutMs / 2);

  const apply = useCallback((next: PieState) => {
    stateRef.current = next;
    setState(next);
    setFading(false);
    setActivity((n) => n + 1);
  }, []);

  useEffect(() => {
    return window.pieMenuBridge?.onInput((input) => {
      const { state: next, commands } = stepPieMenu(stateRef.current, input, {
        fuelStep: fuelStepRef.current,
      });
      apply(next);
      if (commands.length > 0) {
        window.pieMenuBridge?.sendPitCommands(commands).catch((err) => {
          logger.error('Pie menu pit command failed', err);
        });
      }
    });
  }, [apply]);

  // Fade out over the last stretch of the timeout, then close.
  useEffect(() => {
    if (state.level === 'closed') return;
    const fade = setTimeout(() => setFading(true), timeoutMs - fadeMs);
    const close = setTimeout(
      () => apply({ ...stateRef.current, level: 'closed' }),
      timeoutMs
    );
    return () => {
      clearTimeout(fade);
      clearTimeout(close);
    };
  }, [state.level, activity, timeoutMs, fadeMs, apply]);

  // Settings preview: show the menu open so it can be positioned.
  const level = isDemoMode ? 'root' : state.level;
  if (level === 'closed') return null;

  return (
    <div
      className={`w-full h-full transition-opacity ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{ transitionDuration: `${fading ? fadeMs : 0}ms` }}
    >
      <PieMenuView level={level} state={state} fuelStep={fuelStep} />
    </div>
  );
};
PieMenu.displayName = 'PieMenu';
