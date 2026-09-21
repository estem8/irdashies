/**
 * Proximity scale the radar colours by, plus the hysteresis that keeps it
 * steady.
 *
 * A car is either beyond range, near enough to matter, or close enough to be
 * about to hit: `far`, `nearby`, `critical`. The thresholds that engage a car
 * and the ones that release it are deliberately different values, because a car
 * sitting exactly on a threshold would otherwise toggle every frame.
 */
export type ProximityLevel = 'far' | 'nearby' | 'critical';

export interface ProximityThresholds {
  /** Gap at which a car engages. */
  nearbyRange: number;
  /** Gap at which an engaged car releases; higher than `nearbyRange`. */
  clearRange: number;
  /** Gap at which a car turns critical. */
  criticalRange: number;
}

export interface ProximityVerdict {
  /** Whether the car is being tracked as a threat. */
  engaged: boolean;
  level: ProximityLevel;
}

/**
 * @param gapM Fore/aft gap in metres; the distance the radar is about.
 * @param alongside True when the sim reports this car directly beside us. It
 * engages a car on its own — the sim only reports overlap for a car it can see
 * beside us — but it does not by itself make the car critical.
 * @param wasEngaged Whether the previous frame had this car engaged.
 */
export const evaluateProximity = (
  gapM: number,
  alongside: boolean,
  wasEngaged: boolean,
  thresholds: ProximityThresholds
): ProximityVerdict => {
  if (!Number.isFinite(gapM)) return { engaged: false, level: 'far' };

  const engaged = wasEngaged
    ? gapM <= thresholds.clearRange
    : gapM <= thresholds.nearbyRange || alongside;

  if (!engaged) return { engaged: false, level: 'far' };

  // Critical is the gap alone, not the overlap verdict: recorded passes show
  // the sim reporting a car beside us across the whole overtake, out to five
  // metres of stagger, so treating every overlap as critical would turn the
  // radar red for most of a pass. A car actually level has a near-zero gap and
  // is critical by this rule anyway.
  const critical = gapM <= thresholds.criticalRange;
  return { engaged: true, level: critical ? 'critical' : 'nearby' };
};
