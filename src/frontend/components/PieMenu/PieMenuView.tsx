import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUUpLeftIcon,
  BroomIcon,
  CheckCircleIcon,
  CloudRainIcon,
  DropIcon,
  GasPumpIcon,
  LightningIcon,
  ListIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  ProhibitIcon,
  SunIcon,
  TireIcon,
  WrenchIcon,
  XCircleIcon,
  type Icon,
} from '@phosphor-icons/react';
import type { PieIconName } from '@irdashies/types';
import {
  PIE_DIRECTIONS,
  getPieItems,
  pieCenter,
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
  remove: MinusCircleIcon,
};

const ANGLE: Record<PieDirection, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180,
};
const VECTOR: Record<PieDirection, readonly [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

const INNER = 66;
const OUTER = 134;
/** Half the angle of a side; the sides meet and are told apart by a hairline. */
const HALF = 45;
const MID = (INNER + OUTER) / 2;
const POP = 8;
/** A tire that is not being replaced; one checked for a change shows the new compound's colour. */
const KEEP_TIRE = '#6b7280';
const tireColor = (service: PitServiceView, corner: TireCorner) =>
  service.tires[corner].change?.color ?? KEEP_TIRE;

const polar = (radius: number, degrees: number) => {
  const rad = (degrees * Math.PI) / 180;
  return [radius * Math.cos(rad), radius * Math.sin(rad)] as const;
};

const arcPath = (r0: number, r1: number, a0: number, a1: number) => {
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1);
  const [x3, y3] = polar(r0, a0);
  return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
};

/** Fades and scales in on mount, quickly; key it to replay on a change. */
const Appear = ({
  children,
  hidden = false,
}: {
  children: ReactNode;
  hidden?: boolean;
}) => {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const shown = entered && !hidden;
  return (
    <g
      className={`origin-center transition-[opacity,scale] duration-150 ease-out ${
        shown ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
      }`}
    >
      {children}
    </g>
  );
};

/** Text and icon colour: dark on a highlighted side, light otherwise. */
const INK = 'text-slate-100';
const INK_FILL = 'fill-slate-100';

const Label = ({
  x,
  y,
  size,
  children,
  bold = true,
}: {
  x: number;
  y: number;
  size: number;
  children: ReactNode;
  bold?: boolean;
}) => (
  <text
    x={x}
    y={y}
    fontSize={size}
    textAnchor="middle"
    dominantBaseline="middle"
    className={`${INK_FILL} ${bold ? 'font-bold' : 'font-semibold'} pointer-events-none`}
  >
    {children}
  </text>
);

const Glyph = ({
  Svg,
  x,
  y,
  size,
  className,
}: {
  Svg: Icon;
  x: number;
  y: number;
  size: number;
  className?: string;
}) => (
  <Svg
    x={x - size / 2}
    y={y - size / 2}
    size={size}
    weight="fill"
    className={`${className ?? INK} pointer-events-none`}
  />
);

const Chip = ({
  x,
  y,
  style,
}: {
  x: number;
  y: number;
  style: CompoundStyle;
}) => (
  <g className="pointer-events-none">
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
    <g className="pointer-events-none">
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
      className="fill-slate-500 text-[9px] font-bold pointer-events-none"
    >
      off
    </text>
  );

const Tick = ({
  x,
  y,
  size,
  on,
}: {
  x: number;
  y: number;
  size: number;
  on: boolean;
}) => (
  <Glyph
    Svg={on ? CheckCircleIcon : XCircleIcon}
    x={x}
    y={y}
    size={size}
    className={on ? INK : 'text-slate-500'}
  />
);

/** The four tires in the current compound's colour; a tire checked for a change carries a bar in the new colour. */
const TireIcons = ({
  service,
  x,
  y,
  gap,
  size,
  grid,
}: {
  service: PitServiceView;
  x: number;
  y: number;
  gap: number;
  size: number;
  grid: boolean;
}) => {
  const spots = grid
    ? ([
        ['lf', -gap, -gap],
        ['rf', gap, -gap],
        ['lr', -gap, gap],
        ['rr', gap, gap],
      ] as const)
    : ([
        ['lf', -gap * 3, 0],
        ['rf', -gap, 0],
        ['lr', gap, 0],
        ['rr', gap * 3, 0],
      ] as const);
  return (
    <g className="pointer-events-none">
      {spots.map(([corner, dx, dy]) => (
        <TireIcon
          key={corner}
          x={x + dx - size / 2}
          y={y + dy - size / 2}
          size={size}
          weight="fill"
          color={tireColor(service, corner)}
        />
      ))}
    </g>
  );
};

