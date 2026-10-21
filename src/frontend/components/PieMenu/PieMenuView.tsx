import { memo, type ReactNode } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUUpLeftIcon,
  BroomIcon,
  CloudRainIcon,
  GasPumpIcon,
  LightningIcon,
  ListIcon,
  PlusCircleIcon,
  ProhibitIcon,
  SunIcon,
  TireIcon,
  WrenchIcon,
  XCircleIcon,
  type Icon,
} from '@phosphor-icons/react';
import type { PieIconName } from '@irdashies/types';
import { PieLogo } from './PieLogo';
import {
  PIE_DIRECTIONS,
  getPieItems,
  type CompoundStyle,
  type PieDirection,
  type PieItem,
  type PieModelConfig,
  type PieState,
  type PitServiceView,
  type TireCorner,
} from './pieMenuModel';

export const PIE_ICONS: Record<PieIconName, Icon> = {
  tires: TireIcon,
  fuel: GasPumpIcon,
  repair: WrenchIcon,
  tearoff: BroomIcon,
  dry: SunIcon,
  wet: CloudRainIcon,
  auto: LightningIcon,
  add: PlusCircleIcon,
  clear: XCircleIcon,
  cancel: ProhibitIcon,
  left: ArrowLeftIcon,
  right: ArrowRightIcon,
  back: ArrowUUpLeftIcon,
  menu: ListIcon,
};

const ANGLE: Record<PieDirection, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180,
};

const INNER = 72;
const OUTER = 140;
const MID = (INNER + OUTER) / 2;
const NO_TIRE = '#475569';

const polar = (radius: number, degrees: number) => {
  const rad = (degrees * Math.PI) / 180;
  return [radius * Math.cos(rad), radius * Math.sin(rad)] as const;
};

const sectorPath = (degrees: number) => {
  const [a0, a1] = [degrees - 42, degrees + 42];
  const [x0, y0] = polar(OUTER, a0);
  const [x1, y1] = polar(OUTER, a1);
  const [x2, y2] = polar(INNER, a1);
  const [x3, y3] = polar(INNER, a0);
  return `M${x0} ${y0}A${OUTER} ${OUTER} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${INNER} ${INNER} 0 0 0 ${x3} ${y3}Z`;
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

const OnOff = ({ x, y, on }: { x: number; y: number; on: boolean }) =>
  on ? (
    <g>
      <rect
        x={x - 14}
        y={y - 7}
        width={28}
        height={14}
        rx={7}
        className="fill-slate-200"
      />
      <text
        x={x}
        y={y + 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-slate-900 text-[9px] font-bold"
      >
        ON
      </text>
    </g>
  ) : (
    <text
      x={x}
      y={y + 0.5}
      textAnchor="middle"
      dominantBaseline="middle"
      className="fill-slate-500 text-[9px] font-bold"
    >
      off
    </text>
  );

/** Live state under a sector label; null when the sector has none. */
const sectorStatus = (
  item: PieItem,
  service: PitServiceView,
  x: number,
  y: number
): ReactNode => {
  if (item.opensSubmenu && item.icon === 'tires') {
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
          className="text-slate-200"
        />
        <Chip x={x + 17} y={y} style={service.next} />
      </g>
    );
  }
  if (item.opensSubmenu && item.icon === 'fuel') {
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-slate-200 text-[10px] font-bold"
      >
        {service.fuelLevel === undefined
          ? '--'
          : `${service.fuelLevel.toFixed(1)} L`}
      </text>
    );
  }
  switch (item.action) {
    case 'tearoff':
      return <OnOff x={x} y={y} on={service.tearoff} />;
    case 'repair':
      return <OnOff x={x} y={y} on={service.repair} />;
    case 'tiresAll':
      return <OnOff x={x} y={y} on={service.tiresAll} />;
    case 'fuelAuto':
      return <OnOff x={x} y={y} on={service.fuelOn} />;
    case 'compoundDry':
      return service.styles.dry ? (
        <Chip x={x} y={y} style={service.styles.dry} />
      ) : null;
    case 'compoundWet':
      return service.styles.wet ? (
        <Chip x={x} y={y} style={service.styles.wet} />
      ) : null;
    default:
      return null;
  }
};

const TIRE_SPOT: Record<TireCorner, readonly [number, number]> = {
  lf: [-34, -38],
  rf: [34, -38],
  lr: [-34, 38],
  rr: [34, 38],
};

