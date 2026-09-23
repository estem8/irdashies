import {
  progressToTrackPoint,
  tangentAngleAt,
  type TrackDrawing,
} from '@irdashies/domain/trackGeometry';
import {
  alongsideWindowM,
  assignOverlapSides,
  retainSideWindowM,
  type OverlapSide,
  type RadarOverlap,
} from './overlapSides';
import { carFadeAt } from './radarFade';

export interface RadarBlip {
  carIdx: number;
  /** Metres along the road; positive is ahead of the player. */
  alongM: number;
  /** Metres to the driver's right, negative to the left. */
  lateralM: number;
  /**
   * Road heading at this car relative to the player's, radians in (-PI, PI].
   * Both are measured against the same centreline, so the track's running
   * direction cancels out.
   */
  relYaw: number;
  /**
   * Fore/aft gap in metres; the show-when-nearby gate reads the nearest one.
   */
  gapM: number;
  /** Set when the sim reports this car directly alongside. */
  side: OverlapSide | null;
  /**
   * Set when the car is level with the player and the sim has reported no side
   * for it. It is beside us — two cars cannot share a point of the road — but
   * which side it is on is not known, so nothing may be drawn as if it were in
   * one lane rather than the other.
   */
  sideUnknown: boolean;
  /** Car number for the blip label; null when the session has none. */
  carNumber: string | null;
  /** Set when this is the session's pace car, which carries a fixed label. */
  isPaceCar: boolean;
  /**
   * Opacity 0..1 for this car, so it fades in over the outer band of the range
   * rather than appearing on a ring. 1 when the band is switched off.
   */
  fade: number;
}

/** What the widget must carry from one frame to the next, per car. */
export interface RadarTargetState {
  side: OverlapSide | null;
  /**
   * The direction this car was last drawn in (-1 behind, 1 ahead, 0 none yet).
   * A car running abreast oscillates around the player's lap fraction, so the
   * sign of its measured offset hops between frames; the radar holds the side
   * it first drew the car on instead of letting it flicker.
   */
  alongSign: -1 | 0 | 1;
}

export interface RadarBlipResult {
  /**
   * The track centreline is usable. False means positions cannot be projected
   * onto the road at all — the widget has nothing to draw, exactly as the
   * track map draws nothing for a track without path points.
   */
  hasGeometry: boolean;
  /** The focus car has a usable position; false blanks the radar. */
  playerOnRoad: boolean;
  blips: RadarBlip[];
  /** State to hand back in as `previousTargets` next frame. */
  targets: ReadonlyMap<number, RadarTargetState>;
}

export interface RadarBlipInput {
  carIdxLapDistPct: readonly number[];
  carIdxOnPitRoad: readonly boolean[];
  playerCarIdx: number | null;
  trackDrawing: TrackDrawing | undefined;
  /** Track length in metres; from the session's WeekendInfo.TrackLength. */
  trackLengthM: number;
  radarRange: number;
  hideInPit: boolean;
  /** The sim's own side-overlap verdict, for placing cars running abreast. */
  overlap: RadarOverlap;
  vehicleWidth: number;
  vehicleLength: number;
  /** Metres of fade at the outer edge of the range; 0 for none. */
  fadeBandM: number;
  /** Car number by CarIdx, for blip labels. */
  carNumbers: ReadonlyMap<number, string>;
  /**
   * The pace car's CarIdx as the driver roster flags it, or null when no
   * driver is flagged CarIsPaceCar.
   */
  paceCarIdx: number | null;
  /** State carried over from the previous frame; the caller owns it. */
  previousTargets: ReadonlyMap<number, RadarTargetState>;
}

const EMPTY_TARGETS: ReadonlyMap<number, RadarTargetState> = new Map();

const NO_GEOMETRY: RadarBlipResult = {
  hasGeometry: false,
  playerOnRoad: false,
  blips: [],
  targets: EMPTY_TARGETS,
};

/**
 * How far to the side an abreast car is drawn, in car widths. Just over one
 * width keeps it clear of the player's own rectangle.
 */
const ABREAST_LATERAL_FACTOR = 1.1;

/**
 * A sub-car-length latch. Measured on a replayed race, cars within a couple of
 * metres of the player oscillate ±0.5 m frame to frame, which flips the
 * ahead/behind sign; a real pass still sweeps through the latch.
 */
export const LONGITUDINAL_LATCH_M = 1;

/**
 * How level a car counts as beside the player, in car lengths.
 *
 * Two cars cannot share a point of the road, so a rival whose centre is within
 * half a car length of the player's is necessarily across the road from them —
 * whether or not the sim's own verdict said so. Measured on a ten-minute race,
 * the verdict stays silent for about half the overtakes and for every overtake
 * of a player standing off the racing surface, so this is what lets the display
 * say a car is beside you when the sim says nothing.
 */