/** W to S when a replacement is asked for, otherwise an arrow to a cross. */
const TireStatus = ({
  service,
  x,
  y,
}: {
  service: PitServiceView;
  x: number;
  y: number;
}) => {
  if (!service.current) return null;
  if (service.anyTireChange && service.next) {
    return (
      <g>
        <Chip x={x - 17} y={y} style={service.current} />
        <Glyph Svg={ArrowRightIcon} x={x} y={y} size={10} />
        <Chip x={x + 17} y={y} style={service.next} />
      </g>
    );
  }
  return (
    <g>
      <Chip x={x - 14} y={y} style={service.current} />
      <Glyph
        Svg={ArrowRightIcon}
        x={x + 2}
        y={y}
        size={10}
        className="text-slate-400"
      />
      <Glyph
        Svg={XCircleIcon}
        x={x + 17}
        y={y}
        size={13}
        className="text-slate-400"
      />
    </g>
  );
};

const fuelText = (litres: number | undefined) =>
  litres === undefined ? '--' : `${litres.toFixed(1)} L`;
const lapsText = (laps: number | undefined) =>
  laps === undefined ? '-- laps' : `${laps.toFixed(1)} laps`;

/** What sits inside a side of the ring. */
const SectorBody = ({
  item,
  service,
  x,
  y,
  compact,
}: {
  item: PieItem;
  service: PitServiceView;
  x: number;
  y: number;
  compact: boolean;
}) => {
  const ItemIcon = PIE_ICONS[item.icon];
  if (compact && item.opensSubmenu && item.icon === 'tires') {
    return (
      <g>
        <TireIcons service={service} x={x} y={y - 12} gap={9} size={15} grid />
        <TireStatus service={service} x={x} y={y + 17} />
      </g>
    );
  }
  if (compact && item.opensSubmenu && item.icon === 'fuel') {
    return (
      <g>
        <Glyph Svg={GasPumpIcon} x={x} y={y - 18} size={18} />
        <Label x={x} y={y + 1} size={11}>
          {fuelText(service.fuelLevel)}
          {service.fuelAdd !== undefined && (
            <tspan opacity={0.7}>{` +${service.fuelAdd}`}</tspan>
          )}
        </Label>
        <Label x={x} y={y + 15} size={9.5} bold={false}>
          {lapsText(service.fuelLaps)}
        </Label>
      </g>
    );
  }
  if (compact && item.action === 'repair') {
    return (
      <g>
        <Glyph Svg={WrenchIcon} x={x} y={y - 12} size={22} />
        <Tick x={x} y={y + 14} size={18} on={service.repair} />
      </g>
    );
  }
  if (compact && item.action === 'tearoff') {
    return (
      <g>
        <Glyph Svg={BroomIcon} x={x} y={y - 12} size={22} />
        <OnOff x={x} y={y + 14} on={service.tearoff} />
      </g>
    );
  }
  const status =
    item.action === 'tiresAll' ? (
      <OnOff x={x} y={y + 16} on={service.anyTireChange} />
    ) : item.action === 'fuelAuto' ? (
      <OnOff x={x} y={y + 16} on={service.fuelOn} />
    ) : item.action === 'compoundDry' && service.styles.dry ? (
      <Chip x={x} y={y + 16} style={service.styles.dry} />
    ) : item.action === 'compoundWet' && service.styles.wet ? (
      <Chip x={x} y={y + 16} style={service.styles.wet} />
    ) : null;
  return (
    <g>
      <Glyph Svg={ItemIcon} x={x} y={y - (status ? 20 : 12)} size={20} />
      <Label x={x} y={y + (status ? 0 : 10)} size={10.5}>
        {item.label}
      </Label>
      {status}
    </g>
  );
};

const WET_LABEL: Record<number, string> = {
  1: 'Dry',
  2: 'Dry',
  3: 'Damp',
  4: 'Damp',
  5: 'Wet',
  6: 'Wet',
  7: 'Soaked',
};
const WATER = '#2f9bff';

