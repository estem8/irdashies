import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUUpLeftIcon,
  BroomIcon,
  GasPumpIcon,
  PlusCircleIcon,
  ProhibitIcon,
  TireIcon,
  WrenchIcon,
  XCircleIcon,
  type Icon,
} from '@phosphor-icons/react';
import {
  useDashboard,
  useDriverTires,
  usePitServiceSnapshot,
} from '@irdashies/context';
import logger from '@irdashies/utils/logger';
import { PIT_SV_FLAGS, type PieMenuConfig } from '@irdashies/types';
import {
  DEMO_PIT_SERVICE,
  INITIAL_PIE_STATE,
  PIE_DIRECTIONS,
  TIRE_CORNERS,
  describePitService,
  getPieItems,
  stepPieMenu,
  type CompoundStyle,
  type PieDirection,
  type PieIcon,
  type PieItem,
  type PieLevel,
  type PieModelConfig,
  type PieState,
  type PitServiceView,
  type TireCorner,
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

const INNER = 68;
const OUTER = 138;
const MID = (INNER + OUTER) / 2;
const DEFAULT_CONFIG: PieMenuConfig = {
  timeoutSeconds: 5,
  fuelStep: 10,
  sides: { up: 'tearoff', right: 'repair', down: 'fuel', left: 'tires' },
};
const MAX_FADE_MS = 1000;
const NO_TIRE = '#475569';

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

const TIRE_POSITION: Record<TireCorner, readonly [number, number]> = {
  lf: [-21, -24],
  rf: [21, -24],
  lr: [-22, 22],
  rr: [22, 22],
};
const TANK = { x: -8, y: 12, width: 16, height: 20 } as const;

const fuelColor = (pct: number | undefined) =>
  pct === undefined || pct > 0.3
    ? '#22c55e'
    : pct > 0.15
      ? '#f59e0b'
      : '#ef4444';

/** Top-down car outline: tires, fuel tank, fast repair and windshield. */
const CarSkeleton = ({ service }: { service: PitServiceView }) => {
  const { fuelLevel, fuelPct, fuelAdd } = service;
  const tankFill = (fuelPct ?? 0) * TANK.height;
  const capacity = fuelLevel && fuelPct ? fuelLevel / fuelPct : undefined;
  const addedPct =
    capacity && fuelAdd
      ? Math.min(1, ((fuelLevel ?? 0) + fuelAdd) / capacity)
      : undefined;
  const addedFill = (addedPct ?? 0) * TANK.height;

  return (
    <g transform="scale(1.25)">
      <path
        d="M-9 -40Q0 -46 9 -40L12 -20L12 8L15 14L15 34Q0 40 -15 34L-15 14L-12 8L-12 -20Z"
        className="fill-slate-900 stroke-slate-400"
        strokeWidth={1.5}
      />
      <path
        d="M-8 -26Q0 -31 8 -26"
        fill="none"
        strokeWidth={2}
        className={service.tearoff ? 'stroke-cyan-300' : 'stroke-slate-600'}
      />
      <rect
        x={-7}
        y={-20}
        width={14}
        height={22}
        rx={5}
        className="fill-slate-800 stroke-slate-600"
      />
      {TIRE_CORNERS.map((corner) => {
        const [cx, cy] = TIRE_POSITION[corner];
        const change = service.tires[corner].change;
        return (
          <g key={corner}>
            <rect
              x={cx - 5}
              y={cy - 9}
              width={10}
              height={18}
              rx={2}
              fill={service.current?.color ?? NO_TIRE}
            />
            {change && (
              // Blinks between the old and new colour, settling on the new one.
              <rect
                key={`${corner}-${change.color}-${service.current?.color}`}
                x={cx - 5}
                y={cy - 9}
                width={10}
                height={18}
                rx={2}
                fill={change.color}
                opacity={0}
              >
                <animate
                  attributeName="opacity"
                  values="0;1;0.1;1;0.35;1;0.65;1"
                  dur="2.4s"
                  fill="freeze"
                />
              </rect>
            )}
          </g>
        );
      })}
      <rect {...TANK} rx={2} className="fill-slate-800 stroke-slate-600" />
      {addedPct !== undefined && (
        <rect
          x={TANK.x}
          y={TANK.y + TANK.height - addedFill}
          width={TANK.width}
          height={addedFill}
          rx={2}
          fill="#bbf7d0"
          className="animate-pulse"
          opacity={0.6}
        />
      )}
      {fuelPct !== undefined && (
        <rect
          x={TANK.x}
          y={TANK.y + TANK.height - tankFill}
          width={TANK.width}
          height={tankFill}
          rx={2}
          fill={fuelColor(fuelPct)}
        />
      )}
      {service.repair && (
        <WrenchIcon
          x={-9}
          y={-17}
          size={18}
          weight="fill"
          className="text-amber-400 animate-pulse"
        />
      )}
    </g>
  );
};

const Chip = ({
  x,
  y,
  style,
}: {
  x: number;
  y: number;
  style: CompoundStyle;
}) => (
  <g>
    <rect
      x={x - 8}
      y={y - 8}
      width={16}
      height={16}
      rx={3}
      fill={style.color}
    />
    <text
      x={x}
      y={y + 0.5}
      textAnchor="middle"
      dominantBaseline="middle"
      className="fill-slate-950 text-[11px] font-bold"
    >
      {style.letter}
    </text>
  </g>
);

/** Live state shown under a root sector label. */
const SectorStatus = ({
  item,
  service,
  x,
  y,
}: {
  item: PieItem;
  service: PitServiceView;
  x: number;
  y: number;
}) => {
  if (item.next === 'tires') {
    if (!service.current) return null;
    if (!service.anyTireChange || !service.next) {
      return <Chip x={x} y={y} style={service.current} />;
    }
    return (
      <g>
        <Chip x={x - 17} y={y} style={service.current} />
        <ArrowRightIcon
          x={x - 5}
          y={y - 5}
          size={10}
          weight="bold"
          className="text-white"
        />
        <Chip x={x + 17} y={y} style={service.next} />
      </g>
    );
  }
  if (item.next === 'fuel') {
    return (
      <g>
        <text
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white text-[10px] font-bold"
        >
          {service.fuelLevel === undefined
            ? '--'
            : `${service.fuelLevel.toFixed(1)} L`}
        </text>
        {service.fuelAdd !== undefined && (
          <text
            x={x}
            y={y + 11}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-amber-400 text-[10px] font-bold"
          >
            {`+${service.fuelAdd} L`}
          </text>
        )}
      </g>
    );
  }
  if (item.toggle) {
    const on = item.toggle === 'repair' ? service.repair : service.tearoff;
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        className={`${on ? 'fill-amber-400' : 'fill-slate-400'} text-[10px] font-bold`}
      >
        {on ? 'ON' : 'off'}
      </text>
    );
  }
  return null;
};

