import { useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import type { RadarSnapshot } from '@irdashies/types';
import {
  useBlindSpotSelector,
  useDriverCarIdx,
  useRadarSelector,
  useSessionStore,
  useTrackLength,
} from '@irdashies/context';
import tracks from '../../../assets/data/tracks.json';
import { shouldShowTrack } from '../../../assets/data/brokenTracks';
import type { TrackDrawing } from '@irdashies/domain/trackGeometry';
import { computeRadarBlips, type RadarBlip } from '../radarBlips';
import {
  NO_OVERLAP,
  overlapFromCarLeftRight,
  type OverlapSide,
  type RadarOverlap,
} from '../overlapSides';

export interface RadarState {
  /** Centreline is usable; false hides the widget, as the track map does. */
  hasGeometry: boolean;
  blips: readonly RadarBlip[];
  overlap: RadarOverlap;
  isOnTrack: boolean;
}

export interface UseRadarOptions {
  radarRange: number;
  /** Car size in metres; the SDK reports none, so the config supplies it. */
  vehicleWidth: number;
  vehicleLength: number;
  hideInPit: boolean;
}

type RadarInput = readonly [
  number | null,
  readonly number[],
  readonly number[],
  readonly boolean[],
  boolean,
];

const EMPTY_INPUT: RadarInput = [null, [], [], [], false];

const selectRadarInput = (snapshot: RadarSnapshot): RadarInput => [
  snapshot.focusCarIdx,
  snapshot.carIdxLapDistPct,
  snapshot.carIdxLap,
  snapshot.carIdxOnPitRoad,
  snapshot.isOnTrack,
];

const radarInputEqual = (previous: RadarInput, next: RadarInput): boolean =>
  previous[0] === next[0] &&
  previous[4] === next[4] &&
  shallow(previous[1], next[1]) &&
  shallow(previous[2], next[2]) &&
  shallow(previous[3], next[3]);

const trackDrawings = tracks as unknown as Record<
  number,
  TrackDrawing | undefined
>;

/**
 * Radar state from the two channels the widget declares: per-car positions
 * (radar.snapshot) and the sim's own overlap verdict (blind-spot.snapshot).
 */
export const useRadar = (options: UseRadarOptions): RadarState => {
  const { radarRange, hideInPit, vehicleWidth, vehicleLength } = options;
  const [focusCarIdx, positions, laps, onPitRoad, isOnTrack] =
    useRadarSelector(selectRadarInput, { equality: radarInputEqual }) ??
    EMPTY_INPUT;
  const carLeftRight = useBlindSpotSelector(
    (snapshot) => snapshot.carLeftRight
  );
  const driverCarIdx = useDriverCarIdx();
  const trackId = useSessionStore(
    (state) => state.session?.WeekendInfo?.TrackID
  );
  const trackLengthM = useTrackLength();
  // The camera car is the player while driving and the watched car otherwise.
  const playerCarIdx = focusCarIdx ?? driverCarIdx ?? null;

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

  // Sides live across frames so a car keeps the side the sim gave it for the
  // whole pass, rather than following a verdict that flickers frame to frame.
  // Car indices are re-used between sessions, so the map is dropped whenever
  // the track or the field size changes rather than carrying a stale side into
  // the next session.
  const sidesRef = useRef<ReadonlyMap<number, OverlapSide>>(new Map());
  const sidesKeyRef = useRef<string>('');
  const computed = useMemo(() => {
    const sidesKey = `${trackId}:${positions.length}`;
    if (sidesKey !== sidesKeyRef.current) {
      sidesKeyRef.current = sidesKey;
      sidesRef.current = new Map();
    }
    const result = computeRadarBlips({
      carIdxLapDistPct: positions,
      carIdxLap: laps,
      carIdxOnPitRoad: onPitRoad,
      playerCarIdx,
      trackDrawing,
      trackLengthM,
      radarRange,
      hideInPit,
      overlap,
      vehicleWidth,
      vehicleLength,
      previousSides: sidesRef.current,
    });
    sidesRef.current = result.sides;
    return result;
  }, [
    positions,
    laps,
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
  ]);

  return {
    hasGeometry: usable && computed.hasGeometry && computed.playerOnRoad,
    blips: computed.blips,
    overlap,
    isOnTrack,
  };
};
