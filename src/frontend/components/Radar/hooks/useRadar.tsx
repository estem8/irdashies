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
  MAP_SAMPLE_M,
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
  /** Track length in metres; forwarded for motion interpolation. */
  trackLengthM: number;
  /** Reusable `(alongM, lateralM)` storage for the following-car road. */
  followingMapPath: Float64Array;
  /** Number of valid road pairs in `followingMapPath`. */
  followingMapPointCount: number;
  /** Road shown, in metres, from half this window behind to half ahead. */
  followingMapWindowM: number;
  /** The original SVG track path, used for its smooth developer geometry. */
  followingMapSvgPath: string | null;
  /** Player frame in the track drawing's coordinate space. */
  followingMapCameraPlayerX: number;
  followingMapCameraPlayerY: number;
  followingMapCameraForwardX: number;
  followingMapCameraForwardY: number;
  followingMapCameraRightX: number;
  followingMapCameraRightY: number;
  followingMapUnitsPerMetre: number;
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
  readonly boolean[],
  boolean,
  number,
];

const EMPTY_INPUT: RadarInput = [null, [], [], false, 0];
const EMPTY_TARGETS: ReadonlyMap<number, RadarTargetState> = new Map();
const EMPTY_NUMBERS: ReadonlyMap<number, string> = new Map();

const selectRadarInput = (snapshot: RadarSnapshot): RadarInput => [
  snapshot.focusCarIdx,
  snapshot.carIdxLapDistPct,
  snapshot.carIdxOnPitRoad,
  snapshot.isOnTrack,
  snapshot.version,
];

const radarInputEqual = (previous: RadarInput, next: RadarInput): boolean =>
  previous[0] === next[0] &&
  previous[3] === next[3] &&
  previous[4] === next[4] &&
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
  const { radarRange, hideInPit, vehicleWidth, vehicleLength, fadeBandM } =
    options;
  const [focusCarIdx, positions, onPitRoad, isOnTrack, frameVersion] =
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
  const followingMapWindowM = radarRange * 3;
  const mapPointCapacity =
    Number.isFinite(followingMapWindowM) && followingMapWindowM >= 0
      ? Math.floor(followingMapWindowM / MAP_SAMPLE_M) + 1
      : 0;
  const followingMapBufferRef = useRef<Float64Array | null>(null);
  if (
    followingMapBufferRef.current === null ||
    followingMapBufferRef.current.length < mapPointCapacity * 2
  ) {
    followingMapBufferRef.current = new Float64Array(mapPointCapacity * 2);
  }
  const followingMapBuffer = followingMapBufferRef.current;

  const previousPositionsRef = useRef<{
    positions: readonly number[];
    playerCarIdx: number | null;
    trackId: number | undefined;
    version: number;
  } | null>(null);

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
      fadeBandM,
      carNumbers,
      paceCarIdx,
      previousTargets: targetsRef.current,
      followingMapBuffer,
    });
    const previous = previousPositionsRef.current;
    if (
      previous &&
      previous.playerCarIdx === playerCarIdx &&
      previous.trackId === trackId &&
      previous.version !== frameVersion &&
      trackLengthM > 0
    ) {
      const previousPlayer = previous.positions[playerCarIdx ?? -1];
      const currentPlayer = positions[playerCarIdx ?? -1];
      for (const blip of result.blips) {
        const previousCar = previous.positions[blip.carIdx];
        const currentCar = positions[blip.carIdx];
        if (
          typeof previousPlayer === 'number' &&
          typeof currentPlayer === 'number' &&
          typeof previousCar === 'number' &&
          typeof currentCar === 'number'
        ) {
          let relativeDelta =
            previousCar - currentCar - (previousPlayer - currentPlayer);
          if (relativeDelta > 0.5) relativeDelta -= 1;
          if (relativeDelta < -0.5) relativeDelta += 1;
          blip.closingSpeedMps = Math.max(0, relativeDelta * trackLengthM * 25);
        }
      }
    }
    previousPositionsRef.current = {
      positions,
      playerCarIdx,
      trackId,
      version: frameVersion,
    };
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
    fadeBandM,
    carNumbers,
    paceCarIdx,
    followingMapBuffer,
    frameVersion,
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
    trackLengthM,
    followingMapPath: followingMapBuffer,
    followingMapPointCount: computed.followingMapPointCount,
    followingMapWindowM,
    followingMapSvgPath: trackDrawing?.active?.inside ?? null,
    followingMapCameraPlayerX: computed.followingMapCameraPlayerX,
    followingMapCameraPlayerY: computed.followingMapCameraPlayerY,
    followingMapCameraForwardX: computed.followingMapCameraForwardX,
    followingMapCameraForwardY: computed.followingMapCameraForwardY,
    followingMapCameraRightX: computed.followingMapCameraRightX,
    followingMapCameraRightY: computed.followingMapCameraRightY,
    followingMapUnitsPerMetre: computed.followingMapUnitsPerMetre,
  };
};
