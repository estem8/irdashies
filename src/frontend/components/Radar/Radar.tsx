import { useDashboard, useSessionVisibility } from '@irdashies/context';
import { RadarDisplay } from './components/RadarDisplay';
import { useRadar } from './hooks/useRadar';
import { useRadarFade } from './hooks/useRadarFade';
import { useRadarSettings } from './hooks/useRadarSettings';
import type { RadarBlip } from './radarBlips';

/**
 * A car metres ahead, one alongside on the left, one a lap up closing from
 * behind, and the pace car in the pits: between them the four colours and the
 * lettered label the display can produce.
 */
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
    isPaceCar: false,
    lapping: false,
    inPit: false,
    fade: 1,
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
    isPaceCar: false,
    lapping: true,
    inPit: false,
    fade: 1,
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
    isPaceCar: false,
    lapping: false,
    inPit: false,
    fade: 1,
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
    isPaceCar: true,
    lapping: false,
    inPit: true,
    fade: 0.4,
  },
];
/** Metres; the demo blips are laid out against a 5.8 km lap. */
const DEMO_TRACK_LENGTH_M = 5800;

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
    fadeBandM: settings.fadeInCars ? settings.fadeBandM : 0,
  });
  const { isDemoMode } = useDashboard();
  const sessionVisible = useSessionVisibility(settings.sessionVisibility);

  // The show range cannot reach further than the radar draws, or nothing would
  // ever be near enough to bring it on screen.
  const showRange = Math.min(settings.showRange, settings.radarRange);
  const trafficNear =
    state.nearestGapM !== null && state.nearestGapM <= showRange;
  const wanted =
    sessionVisible &&
    (!settings.showOnlyWhenOnTrack || state.isOnTrack) &&
    state.hasGeometry &&
    (!settings.showWhenNearby || trafficNear);
  // Demo mode ignores visibility rules so the widget can be seen while editing.
  const fade = useRadarFade(isDemoMode || wanted, settings.fadeSeconds);

  if (fade <= 0) return <></>;

  return (
    <div className="h-full w-full" style={{ opacity: fade }}>
      <RadarDisplay
        mode={settings.displayMode}
        blips={isDemoMode ? DEMO_BLIPS : state.blips}
        radarRange={settings.radarRange}
        nearbyRange={settings.nearbyRange}
        vehicleWidth={settings.vehicleWidth}
        vehicleLength={settings.vehicleLength}
        showCarNumbers={settings.showCarNumbers}
        pulseWhenCritical={settings.pulseWhenCritical}
        colorFar={settings.colorFar}
        colorNearby={settings.colorNearby}
        colorCritical={settings.colorCritical}
        colorPlayer={settings.colorPlayer}
        colorLapping={settings.colorLapping}
        colorInPit={settings.colorInPit}
        bgOpacity={settings.background.opacity}
        trackLengthM={isDemoMode ? DEMO_TRACK_LENGTH_M : state.trackLengthM}
      />
    </div>
  );
};
