import { useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import type { RadarSnapshot } from '@irdashies/types';
import {
  useBlindSpotSelector,
  useCurrentSessionType,
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
  /** At least one visible rival is a lap ahead in a race. */
  holdLine: boolean;
  /**
   * Shortest fore/aft gap to any car being drawn, in metres; null when the
   * radar is drawing none. Cars hidden by `hideInPit` do not count, so a car
   * in the pits cannot bring the radar on screen.
   */
  nearestGapM: number | null;
  /** Track length in metres; forwarded for motion interpolation. */
  trackLengthM: number;
}

export interface UseRadarOptions {
  radarRange: number;
  /** Car size in metres; the SDK reports none, so the config supplies it. */
  vehicleWidth: number;
  vehicleLength: number;
  hideInPit: boolean;
  /** Metres of fade at the outer edge of the range; 0 for none. */
  fadeBandM: number;
}

type RadarInput = readonly [
  number | null,
  readonly number[],
  readonly number[],
  readonly boolean[],
  boolean,
];

const EMPTY_INPUT: RadarInput = [null, [], [], [], false];
const EMPTY_TARGETS: ReadonlyMap<number, RadarTargetState> = new Map();
const EMPTY_NUMBERS: ReadonlyMap<number, string> = new Map();

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
 * Car numbers come from the session, since the position channel carries none.
 */
export const useRadar = (options: UseRadarOptions): RadarState => {
  const { radarRange, hideInPit, vehicleWidth, vehicleLength, fadeBandM } =
    options;
  const [focusCarIdx, positions, laps, onPitRoad, isOnTrack] =
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
  const isRace = useCurrentSessionType() === 'Race';
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

  /**
   * The pace car index: the first driver the roster flags CarIsPaceCar. The
   * session's PaceCarIdx is deliberately not consulted — some sessions report
   * it as 0, which is the player's index too — and the roster flag is what the
   * sim keeps correct.
   */
  const paceCarIdx = useMemo<number | null>(() => {
    if (!drivers) return null;
    const flagged = drivers.find((driver) => driver.CarIsPaceCar);
    if (flagged) return flagged.CarIdx;
    return null;
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

  // Drawn sides live across frames: the sim's verdict flickers through a pass,
  // and a car abreast must keep the side it was first drawn on. Car indices
  // are re-used between sessions, so the map is dropped whenever the track or
  // the field size changes rather than carrying a stale side into the next
  // session.
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
      carIdxLap: laps,
      carIdxOnPitRoad: onPitRoad,
      isRace,
      playerCarIdx,
      trackDrawing,
      trackLengthM,
      radarRange,
      hideInPit,
      overlap,
      vehicleWidth,
      vehicleLength,
      fadeBandM,
      carNumbers,
      paceCarIdx,
      previousTargets: targetsRef.current,
    });
    targetsRef.current = result.targets;
    return result;
  }, [
    positions,
    laps,
    onPitRoad,
    isRace,
    playerCarIdx,
    trackId,
    trackDrawing,
    trackLengthM,
    radarRange,
    hideInPit,
    overlap,
    vehicleWidth,
    vehicleLength,
    fadeBandM,
    carNumbers,
    paceCarIdx,
  ]);

  let nearestGapM: number | null = null;
  let holdLine = false;
  for (const blip of computed.blips) {
    if (nearestGapM === null || blip.gapM < nearestGapM)
      nearestGapM = blip.gapM;
    if (blip.lapAhead) holdLine = true;
  }

  return {
    hasGeometry: usable && computed.hasGeometry && computed.playerOnRoad,
    blips: computed.blips,
    overlap,
    isOnTrack,
    holdLine,
    nearestGapM,
    trackLengthM,
  };
};
