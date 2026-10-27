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
import type { TireCorner } from '@irdashies/types';
import { TireCard } from './components/TireCard';
import { DEMO } from './demo';
import { useTiresSettings } from './hooks/useTiresSettings';
import { slipEvent } from './slipEvent';

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
  const pressureUnit =
    settings.pressureUnits === 'auto'
      ? fahrenheit
        ? 'psi'
        : 'kPa'
      : settings.pressureUnits;
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
      pressureUnit={pressureUnit}
      optimal={settings.tempOptimal}
      range={settings.tempRange}
      overheat={settings.tempOverheat}
      tempMode={settings.tempMode}
      wearMode={settings.wearMode}
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
