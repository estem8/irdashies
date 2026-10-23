import { memo } from 'react';
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
    temp: [92, 98, 95],
    wear: [88.4, 91.2, 89.9],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rf: {
    camber: -3.5,
    temp: [101, 106, 112],
    wear: [82.1, 85.5, 80.3],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  lr: {
    camber: -2.5,
    temp: [88, 90, 89],
    wear: [90.7, 92.0, 91.1],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rr: {
    camber: -2.5,
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

/** Drawing degrees of tilt per degree of camber. */
const CAMBER_TILT = 4;

const SHADING =
  'linear-gradient(to right, rgb(0 0 0 / 0.4), transparent 22%, rgb(255 255 255 / 0.12) 40%, transparent 55%, transparent 78%, rgb(0 0 0 / 0.4))';

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
    const colors = [0, 1, 2].map((zone) => {
      const celsius = tire?.temp[zone];
      return celsius === undefined
        ? 'rgb(100 116 139)'
        : tempColor(celsius, optimal, range);
    });
    // Negative camber leans the top toward the car, so the inner shoulder is
    // turned toward the viewer. Exaggerated, since a few degrees would not show.
    const tilt = (side === 'left' ? 1 : -1) * (tire?.camber ?? 0) * CAMBER_TILT;
    const treadGradient = `linear-gradient(to right, ${colors[0]} 10%, ${colors[1]} 50%, ${colors[2]} 90%)`;
    return (
      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="flex min-h-0 flex-1 justify-center">
          {/* Seen from above: a tall tread with softly rounded corners. The
              outer fifths are the shoulders, the middle 60% the centre. */}
          <div
            className="relative grid aspect-[7/10] h-full max-w-full grid-cols-[20%_60%_20%] divide-x divide-white/40 overflow-hidden rounded-[12%] shadow-[0_3px_8px_rgb(0_0_0/0.5)]"
            style={{
              backgroundImage: treadGradient,
              transform: `perspective(280px) rotateY(${tilt}deg)`,
            }}
          >
            {/* Darker shoulders and a highlight give the flat fill some roundness. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: SHADING }}
            />
            {[0, 1, 2].map((zone) => {
              const celsius = tire?.temp[zone];
              return (
                <div
                  key={zone}
                  className="relative flex items-center justify-center"
                >
                  <span
                    className={`font-black tabular-nums text-black/90 ${
                      zone === 1 ? 'text-base' : 'text-[0.6em]'
                    }`}
                  >
                    {celsius === undefined
                      ? '--'
                      : `${tire?.tempEstimated ? '~' : ''}${Math.round(
                          fahrenheit ? (celsius * 9) / 5 + 32 : celsius
                        )}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid flex-none grid-cols-3 gap-[4%] px-[7%]">
          {[0, 1, 2].map((zone) => {
            const wear = tire?.wear[zone];
            return (
              <div key={zone} className="flex flex-col items-center gap-0.5">
                <div className="h-1.5 w-full -skew-x-12 overflow-hidden bg-white/15">
                  <div
                    className="h-full"
                    style={{
                      width: `${wear ?? 0}%`,
                      backgroundColor:
                        wear === undefined ? undefined : wearColor(wear, limit),
                      boxShadow:
                        wear === undefined
                          ? undefined
                          : `0 0 6px ${wearColor(wear, limit)}`,
                    }}
                  />
                </div>
                <span className="text-[0.7em] font-bold tabular-nums leading-none text-white">
                  {wear === undefined
                    ? '--'
                    : `${tire?.estimated ? '~' : ''}${Math.round(wear)}%`}
                </span>
              </div>
            );
          })}
        </div>
        {left !== undefined && (
          <div className="flex-none text-center text-xs font-black italic tabular-nums text-amber-300">
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
