import { describe, expect, it } from 'vitest';
import { CarLeftRight } from '@irdashies/types';
import {
  assignOverlapSides,
  overlapFromCarLeftRight,
  type OverlapSide,
} from './overlapSides';

describe('assignOverlapSides', () => {
  const blips = (...along: number[]) =>
    along.map((alongM, index) => ({ carIdx: index + 1, alongM }));
  const none = new Map<number, OverlapSide>();

  it('puts the only car abreast on the side the sim reports', () => {
    const left = assignOverlapSides({
      blips: blips(0.4),
      overlap: { left: 1, right: 0 },
      vehicleLength: 4.5,
      previous: none,
    });
    expect(left.get(1)).toBe(-1);

    const right = assignOverlapSides({
      blips: blips(0.4),
      overlap: { left: 0, right: 1 },
      vehicleLength: 4.5,
      previous: none,
    });
    expect(right.get(1)).toBe(1);
  });

  it('assigns the nearer car first when several are abreast', () => {
    const sides = assignOverlapSides({
      blips: blips(7, 0.5),
      overlap: { left: 1, right: 0 },
      vehicleLength: 4.5,
      previous: none,
    });

    // carIdx 2 is the nearer of the two, so it takes the reported slot.
    expect(sides.get(2)).toBe(-1);
    expect(sides.has(1)).toBe(false);
  });

  it('puts two cars on the same side when the sim reports two', () => {
    const sides = assignOverlapSides({
      blips: blips(-0.5, 0.5),
      overlap: { left: 2, right: 0 },
      vehicleLength: 4.5,
      previous: none,
    });

    expect(sides.get(1)).toBe(-1);
    expect(sides.get(2)).toBe(-1);
  });

  it('separates a car on each side', () => {
    const sides = assignOverlapSides({
      blips: blips(-0.5, 0.5),
      overlap: { left: 1, right: 1 },
      vehicleLength: 4.5,
      previous: none,
    });

    expect([...sides.values()].sort()).toEqual([-1, 1]);
  });

  it('keeps the side a car already had when the verdict flickers to clear', () => {
    const held = new Map<number, OverlapSide>([[1, -1]]);
    const sides = assignOverlapSides({
      blips: blips(-0.5),
      overlap: { left: 0, right: 0 },
      vehicleLength: 4.5,
      previous: held,
    });

    expect(sides.get(1)).toBe(-1);
  });

  it('does not let a car beyond the alongside window consume a fresh slot', () => {
    const held = new Map<number, OverlapSide>([[1, -1]]);
    const sides = assignOverlapSides({
      blips: blips(12, 0.4),
      overlap: { left: 1, right: 0 },
      vehicleLength: 4.5,
      previous: held,
    });

    // The old side remains available for the offset ramp, but the reported slot
    // belongs to the car the sim is describing now.
    expect(sides.get(1)).toBe(-1);
    expect(sides.get(2)).toBe(-1);
  });

  it('drops a held side once the car is clear in either direction', () => {
    const held = new Map<number, OverlapSide>([[1, -1]]);
    const sides = assignOverlapSides({
      blips: blips(20),
      overlap: { left: 0, right: 0 },
      vehicleLength: 4.5,
      previous: held,
    });

    expect(sides.size).toBe(0);
  });

  it('claims no side when the sim reports no overlap', () => {
    const sides = assignOverlapSides({
      blips: blips(0.5),
      overlap: { left: 0, right: 0 },
      vehicleLength: 4.5,
      previous: none,
    });

    expect(sides.size).toBe(0);
  });

  it('does not give a far car a side even when slots are free', () => {
    const sides = assignOverlapSides({
      blips: blips(12),
      overlap: { left: 1, right: 0 },
      vehicleLength: 4.5,
      previous: none,
    });

    expect(sides.size).toBe(0);
  });
});

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
