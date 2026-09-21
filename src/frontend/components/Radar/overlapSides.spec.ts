import { describe, expect, it } from 'vitest';
import { CarLeftRight } from '@irdashies/types';
import { overlapFromCarLeftRight } from './overlapSides';

describe('overlapFromCarLeftRight', () => {
  it.each([
    [CarLeftRight.Off, 0, 0],
    [CarLeftRight.Clear, 0, 0],
    [CarLeftRight.CarLeft, 1, 0],
    [CarLeftRight.CarRight, 0, 1],
    [CarLeftRight.CarLeftRight, 1, 1],
    [CarLeftRight.Cars2Left, 2, 0],
    [CarLeftRight.Cars2Right, 0, 2],
  ])('maps state %i to %i cars left and %i right', (state, left, right) => {
    expect(overlapFromCarLeftRight(state)).toEqual({ left, right });
  });

  it('treats an unknown state as no overlap rather than a side', () => {
    expect(overlapFromCarLeftRight(99)).toEqual({ left: 0, right: 0 });
  });
});
