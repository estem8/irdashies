import { CarLeftRight } from '@irdashies/types';

/** Cars the sim reports alongside, per side. 2 means two abreast. */
export interface RadarOverlap {
  left: 0 | 1 | 2;
  right: 0 | 1 | 2;
}

export const NO_OVERLAP: RadarOverlap = { left: 0, right: 0 };

/**
 * Side-overlap verdict straight from the sim.
 *
 * The disc cannot answer this itself: cars are placed from lap distance, which
 * snaps both of a side-by-side pair onto the same point of the centreline, so
 * a geometric left/right test would be noise. `CarLeftRight` is the sim's own
 * answer, computed from the car positions it does not publish.
 */
export const overlapFromCarLeftRight = (state: number): RadarOverlap => {
  switch (state) {
    case CarLeftRight.CarLeft:
      return { left: 1, right: 0 };
    case CarLeftRight.CarRight:
      return { left: 0, right: 1 };
    case CarLeftRight.CarLeftRight:
      return { left: 1, right: 1 };
    case CarLeftRight.Cars2Left:
      return { left: 2, right: 0 };
    case CarLeftRight.Cars2Right:
      return { left: 0, right: 2 };
    default:
      return NO_OVERLAP;
  }
};

/** Which way of the player a car is drawn: -1 is their left, +1 their right. */
export type OverlapSide = -1 | 1;

export interface OverlapCandidate {
  carIdx: number;
  /** Metres along the track; positive is ahead of the player. */
  alongM: number;
}

/**
 * How far fore/aft a car still counts as alongside, in car lengths.
 *
 * `CarLeftRight` fires while two cars overlap longitudinally, and the sim
 * measures that against both cars' lengths — a recorded Interlagos pass has the
 * verdict at 4.6 m of stagger for 4.5 m cars, just past a single length. Two
 * lengths covers that without reaching cars that are clearly ahead or behind;
 * beyond it the offset has faded to nothing anyway.
 */
const ALONGSIDE_WINDOW_LENGTHS = 2;

/**
 * How far a car keeps a side it was already given, even once the sim's verdict
 * drops to Clear. `CarLeftRight` flickers through a pass, and without this the
 * car would snap back onto the player's own rectangle for those frames.
 */
const RETAIN_WINDOW_LENGTHS = 3;

export const alongsideWindowM = (vehicleLength: number): number =>
  Math.max(1, vehicleLength * ALONGSIDE_WINDOW_LENGTHS);

export const retainSideWindowM = (vehicleLength: number): number =>
  Math.max(1, vehicleLength * RETAIN_WINDOW_LENGTHS);

/**
 * Scratch for the contenders sort, and the comparator itself. Both are reused
 * across calls: this runs once per changed snapshot, so the filtered array and
 * the comparator closure it needs were two allocations per frame. The array is
 * only read inside this function and never handed out, and the function is
 * synchronous, so there is nothing to overlap with.
 */
const contenders: OverlapCandidate[] = [];
const byDistanceFromPlayer = (
  left: OverlapCandidate,
  right: OverlapCandidate
) => Math.abs(left.alongM) - Math.abs(right.alongM);
/**
 * Decides which side each alongside car is drawn on.
 *
 * The sim reports that *a* car is on the left, never which one, so cars are
 * matched to the reported slots nearest-first. With one car abreast — the
 * common case — that is unambiguous; with a car on each side the two are
 * simply put on opposite sides, and which is which is a coin toss.
 *
 * Sides already held are kept while the car stays near, so a flickering
 * verdict cannot make a car jump across the player mid-pass.
 */
export const assignOverlapSides = (input: {
  blips: readonly OverlapCandidate[];
  overlap: RadarOverlap;
  vehicleLength: number;
  /** Sides from the previous frame; the caller owns this across frames. */
  previous: ReadonlyMap<number, OverlapSide>;
}): Map<number, OverlapSide> => {
  const { blips, overlap, vehicleLength, previous } = input;
  const alongside = alongsideWindowM(vehicleLength);
  const retain = retainSideWindowM(vehicleLength);
  const sides = new Map<number, OverlapSide>();

  // Держим сторону, пока машина в retain-окне — независимо от текущего счёта.
  for (const blip of blips) {
    if (Math.abs(blip.alongM) > retain) continue;
    const held = previous.get(blip.carIdx);
    if (held !== undefined) sides.set(blip.carIdx, held);
  }

  // Слоты раздаются по близости всем машинам в "живом" окне — старым и новым.
  contenders.length = 0;
  for (const blip of blips) {
    if (Math.abs(blip.alongM) <= alongside) contenders.push(blip);
  }
  contenders.sort(byDistanceFromPlayer);

  let freeLeft = overlap.left;
  let freeRight = overlap.right;
  for (const blip of contenders) {
    const held = previous.get(blip.carIdx);
    if (held === -1) {
      if (freeLeft > 0) freeLeft -= 1;
    } else if (held === 1) {
      if (freeRight > 0) freeRight -= 1;
    } else if (freeLeft > 0) {
      sides.set(blip.carIdx, -1);
      freeLeft -= 1;
    } else if (freeRight > 0) {
      sides.set(blip.carIdx, 1);
      freeRight -= 1;
    }
  }

  return sides;
};