/** Main menu centre: the state of the track above, the fuel verdict below. */
const MainCenter = ({ service }: { service: PitServiceView }) => {
  const { wetness, precipitation, fuelMargin, lapUsage } = service;
  const known = wetness !== undefined && wetness >= 1;
  const filled = known ? Math.min(5, wetness - 1) : 0;
  const rain = precipitation ? Math.round(precipitation * 100) : 0;
  const trackLabel = known ? WET_LABEL[wetness] : '--';
  const verdictColour =
    fuelMargin === undefined
      ? 'fill-slate-500'
      : fuelMargin >= 1
        ? 'fill-green-500'
        : fuelMargin >= 0
          ? 'fill-amber-500'
          : 'fill-red-500';
  const short =
    fuelMargin !== undefined && fuelMargin < 0 && lapUsage
      ? `short ${(-fuelMargin * lapUsage).toFixed(1)} L`
      : 'laps to finish';
  return (
    <g className="pointer-events-none">
      {[0, 1, 2, 3, 4].map((i) => (
        <DropIcon
          key={i}
          x={-30 + i * 15 - 6.5}
          y={-38 - 6.5}
          size={13}
          weight="fill"
          color={i < filled ? WATER : undefined}
          className={i < filled ? undefined : 'text-slate-600'}
        />
      ))}
      <text
        x={rain > 0 ? -8 : 0}
        y={-19.5}
        fontSize={10}
        textAnchor={rain > 0 ? 'end' : 'middle'}
        dominantBaseline="middle"
        className="fill-slate-200 font-bold"
      >
        {trackLabel}
      </text>
      {rain > 0 && (
        <g>
          <CloudRainIcon
            x={8.5}
            y={-25}
            size={11}
            weight="fill"
            className="text-slate-300"
          />
          <text
            x={22}
            y={-19.5}
            fontSize={9.5}
            dominantBaseline="middle"
            className="fill-slate-300 font-bold"
          >
            {`${rain}%`}
          </text>
        </g>
      )}
      <line
        x1={-34}
        x2={34}
        y1={-4}
        y2={-4}
        className="stroke-slate-600"
        strokeWidth={1.5}
      />
      {service.stopInProgress ? (
        <g>
          <text
            y={17}
            fontSize={14}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-amber-400 font-extrabold"
          >
            Pit stop
          </text>
          <text
            y={34}
            fontSize={9}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-300 font-semibold"
          >
            in progress
          </text>
        </g>
      ) : (
        <g>
          <text
            y={19}
            fontSize={fuelMargin === undefined ? 20 : 21}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`${verdictColour} font-extrabold`}
          >
            {fuelMargin === undefined
              ? '--'
              : `${fuelMargin >= 0 ? '+' : ''}${fuelMargin.toFixed(1)}`}
          </text>
          <text
            y={38}
            fontSize={9}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-300 font-semibold"
          >
            {fuelMargin === undefined ? 'finish unknown' : short}
          </text>
        </g>
      )}
    </g>
  );
};

/** The centre: the menu we are in, or the track and fuel at a glance. */
const CenterBody = ({
  state,
  config,
  service,
}: {
  state: PieState;
  config: PieModelConfig;
  service: PitServiceView;
}) => {
  const { kind, icon } = pieCenter(state, config);
  const light = 'text-slate-200';
  switch (kind) {
    case 'tires':
      return (
        <g>
          <TireIcons
            service={service}
            x={0}
            y={-8}
            gap={12}
            size={24}
            grid={false}
          />
          <TireStatus service={service} x={0} y={24} />
        </g>
      );
    case 'fuel':
      return (
        <g>
          <Glyph Svg={GasPumpIcon} x={0} y={-30} size={26} className={light} />
          <text
            y={-1}
            fontSize={15}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-100 font-bold"
          >
            {fuelText(service.fuelLevel)}
            {service.fuelAdd !== undefined && (
              <tspan className="fill-slate-400">{` +${service.fuelAdd}`}</tspan>
            )}
          </text>
          <Label x={0} y={17} size={11} bold={false}>
            {lapsText(service.fuelLaps)}
          </Label>
          {service.fuelToFinish !== undefined && (
            <text
              y={36}
              fontSize={10}
              textAnchor="middle"
              dominantBaseline="middle"
              className={`${service.fuelToFinish > 0 ? 'fill-amber-400' : 'fill-green-500'} font-bold`}
            >
              {service.fuelToFinish > 0
                ? `finish +${service.fuelToFinish} L`
                : 'finish: enough'}
            </text>
          )}
        </g>
      );
    case 'generic':
      return (
        <Glyph Svg={PIE_ICONS[icon]} x={0} y={0} size={44} className={light} />
      );
    default:
      return <MainCenter service={service} />;
  }
};

const BLINK_MS = 1400;

/**
 * A tire that remembers the colour it showed. When the colour changes it
 * flashes between the old one and the new one and settles on the new one, so a replacement
 * going in and one being cancelled both read as a change of tire.
 */
