import { memo, useId } from 'react';
import {
  sessionBarSelectors,
  trackStateSelectors,
  useDashboard,
  useSessionBarSelector,
  useSessionVisibility,
  useTireSnapshot,
  useTrackStateSelector,
} from '@irdashies/context';
import type {
  TireCorner,
  TireCornerSnapshot,
  TireSlipSnapshot,
} from '@irdashies/types';
import { useTiresSettings } from './hooks/useTiresSettings';

const DEMO: Record<TireCorner, TireCornerSnapshot> = {
  lf: {
    camber: -3.5,
    toe: '-2.8 mm',
    toeDeg: -0.134,
    temp: [92, 98, 95],
    wear: [88.4, 91.2, 89.9],
    estimated: true,
    tempEstimated: true,
    pressure: 152.0,
    load: 0.9,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rf: {
    camber: -3.5,
    toe: '-2.8 mm',
    toeDeg: -0.134,
    temp: [101, 106, 112],
    wear: [82.1, 85.5, 80.3],
    estimated: true,
    tempEstimated: true,
    pressure: 153.0,
    load: 1.5,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  lr: {
    camber: -2.5,
    toe: '+0.1 mm',
    toeDeg: 0.01,
    temp: [88, 90, 89],
    wear: [90.7, 92.0, 91.1],
    estimated: true,
    tempEstimated: true,
    pressure: 148.0,
    load: 0.8,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rr: {
    camber: -2.5,
    toe: '+0.1 mm',
    toeDeg: 0.01,
    temp: [96, 99, 103],
    wear: [85.2, 87.8, 84.6],
    estimated: true,
    tempEstimated: true,
    pressure: 149.0,
    load: 1.3,
    wearPerLap: [0.4, 0.4, 0.4],
  },
};

/** Green at the optimum, fading to blue when colder and red when hotter. */
const tempColor = (celsius: number, optimal: number, range: number) => {
  const away = Math.min(1, Math.abs(celsius - optimal) / range);
  const hue = celsius < optimal ? 120 + 90 * away : 120 - 120 * away;
  return `hsl(${Math.round(hue)} 100% 50%)`;
};

/** White while there is plenty of tread, yellow as it runs down, red at the limit. */
const wearClass = (percent: number, limit: number) =>
  percent <= limit
    ? 'text-red-500'
    : percent <= limit + 20
      ? 'text-yellow-300'
      : 'text-white';

/** Whole laps until the worst zone reaches the limit, if a rate is known. */
const lapsLeft = (tire: TireCornerSnapshot, limit: number) => {
  if (!tire.wearPerLap) return undefined;
  const laps = tire.wearPerLap
    .map((rate, i) => (rate > 0 ? (tire.wear[i] - limit) / rate : Infinity))
    .reduce((a, b) => Math.min(a, b), Infinity);
  return Number.isFinite(laps) ? Math.max(0, Math.floor(laps)) : undefined;
};

/** Drawing degrees of lean per degree of camber; a few real degrees would not show. */
const CAMBER_TILT = 4;
/** Drawing degrees of turn per degree of toe; real toe is a fraction of a degree. */
const TOE_TURN = 25;
const MAX_TOE_TURN = 12;

// Tire seen from above, in viewBox units: dark sidewalls bulge out either side
// of the tread, which carries the temperature colours.
const VIEW_W = 100;
const VIEW_H = 140;
const TREAD_X = 9;
const TREAD_W = VIEW_W - 2 * TREAD_X;
const ZONE_CENTRES = [0.1, 0.5, 0.9];
const DIVIDERS = [0.2, 0.8];
/** Contact patch, as a share of the tread, and how far camber shifts it. */
const PATCH_W = 0.6;
const PATCH_H = 0.37;
const PATCH_SHIFT_PER_DEGREE = 0.04;
/** Load (1 = standing) that draws the smallest and the largest patch. */
const LOAD_MIN = 0.6;
const LOAD_MAX = 1.8;

interface SlipEvent {
  label: string;
  color: string;
  /** 0 to 1. */
  level: number;
}

/**
 * What to light up on one tire's contact patch: the strongest slip that
 * applies to it. Spin, lock and traction control act on the driven rear
 * wheels; ABS on all four; a slide on the axle that is letting go.
 */
const slipEvent = (
  slip: TireSlipSnapshot | undefined,
  corner: TireCorner
): SlipEvent | undefined => {
  if (!slip) return undefined;
  const rear = corner === 'lr' || corner === 'rr';
  const candidates: SlipEvent[] = [
    { label: 'ABS', color: '#ffb020', level: slip.abs ? 1 : 0 },
    ...(rear
      ? [
          { label: 'LOCK', color: '#ffb020', level: slip.lock },
          { label: 'SPIN', color: '#ff3b3b', level: slip.spin },
          { label: 'TC', color: '#d24bff', level: slip.tc },
          { label: 'SLIDE', color: '#3fd7ff', level: slip.over },
        ]
      : [{ label: 'SLIDE', color: '#3fd7ff', level: slip.under }]),
  ];
  const strongest = candidates.reduce((a, b) => (b.level > a.level ? b : a));
  return strongest.level > 0 ? strongest : undefined;
};

interface TireTopProps {
  side: 'left' | 'right';
  tire?: TireCornerSnapshot;
  colors: readonly string[];
  labels: readonly string[];
  event?: SlipEvent;
}

const TireTop = memo(({ side, tire, colors, labels, event }: TireTopProps) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const camber = tire?.camber ?? 0;
  // Negative camber leans the top inward and loads the inner shoulder, so the
  // patch moves toward the car: right on a left tire, left on a right one.
  const inward = side === 'left' ? 1 : -1;
  const shift = Math.max(
    -0.15,
    Math.min(0.15, -camber * PATCH_SHIFT_PER_DEGREE * inward)
  );
  // 0 when unloaded to 1 under the heaviest load; a middling patch if unknown.
  const load =
    tire?.load === undefined
      ? 0.5
      : Math.max(
          0,
          Math.min(1, (tire.load - LOAD_MIN) / (LOAD_MAX - LOAD_MIN))
        );
  const scale = 0.8 + 0.4 * load;
  const patchW = TREAD_W * PATCH_W * scale;
  const patchH = VIEW_H * PATCH_H * scale;
  const patchX = TREAD_X + TREAD_W * (0.5 + shift) - patchW / 2;
  const patchY = VIEW_H / 2 - patchH / 2;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sidewall${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#0c0d0f" />
          <stop offset="0.06" stopColor="#34363c" />
          <stop offset="0.12" stopColor="#141518" />
          <stop offset="0.88" stopColor="#141518" />
          <stop offset="0.94" stopColor="#34363c" />
          <stop offset="1" stopColor="#0c0d0f" />
        </linearGradient>
        <linearGradient id={`tread${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset={ZONE_CENTRES[0]} stopColor={colors[0]} />
          <stop offset={ZONE_CENTRES[1]} stopColor={colors[1]} />
          <stop offset={ZONE_CENTRES[2]} stopColor={colors[2]} />
        </linearGradient>
        {/* The tread curves away at both ends of the tire. */}
        <linearGradient id={`round${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgb(0 0 0 / 0.55)" />
          <stop offset="0.22" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="0.78" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="1" stopColor="rgb(0 0 0 / 0.55)" />
        </linearGradient>
        {/* Shoulders round off into the sidewalls; a soft highlight left of centre. */}
        <linearGradient id={`shoulder${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="rgb(0 0 0 / 0.45)" />
          <stop offset="0.12" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="0.35" stopColor="rgb(255 255 255 / 0.16)" />
          <stop offset="0.5" stopColor="rgb(255 255 255 / 0)" />
          <stop offset="0.88" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="1" stopColor="rgb(0 0 0 / 0.45)" />
        </linearGradient>
      </defs>

      <ellipse
        cx={VIEW_W / 2}
        cy={VIEW_H - 2}
        rx={VIEW_W * 0.46}
        ry={4}
        fill="rgb(0 0 0 / 0.45)"
      />
      <rect
        x={0}
        y={1}
        width={VIEW_W}
        height={VIEW_H - 2}
        rx={18}
        fill={`url(#sidewall${id})`}
      />
      <rect
        x={TREAD_X}
        y={3}
        width={TREAD_W}
        height={VIEW_H - 6}
        rx={13}
        fill={`url(#tread${id})`}
      />
      <rect
        x={TREAD_X}
        y={3}
        width={TREAD_W}
        height={VIEW_H - 6}
        rx={13}
        fill={`url(#shoulder${id})`}
      />
      <rect
        x={TREAD_X}
        y={3}
        width={TREAD_W}
        height={VIEW_H - 6}
        rx={13}
        fill={`url(#round${id})`}
      />

      {DIVIDERS.map((p) => (
        <line
          key={p}
          x1={TREAD_X + p * TREAD_W}
          x2={TREAD_X + p * TREAD_W}
          y1={5}
          y2={VIEW_H - 5}
          stroke="rgb(255 255 255 / 0.55)"
          strokeWidth={0.8}
        />
      ))}

      {/* Contact patch: where the tread meets the road. It lights up while
          the tire slides there (ABS, spin, lock, traction control). */}
      {event && (
        <rect
          x={patchX - 2}
          y={patchY - 2}
          width={patchW + 4}
          height={patchH + 4}
          rx={10}
          fill="none"
          stroke={event.color}
          strokeOpacity={0.35 + 0.4 * event.level}
          strokeWidth={4}
        />
      )}
      <rect
        x={patchX}
        y={patchY}
        width={patchW}
        height={patchH}
        rx={8}
        fill={event ? event.color : 'rgb(255 255 255)'}
        fillOpacity={event ? 0.3 + 0.5 * event.level : 0.05 + 0.4 * load}
        stroke={event ? event.color : 'rgb(255 255 255)'}
        strokeWidth={event ? 1.6 : 1.2}
        strokeOpacity={event ? 1 : 0.4 + 0.6 * load}
        strokeDasharray={event ? undefined : '4 3'}
      />
      {event && (
        <text
          x={patchX + patchW / 2}
          y={patchY + patchH - 4.5}
          textAnchor="middle"
          fontSize={9}
          fontWeight={900}
          fill="#fff"
          stroke="rgb(0 0 0 / 0.7)"
          strokeWidth={2}
          paintOrder="stroke"
        >
          {event.label}
        </text>
      )}

      {ZONE_CENTRES.map((q, zone) => (
        <text
          key={q}
          x={TREAD_X + q * TREAD_W}
          y={VIEW_H / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={zone === 1 ? 19 : 10.5}
          fontWeight={900}
          fill="rgb(0 0 0 / 0.88)"
        >
          {labels[zone]}
        </text>
      ))}
    </svg>
  );
});
TireTop.displayName = 'TireTop';

interface TireCardProps {
  /** Which side of the car the tire is on; camber leans toward the car. */
  side: 'left' | 'right';
  tire?: TireCornerSnapshot;
  fahrenheit: boolean;
  optimal: number;
  range: number;
  limit: number;
  event?: SlipEvent;
}

const TireCard = memo(
  ({ side, tire, fahrenheit, optimal, range, limit, event }: TireCardProps) => {
    const left = tire && lapsLeft(tire, limit);
    const pressure =
      tire?.pressure === undefined
        ? undefined
        : fahrenheit
          ? (tire.pressure * 0.145038).toFixed(1)
          : tire.pressure.toFixed(0);
    const pressureUnit = fahrenheit ? 'psi' : 'kPa';
    // Zones run left to right across the car (iRacing's L, M, R), the same
    // order on the screen for every tire.
    const colors = [0, 1, 2].map((zone) => {
      const celsius = tire?.temp[zone];
      return celsius === undefined
        ? 'rgb(100 116 139)'
        : tempColor(celsius, optimal, range);
    });
    const labels = [0, 1, 2].map((zone) => {
      const celsius = tire?.temp[zone];
      if (celsius === undefined) return '--';
      const value = Math.round(fahrenheit ? (celsius * 9) / 5 + 32 : celsius);
      return `${value}`;
    });
    // Negative camber leans the top toward the car, turning the inner
    // shoulder toward the viewer.
    const tilt =
      (side === 'left' ? 1 : -1) *
      Math.max(-20, Math.min(20, (tire?.camber ?? 0) * CAMBER_TILT));
    // Toe-in points the front of the tire (the top here) toward the car.
    const toeTurn =
      (side === 'left' ? 1 : -1) *
      Math.max(
        -MAX_TOE_TURN,
        Math.min(MAX_TOE_TURN, (tire?.toeDeg ?? 0) * TOE_TURN)
      );

    const pressureLabel = pressure !== undefined && (
      <div className="flex w-[2.6em] flex-none flex-col items-center leading-tight">
        <span className="text-[0.9em] font-bold tabular-nums text-white">
          {pressure}
        </span>
        <span className="text-center text-[0.55em] font-bold uppercase text-white/50">
          {pressureUnit}
          {tire?.pressureHot ? '' : ' cold'}
        </span>
      </div>
    );

    return (
      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="flex min-h-0 flex-1 items-center gap-1">
          {side === 'left' && pressureLabel}
          <div className="flex h-full min-h-0 min-w-0 flex-1 justify-center">
            <div
              className="aspect-[5/7] h-full max-w-full"
              style={{
                transform: `perspective(280px) rotateZ(${toeTurn}deg) rotateY(${tilt}deg)`,
              }}
            >
              <TireTop
                side={side}
                tire={tire}
                colors={colors}
                labels={labels}
                event={event}
              />
            </div>
          </div>
          {side === 'right' && pressureLabel}
        </div>

        <div className="grid flex-none grid-cols-3 gap-[4%] px-[9%]">
          {[0, 1, 2].map((zone) => {
            const wear = tire?.wear[zone];
            return (
              <span
                key={zone}
                className={`text-center text-[0.8em] font-bold tabular-nums leading-none ${
                  wear === undefined ? 'text-white' : wearClass(wear, limit)
                }`}
              >
                {wear === undefined ? '--' : `${Math.round(wear)}%`}
              </span>
            );
          })}
        </div>
        {left !== undefined && (
          <div className="flex-none text-center text-xs font-black italic tabular-nums text-amber-300">
            {left} LAPS
          </div>
        )}
      </div>
    );
  }
);
TireCard.displayName = 'TireCard';

export const Tires = memo(() => {
  const { isDemoMode } = useDashboard();
  const settings = useTiresSettings();
  const snapshot = useTireSnapshot();
  const displayUnits = useSessionBarSelector(sessionBarSelectors.displayUnits);
  const isOnTrack = useTrackStateSelector(trackStateSelectors.isOnTrack);
  const isSessionVisible = useSessionVisibility(settings.sessionVisibility);

  if (!isDemoMode) {
    if (settings.showOnlyWhenOnTrack && !isOnTrack) return null;
    if (!isSessionVisible) return null;
  }

  const fahrenheit =
    settings.units === 'auto'
      ? displayUnits === 0
      : settings.units === 'Imperial';
  const corners = isDemoMode ? DEMO : (snapshot?.corners ?? {});

  // iRacing refreshes its readings at a stop, so on track the temperatures
  // are the processor's estimate once it has one, otherwise the last stop's.
  const driving = Boolean(isOnTrack) && !isDemoMode;
  const tempEstimated = Object.values(corners).some((c) => c.tempEstimated);

  const card = (corner: TireCorner) => (
    <TireCard
      side={corner === 'lf' || corner === 'lr' ? 'left' : 'right'}
      tire={corners[corner]}
      fahrenheit={fahrenheit}
      optimal={settings.tempOptimal}
      range={settings.tempRange}
      limit={settings.wearLimit}
      event={slipEvent(isDemoMode ? undefined : snapshot?.slip, corner)}
    />
  );

  return (
    <div
      className="flex h-full w-full flex-col gap-2 rounded-2xl bg-[linear-gradient(180deg,rgb(0_0_0/var(--bg-opacity)),rgb(6_44_48/var(--bg-opacity)))] p-2 text-white"
      style={{
        ['--bg-opacity' as string]: `${settings.background.opacity}%`,
      }}
    >
      {/* Direction of travel is up: front tires on top, left tires on the left. */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-x-3 gap-y-3">
        {card('lf')}
        {card('rf')}
        {card('lr')}
        {card('rr')}
      </div>

      {driving && !tempEstimated && (
        <div className="flex-none text-center text-[0.65em] font-bold italic uppercase text-white/50">
          Temps from last stop
        </div>
      )}
    </div>
  );
});
Tires.displayName = 'Tires';
