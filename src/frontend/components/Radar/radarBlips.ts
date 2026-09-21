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
import {
  evaluateProximity,
  type ProximityLevel,
  type ProximityThresholds,
} from './radarProximity';
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
  /** Fore/aft gap in metres — the distance the radar colours by. */
  gapM: number;
  level: ProximityLevel;
  /** Set when the sim reports this car directly alongside. */
  side: OverlapSide | null;
  /** Car number for the blip label; null when the session has none. */
  carNumber: string | null;
  inPit: boolean;
  /**
   * Opacity 0..1 for this car, so it fades in over the outer band of the range
   * rather than appearing on a ring. 1 when the band is switched off.
   */
  fade: number;
}

/** What the widget must carry from one frame to the next, per car. */
export interface RadarTargetState {
  side: OverlapSide | null;
  engaged: boolean;
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
  thresholds: ProximityThresholds;
  /** Metres of fade at the outer edge of the range; 0 for none. */
  fadeBandM: number;
  /** Car number by CarIdx, for blip labels. */
  carNumbers: ReadonlyMap<number, string>;
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

const onRoad = (pct: number | undefined): pct is number =>
  typeof pct === 'number' && Number.isFinite(pct) && pct >= 0;

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
    thresholds,
    carNumbers,
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
    const alongM = delta * trackLengthM;
    if (Math.abs(alongM) > radarRange) continue;

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
      level: 'far',
      side: null,
      carNumber: carNumbers.get(carIdx) ?? null,
      inPit,
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

    const wasEngaged = previousTargets.get(blip.carIdx)?.engaged ?? false;
    const verdict = evaluateProximity(
      blip.gapM,
      side !== null,
      wasEngaged,
      thresholds
    );
    blip.level = verdict.level;
    targets.set(blip.carIdx, { side, engaged: verdict.engaged });
  }

  return { hasGeometry: true, playerOnRoad: true, blips, targets };
};
