import { describe, expect, it } from 'vitest';
import type { TrackDrawing } from '@irdashies/domain/trackGeometry';
import { computeRadarBlips, type RadarBlipInput } from './radarBlips';
import {
  NO_OVERLAP,
  type OverlapSide,
  type RadarOverlap,
} from './overlapSides';

const EDGE_STEP = 20;
const RECT_WIDTH = 400;
const RECT_HEIGHT = 200;
const TRACK_LENGTH_M = 1200;

/**
 * A closed 400x200 rectangle walked every 20 units, so path arc length equals
 * metres with TRACK_LENGTH_M = perimeter. Point at index i sits at arc 20i.
 */
const rectanglePath = () => {
  const points: { x: number; y: number }[] = [];
  for (let x = 0; x <= RECT_WIDTH; x += EDGE_STEP) points.push({ x, y: 0 });
  for (let y = EDGE_STEP; y <= RECT_HEIGHT; y += EDGE_STEP)
    points.push({ x: RECT_WIDTH, y });
  for (let x = RECT_WIDTH - EDGE_STEP; x >= 0; x -= EDGE_STEP)
    points.push({ x, y: RECT_HEIGHT });
  for (let y = RECT_HEIGHT - EDGE_STEP; y >= 0; y -= EDGE_STEP)
    points.push({ x: 0, y });
  return points;
};

const trackDrawing = (
  direction: 'clockwise' | 'anticlockwise' = 'anticlockwise'
): TrackDrawing => ({
  active: {
    inside: '',
    outside: '',
    trackPathPoints: rectanglePath(),
    totalLength: 1200,
  },
  startFinish: {
    point: { length: 0 },
    direction,
  },
});

/** Lap fraction for a distance along the rectangle, in metres. */
const pctOfArc = (arcMetres: number) => arcMetres / TRACK_LENGTH_M;

const positionsOf = (
  positions: number[],
  laps: number[] = [5, 5],
  onPitRoad: boolean[] = positions.map(() => false)
) => ({
  carIdxLapDistPct: positions,
  carIdxLap: laps,
  carIdxOnPitRoad: onPitRoad,
});

const baseInput: Omit<
  RadarBlipInput,
  'carIdxLapDistPct' | 'carIdxLap' | 'carIdxOnPitRoad'
> = {
  playerCarIdx: 0,
  trackDrawing: trackDrawing(),
  trackLengthM: TRACK_LENGTH_M,
  radarRange: 15,
  hideInPit: false,
  overlap: NO_OVERLAP,
  vehicleWidth: 2,
  vehicleLength: 4.5,
  previousSides: new Map<number, OverlapSide>(),
};

