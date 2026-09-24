import { useRef } from 'react';
import { useDashboard, useSessionVisibility } from '@irdashies/context';
import { RadarDisplay } from './components/RadarDisplay';
import { useRadar } from './hooks/useRadar';
import { useRadarFade } from './hooks/useRadarFade';
import { useRadarSettings } from './hooks/useRadarSettings';
import { RADAR_SHOW_RANGE_MARGIN_M } from './radarFade';
import type { RadarBlip } from './radarBlips';

/**
 * A car metres ahead, one alongside on the left, a car level with us, and
 * a car fading in: between them the lettered label, fade band and rim
 * signals the display can produce.
 */
const DEMO_BLIPS: RadarBlip[] = [
  {
    carIdx: 1,
    alongM: 12,
    lateralM: 0.3,
    relYaw: 0,
    gapM: 12,
    side: null,
    rimSignal: null,
    carNumber: '24',
    isPaceCar: false,
    fade: 1,
  },
  {
    carIdx: 2,
    alongM: -3.2,
    lateralM: -1.9,
    relYaw: 0.05,
    gapM: 3.2,
    side: null,
    rimSignal: 'left',
    carNumber: '7',
    isPaceCar: false,
    fade: 1,
  },
  {
    carIdx: 3,
    alongM: -0.8,
    lateralM: -2.1,
    relYaw: 0,
    gapM: 0.8,
    side: -1,
    rimSignal: 'left',
    carNumber: '51',
    isPaceCar: false,
    fade: 1,
  },
  {
    carIdx: 5,
    alongM: 0.4,
    lateralM: 0,
    relYaw: 0,
    gapM: 0.4,
    side: null,
    rimSignal: 'both',
    carNumber: '31',
    isPaceCar: false,
    fade: 1,
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
    fadeBandM: settings.fadeInCars ? settings.fadeBandM : 0,
  });
  const { isDemoMode } = useDashboard();
  const sessionVisible = useSessionVisibility(settings.sessionVisibility);

  // Equality with the radar range is useless here: the car at the clipping
  // boundary cannot bring on a panel that only appears once it is visible.
  const showRange = Math.min(
    settings.showRange,
    settings.radarRange - RADAR_SHOW_RANGE_MARGIN_M
  );

  // The gate is hysteretic: `nearestGapM` jitters by fractions of a metre
  // around whatever boundary it sits on, so a plain `<= showRange` test would
  // flip the panel on and off every few frames. A car brings the panel on
  // screen inside the range and only loses it once it is past the range plus a
  // margin, so the boundary itself has a dead band no jitter can span.
  // The hold lives in a ref rather than the memoised state: it is a latch on
  // an observed gap, not a value the render derives.
  const gateShownRef = useRef(false);
  // The gate only applies while everything else already wants the panel; when
  // it does not, the latch resets so a later session starts clean.
  const gateApplies =
    !isDemoMode &&
    sessionVisible &&
    state.hasGeometry &&
    (!settings.showOnlyWhenOnTrack || state.isOnTrack) &&
    settings.showWhenNearby;
  if (gateApplies) {
    const gap = state.nearestGapM;
    if (gateShownRef.current) {
      if (gap === null || gap > showRange + Math.max(1, showRange * 0.1)) {
        gateShownRef.current = false;
      }
    } else if (gap !== null && gap <= showRange) {
      gateShownRef.current = true;
    }
  } else {
    gateShownRef.current = false;
  }

  const wanted =
    sessionVisible &&
    (!settings.showOnlyWhenOnTrack || state.isOnTrack) &&
    state.hasGeometry &&
    (!settings.showWhenNearby || gateShownRef.current);
  // Demo mode ignores visibility rules so the widget can be seen while editing.
  const fade = useRadarFade(isDemoMode || wanted, settings.fadeSeconds);

  if (fade <= 0) return <></>;

  return (
    <div className="h-full w-full" style={{ opacity: fade }}>
      <RadarDisplay
        blips={isDemoMode ? DEMO_BLIPS : state.blips}
        radarRange={settings.radarRange}
        vehicleWidth={settings.vehicleWidth}
        vehicleLength={settings.vehicleLength}
        showCarNumbers={settings.showCarNumbers}
        colorRival={settings.colorRival}
        closingWarningColor={settings.closingWarningColor ?? '#ef4444'}
        closingSpeedThreshold={settings.closingSpeedThreshold ?? 5}
        colorAlongside={settings.colorAlongside}
        colorPlayer={settings.colorPlayer}
        bgOpacity={settings.background.opacity}
        trackLengthM={isDemoMode ? DEMO_TRACK_LENGTH_M : state.trackLengthM}
        showMap={settings.showTrackMap}
        mapPath={state.mapPath}
        mapPointCount={state.mapPointCount}
        mapWindowM={state.mapWindowM}
        mapBorderColor={settings.mapBorderColor}
        mapBorderOpacity={settings.mapBorderOpacity}
        mapFillColor={settings.mapFillColor}
        mapFillOpacity={settings.mapFillOpacity}
        // Use the author's original SVG geometry as the map layer. The
        // display applies the corrected camera transform and clips it to the
        // radar viewport; trackPathPoints remains the source for car positions.
        mapTrackPath={state.mapTrackPath}
        mapPlayerX={state.mapPlayerX}
        mapPlayerY={state.mapPlayerY}
        mapForwardX={state.mapForwardX}
        mapForwardY={state.mapForwardY}
        mapRightX={state.mapRightX}
        mapRightY={state.mapRightY}
        mapUnitsPerMetre={state.mapUnitsPerMetre}
      />
    </div>
  );
};
