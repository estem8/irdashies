/**
 * The two fades the radar has, both kept pure so the ramp maths is testable
 * without a canvas or a clock.
 */

/** Where a fade is heading: 1 fully on screen, 0 fully off. */
export type FadeTarget = 0 | 1;

/**
 * One step of a linear opacity ramp.
 *
 * @param current Opacity now, 0..1.
 * @param target Where it is heading.
 * @param dtSeconds Time since the last step.
 * @param fadeSeconds How long a full 0-to-1 ramp takes. 0 means no ramp.
 */
export const advanceFade = (
  current: number,
  target: FadeTarget,
  dtSeconds: number,
  fadeSeconds: number
): number => {
  if (fadeSeconds <= 0) return target;
  const step = Math.max(0, dtSeconds) / fadeSeconds;
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return current;
};

/**
 * How opaque a car at `distanceM` from the player should be, given a fade band
 * at the outer edge of the range.
 *
 * A car is solid once it is inside the band and fades to nothing as it reaches
 * the range itself, so cars enter and leave the view gradually instead of
 * appearing out of nothing on a ring. `fadeBandM` of 0 means no band and
 * every car is solid.
 */
export const carFadeAt = (
  distanceM: number,
  radarRange: number,
  fadeBandM: number
): number => {
  if (fadeBandM <= 0) return 1;
  if (!Number.isFinite(distanceM)) return 0;
  const band = Math.min(fadeBandM, radarRange);
  const opacity = (radarRange - distanceM) / band;
  return Math.min(1, Math.max(0, opacity));
};
