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
import type { TireCorner, TireCornerSnapshot } from '@irdashies/types';
import { useTiresSettings } from './hooks/useTiresSettings';

const DEMO: Record<TireCorner, TireCornerSnapshot> = {
  lf: {
    camber: -3.5,
    toe: '-2.8 mm',
    temp: [92, 98, 95],
    wear: [88.4, 91.2, 89.9],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rf: {
    camber: -3.5,
    toe: '-2.8 mm',
    temp: [101, 106, 112],
    wear: [82.1, 85.5, 80.3],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  lr: {
    camber: -2.5,
    toe: '+0.1 mm',
    temp: [88, 90, 89],
    wear: [90.7, 92.0, 91.1],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rr: {
    camber: -2.5,
    toe: '+0.1 mm',
    temp: [96, 99, 103],
    wear: [85.2, 87.8, 84.6],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
};

/** Green at the optimum, fading to blue when colder and red when hotter. */
const tempColor = (celsius: number, optimal: number, range: number) => {
  const away = Math.min(1, Math.abs(celsius - optimal) / range);
  const hue = celsius < optimal ? 120 + 90 * away : 120 - 120 * away;
  return `hsl(${Math.round(hue)} 100% 50%)`;
};

/** Green while there is plenty of tread, red at the limit and below. */
const wearColor = (percent: number, limit: number) => {
  const ratio = Math.min(1, Math.max(0, (percent - limit) / (100 - limit)));
  return `hsl(${Math.round(130 * ratio)} 100% 50%)`;
};

/** Whole laps until the worst zone reaches the limit, if a rate is known. */
const lapsLeft = (tire: TireCornerSnapshot, limit: number) => {
  if (!tire.wearPerLap) return undefined;
  const laps = tire.wearPerLap
    .map((rate, i) => (rate > 0 ? (tire.wear[i] - limit) / rate : Infinity))
    .reduce((a, b) => Math.min(a, b), Infinity);
  return Number.isFinite(laps) ? Math.max(0, Math.floor(laps)) : undefined;
};

/** Camber as an alignment sheet prints it, e.g. -4.2 -> -4°12'. */
const degreesMinutes = (degrees: number) => {
  const sign = degrees < 0 ? '-' : '';
  const total = Math.round(Math.abs(degrees) * 60);
  const minutes = String(total % 60).padStart(2, '0');
  return `${sign}${Math.floor(total / 60)}°${minutes}'`;
};

/** Drawing degrees of lean per degree of camber; a few real degrees would not show. */
const CAMBER_TILT = 2.5;

// Wheel geometry, in viewBox units, drawn for a left wheel seen from the front
// and a little to the outside: the outboard sidewall (with the rim) is an
// ellipse on the left, the tread runs from it toward the car. Right wheels are
// the mirror image.
const VIEW = 116;
const CY = 60;
const R = 47;
const W = 60;
const RX = 17;
const XO = 24;
const PIVOT_Y = CY + R;
const ZONES = [0.1, 0.5, 0.9];
const DIVIDERS = [0.2, 0.8];

interface WheelProps {
  side: 'left' | 'right';
  tire?: TireCornerSnapshot;
  colors: readonly string[];
  labels: readonly string[];
}

const Wheel = memo(({ side, tire, colors, labels }: WheelProps) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const x = (v: number) => (side === 'left' ? v : VIEW - v);
  const sweep = side === 'left' ? 1 : 0;
  // Negative camber leans the top toward the car.
  const lean = -(tire?.camber ?? 0) * CAMBER_TILT * (side === 'left' ? 1 : -1);
  const pivotX = x(XO + RX + W / 2);
  const treadFrom = x(XO + RX);
  const treadTo = x(XO + RX + W);

  // The tread: between the outboard sidewall and the inner edge, both curved
  // like the sidewall so the band reads as part of a cylinder.
  const tread = `M ${x(XO)} ${CY - R} L ${x(XO + W)} ${CY - R} A ${RX} ${R} 0 0 ${sweep} ${x(XO + W)} ${CY + R} L ${x(XO)} ${CY + R} Z`;
  const spokes = [0, 72, 144, 216, 288].map((deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [x(XO + RX * 0.62 * Math.cos(a)), CY + R * 0.62 * Math.sin(a)];
  });
  const arcRadius = 2 * R + 4;
  const arcEnd = (lean * Math.PI) / 180;

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`tread${id}`}
          gradientUnits="userSpaceOnUse"
          x1={Math.min(treadFrom, treadTo)}
          x2={Math.max(treadFrom, treadTo)}
          y1="0"
          y2="0"
        >
          <stop offset="0.1" stopColor={colors[0]} />
          <stop offset="0.5" stopColor={colors[1]} />
          <stop offset="0.9" stopColor={colors[2]} />
        </linearGradient>
        <linearGradient id={`round${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgb(0 0 0 / 0.45)" />
          <stop offset="0.3" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="0.45" stopColor="rgb(255 255 255 / 0.18)" />
          <stop offset="0.6" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="1" stopColor="rgb(0 0 0 / 0.5)" />
        </linearGradient>
        <radialGradient id={`rubber${id}`} cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#3a3c42" />
          <stop offset="1" stopColor="#0d0e10" />
        </radialGradient>
        <linearGradient id={`rim${id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#eef1f4" />
          <stop offset="1" stopColor="#7c838c" />
        </linearGradient>
      </defs>

      <g transform={`rotate(${lean} ${pivotX} ${PIVOT_Y})`}>
        <path d={tread} fill={`url(#tread${id})`} />
        <path d={tread} fill={`url(#round${id})`} />
        {DIVIDERS.map((p) => (
          <path
            key={p}
            d={`M ${x(XO + p * W)} ${CY - R} A ${RX} ${R} 0 0 ${sweep} ${x(XO + p * W)} ${CY + R}`}
            fill="none"
            stroke="rgb(255 255 255 / 0.6)"
            strokeWidth="0.8"
          />
        ))}
        {ZONES.map((q, zone) => (
          <text
            key={q}
            x={x(XO + RX + q * W)}
            y={CY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={zone === 1 ? 14 : 8.5}
            fontWeight={900}
            fill="rgb(0 0 0 / 0.85)"
          >
            {/* Mirrored, the first zone position is the car's right edge. */}
            {labels[side === 'left' ? zone : 2 - zone]}
          </text>
        ))}

        {/* Outboard sidewall with the rim. */}
        <ellipse cx={x(XO)} cy={CY} rx={RX} ry={R} fill={`url(#rubber${id})`} />
        <ellipse
          cx={x(XO)}
          cy={CY}
          rx={RX * 0.72}
          ry={R * 0.72}
          fill={`url(#rim${id})`}
          stroke="#2b2e33"
          strokeWidth="0.8"
        />
        {spokes.map(([sx, sy], i) => (
          <line
            key={i}
            x1={x(XO)}
            y1={CY}
            x2={sx}
            y2={sy}
            stroke="#3b4048"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ))}
        <ellipse
          cx={x(XO)}
          cy={CY}
          rx={RX * 0.18}
          ry={R * 0.16}
          fill="#1b1d21"
        />
      </g>
      {/* Camber: a short upright reference above the wheel and a red arc
          from it out to the wheel's lean. */}
      {Math.abs(lean) > 0.5 && (
        <g fill="none" strokeLinecap="round">
          <line
            x1={pivotX}
            y1={PIVOT_Y - arcRadius - 5}
            x2={pivotX}
            y2={PIVOT_Y - arcRadius + 7}
            stroke="rgb(255 255 255 / 0.8)"
            strokeWidth="1.2"
          />
          <path
            d={`M ${pivotX} ${PIVOT_Y - arcRadius} A ${arcRadius} ${arcRadius} 0 0 ${lean > 0 ? 1 : 0} ${pivotX + arcRadius * Math.sin(arcEnd)} ${PIVOT_Y - arcRadius * Math.cos(arcEnd)}`}
            stroke="#ef2b2b"
            strokeWidth="3"
          />
        </g>
      )}
    </svg>
  );
});
Wheel.displayName = 'Wheel';

interface TireCardProps {
  /** Which side of the car the tire is on; camber leans toward the car. */
  side: 'left' | 'right';
  tire?: TireCornerSnapshot;
  fahrenheit: boolean;
  optimal: number;
  range: number;
  limit: number;
}

const TireCard = memo(
  ({ side, tire, fahrenheit, optimal, range, limit }: TireCardProps) => {
    const left = tire && lapsLeft(tire, limit);
    // Zones run left to right across the car (iRacing's L, M, R), which on
    // the screen is the same order for every wheel.
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
      // The estimate mark only on the centre: the shoulders are too narrow.
      return `${tire?.tempEstimated && zone === 1 ? '~' : ''}${value}`;
    });
    return (
      <div className="relative flex min-h-0 flex-col gap-1">
        <div
          className={`absolute top-0 z-10 flex flex-col text-[0.7em] font-black leading-tight tabular-nums text-[#3cf03c] [text-shadow:0_1px_2px_rgb(0_0_0/0.7)] ${
            side === 'left' ? 'left-0 items-start' : 'right-0 items-end'
          }`}
        >
          {tire?.camber !== undefined && (
            <span>{degreesMinutes(tire.camber)}</span>
          )}
          {tire?.toe !== undefined && <span>{tire.toe}</span>}
        </div>

        <div className="min-h-0 flex-1">
          <Wheel side={side} tire={tire} colors={colors} labels={labels} />
        </div>

        <div className="grid flex-none grid-cols-3 gap-1 px-[12%]">
          {[0, 1, 2].map((zone) => {
            const wear = tire?.wear[zone];
            return (
              <div key={zone} className="flex flex-col items-center gap-0.5">
                <div className="h-1 w-full overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${wear ?? 0}%`,
                      backgroundColor:
                        wear === undefined ? undefined : wearColor(wear, limit),
                    }}
                  />
                </div>
                <span className="text-[0.65em] font-bold tabular-nums leading-none text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                  {wear === undefined
                    ? '--'
                    : `${tire?.estimated ? '~' : ''}${Math.round(wear)}%`}
                </span>
              </div>
            );
          })}
        </div>
        {left !== undefined && (
          <div className="flex-none text-center text-[0.7em] font-black tabular-nums text-[#3cf03c] [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]">
            ~{left} LAPS
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
    />
  );

  return (
    <div
      className="flex h-full w-full flex-col gap-2 rounded-xl bg-[linear-gradient(180deg,rgb(150_155_161/var(--bg-opacity)),rgb(108_113_119/var(--bg-opacity)))] p-2 text-white"
      style={{
        ['--bg-opacity' as string]: `${settings.background.opacity}%`,
      }}
    >
      {/* Direction of travel is up: front tires on top, left tires on the left. */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-x-3 gap-y-2">
        {card('lf')}
        {card('rf')}
        {card('lr')}
        {card('rr')}
      </div>

      {driving && !tempEstimated && (
        <div className="flex-none text-center text-[0.65em] font-bold uppercase text-white/70">
          Temps from last stop
        </div>
      )}
    </div>
  );
});
Tires.displayName = 'Tires';
