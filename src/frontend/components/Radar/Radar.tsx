import { useDashboard, useSessionVisibility } from '@irdashies/context';
import { RadarDisplay } from './components/RadarDisplay';
import { useRadar } from './hooks/useRadar';
import { useRadarSettings } from './hooks/useRadarSettings';
import type { RadarBlip } from './radarBlips';
import type { RadarOverlap } from './overlapSides';

/** A car metres ahead, one alongside on the left, one a lap down behind. */
const DEMO_BLIPS: RadarBlip[] = [
  {
    carIdx: 1,
    alongM: 12,
    lateralM: 0.3,
    relYaw: 0,
    gapM: 12,
    level: 'far',
    side: null,
    carNumber: '24',
    inPit: false,
  },
  {
    carIdx: 2,
    alongM: -3.2,
    lateralM: -1.9,
    relYaw: 0.05,
    gapM: 3.2,
    level: 'nearby',
    side: null,
    carNumber: '7',
    inPit: false,
  },
  {
    carIdx: 3,
    alongM: -0.8,
    lateralM: -2.1,
    relYaw: 0,
    gapM: 0.8,
    level: 'critical',
    side: -1,
    carNumber: '51',
    inPit: false,
  },
  {
    carIdx: 4,
    alongM: 6,
    lateralM: 3.4,
    relYaw: 0.2,
    gapM: 6,
    level: 'nearby',
    side: null,
    carNumber: '9',
    inPit: true,
  },
];
const DEMO_OVERLAP: RadarOverlap = { left: 1, right: 0 };

export const Radar = () => {
  const settings = useRadarSettings();
  const state = useRadar({
    radarRange: settings.radarRange,
    hideInPit: settings.hideInPit,
    vehicleWidth: settings.vehicleWidth,
    vehicleLength: settings.vehicleLength,
    nearbyRange: settings.nearbyRange,
    clearRange: settings.clearRange,
    criticalRange: settings.criticalRange,
  });
  const { isDemoMode } = useDashboard();
  const sessionVisible = useSessionVisibility(settings.sessionVisibility);

  if (!isDemoMode && !sessionVisible) return <></>;
  if (!isDemoMode && settings.showOnlyWhenOnTrack && !state.isOnTrack)
    return <></>;
  if (!isDemoMode && !state.hasGeometry) return <></>;

  return (
    <RadarDisplay
      mode={settings.displayMode}
      blips={isDemoMode ? DEMO_BLIPS : state.blips}
      overlap={isDemoMode ? DEMO_OVERLAP : state.overlap}
      radarRange={settings.radarRange}
      nearbyRange={settings.nearbyRange}
      vehicleWidth={settings.vehicleWidth}
      vehicleLength={settings.vehicleLength}
      showCarNumbers={settings.showCarNumbers}
      pulseWhenCritical={settings.pulseWhenCritical}
      showOverlapIndicator={settings.showOverlapIndicator}
      colorFar={settings.colorFar}
      colorNearby={settings.colorNearby}
      colorCritical={settings.colorCritical}
      colorPlayer={settings.colorPlayer}
      colorInPit={settings.colorInPit}
      bgOpacity={settings.background.opacity}
    />
  );
};
