import type { TireCorner, TireSlipSnapshot } from '@irdashies/types';

export interface SlipEvent {
  label: string;
  color: string;
  /** 0 to 1. */
  level: number;
}

/**
 * What to light up on one tire's contact patch: the strongest slip that
 * applies to it. Spin, lock and traction control act on the driven rear
 * wheels; ABS on all four; a slide on the axle that is letting go.
 */
export const slipEvent = (
  slip: TireSlipSnapshot | undefined,
  corner: TireCorner
): SlipEvent | undefined => {
  if (!slip) return undefined;
  const rear = corner === 'lr' || corner === 'rr';
  const candidates: SlipEvent[] = [
    { label: 'ABS', color: '#ffb020', level: slip.abs ? 1 : 0 },
    ...(rear
      ? [
          { label: 'LOCK', color: '#ffb020', level: slip.lock },
          { label: 'SPIN', color: '#ff3b3b', level: slip.spin },
          { label: 'TC', color: '#d24bff', level: slip.tc },
          { label: 'SLIDE', color: '#3fd7ff', level: slip.over },
        ]
      : [{ label: 'SLIDE', color: '#3fd7ff', level: slip.under }]),
  ];
  const strongest = candidates.reduce((a, b) => (b.level > a.level ? b : a));
  return strongest.level > 0 ? strongest : undefined;
};
