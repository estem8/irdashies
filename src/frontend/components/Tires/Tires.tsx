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

const tempClass = (celsius: number, cold: number, hot: number) =>
  celsius < cold
    ? 'text-sky-300'
    : celsius > hot
      ? 'text-red-400'
      : 'text-emerald-300';

const wearClass = (percent: number) =>
  percent < 25
    ? 'bg-red-500'
    : percent < 50
      ? 'bg-amber-400'
      : 'bg-emerald-400';

/** Whole laps until the worst zone reaches the limit, if a rate is known. */
const lapsLeft = (tire: TireCornerSnapshot, limit: number) => {
  if (!tire.wearPerLap) return undefined;
  const laps = tire.wearPerLap
    .map((rate, i) => (rate > 0 ? (tire.wear[i] - limit) / rate : Infinity))
    .reduce((a, b) => Math.min(a, b), Infinity);
  return Number.isFinite(laps) ? Math.max(0, Math.floor(laps)) : undefined;
};

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
      <div className="flex flex-col gap-1 rounded-sm bg-slate-900/60 p-1.5">
        <div className="flex items-baseline justify-between text-xs font-semibold text-white/60">
          <span>{label}</span>
          {left !== undefined && (
            <span className="tabular-nums text-white/80">~{left} laps</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((zone) => {
            const celsius = tire?.temp[zone];
            const wear = tire?.wear[zone];
            return (
              <div key={zone} className="flex flex-col items-center gap-0.5">
                <div
                  className={`text-sm font-semibold tabular-nums ${
                    celsius === undefined
                      ? 'text-white/40'
                      : tempClass(celsius, cold, hot)
                  } ${staleTemps ? 'opacity-60' : ''}`}
                >
                  {celsius === undefined
                    ? '--'
                    : Math.round(fahrenheit ? (celsius * 9) / 5 + 32 : celsius)}
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full ${wear === undefined ? '' : wearClass(wear)}`}
                    style={{ width: `${wear ?? 0}%` }}
                  />
                </div>
                <div className="text-[0.7em] tabular-nums text-white/70">
                  {wear === undefined
                    ? '--'
                    : `${tire?.estimated ? '~' : ''}${Math.round(wear)}%`}
                </div>
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
      className="flex h-full w-full flex-col gap-1 rounded-sm bg-slate-800/(--bg-opacity) p-1"
      style={{
        ['--bg-opacity' as string]: `${settings.background.opacity}%`,
      }}
    >
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1">
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
        <div className="flex-none text-center text-[0.65em] text-white/50">
          {estimated
            ? 'Wear estimated, temps from last stop'
            : 'Values from last stop'}
        </div>
      )}
    </div>
  );
});
Tires.displayName = 'Tires';