export interface PieMenuViewProps {
  level: Exclude<PieLevel, 'closed'>;
  state: PieState;
  config: PieModelConfig;
  service: PitServiceView;
}

export const PieMenuView = memo(
  ({ level, state, config, service }: PieMenuViewProps) => {
    const items = getPieItems(level, state, config);

    return (
      <svg viewBox="-145 -145 290 290" className="w-full h-full">
        {PIE_DIRECTIONS.map((direction) => {
          const item = items[direction];
          if (!item) return null;
          const SectorIcon = ICONS[item.icon];
          const [x, y] = polar(MID, ANGLE[direction]);
          const hasStatus = level === 'root' && (item.next || item.toggle);
          return (
            <g key={direction}>
              <path
                d={sectorPath(ANGLE[direction])}
                className="fill-slate-800/90 stroke-slate-600"
              />
              <SectorIcon
                x={x - 11}
                y={y - (hasStatus ? 29 : 21)}
                size={22}
                weight="fill"
                className="text-white"
              />
              <text
                x={x}
                y={y + (hasStatus ? -2 : 8)}
                textAnchor="middle"
                className="fill-white text-[11px] font-bold"
              >
                {item.label}
              </text>
              {hasStatus && (
                <SectorStatus item={item} service={service} x={x} y={y + 12} />
              )}
            </g>
          );
        })}
        <circle r={64} className="fill-slate-950/90 stroke-slate-600" />
        <CarSkeleton service={service} />
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
  const timeoutSeconds =
    savedConfig?.timeoutSeconds ?? DEFAULT_CONFIG.timeoutSeconds;
  const fuelStep = savedConfig?.fuelStep ?? DEFAULT_CONFIG.fuelStep;
  const { up, right, down, left } = {
    ...DEFAULT_CONFIG.sides,
    ...savedConfig?.sides,
  };
  const modelConfig = useMemo<PieModelConfig>(
    () => ({ fuelStep, sides: { up, right, down, left } }),
    [fuelStep, up, right, down, left]
  );

  const snapshot = usePitServiceSnapshot();
  const sessionTires = useDriverTires();
  const service = useMemo(
    () =>
      isDemoMode
        ? DEMO_PIT_SERVICE
        : describePitService(snapshot, sessionTires),
    [isDemoMode, snapshot, sessionTires]
  );

  const [state, setState] = useState<PieState>(INITIAL_PIE_STATE);
  const [activity, setActivity] = useState(0);
  const [fading, setFading] = useState(false);
  const stateRef = useRef(state);
  const configRef = useRef(modelConfig);
  configRef.current = modelConfig;

  const timeoutMs = timeoutSeconds * 1000;
  const fadeMs = Math.min(MAX_FADE_MS, timeoutMs / 2);

  const apply = useCallback((next: PieState) => {
    stateRef.current = next;
    setState(next);
    setFading(false);
    setActivity((n) => n + 1);
  }, []);

  // The sim's checkboxes are the truth for the toggles; the local flip after a
  // pick only covers the moment before the next snapshot.
  const flags = snapshot?.flags;
  useEffect(() => {
    if (flags === undefined) return;
    const next = {
      ...stateRef.current,
      repair: (flags & PIT_SV_FLAGS.repair) !== 0,
      tearoff: (flags & PIT_SV_FLAGS.tearoff) !== 0,
    };
    stateRef.current = next;
    setState(next);
  }, [flags]);

  useEffect(() => {
    return window.pieMenuBridge?.onInput((input) => {
      const { state: next, commands } = stepPieMenu(
        stateRef.current,
        input,
        configRef.current
      );
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
      <PieMenuView
        level={level}
        state={state}
        config={modelConfig}
        service={service}
      />
    </div>
  );
};
PieMenu.displayName = 'PieMenu';
