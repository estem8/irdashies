import { useMemo, useRef } from 'react';
import type { TireForce } from '@irdashies/types';

/** Samples kept: a few seconds at the rate the tires snapshot changes. */
const TRAIL_LENGTH = 40;

/**
 * The last few accelerations, oldest first. A sample is added each time the
 * acceleration changes; nothing is kept while it is off.
 */
export const useForceTrail = (
  g: TireForce | undefined,
  enabled: boolean
): readonly TireForce[] => {
  const samples = useRef<TireForce[]>([]);
  return useMemo(() => {
    if (!enabled || !g) {
      samples.current = [];
      return samples.current;
    }
    samples.current = [...samples.current, g].slice(-TRAIL_LENGTH);
    return samples.current;
  }, [g, enabled]);
};
