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

const LAYOUT: readonly { corner: TireCorner; label: string }[] = [
  { corner: 'lf', label: 'LF' },
  { corner: 'rf', label: 'RF' },
  { corner: 'lr', label: 'LR' },
  { corner: 'rr', label: 'RR' },
];

const DEMO: Record<TireCorner, TireCornerSnapshot> = {
  lf: {
    temp: [92, 98, 95],
    wear: [88.4, 91.2, 89.9],
    estimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rf: {
    temp: [101, 106, 112],
    wear: [82.1, 85.5, 80.3],
    estimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  lr: {
    temp: [88, 90, 89],
    wear: [90.7, 92.0, 91.1],
    estimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
  rr: {
    temp: [96, 99, 103],
    wear: [85.2, 87.8, 84.6],
    estimated: true,
    wearPerLap: [0.4, 0.4, 0.4],
  },
};

/** Hue runs blue (cold) through green to red (hot), a little past each limit. */
const tempColor = (celsius: number, cold: number, hot: number) => {
  const margin = 15;
  const ratio = Math.min(
    1,
    Math.max(0, (celsius - (cold - margin)) / (hot + margin - (cold - margin)))
  );
  return `hsl(${Math.round(210 * (1 - ratio))} 70% 48%)`;
};

/** Green while there is plenty of tread, red at the limit and below. */
const wearColor = (percent: number, limit: number) => {
  const ratio = Math.min(1, Math.max(0, (percent - limit) / (100 - limit)));
  return `hsl(${Math.round(130 * ratio)} 65% 50%)`;
};

/** Whole laps until the worst zone reaches the limit, if a rate is known. */
const lapsLeft = (tire: TireCornerSnapshot, limit: number) => {
  if (!tire.wearPerLap) return undefined;
  const laps = tire.wearPerLap
    .map((rate, i) => (rate > 0 ? (tire.wear[i] - limit) / rate : Infinity))
    .reduce((a, b) => Math.min(a, b), Infinity);
  return Number.isFinite(laps) ? Math.max(0, Math.floor(laps)) : undefined;
};

// Tread grooves across each zone, drawn over its temperature colour.
const GROOVES =
  'repeating-linear-gradient(to bottom, transparent 0 7px, rgb(0 0 0 / 0.22) 7px 9px)';
// Soft highlight down the left of the tire, like the glass bezel it is styled on.
const GLOSS =
  'linear-gradient(100deg, rgb(255 255 255 / 0.28), transparent 45%, rgb(0 0 0 / 0.18))';

interface TireCardProps {
  label: string;
  tire?: TireCornerSnapshot;
  fahrenheit: boolean;
  cold: number;
  hot: number;
  limit: number;
  staleTemps: boolean;
}

const TireCard = memo(
  ({
    label,
    tire,
    fahrenheit,
    cold,
    hot,
    limit,
    staleTemps,
  }: TireCardProps) => {
    const left = tire && lapsLeft(tire, limit);
    return (
      <div className="flex min-h-0 flex-col gap-1.5 rounded-2xl bg-linear-to-b from-white/12 to-white/4 p-2 ring-1 ring-white/15">
        <div className="flex flex-none items-baseline justify-between">
          <span className="text-base font-extrabold leading-none text-slate-300/70">
            {label}
          </span>
          {left !== undefined && (
            <span className="text-xs font-bold tabular-nums text-white/90">
              ~{left} laps
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-1 justify-center">
          <div className="flex aspect-[3/4] h-full max-w-full gap-[3%] rounded-[22%] bg-linear-to-b from-slate-600 to-slate-800 p-[7%] shadow-[inset_0_0_0_2px_rgb(255_255_255/0.12),0_2px_6px_rgb(0_0_0/0.4)]">
            {[0, 1, 2].map((zone) => {
              const celsius = tire?.temp[zone];
              return (
                <div
                  key={zone}
                  className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-lg ${
                    staleTemps ? 'opacity-60' : ''
                  }`}
                  style={{
                    backgroundColor:
                      celsius === undefined
                        ? 'rgb(100 116 139 / 0.5)'
                        : tempColor(celsius, cold, hot),
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{ backgroundImage: `${GROOVES}, ${GLOSS}` }}
                  />
                  <span className="relative text-sm font-extrabold tabular-nums text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                    {celsius === undefined
                      ? '--'
                      : Math.round(
                          fahrenheit ? (celsius * 9) / 5 + 32 : celsius
                        )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid flex-none grid-cols-3 gap-[3%] px-[7%]">
          {[0, 1, 2].map((zone) => {
            const wear = tire?.wear[zone];
            return (
              <div key={zone} className="flex flex-col items-center gap-0.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${wear ?? 0}%`,
                      backgroundColor:
                        wear === undefined ? undefined : wearColor(wear, limit),
                    }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums leading-none text-slate-200">
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

  // iRacing freezes tire values while the car is driving and refreshes them
  // when it stops, so on track they describe the last stop, not the tires now.
  const stale = Boolean(isOnTrack) && !isDemoMode;
  const estimated = Object.values(corners).some((c) => c.estimated);

  return (
    <div
      className="flex h-full w-full flex-col gap-1.5 rounded-2xl bg-slate-800/(--bg-opacity) p-1.5"
      style={{
        ['--bg-opacity' as string]: `${settings.background.opacity}%`,
      }}
    >
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5">
        {LAYOUT.map(({ corner, label }) => (
          <TireCard
            key={corner}
            label={label}
            tire={corners[corner]}
            fahrenheit={fahrenheit}
            cold={settings.tempCold}
            hot={settings.tempHot}
            limit={settings.wearLimit}
            staleTemps={stale}
          />
        ))}
      </div>
      {stale && (
        <div className="flex-none text-center text-[0.65em] font-semibold text-slate-300/60">
          {estimated
            ? 'Wear estimated, temps from last stop'
            : 'Values from last stop'}
        </div>
      )}
    </div>
  );
});
Tires.displayName = 'Tires';
