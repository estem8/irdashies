import { useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import type { RadarSnapshot } from '@irdashies/types';
import {
  useBlindSpotSelector,
  useDriverCarIdx,
  useRadarSelector,
  useSessionDrivers,
  useSessionStore,
  useTrackLength,
} from '@irdashies/context';
import tracks from '../../../assets/data/tracks.json';
import { shouldShowTrack } from '../../../assets/data/brokenTracks';
import type { TrackDrawing } from '@irdashies/domain/trackGeometry';
import {
  computeRadarBlips,
  type RadarBlip,
  type RadarTargetState,
} from '../radarBlips';
import {
  NO_OVERLAP,
  overlapFromCarLeftRight,
  type RadarOverlap,
} from '../overlapSides';

export interface RadarState {
  /** Centreline is usable; false hides the widget, as the track map does. */
  hasGeometry: boolean;
  blips: readonly RadarBlip[];
  overlap: RadarOverlap;
  isOnTrack: boolean;
  /**
   * Shortest fore/aft gap to any car being drawn, in metres; null when the
   * radar is drawing none. Cars hidden by `hideInPit` do not count, so a car
   * in the pits cannot bring the radar on screen.
   */
  nearestGapM: number | null;
}

export interface UseRadarOptions {
  radarRange: number;
  /** Car size in metres; the SDK reports none, so the config supplies it. */
  vehicleWidth: number;
  vehicleLength: number;
  hideInPit: boolean;
  nearbyRange: number;
  clearRange: number;
  criticalRange: number;
  /** Metres of fade at the outer edge of the range; 0 for none. */
  fadeBandM: number;
}

type RadarInput = readonly [
  number | null,
  readonly number[],
  readonly boolean[],
  boolean,
];

const EMPTY_INPUT: RadarInput = [null, [], [], false];
const EMPTY_TARGETS: ReadonlyMap<number, RadarTargetState> = new Map();
const EMPTY_NUMBERS: ReadonlyMap<number, string> = new Map();

const selectRadarInput = (snapshot: RadarSnapshot): RadarInput => [
  snapshot.focusCarIdx,
  snapshot.carIdxLapDistPct,
  snapshot.carIdxOnPitRoad,
  snapshot.isOnTrack,
];

const radarInputEqual = (previous: RadarInput, next: RadarInput): boolean =>
  previous[0] === next[0] &&
  previous[3] === next[3] &&
  shallow(previous[1], next[1]) &&
  shallow(previous[2], next[2]);

const trackDrawings = tracks as unknown as Record<
  number,
  TrackDrawing | undefined
>;

/**
 * Radar state from the two channels the widget declares: per-car positions
 * (radar.snapshot) and the sim's own overlap verdict (blind-spot.snapshot).
 * Car numbers come from the session, since the position channel carries none.
 */
export const useRadar = (options: UseRadarOptions): RadarState => {
  const {
    radarRange,
    hideInPit,
    vehicleWidth,
    vehicleLength,
    nearbyRange,
    clearRange,
    criticalRange,
    fadeBandM,
  } = options;
  const [focusCarIdx, positions, onPitRoad, isOnTrack] =
    useRadarSelector(selectRadarInput, { equality: radarInputEqual }) ??
    EMPTY_INPUT;
  const carLeftRight = useBlindSpotSelector(
    (snapshot) => snapshot.carLeftRight
  );
  const driverCarIdx = useDriverCarIdx();
  const drivers = useSessionDrivers();
  const trackId = useSessionStore(
    (state) => state.session?.WeekendInfo?.TrackID
  );
  const trackLengthM = useTrackLength();
  // The camera car is the player while driving and the watched car otherwise.
  const playerCarIdx = focusCarIdx ?? driverCarIdx ?? null;

  const carNumbers = useMemo(() => {
    if (!drivers) return EMPTY_NUMBERS;
    return new Map(
      drivers
        .filter((driver) => driver.CarNumber)
        .map((driver) => [driver.CarIdx, driver.CarNumber])
    );
  }, [drivers]);

  const trackDrawing =
    trackId === undefined ? undefined : trackDrawings[trackId];
  const usable =
    trackId !== undefined &&
    trackDrawing !== undefined &&
    shouldShowTrack(trackId, trackDrawing);

  const overlap =
    carLeftRight === undefined
      ? NO_OVERLAP
      : overlapFromCarLeftRight(carLeftRight);

  // Engagement and side live across frames: the sim's verdict flickers through
  // a pass, and the proximity hysteresis needs the previous frame to keep a car
  // engaged. Car indices are re-used between sessions, so the map is dropped
  // whenever the track or the field size changes rather than carrying a stale
  // threat into the next session.
  const targetsRef =
    useRef<ReadonlyMap<number, RadarTargetState>>(EMPTY_TARGETS);
  const targetsKeyRef = useRef<string>('');
  const computed = useMemo(() => {
    const targetsKey = `${trackId}:${positions.length}`;
    if (targetsKey !== targetsKeyRef.current) {
      targetsKeyRef.current = targetsKey;
      targetsRef.current = EMPTY_TARGETS;
    }
    const result = computeRadarBlips({
      carIdxLapDistPct: positions,
      carIdxOnPitRoad: onPitRoad,
      playerCarIdx,
      trackDrawing,
      trackLengthM,
      radarRange,
      hideInPit,
      overlap,
      vehicleWidth,
      vehicleLength,
      thresholds: { nearbyRange, clearRange, criticalRange },
      fadeBandM,
      carNumbers,
      previousTargets: targetsRef.current,
    });
    targetsRef.current = result.targets;
    return result;
  }, [
    positions,
    onPitRoad,
    playerCarIdx,
    trackId,
    trackDrawing,
    trackLengthM,
    radarRange,
    hideInPit,
    overlap,
    vehicleWidth,
    vehicleLength,
    nearbyRange,
    clearRange,
    criticalRange,
    fadeBandM,
    carNumbers,
  ]);

  let nearestGapM: number | null = null;
  for (const blip of computed.blips) {
    if (nearestGapM === null || blip.gapM < nearestGapM)
      nearestGapM = blip.gapM;
  }

  return {
    hasGeometry: usable && computed.hasGeometry && computed.playerOnRoad,
    blips: computed.blips,
    overlap,
    isOnTrack,
    nearestGapM,
  };
};
