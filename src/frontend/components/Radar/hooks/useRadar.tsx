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
import { getClassColorHex } from '@irdashies/utils/colors';
import type { TrackDrawing } from '@irdashies/domain/trackGeometry';
import {
  NO_OVERLAP,
  overlapFromCarLeftRight,
  type RadarOverlap,
} from '../overlapSides';
import { MAX_RADAR_RANGE_M } from '../radarFade';
import {
  computeRadarBlips,
  MAP_SAMPLE_M,
  type RadarBlip,
  type RadarTargetState,
} from '../radarBlips';

export interface RadarState {
  /** Centreline is usable; false hides the widget, as the track map does. */
  hasGeometry: boolean;
  blips: readonly RadarBlip[];
  overlap: RadarOverlap;
  /** True while the player is stationary and the grid layout is ambiguous. */
  isGrid: boolean;
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
  rivalColorMode: 'class' | 'badge' | 'custom';
  colorRival: string;
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
const EMPTY_COLORS: ReadonlyMap<number, string> = new Map();

const colorHex = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return `#${Math.min(0xffffff, Math.round(value)).toString(16).padStart(6, '0')}`;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.replace(/^0x/i, ''), 16);
    if (Number.isFinite(parsed) && parsed > 0) {
      return `#${Math.min(0xffffff, parsed).toString(16).padStart(6, '0')}`;
    }
  }
  return null;
};

const LICENSE_COLORS: Record<string, string> = {
  W: '#71717a',
  P: '#7e22ce',
  A: '#1d4ed8',
  B: '#15803d',
  C: '#a16207',
  D: '#c2410c',
  R: '#b91c1c',
};

const badgeColor = (value: unknown, license: unknown): string | null => {
  const numeric = colorHex(value);
  if (numeric) return numeric;
  return typeof license === 'string'
    ? (LICENSE_COLORS[license.charAt(0)] ?? null)
    : null;
};

const selectRadarInput = (snapshot: RadarSnapshot): RadarInput => [
  snapshot.focusCarIdx,
  snapshot.carIdxLapDistPct,
  snapshot.carIdxOnPitRoad,
  snapshot.isOnTrack,
  snapshot.carSpeed,
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
  const [focusCarIdx, positions, onPitRoad, isOnTrack, carSpeed] =
    useRadarSelector(selectRadarInput, { equality: radarInputEqual }) ??
    EMPTY_INPUT;
  const carLeftRight = useBlindSpotSelector(
    (snapshot) => snapshot.carLeftRight
  );
  const driverCarIdx = useDriverCarIdx();
  // Speed describes the player's car. Do not classify a watched car as
  // stationary from the player's speed when the camera follows someone else.
  const isGrid =
    focusCarIdx !== null && focusCarIdx === driverCarIdx && carSpeed < 0.5;
  const drivers = useSessionDrivers();
  const session = useSessionStore((state) => state.session);
  const trackId = session?.WeekendInfo?.TrackID;
  const isMultiClass = (session?.WeekendInfo?.NumCarClasses ?? 0) > 1;
  const sessionKey = useMemo(() => {
    const sessionNumbers =
      session?.SessionInfo?.Sessions?.map(({ SessionNum }) => SessionNum).join(
        ','
      ) ?? '';
    const subSessionId =
      session?.WeekendInfo?.SubSessionID ??
      session?.WeekendInfo?.SessionID ??
      'none';
    return `${subSessionId}:${sessionNumbers}`;
  }, [session]);
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

  const carColors = useMemo(() => {
    if (!drivers || options.rivalColorMode === 'custom') return EMPTY_COLORS;
    const colorByCar = new Map<number, string>();
    for (const driver of drivers) {
      const color =
        options.rivalColorMode === 'class'
          ? getClassColorHex(
              Number(driver.CarClassColor),
              isMultiClass,
              options.colorRival
            )
          : badgeColor(driver.LicColor, driver.LicString);
      if (color) colorByCar.set(driver.CarIdx, color);
    }
    return colorByCar;
  }, [drivers, isMultiClass, options.colorRival, options.rivalColorMode]);

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

  const overlap = useMemo(
    () =>
      carLeftRight === undefined
        ? NO_OVERLAP
        : overlapFromCarLeftRight(carLeftRight),
    [carLeftRight]
  );

  // Drawn sides live across frames: the sim's verdict flickers through a pass,
  // and a car abreast must keep the side it was first drawn on. Car indices
  // are re-used between sessions, so the map is dropped whenever the session,
  // track, or field size changes rather than carrying stale state forward.
  const safeRadarRange = Number.isFinite(radarRange)
    ? Math.max(0, Math.min(radarRange, MAX_RADAR_RANGE_M))
    : 0;
  const followingMapWindowM = safeRadarRange * 3;
  const mapPointCapacity = Math.floor(followingMapWindowM / MAP_SAMPLE_M) + 1;
  const targetsRef =
    useRef<ReadonlyMap<number, RadarTargetState>>(EMPTY_TARGETS);
  const targetsKeyRef = useRef<string>('');
  const followingMapBufferRef = useRef<Float64Array | null>(null);
  if (
    followingMapBufferRef.current === null ||
    followingMapBufferRef.current.length < mapPointCapacity * 2
  ) {
    followingMapBufferRef.current = new Float64Array(mapPointCapacity * 2);
  }
  const followingMapBuffer = followingMapBufferRef.current;

  const computed = useMemo(() => {
    const targetsKey = `${sessionKey}:${trackId}:${positions.length}`;
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
      radarRange: safeRadarRange,
      hideInPit,
      overlap,
      vehicleWidth,
      vehicleLength,
      fadeBandM,
      carNumbers,
      carColors,
      paceCarIdx,
      previousTargets: targetsRef.current,
      followingMapBuffer,
    });
    targetsRef.current = result.targets;
    if (isGrid) {
      // These blips are freshly owned by this calculation; clear only the
      // display signals in place instead of cloning every blip at 25 Hz.
      for (const blip of result.blips) {
        blip.side = null;
        blip.rimSignal = null;
      }
    }
    return result;
  }, [
    positions,
    onPitRoad,
    playerCarIdx,
    sessionKey,
    trackId,
    trackDrawing,
    trackLengthM,
    safeRadarRange,
    hideInPit,
    overlap,
    vehicleWidth,
    vehicleLength,
    fadeBandM,
    carNumbers,
    carColors,
    paceCarIdx,
    isGrid,
    followingMapBuffer,
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
    isGrid,
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
