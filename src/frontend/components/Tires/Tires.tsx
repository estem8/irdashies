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
    temp: [92, 98, 95],
    wear: [88.4, 91.2, 89.9],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rf: {
    temp: [101, 106, 112],
    wear: [82.1, 85.5, 80.3],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  lr: {
    temp: [88, 90, 89],
    wear: [90.7, 92.0, 91.1],
    estimated: true,
    tempEstimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rr: {
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

// Cell gaps across each tread lane, so a lane reads as the ribbed lug blocks
// of a tire rather than a flat bar.
const CELLS =
  'repeating-linear-gradient(to bottom, transparent 0 8px, rgb(0 0 0 / 0.85) 8px 10px)';

const COLD_TO_HOT =
  'linear-gradient(to right, hsl(210 100% 50%), hsl(120 100% 50%), hsl(0 100% 50%))';

interface TireCardProps {
  label: string;
  tire?: TireCornerSnapshot;
  fahrenheit: boolean;
  optimal: number;
  range: number;
  limit: number;
}

const TireCard = memo(
  ({ label, tire, fahrenheit, optimal, range, limit }: TireCardProps) => {
    const left = tire && lapsLeft(tire, limit);
    return (
      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="flex flex-none items-center justify-between gap-1">
          <span className="-skew-x-12 bg-white px-2 text-sm font-black italic leading-5 text-black">
            {label}
          </span>
          {left !== undefined && (
            <span className="text-xs font-black italic tabular-nums text-amber-300">
              ~{left} LAPS
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-1 justify-center">
          <div className="flex aspect-[3/4] h-full max-w-full gap-[4%] rounded-[24%] bg-black p-[7%] shadow-[0_0_0_2px_rgb(245_158_11/0.85),0_0_12px_rgb(245_158_11/0.55),inset_0_0_8px_rgb(245_158_11/0.45)]">
            {[0, 1, 2].map((zone) => {
              const celsius = tire?.temp[zone];
              const color =
                celsius === undefined
                  ? 'rgb(100 116 139)'
                  : tempColor(celsius, optimal, range);
              return (
                <div
                  key={zone}
                  className="relative flex flex-1 items-center justify-center overflow-hidden rounded-md"
                  style={{
                    backgroundColor: color,
                    boxShadow: `0 0 8px ${color}`,
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{ backgroundImage: CELLS }}
                  />
                  <span className="relative -rotate-90 text-sm font-black tabular-nums text-black/90">
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

  const card = (corner: TireCorner, label: string) => (
    <TireCard
      label={label}
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
      <div className="flex flex-none items-center justify-between">
        <span className="text-base font-black italic uppercase tracking-wider">
          Tires
        </span>
        <div className="flex items-center gap-1 text-[0.65em] font-bold">
          <span>COLD</span>
          <div
            className="h-1.5 w-16"
            style={{ backgroundImage: COLD_TO_HOT }}
          />
          <span>HOT</span>
        </div>
      </div>

      {/* Direction of travel is up: front tires on top, left tires on the left. */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-x-3 gap-y-3">
        {card('lf', 'LF')}
        {card('rf', 'RF')}
        {card('lr', 'LR')}
        {card('rr', 'RR')}
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