const ABREAST_UNKNOWN_LENGTHS = 0.5;

/**
 * Holds a car on the side it was last drawn on while its measured offset sits
 * inside the latch: an oscillation about the player must not flip ahead/behind
 * frame to frame. Beyond the latch the measured along-track offset is passed
 * through untouched, so a genuine pass still crosses the axis.
 */
export const latchAlongSide = (
  alongM: number,
  previousSign: -1 | 0 | 1,
  latchM: number
): number =>
  previousSign !== 0 &&
  Math.abs(alongM) <= latchM &&
  Math.sign(alongM) !== previousSign
    ? previousSign * Math.abs(alongM)
    : alongM;
const onRoad = (pct: number | undefined): pct is number =>
  typeof pct === 'number' && Number.isFinite(pct) && pct >= 0;

/**
 * Whether a rival is lapping the player: more than half a lap of total distance
 * ahead of them, which is what the standings widget calls `lappedState:
 * 'ahead'` and paints its rows by. Lap counts alone will not do — a leader
 * crossing the line puts every car on the previous count a "lap" behind while
 * it is still seconds up the road — so each counter is taken together with that
 * driver's position on the lap, exactly as `useDriverPositions` computes it.
 */
export const isLappingPlayer = (
  rivalLap: number,
  rivalPct: number,
  playerLap: number,
  playerPct: number
): boolean =>
  rivalLap >= 0 &&
  playerLap >= 0 &&
  Math.round(rivalLap + rivalPct - (playerLap + playerPct)) > 0;

/** The fixed blip tag for the pace car; its number (0) is meaningless. */
export const PACE_CAR_LABEL = 'PACE';

/**
 * Blip text, or null when labels are off. The pace car is labelled with the
 * fixed tag rather than its number: the number is '0' and there is no
 * AbbrevName for it.
 */
export const blipLabel = (
  blip: { carNumber: string | null; isPaceCar: boolean },
  showLabels: boolean
): string | null => {
  if (!showLabels) return null;
  return blip.isPaceCar ? PACE_CAR_LABEL : blip.carNumber;
};

/**
 * Places nearby cars on the road as the player sees it: metres ahead/behind
 * from lap distance, and metres left/right from the centreline's own shape.
 *
 * The SDK publishes no per-car world position, so a car's lateral offset is
 * the centreline offset between its point and the player's — two cars side by
 * side on the same part of the road project onto each other. What the lateral
 * term does carry is how much the road bends between the two cars, which is
 * what curves a blip off the vertical axis in a corner. A car the sim reports
 * directly alongside is the exception: it is pinned to its side instead.
 */
