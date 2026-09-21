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
