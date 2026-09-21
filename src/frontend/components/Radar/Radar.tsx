import { useDashboard, useSessionVisibility } from '@irdashies/context';
import { RadarDisplay } from './components/RadarDisplay';
import { useRadar } from './hooks/useRadar';
import { useRadarSettings } from './hooks/useRadarSettings';
import type { RadarBlip } from './radarBlips';
import type { RadarOverlap } from './overlapSides';

/** A car metres ahead, one alongside on the left, one a lap down behind. */
const DEMO_BLIPS: RadarBlip[] = [
  { carIdx: 1, alongM: 12, lateralM: 0.3, relYaw: 0, color: 'sameLap' },
  { carIdx: 2, alongM: -1.4, lateralM: -1.9, relYaw: 0.05, color: 'lapsAhead' },
  { carIdx: 3, alongM: -9, lateralM: 2.4, relYaw: -0.1, color: 'lapsBehind' },
  { carIdx: 4, alongM: 6, lateralM: -3.4, relYaw: 0.2, color: 'inPit' },
];
const DEMO_OVERLAP: RadarOverlap = { left: 1, right: 0 };

export const Radar = () => {
  const settings = useRadarSettings();
  const state = useRadar({
    radarRange: settings.radarRange,
    hideInPit: settings.hideInPit,
    vehicleWidth: settings.vehicleWidth,
    vehicleLength: settings.vehicleLength,
  });
  const { isDemoMode } = useDashboard();
  const sessionVisible = useSessionVisibility(settings.sessionVisibility);

  if (!isDemoMode && !sessionVisible) return <></>;
  if (!isDemoMode && settings.showOnlyWhenOnTrack && !state.isOnTrack)
    return <></>;
  if (!isDemoMode && !state.hasGeometry) return <></>;

  return (
    <RadarDisplay
      blips={isDemoMode ? DEMO_BLIPS : state.blips}
      overlap={isDemoMode ? DEMO_OVERLAP : state.overlap}
      radarRange={settings.radarRange}
      vehicleWidth={settings.vehicleWidth}
      vehicleLength={settings.vehicleLength}
      showOverlapIndicator={settings.showOverlapIndicator}
      colorPlayer={settings.colorPlayer}
      colorSameLap={settings.colorSameLap}
      colorLapsAhead={settings.colorLapsAhead}
      colorLapsBehind={settings.colorLapsBehind}
      colorInPit={settings.colorInPit}
      colorNearby={settings.colorNearby}
      colorCritical={settings.colorCritical}
      bgOpacity={settings.background.opacity}
    />
  );
};