describe('computeRadarBlips', () => {
  it('measures a car ahead on the same straight as along-track metres', () => {
    const result = computeRadarBlips({
      ...baseInput,
      ...positionsOf([pctOfArc(300), pctOfArc(312)]),
    });

    expect(result.hasGeometry).toBe(true);
    expect(result.playerOnRoad).toBe(true);
    expect(result.blips).toHaveLength(1);
    expect(result.blips[0].carIdx).toBe(1);
    expect(result.blips[0].alongM).toBeCloseTo(12, 6);
    expect(result.blips[0].lateralM).toBeCloseTo(0, 6);
    expect(result.blips[0].color).toBe('sameLap');
    expect(result.blips[0].relYaw).toBeCloseTo(0, 6);
  });

  it('signs cars behind the player as negative along-track metres', () => {
    const result = computeRadarBlips({
      ...baseInput,
      ...positionsOf([pctOfArc(300), pctOfArc(288)]),
    });

    expect(result.blips[0].alongM).toBeCloseTo(-12, 6);
  });

  it('wraps a car across the start/finish line to a small gap', () => {
    const result = computeRadarBlips({
      ...baseInput,
      ...positionsOf([pctOfArc(1196), pctOfArc(6)]),
    });

    expect(result.blips[0].alongM).toBeCloseTo(10, 6);
  });

  it('bends blips off the axis by road curvature, and turns them with it', () => {
    // Player 100 m before the corner heading +x; the rival is 40 m into the
    // 90-degree right-hand turn that follows, so it reads right and rotated.
    const result = computeRadarBlips({
      ...baseInput,
      radarRange: 200,
      ...positionsOf([pctOfArc(300), pctOfArc(440)]),
    });

    expect(result.blips[0].alongM).toBeCloseTo(140, 6);
    expect(result.blips[0].lateralM).toBeCloseTo(40, 6);
    expect(result.blips[0].relYaw).toBeCloseTo(Math.PI / 2, 6);
  });

  it('mirrors the lateral sign on a clockwise track', () => {
    // A clockwise track runs the path index order backwards, so lap fraction
    // 0.25 is the point 300 m *before* the finish, and the rival 340 m ahead
    // of it on the road sits at index arc 560.
    const result = computeRadarBlips({
      ...baseInput,
      trackDrawing: trackDrawing('clockwise'),
      radarRange: 400,
      ...positionsOf([300 / TRACK_LENGTH_M, (1200 - 560) / TRACK_LENGTH_M]),
    });

    expect(result.blips[0].alongM).toBeCloseTo(340, 6);
    expect(result.blips[0].lateralM).toBeLessThan(0);
    expect(result.blips[0].relYaw).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('drops cars beyond the radar range', () => {
    const result = computeRadarBlips({
      ...baseInput,
      ...positionsOf([pctOfArc(300), pctOfArc(316)]),
    });

    expect(result.blips).toHaveLength(0);
  });

  it('colours by lapped state and by pit road', () => {
    const result = computeRadarBlips({
      ...baseInput,
      ...positionsOf(
        [pctOfArc(300), pctOfArc(302), pctOfArc(304), pctOfArc(306)],
        [5, 6, 4, 5],
        [false, false, false, true]
      ),
    });

    expect(result.blips.map((blip) => blip.color)).toEqual([
      'lapsAhead',
      'lapsBehind',
      'inPit',
    ]);
  });

  it('hides cars on pit road only when asked to', () => {
    const withPitCar = positionsOf(
      [pctOfArc(300), pctOfArc(304)],
      [5, 5],
      [false, true]
    );

    expect(
      computeRadarBlips({ ...baseInput, ...withPitCar }).blips
    ).toHaveLength(1);
    expect(
      computeRadarBlips({ ...baseInput, ...withPitCar, hideInPit: true }).blips
    ).toHaveLength(0);
  });

  it('ignores cars the sim has not placed yet', () => {
    const result = computeRadarBlips({
      ...baseInput,
      ...positionsOf([pctOfArc(300), -1]),
    });

    expect(result.blips).toHaveLength(0);
  });

  it('reports missing centreline geometry instead of guessing placements', () => {
    const result = computeRadarBlips({
      ...baseInput,
      trackDrawing: undefined,
      ...positionsOf([pctOfArc(300), pctOfArc(302)]),
    });

    expect(result).toMatchObject({ hasGeometry: false, blips: [] });
  });

  it('reports an unusable player position without emitting blips', () => {
    const result = computeRadarBlips({
      ...baseInput,
      ...positionsOf([-1, pctOfArc(302)]),
    });

    expect(result).toMatchObject({ hasGeometry: true, playerOnRoad: false });
    expect(result.blips).toHaveLength(0);
  });

  it('draws a car the sim reports abreast to the side, not on the player', () => {
    // Without the side verdict this car projects onto the player's own point of
    // the centreline and is drawn on top of them — the "cars pass through me"
    // case. The sim's verdict is the only thing that knows which side it is on.
    const result = computeRadarBlips({
      ...baseInput,
      overlap: { left: 1, right: 0 },
      ...positionsOf([pctOfArc(300), pctOfArc(300)]),
    });

    expect(result.blips).toHaveLength(1);
    expect(result.blips[0].alongM).toBeCloseTo(0, 6);
    // Level with the player, so the side offset is at full reach.
    expect(result.blips[0].lateralM).toBeCloseTo(-2 * 1.1, 6);
    expect(result.sides.get(1)).toBe(-1);
  });

  it('holds the offset across the overlap window and fades it in the tail', () => {
    const run = (
      alongM: number,
      previousSides?: ReadonlyMap<number, OverlapSide>,
      overlap: RadarOverlap = { left: 1, right: 0 }
    ) =>
      computeRadarBlips({
        ...baseInput,
        overlap,
        previousSides: previousSides ?? new Map<number, OverlapSide>(),
        ...positionsOf([pctOfArc(300), pctOfArc(300 + alongM)]),
      });

    // 4.5 m car: full reach anywhere inside the 9 m window.
    const full = 2 * 1.1;
    expect(run(0.1).blips[0].lateralM).toBeCloseTo(-full, 6);
    expect(run(4).blips[0].lateralM).toBeCloseTo(-full, 6);

    // A car 11 m back that was never alongside gets no side at all.
    expect(run(11).blips[0].lateralM).toBeCloseTo(0, 6);

    // But one that *was* alongside keeps a fading side on the way out.
    const held = run(4).sides;
    const tail = run(11, held, NO_OVERLAP).blips[0].lateralM;
    expect(tail).toBeLessThan(0);
    expect(Math.abs(tail)).toBeLessThan(full);
  });

  it('leaves a car outside the abreast window on the road projection', () => {
    const result = computeRadarBlips({
      ...baseInput,
      overlap: { left: 1, right: 0 },
      ...positionsOf([pctOfArc(300), pctOfArc(310)]),
    });

    expect(result.blips[0].lateralM).toBeCloseTo(0, 6);
    expect(result.sides.size).toBe(0);
  });

  it('hands the sides back so the next frame can hold them', () => {
    const first = computeRadarBlips({
      ...baseInput,
      overlap: { left: 1, right: 0 },
      ...positionsOf([pctOfArc(300), pctOfArc(300.2)]),
    });
    expect(first.sides.get(1)).toBe(-1);

    // The verdict drops to clear, but the car is still alongside: it keeps the
    // side it was given rather than snapping back onto the player.
    const second = computeRadarBlips({
      ...baseInput,
      overlap: NO_OVERLAP,
      previousSides: first.sides,
      ...positionsOf([pctOfArc(300), pctOfArc(300.3)]),
    });

    expect(second.blips[0].lateralM).toBeLessThan(0);
    expect(second.sides.get(1)).toBe(-1);
  });
});