/** A tire that blinks from its old colour to the new one, settling on the new. */
const TireGlyph = ({
  corner,
  service,
}: {
  corner: TireCorner;
  service: PitServiceView;
}) => {
  const [cx, cy] = TIRE_SPOT[corner];
  const change = service.tires[corner].change;
  const shape = { x: cx - 20, y: cy - 30, width: 40, height: 60, rx: 10 };
  return (
    <g>
      <rect {...shape} fill={service.current?.color ?? NO_TIRE} />
      {change && (
        <rect
          key={`${corner}-${change.color}-${service.current?.color}`}
          {...shape}
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
      {[-14, 0, 14].map((offset) => (
        <line
          key={offset}
          x1={cx - 14}
          x2={cx + 14}
          y1={cy + offset}
          y2={cy + offset}
          stroke="#0b1020"
          strokeWidth={4}
          opacity={0.3}
        />
      ))}
    </g>
  );
};

const FuelResult = ({ service }: { service: PitServiceView }) => {
  const { fuelLevel, fuelPct, fuelAdd } = service;
  const capacity = fuelLevel && fuelPct ? fuelLevel / fuelPct : undefined;
  const addedPct =
    capacity && fuelLevel && fuelAdd
      ? Math.min(1, (fuelLevel + fuelAdd) / capacity)
      : 0;
  const width = 150;
  return (
    <g>
      <GasPumpIcon
        x={-36}
        y={-76}
        size={72}
        weight="fill"
        className="text-slate-200"
      />
      <text
        x={0}
        y={22}
        textAnchor="middle"
        className="fill-white text-[22px] font-bold"
      >
        {fuelLevel === undefined ? '--' : `${fuelLevel.toFixed(1)} L`}
      </text>
      <text
        x={0}
        y={46}
        textAnchor="middle"
        className="fill-slate-300 text-[14px] font-bold"
      >
        {fuelAdd !== undefined ? `+${fuelAdd} L` : 'no refuel'}
      </text>
      <rect
        x={-width / 2}
        y={64}
        width={width}
        height={9}
        rx={4.5}
        className="fill-slate-700"
      />
      <rect
        x={-width / 2}
        y={64}
        width={addedPct * width}
        height={9}
        rx={4.5}
        className="fill-slate-400 animate-pulse"
      />
      <rect
        x={-width / 2}
        y={64}
        width={(fuelPct ?? 0) * width}
        height={9}
        rx={4.5}
        className="fill-slate-200"
      />
    </g>
  );
};

const ToggleResult = ({
  Glyph,
  label,
  on,
}: {
  Glyph: Icon;
  label: string;
  on: boolean;
}) => (
  <g>
    <Glyph
      x={-44}
      y={-70}
      size={88}
      weight="fill"
      className={on ? 'text-slate-200' : 'text-slate-600'}
    />
    <text
      x={0}
      y={46}
      textAnchor="middle"
      className="fill-white text-[16px] font-bold"
    >
      {label}
    </text>
    <OnOff x={0} y={70} on={on} />
  </g>
);

const ResultView = ({
  feedback,
  service,
}: {
  feedback: NonNullable<PieState['feedback']>;
  service: PitServiceView;
}) => (
  <svg viewBox="-145 -145 290 290" className="w-full h-full">
    <circle
      r={122}
      className="fill-slate-950/90 stroke-slate-500"
      strokeWidth={3}
    />
    {feedback === 'tires' && (
      <g>
        {(['lf', 'rf', 'lr', 'rr'] as const).map((corner) => (
          <TireGlyph key={corner} corner={corner} service={service} />
        ))}
        {service.current && service.next && service.anyTireChange && (
          <g>
            <Chip x={-19} y={96} style={service.current} />
            <ArrowRightIcon
              x={-5}
              y={91}
              size={10}
              weight="bold"
              className="text-slate-200"
            />
            <Chip x={19} y={96} style={service.next} />
          </g>
        )}
      </g>
    )}
    {feedback === 'fuel' && <FuelResult service={service} />}
    {feedback === 'repair' && (
      <ToggleResult
        Glyph={WrenchIcon}
        label="Fast repair"
        on={service.repair}
      />
    )}
    {feedback === 'tearoff' && (
      <ToggleResult Glyph={BroomIcon} label="Tear-off" on={service.tearoff} />
    )}
  </svg>
);

export interface PieMenuViewProps {
  state: PieState;
  config: PieModelConfig;
  service: PitServiceView;
  /** Settings editor: the side being edited. */
  selected?: PieDirection;
  /** Settings editor: makes the sides clickable and draws empty ones. */
  onSelect?: (direction: PieDirection) => void;
}

export const PieMenuView = memo(
  ({ state, config, service, selected, onSelect }: PieMenuViewProps) => {
    if (state.level === 'result' && state.feedback) {
      return <ResultView feedback={state.feedback} service={service} />;
    }
    const items = getPieItems(state, config);

    return (
      <svg viewBox="-145 -145 290 290" className="w-full h-full">
        {PIE_DIRECTIONS.map((direction) => {
          const item = items[direction];
          if (!item && !onSelect) return null;
          const [x, y] = polar(MID, ANGLE[direction]);
          const isSelected = selected === direction;
          const ItemIcon = item ? PIE_ICONS[item.icon] : undefined;
          const status = item ? sectorStatus(item, service, x, y + 14) : null;
          return (
            <g
              key={direction}
              onClick={onSelect ? () => onSelect(direction) : undefined}
              className={onSelect ? 'cursor-pointer' : undefined}
            >
              <path
                d={sectorPath(ANGLE[direction])}
                strokeWidth={3}
                strokeLinejoin="round"
                strokeDasharray={item ? undefined : '5 5'}
                className={[
                  isSelected ? 'fill-slate-600' : 'fill-slate-800/90',
                  item ? 'stroke-slate-500' : 'stroke-slate-600',
                  onSelect ? 'hover:fill-slate-700' : '',
                ].join(' ')}
              />
              {item && ItemIcon && (
                <>
                  <ItemIcon
                    x={x - 10}
                    y={y - (status ? 31 : 24)}
                    size={20}
                    weight="fill"
                    className="text-slate-100 pointer-events-none"
                  />
                  <text
                    x={x}
                    y={y + (status ? 1 : 10)}
                    textAnchor="middle"
                    className="fill-slate-100 text-[10px] font-bold pointer-events-none"
                  >
                    {item.label}
                  </text>
                  {status}
                </>
              )}
            </g>
          );
        })}
        <circle
          r={64}
          className="fill-slate-950/90 stroke-slate-500"
          strokeWidth={3}
        />
        <PieLogo x={-44} y={-44} size={88} />
      </svg>
    );
  }
);
PieMenuView.displayName = 'PieMenuView';