export const computeRadarBlips = (input: RadarBlipInput): RadarBlipResult => {
  const {
    carIdxLapDistPct: positions,
    carIdxOnPitRoad,
    playerCarIdx,
    trackDrawing,
    trackLengthM,
    radarRange,
    hideInPit,
    overlap,
    vehicleWidth,
    vehicleLength,
    carNumbers,
    paceCarIdx,
    fadeBandM,
    previousTargets,
  } = input;

  const trackPathPoints = trackDrawing?.active?.trackPathPoints;
  const totalLength = trackDrawing?.active?.totalLength;
  const intersectionLength = trackDrawing?.startFinish?.point?.length;
  const direction = trackDrawing?.startFinish?.direction;

  if (
    !trackPathPoints ||
    !totalLength ||
    intersectionLength === undefined ||
    !Number.isFinite(trackLengthM) ||
    trackLengthM <= 0 ||
    trackPathPoints.length < 3
  ) {
    return NO_GEOMETRY;
  }

  const playerPct = playerCarIdx === null ? undefined : positions[playerCarIdx];
  if (playerCarIdx === null || !onRoad(playerPct)) {
    return {
      hasGeometry: true,
      playerOnRoad: false,
      blips: [],
      targets: EMPTY_TARGETS,
    };
  }

  const playerTangent = tangentAngleAt(
    playerPct,
    trackPathPoints,
    totalLength,
    intersectionLength,
    direction
  );
  if (playerTangent === null) {
    return {
      hasGeometry: true,
      playerOnRoad: false,
      blips: [],
      targets: EMPTY_TARGETS,
    };
  }

  const metresPerUnit = trackLengthM / totalLength;
  // `tangentAngleAt` follows increasing path index. On an anticlockwise track
  // that is also the direction of travel; on a clockwise track cars run the
  // other way through the same points.
  const travelFlip = direction === 'anticlockwise' ? 0 : Math.PI;
  const rightX = -Math.sin(playerTangent + travelFlip);
  const rightY = Math.cos(playerTangent + travelFlip);

  const playerPoint = { x: 0, y: 0 };
  progressToTrackPoint(
    playerPct,
    trackPathPoints,
    totalLength,
    intersectionLength,
    direction,
    playerPoint
  );

  const blips: RadarBlip[] = [];
  const carPoint = { x: 0, y: 0 };

  for (let carIdx = 0; carIdx < positions.length; carIdx += 1) {
    if (carIdx === playerCarIdx) continue;
    const pct = positions[carIdx];
    if (!onRoad(pct)) continue;

    const inPit = carIdxOnPitRoad[carIdx] === true;
    if (hideInPit && inPit) continue;

    let delta = pct - playerPct;
    if (delta > 0.5) delta -= 1;
    else if (delta < -0.5) delta += 1;
    const rawAlongM = delta * trackLengthM;
    if (Math.abs(rawAlongM) > radarRange) continue;
    // A car abreast oscillates about the player's lap fraction; hold it on the
    // side it was drawn on while the offset is inside the latch. The range
    // test deliberately ran on the raw value, so a latched car near the edge
    // is not dropped.
    const previousSign = previousTargets.get(carIdx)?.alongSign ?? 0;
    const alongM = latchAlongSide(
      rawAlongM,
      previousSign,
      LONGITUDINAL_LATCH_M
    );

    progressToTrackPoint(
      pct,
      trackPathPoints,
      totalLength,
      intersectionLength,
      direction,
      carPoint
    );
    const lateralM =
      ((carPoint.x - playerPoint.x) * rightX +
        (carPoint.y - playerPoint.y) * rightY) *
      metresPerUnit;

    const carTangent = tangentAngleAt(
      pct,
      trackPathPoints,
      totalLength,
      intersectionLength,
      direction
    );
    const relYaw =
      carTangent === null
        ? 0
        : Math.atan2(
            Math.sin(carTangent - playerTangent),
            Math.cos(carTangent - playerTangent)
          );

    blips.push({
      carIdx,
      alongM,
      lateralM,
      relYaw,
      gapM: Math.abs(alongM),
      side: null,
      sideUnknown: false,
      carNumber: carNumbers.get(carIdx) ?? null,
      isPaceCar: carIdx === paceCarIdx,
      // Faded by how far the car is from the player in the plane the radar
      // draws in, so one closing head-on fades in on approach while one
      // alongside (already near in that plane) never dims.
      fade: carFadeAt(Math.hypot(alongM, lateralM), radarRange, fadeBandM),
    });
  }

  // A car running abreast projects onto the player's own point of the
  // centreline — the SDK publishes no lateral offset — so without this it would
  // be drawn on top of the player's rectangle. The sim's own side verdict puts
  // it to one side instead.
  const previousSides = new Map<number, OverlapSide>();
  for (const blip of blips) {
    const held = previousTargets.get(blip.carIdx)?.side;
    if (held != null) previousSides.set(blip.carIdx, held);
  }
  const sides = assignOverlapSides({
    blips,
    overlap,
    vehicleLength,
    previous: previousSides,
  });

  // The offset is full while the verdict covers the car, so a genuine overlap
  // reads at its real width; it fades out only in the retained tail, where the
  // verdict has gone but the car keeps its side for a few frames longer.
  const abeam = alongsideWindowM(vehicleLength);
  const retain = retainSideWindowM(vehicleLength);
  const fadeSpan = Math.max(1e-6, retain - abeam);

  const targets = new Map<number, RadarTargetState>();
  const abreastUnknownM = Math.max(1, vehicleLength * ABREAST_UNKNOWN_LENGTHS);
  for (const blip of blips) {
    const side = sides.get(blip.carIdx) ?? null;
    blip.side = side;
    if (side !== null) {
      const closeness =
        blip.gapM <= abeam
          ? 1
          : Math.max(0, 1 - (blip.gapM - abeam) / fadeSpan);
      blip.lateralM = side * vehicleWidth * ABREAST_LATERAL_FACTOR * closeness;
    }
    // Level with the player and no verdict: the car is beside us, but the only
    // thing that could say which side is silent. It is marked so nothing draws
    // it as though it were in a lane we know it to be in.
    blip.sideUnknown = side === null && blip.gapM <= abreastUnknownM;

    // A car with no history adopts its geometric sign, so a car entering the
    // range is unaffected by the latch until it has been drawn once.
    targets.set(blip.carIdx, {
      side,
      alongSign: (Math.sign(blip.alongM) ||
        (previousTargets.get(blip.carIdx)?.alongSign ?? 0)) as -1 | 0 | 1,
    });
  }

  return { hasGeometry: true, playerOnRoad: true, blips, targets };
};