const TransitionTire = ({
  x,
  y,
  size,
  color,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
}) => {
  const [shown, setShown] = useState({ from: color, to: color });
  if (shown.to !== color) setShown({ from: shown.to, to: color });
  const overlay = useRef<SVGGElement>(null);
  // Web Animations rather than SMIL: a SMIL animation counts from when the
  // whole svg appeared, so one added later would jump straight to its end.
  useEffect(() => {
    const el = overlay.current;
    if (!el || shown.from === shown.to) return;
    // Hard flashes between the old and the new colour, no fade in between,
    // ending on the new one.
    const blink = el.animate(
      [0, 1, 0, 1, 0, 1, 0, 1].map((opacity) => ({
        opacity,
        easing: 'step-end',
      })),
      { duration: BLINK_MS, fill: 'forwards' }
    );
    return () => blink.cancel();
  }, [shown.from, shown.to]);
  const icon = {
    x: x - size / 2,
    y: y - size / 2,
    size,
    weight: 'fill',
  } as const;
  return (
    <g>
      <TireIcon {...icon} color={shown.from} />
      {shown.from !== shown.to && (
        <g ref={overlay} opacity={0}>
          <TireIcon {...icon} color={shown.to} />
        </g>
      )}
    </g>
  );
};

/** The result of a pick, drawn inside the centre only. */
/** Laid over a result the sim did not take, e.g. outside the car. */
const NotApplied = () => (
  <g className="pointer-events-none">
    <circle r={INNER - 4} className="fill-slate-950/75" />
    <XCircleIcon
      x={-20}
      y={-34}
      size={40}
      weight="fill"
      className="text-red-500"
    />
    <text
      y={24}
      fontSize={12}
      textAnchor="middle"
      dominantBaseline="middle"
      className="fill-red-400 font-bold"
    >
      not applied
    </text>
  </g>
);

const ResultBody = ({
  feedback,
  service,
}: {
  feedback: NonNullable<PieState['feedback']>;
  service: PitServiceView;
}) => {
  const light = 'text-slate-200';
  if (feedback === 'tires') {
    const size = 40;
    const spots = [
      ['lf', -22, -20],
      ['rf', 22, -20],
      ['lr', -22, 16],
      ['rr', 22, 16],
    ] as const;
    return (
      <g>
        {spots.map(([corner, x, y]) => (
          <TransitionTire
            key={corner}
            x={x}
            y={y}
            size={size}
            color={tireColor(service, corner)}
          />
        ))}
        <TireStatus service={service} x={0} y={46} />
      </g>
    );
  }
  if (feedback === 'fuel') {
    const width = 92;
    const { fuelLevel, fuelPct, fuelAdd } = service;
    const capacity = fuelLevel && fuelPct ? fuelLevel / fuelPct : undefined;
    const added =
      capacity && fuelLevel !== undefined && fuelAdd
        ? Math.min(1, (fuelLevel + fuelAdd) / capacity)
        : 0;
    return (
      <g>
        <Glyph Svg={GasPumpIcon} x={0} y={-30} size={34} className={light} />
        <Label x={0} y={2} size={17}>
          {fuelAdd !== undefined ? `+${fuelAdd} L` : 'no refuel'}
        </Label>
        <Label x={0} y={22} size={10.5} bold={false}>
          {fuelText(fuelLevel)}
        </Label>
        <rect
          x={-width / 2}
          y={36}
          width={width}
          height={8}
          rx={4}
          className="fill-slate-700"
        />
        <rect
          x={-width / 2}
          y={36}
          width={added * width}
          height={8}
          rx={4}
          className="fill-slate-500 animate-pulse"
        />
        <rect
          x={-width / 2}
          y={36}
          width={(fuelPct ?? 0) * width}
          height={8}
          rx={4}
          className="fill-slate-200"
        />
      </g>
    );
  }
  const repair = feedback === 'repair';
  return (
    <g>
      <Glyph
        Svg={repair ? WrenchIcon : BroomIcon}
        x={0}
        y={-14}
        size={44}
        className={light}
      />
      {repair ? (
        <Tick x={0} y={30} size={30} on={service.repair} />
      ) : (
        <OnOff x={0} y={30} on={service.tearoff} />
      )}
    </g>
  );
};

