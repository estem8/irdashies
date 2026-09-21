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
 * How much of the road a heading is measured over, in canvas units.
 *
 * The drawings are polylines on a one-unit grid, so a heading taken across a
 * neighbouring pair of points measures the grid rather than the road: on a
 * straight that is a zigzag of about ±18 degrees, and it is what made blips
 * rotate in steps and twitch from side to side. A chord of about this length
 * averages the grid away — and because the chord is centred on the point asked
 * about, it still reports the heading of the road there, even through a
 * corner, where a chord over an arc gives the tangent at the arc's midpoint.
 */
const HEADING_BASELINE_UNITS = 50;

/**
 * A half-chord in path points for each drawing, and the headings themselves.
 * Keyed by the points array, which comes from the bundled track data and so
 * outlives any number of frames but never changes.
 */
const headingCache = new WeakMap<readonly TrackPathPoint[], Float64Array>();

const smoothedHeadings = (
  trackPathPoints: readonly TrackPathPoint[],
  totalLength: number
): Float64Array => {
  const cached = headingCache.get(trackPathPoints);
  if (cached) return cached;

  const last = trackPathPoints.length - 1;
  const closed =
    trackPathPoints[0].x === trackPathPoints[last].x &&
    trackPathPoints[0].y === trackPathPoints[last].y;
  const distinct = closed ? last : trackPathPoints.length;
  // One point per this many units, so the same stretch of road is measured on
  // a coarse drawing and a dense one.
  const unitsPerPoint =
    totalLength > 0 ? totalLength / Math.max(1, distinct - 1) : 0;
  const half =
    unitsPerPoint > 0
      ? Math.max(1, Math.round(HEADING_BASELINE_UNITS / (2 * unitsPerPoint)))
      : 1;

  const clamp = (index: number) =>
    closed
      ? ((index % distinct) + distinct) % distinct
      : Math.min(last, Math.max(0, index));

  const headings = new Float64Array(trackPathPoints.length).fill(NaN);
  for (let index = 0; index < trackPathPoints.length; index += 1) {
    const before = trackPathPoints[clamp(index - half)];
    const after = trackPathPoints[clamp(index + half)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    if (dx !== 0 || dy !== 0) headings[index] = Math.atan2(dy, dx);
  }

  headingCache.set(trackPathPoints, headings);
  return headings;
};

/**
 * Direction of the road at a lap distance fraction, in canvas-space radians.
 *
 * Uses neighbouring path points rather than the segment the point sits on, so
 * consecutive cars get a stable heading instead of flipping between segments
 * at the vertex they straddle. Null when the fraction is off the path or the
 * two neighbours coincide.
 *
 * The heading is interpolated between the two vertices the fraction sits
 * between, exactly as `progressToTrackPoint` interpolates the position. Taking
 * the nearest vertex instead quantises the heading to the path's own spacing
 * (a few metres), and a heading that steps while the position glides is what
 * reads as a car steering itself twenty times a second — the blip's rotation,
 * and, through the right vector its lateral offset is projected onto, its
 * side-to-side position as well.
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

  const headings = smoothedHeadings(trackPathPoints, totalLength);
  const last = trackPathPoints.length - 1;
  const index = Math.floor(floatIndex);
  const amount = floatIndex - index;
  const here = headings[index];
  if (Number.isNaN(here)) return null;
  const next = headings[Math.min(last, index + 1)];
  if (Number.isNaN(next) || amount === 0) return here;

  // Shortest way round, so a heading either side of ±pi does not swing the
  // long way through the opposite direction.
  const delta = Math.atan2(Math.sin(next - here), Math.cos(next - here));
  return here + delta * amount;
};
