/**
 * Track centreline geometry shared by any widget that has to place something
 * on the road — the track map, and the proximity radar's blip projection.
 *
 * Everything here works in the track drawing's own canvas space (1920x1080,
 * see tracks.json), not in metres. Callers convert with
 * `metresPerUnit = trackLengthM / totalLength`.
 *
 * The shapes mirror what tracks.json actually holds; `active` and `startFinish`
 * are read deeper than the track map needs because a radar places nothing when
 * either is missing.
 */
export interface TrackDrawing {
  active: {
    inside: string;
    outside: string;
    trackPathPoints?: { x: number; y: number }[];
    totalLength?: number;
  };
  startFinish: {
    line?: string;
    arrow?: string;
    point?: { x?: number; y?: number; length?: number } | null;
    direction?: 'clockwise' | 'anticlockwise' | null;
  };
  turns?: {
    x?: number;
    y?: number;
    content?: string;
  }[];
}

export interface TrackPathPoint {
  x: number;
  y: number;
}

/**
 * Lap distance fraction space into path-point float-index space, applying the
 * start/finish offset and the track's running direction. Shared by the point
 * lookup and the tangent lookup so a blip and its heading always agree.
 */
const progressToFloatIndex = (
  progress: number,
  trackPathPoints: readonly TrackPathPoint[],
  totalLength: number,
  intersectionLength: number,
  direction: 'clockwise' | 'anticlockwise' | null | undefined
): number => {
  const adjustedLength = (totalLength * progress) % totalLength;
  const length =
    direction === 'anticlockwise'
      ? (intersectionLength + adjustedLength) % totalLength
      : (intersectionLength - adjustedLength + totalLength) % totalLength;
  return (length / totalLength) * (trackPathPoints.length - 1);
};

export const progressToTrackPoint = (
  progress: number,
  trackPathPoints: readonly TrackPathPoint[],
  totalLength: number,
  intersectionLength: number,
  direction: 'clockwise' | 'anticlockwise' | null | undefined,
  output: { x: number; y: number }
) => {
  const floatIndex = progressToFloatIndex(
    progress,
    trackPathPoints,
    totalLength,
    intersectionLength,
    direction
  );
  const index1 = Math.floor(floatIndex);
  const index2 = Math.min(index1 + 1, trackPathPoints.length - 1);
  const amount = floatIndex - index1;
  const point1 = trackPathPoints[index1];
  const point2 = trackPathPoints[index2];
  output.x = point1.x + (point2.x - point1.x) * amount;
  output.y = point1.y + (point2.y - point1.y) * amount;
};

/**
 * Direction of the road at a lap distance fraction, in canvas-space radians.
 *
 * Uses neighbouring path points rather than the segment the point sits on, so
 * consecutive cars get a stable heading instead of flipping between segments
 * at the vertex they straddle. Null when the fraction is off the path or the
 * two neighbours coincide.
 */
export const tangentAngleAt = (
  progress: number,
  trackPathPoints: readonly TrackPathPoint[],
  totalLength: number,
  intersectionLength: number,
  direction: 'clockwise' | 'anticlockwise' | null | undefined
): number | null => {
  if (trackPathPoints.length < 3 || totalLength <= 0) return null;
  const floatIndex = progressToFloatIndex(
    progress,
    trackPathPoints,
    totalLength,
    intersectionLength,
    direction
  );
  if (!Number.isFinite(floatIndex) || floatIndex < 0) return null;
  const index = Math.round(floatIndex);
  const before = trackPathPoints[Math.max(0, index - 1)];
  const after =
    trackPathPoints[Math.min(trackPathPoints.length - 1, index + 1)];
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  if (dx === 0 && dy === 0) return null;
  return Math.atan2(dy, dx);
};