export interface PieMenuViewProps {
  state: PieState;
  config: PieModelConfig;
  service: PitServiceView;
  /** A side that is highlighted: it pops out and shows light on dark. */
  highlight?: PieDirection;
  /** Settings editor: the side being edited, drawn highlighted. */
  selected?: PieDirection;
  /** Settings editor: makes the sides clickable and draws empty ones. */
  onSelect?: (direction: PieDirection) => void;
  /** Settings editor: the side the pointer is over. */
  onHighlight?: (direction: PieDirection | undefined) => void;
  /** The sim did not take the last pick. */
  unapplied?: boolean;
}

export const PieMenuView = memo(
  ({
    state,
    config,
    service,
    highlight,
    selected,
    onSelect,
    onHighlight,
    unapplied = false,
  }: PieMenuViewProps) => {
    const result = state.level === 'result' && state.feedback;
    // A result keeps drawing the menu it came from, so the ring fades out
    // instead of being swapped for another one.
    const ringState: PieState = result
      ? state.entry
        ? { level: 'sub', entry: state.entry }
        : { level: 'root' }
      : state;
    const items = getPieItems(ringState, config);
    const compact = ringState.level === 'root';
    // Back is drawn first so the other sides lie over it.
    const drawOrder = [...PIE_DIRECTIONS].sort(
      (a, b) =>
        Number(items[b]?.action === 'back') -
        Number(items[a]?.action === 'back')
    );
    // A new key replays the quick fade-in when another menu comes up.
    const ringKey =
      ringState.level === 'sub' ? `sub-${ringState.entry}` : 'root';
    const centerKey = pieCenter(state, config).kind;

    return (
      <svg viewBox="-150 -150 300 300" className="w-full h-full">
        <Appear key={ringKey} hidden={Boolean(result)}>
          {drawOrder.map((direction) => {
            const item = items[direction];
            if (!item && !onSelect) return null;
            const hot = highlight === direction || selected === direction;
            const [vx, vy] = VECTOR[direction];
            const a = ANGLE[direction];
            const isBack = item?.action === 'back';
            const [x, y] = polar(MID, a);
            return (
              <g
                key={direction}
                onClick={onSelect ? () => onSelect(direction) : undefined}
                onMouseEnter={
                  onHighlight ? () => onHighlight(direction) : undefined
                }
                onMouseLeave={
                  onHighlight ? () => onHighlight(undefined) : undefined
                }
                className={`transition-transform duration-150 ${onSelect ? 'cursor-pointer' : ''}`}
                style={{
                  transform: hot
                    ? `translate(${vx * (isBack ? 5 : POP)}px, ${vy * (isBack ? 5 : POP)}px)`
                    : undefined,
                }}
              >
                <path
                  d={arcPath(INNER, OUTER, a - HALF, a + HALF)}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  strokeDasharray={item ? undefined : '5 5'}
                  className={[
                    !item
                      ? 'fill-slate-950/40 stroke-slate-600'
                      : isBack
                        ? hot
                          ? 'fill-slate-700/70 stroke-slate-600'
                          : 'fill-slate-950/55 stroke-slate-700/50'
                        : hot
                          ? 'fill-slate-700/95 stroke-slate-500'
                          : 'fill-slate-950/90 stroke-slate-600/85',
                    onSelect && !hot ? 'hover:fill-slate-800/90' : '',
                  ].join(' ')}
                />
                {hot && item && !isBack && (
                  <path
                    d={arcPath(
                      OUTER + 3,
                      OUTER + 5.5,
                      a - HALF + 3,
                      a + HALF - 3
                    )}
                    className="fill-slate-200 pointer-events-none"
                  />
                )}
                {item &&
                  (isBack ? (
                    <g>
                      <Glyph
                        Svg={ListIcon}
                        x={x}
                        y={y - 6}
                        size={20}
                        className={hot ? 'text-slate-300' : 'text-slate-400'}
                      />
                      <text
                        x={x}
                        y={y + 12}
                        fontSize={9.5}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className={`${hot ? 'fill-slate-300' : 'fill-slate-400'} font-bold pointer-events-none`}
                      >
                        Menu
                      </text>
                    </g>
                  ) : (
                    <SectorBody
                      item={item}
                      service={service}
                      x={x}
                      y={y}
                      compact={compact}
                    />
                  ))}
              </g>
            );
          })}
        </Appear>
        <circle r={INNER} className="fill-slate-900/95" />
        <Appear key={result ? `result-${result}` : centerKey}>
          {result ? (
            <g>
              <ResultBody feedback={result} service={service} />
              {unapplied && <NotApplied />}
            </g>
          ) : (
            <CenterBody state={state} config={config} service={service} />
          )}
        </Appear>
      </svg>
    );
  }
);
PieMenuView.displayName = 'PieMenuView';
