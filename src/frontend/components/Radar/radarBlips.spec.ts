import { describe, expect, it } from 'vitest';
import type { TrackDrawing } from '@irdashies/domain/trackGeometry';
import {
  blipLabel,
  computeRadarBlips,
  type RadarBlipInput,
  type RadarTargetState,
} from './radarBlips';
import {
  NO_OVERLAP,
  type OverlapSide,
  type RadarOverlap,
} from './overlapSides';

const EDGE_STEP = 20;
const RECT_WIDTH = 400;
const RECT_HEIGHT = 200;
const TRACK_LENGTH_M = 1200;

/** The overlay's own numbers: engage at 7 m, clear at 10 m, red at 1.5 m. */
const THRESHOLDS = { nearbyRange: 7, clearRange: 10, criticalRange: 1.5 };

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
  onPitRoad: boolean[] = positions.map(() => false),
  laps: number[] = positions.map(() => 1)
) => ({
  carIdxLapDistPct: positions,
  carIdxLap: laps,
  carIdxOnPitRoad: onPitRoad,
});

const baseInput: Omit<
  RadarBlipInput,
  'carIdxLapDistPct' | 'carIdxOnPitRoad' | 'carIdxLap'
> = {
  playerCarIdx: 0,
  // Every fixture below runs as a race, so a lap counter difference means a
  // lapping car. The practice case is covered on its own.
  isRace: true,
  trackDrawing: trackDrawing(),
  trackLengthM: TRACK_LENGTH_M,
  radarRange: 15,
  hideInPit: false,
  overlap: NO_OVERLAP,
  vehicleWidth: 2,
  vehicleLength: 4.5,
  thresholds: THRESHOLDS,
  fadeBandM: 3,
  carNumbers: new Map([
    [1, '24'],
    [2, '7'],
  ]),
  paceCarIdx: null,
  previousTargets: new Map<number, RadarTargetState>(),
};

const withTargets = (targets: [number, RadarTargetState][]) =>
  new Map<number, RadarTargetState>(targets);
const held = (side: OverlapSide | null, engaged = true): RadarTargetState => ({
  side,
  engaged,
  alongSign: 0,
});

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
    expect(result.blips[0].gapM).toBeCloseTo(12, 6);
    expect(result.blips[0].relYaw).toBeCloseTo(0, 6);
    // Beyond the engage range, so tracked as far.
    expect(result.blips[0].level).toBe('far');
  });

  it('signs cars behind the player as negative along-track metres', () => {
    const result = computeRadarBlips({
      ...baseInput,
      ...positionsOf([pctOfArc(300), pctOfArc(288)]),
    });

    expect(result.blips[0].alongM).toBeCloseTo(-12, 6);
    expect(result.blips[0].gapM).toBeCloseTo(12, 6);
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

  it('glides a blip round a curve instead of stepping its heading and offset', () => {
    // A circle, so the only thing that can make a step is the geometry lookup.
    // Both cars move — the player is what the offset is projected against, and
    // its heading is quantised by the path spacing just as the rival's is.
    // Written as the drawings are, a closed walk whose last point repeats the
    // first, with about three metres between points like a real track.
    const points = 200;
    const radius = 100;
    const circumference = 2 * Math.PI * radius;
    const ring = Array.from({ length: points }, (_, i) => {
      const angle = (2 * Math.PI * i) / points;
      return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
    });
    const circle = [...ring, ring[0]];
    const drawing: TrackDrawing = {
      active: {
        inside: '',
        outside: '',
        trackPathPoints: circle,
        totalLength: circumference,
      },
      startFinish: { point: { length: 0 }, direction: 'anticlockwise' },
    };
    const gapM = 12;
    const stepM = 0.9; // what a 25 Hz snapshot covers at about 80 km/h

    let targets: ReadonlyMap<number, RadarTargetState> = new Map();
    let previousRelYaw: number | null = null;
    let previousLateral: number | null = null;
    let worstYaw = 0;
    let worstLateral = 0;
    for (let step = 0; step < 2000; step += 1) {
      const playerArc = 900 + step * stepM;
      const result = computeRadarBlips({
        ...baseInput,
        trackDrawing: drawing,
        trackLengthM: circumference,
        radarRange: 40,
        previousTargets: targets,
        carIdxLapDistPct: [
          playerArc / circumference,
          (playerArc + gapM) / circumference,
        ],
        carIdxLap: [1, 1],
        carIdxOnPitRoad: [false, false],
      });
      targets = result.targets;
      const blip = result.blips[0];
      if (!blip) throw new Error('the rival left the radar');
      if (previousRelYaw !== null) {
        worstYaw = Math.max(
          worstYaw,
          Math.abs(
            Math.atan2(
              Math.sin(blip.relYaw - previousRelYaw),
              Math.cos(blip.relYaw - previousRelYaw)
            )
          )
        );
      }
      if (previousLateral !== null) {
        worstLateral = Math.max(
          worstLateral,
          Math.abs(blip.lateralM - previousLateral)
        );
      }
      previousRelYaw = blip.relYaw;
      previousLateral = blip.lateralM;
    }

    // A path point here is a 1.8-degree step of the road. Following the road
    // moves the heading by about half a degree per snapshot; snapping to the
    // nearest point moves it by the whole 1.8 degrees, and swings the offset
    // the same way, which is what a driver sees as a car twitching sideways.
    expect(worstYaw).toBeLessThan(0.006);
    expect(worstLateral).toBeLessThan(0.05);
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

  it('colours by proximity: far, nearby, then critical inside the range', () => {
    const levels = (gap: number) =>
      computeRadarBlips({
        ...baseInput,
        carNumbers: new Map([[1, '24']]),
        ...positionsOf([pctOfArc(300), pctOfArc(300 + gap)]),
      }).blips[0].level;

    expect(levels(12)).toBe('far');
    expect(levels(6.9)).toBe('nearby');
    expect(levels(3)).toBe('nearby');
    expect(levels(1.4)).toBe('critical');

    // The gap is rebuilt from lap fractions, so a threshold lands within a few
    // centimetres of where the ring is drawn; it must still engage at 7 m.
    const atRing = computeRadarBlips({
      ...baseInput,
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(307)]),
    }).blips[0].gapM;
    expect(atRing).toBeGreaterThan(7);
    expect(atRing).toBeLessThan(7.1);
  });

  it('carries the car number and the pit-road flag for the label', () => {
    const result = computeRadarBlips({
      ...baseInput,
      ...positionsOf([pctOfArc(300), pctOfArc(304)], [false, true]),
    });

    expect(result.blips[0].carNumber).toBe('24');
    expect(result.blips[0].inPit).toBe(true);
    expect(result.blips[0].side).toBeNull();
  });

  it('reports no number for a car the session has none for', () => {
    const result = computeRadarBlips({
      ...baseInput,
      carNumbers: new Map(),
      ...positionsOf([pctOfArc(300), pctOfArc(304)]),
    });

    expect(result.blips[0].carNumber).toBeNull();
  });

  it('hides cars on pit road only when asked to', () => {
    const withPitCar = positionsOf(
      [pctOfArc(300), pctOfArc(304)],
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
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(300)]),
    });

    expect(result.blips).toHaveLength(1);
    expect(result.blips[0].gapM).toBeCloseTo(0, 6);
    // Level with the player, so the side offset is at full reach.
    expect(result.blips[0].lateralM).toBeCloseTo(-2 * 1.1, 6);
    expect(result.blips[0].side).toBe(-1);
    // Alongside is critical on its own, whatever the gap says.
    expect(result.blips[0].level).toBe('critical');
  });

  it('holds the offset across the overlap window and fades it in the tail', () => {
    const run = (
      gap: number,
      previousTargets = new Map<number, RadarTargetState>(),
      overlap: RadarOverlap = { left: 1, right: 0 }
    ) =>
      computeRadarBlips({
        ...baseInput,
        overlap,
        previousTargets,
        carNumbers: new Map([[1, '24']]),
        ...positionsOf([pctOfArc(300), pctOfArc(300 + gap)]),
      });

    // 4.5 m car: full reach anywhere inside the 9 m window.
    const full = 2 * 1.1;
    expect(run(0.1).blips[0].lateralM).toBeCloseTo(-full, 6);
    expect(run(4).blips[0].lateralM).toBeCloseTo(-full, 6);

    // A car 11 m back that was never alongside gets no side at all.
    expect(run(11).blips[0].lateralM).toBeCloseTo(0, 6);

    // But one that *was* alongside keeps a fading side on the way out.
    const heldTargets = withTargets([[1, held(-1)]]);
    const tail = run(11, heldTargets, NO_OVERLAP).blips[0].lateralM;
    expect(tail).toBeLessThan(0);
    expect(Math.abs(tail)).toBeLessThan(full);
  });

  it('leaves a car outside the abreast window on the road projection', () => {
    const result = computeRadarBlips({
      ...baseInput,
      overlap: { left: 1, right: 0 },
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(310)]),
    });

    expect(result.blips[0].lateralM).toBeCloseTo(0, 6);
    expect(result.blips[0].side).toBeNull();
  });

  it('marks a level car the sim did not call as beside us with an unknown side', () => {
    // Two cars cannot share a point of the road, so a rival level with the
    // player is beside them whether or not the sim's verdict arrived. Measured
    // on a recorded race, the verdict is silent for about half the overtakes
    // and for every overtake of a player off the racing surface.
    const level = (gap: number) =>
      computeRadarBlips({
        ...baseInput,
        overlap: NO_OVERLAP,
        carNumbers: new Map([[1, '24']]),
        ...positionsOf([pctOfArc(300), pctOfArc(300 + gap)]),
      }).blips[0];

    // Half a car length either way: beside us, side unknown.
    const abreast = level(0.2);
    expect(abreast.side).toBeNull();
    expect(abreast.sideUnknown).toBe(true);
    expect(abreast.lateralM).toBeCloseTo(0, 6);

    const justInside = level(2.2);
    expect(justInside.sideUnknown).toBe(true);

    // A car with room to be in its own lane ahead is not beside us.
    expect(level(2.5).sideUnknown).toBe(false);
    expect(level(6).sideUnknown).toBe(false);
  });

  it('does not mark a level car whose side the sim reported', () => {
    const result = computeRadarBlips({
      ...baseInput,
      overlap: { left: 1, right: 0 },
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(300)]),
    });

    expect(result.blips[0].side).toBe(-1);
    expect(result.blips[0].sideUnknown).toBe(false);
  });

  it('does not flicker a car that keeps a side after it has driven away', () => {
    // A car the sim reported alongside keeps its side for three car lengths
    // after the verdict stops, so it is drawn beside the player rather than
    // snapping onto their rectangle. Between the release range and the end of
    // that retention the side must not count as an abutment: if it does, the
    // car re-engages on the tick after the hysteresis released it and the
    // colour alternates every frame while the car does nothing but drive away.
    // Measured on a recorded race, this alternation was 942 of that race's
    // 1134 colour changes.
    let targets: ReadonlyMap<number, RadarTargetState> = withTargets([
      [1, held(-1)],
    ]);
    const levels: string[] = [];
    let gap = 8;
    for (let tick = 0; tick < 60; tick += 1) {
      // Pulling away at about 1.5 m/s, sampled at 25 Hz.
      gap += 0.06;
      const result = computeRadarBlips({
        ...baseInput,
        overlap: NO_OVERLAP,
        carNumbers: new Map([[1, '24']]),
        thresholds: THRESHOLDS,
        previousTargets: targets,
        ...positionsOf([pctOfArc(300), pctOfArc(300 + gap)]),
      });
      targets = result.targets;
      levels.push(result.blips[0].level);
    }

    const changes = levels.filter(
      (level, index) => index > 0 && level !== levels[index - 1]
    ).length;
    // One crossing of the release range, and nothing after it.
    expect(changes).toBeLessThanOrEqual(1);
    expect(levels.some((level) => level === 'nearby')).toBe(true);
    expect(levels[levels.length - 1]).toBe('far');
  });

  it('fades a car in over the outer band of the range', () => {
    const fadeAt = (gap: number) =>
      computeRadarBlips({
        ...baseInput,
        carNumbers: new Map([[1, '24']]),
        ...positionsOf([pctOfArc(300), pctOfArc(300 + gap)]),
      }).blips[0].fade;

    // Range 15 with a 3 m band: solid from 12 m in, nothing at the range.
    expect(fadeAt(2)).toBe(1);
    // The band edge is a floating-point boundary, so it is asserted closely.
    expect(fadeAt(12)).toBeCloseTo(1, 6);
    expect(fadeAt(13.5)).toBeCloseTo(0.5, 2);
    expect(fadeAt(14.9)).toBeLessThan(0.1);
  });

  it('does not dim a car that is already alongside', () => {
    // Its along-track gap is tiny but its distance in the plane the radar draws
    // is the sideways offset, which is well inside the band.
    const result = computeRadarBlips({
      ...baseInput,
      overlap: { left: 1, right: 0 },
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(300)]),
    });

    expect(result.blips[0].fade).toBe(1);
  });

  it('draws every car at full strength when the band is switched off', () => {
    const result = computeRadarBlips({
      ...baseInput,
      fadeBandM: 0,
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(314.9)]),
    });

    expect(result.blips[0].fade).toBe(1);
  });

  it('hands the per-car state back so the next frame can hold it', () => {
    const first = computeRadarBlips({
      ...baseInput,
      overlap: { left: 1, right: 0 },
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(300.2)]),
    });
    expect(first.targets.get(1)).toEqual({
      side: -1,
      engaged: true,
      alongSign: 1,
    });

    // The verdict drops to clear, but the car is still alongside: it keeps the
    // side it was given rather than snapping back onto the player.
    const second = computeRadarBlips({
      ...baseInput,
      overlap: NO_OVERLAP,
      previousTargets: first.targets,
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(300.3)]),
    });

    expect(second.blips[0].lateralM).toBeLessThan(0);
    expect(second.targets.get(1)?.side).toBe(-1);
  });

  it('keeps an engaged car engaged past the engage range', () => {
    // Between the two thresholds, a tracked car stays amber and a fresh one is
    // ignored — that gap is the whole reason the thresholds differ.
    const between = 8;
    const fresh = computeRadarBlips({
      ...baseInput,
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(300 + between)]),
    });
    expect(fresh.blips[0].level).toBe('far');

    const tracked = computeRadarBlips({
      ...baseInput,
      carNumbers: new Map([[1, '24']]),
      previousTargets: withTargets([[1, held(null)]]),
      ...positionsOf([pctOfArc(300), pctOfArc(300 + between)]),
    });
    expect(tracked.blips[0].level).toBe('nearby');
    expect(tracked.targets.get(1)?.engaged).toBe(true);
  });

  it('does not track a car that has left the release range', () => {
    const result = computeRadarBlips({
      ...baseInput,
      previousTargets: withTargets([[1, held(null)]]),
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(311)]),
    });

    expect(result.blips[0].level).toBe('far');
    expect(result.targets.get(1)?.engaged).toBe(false);
  });

  it('holds an alongside car on its drawn side through measured jitter', () => {
    // Real recorded gaps in metres for a car abreast of the player: the two
    // independently-updated lap fractions oscillate about the player's and
    // flip the sign frame to frame without the latch.
    const jitter = [0.232, -0.116, 0.174, -0.348, 0.29, -0.406];
    let targets: ReadonlyMap<number, RadarTargetState> = new Map();
    const signs: number[] = [];
    for (const gapM of jitter) {
      const result = computeRadarBlips({
        ...baseInput,
        overlap: { left: 1, right: 0 },
        previousTargets: targets,
        carNumbers: new Map([[1, '24']]),
        ...positionsOf([pctOfArc(300), pctOfArc(300 + gapM * Math.sign(gapM))]),
      });
      expect(result.blips).toHaveLength(1);
      signs.push(Math.sign(result.blips[0].alongM));
      targets = result.targets;
    }
    expect(new Set(signs).size).toBe(1);
  });

  it('lets a real pass cross between behind and ahead', () => {
    const pass = [-3, -2.2, -1.4, -0.6, 0.6, 1.4, 2.2, 3];
    const targets = new Map<number, RadarTargetState>();
    const signs: number[] = [];
    let crossings = 0;
    for (let i = 0; i < pass.length; i++) {
      const result = computeRadarBlips({
        ...baseInput,
        previousTargets: targets,
        carNumbers: new Map([[1, '24']]),
        ...positionsOf([pctOfArc(300), pctOfArc(300 + pass[i])]),
      });
      signs.push(Math.sign(result.blips[0].alongM));
      if (i > 0 && signs[i] !== signs[i - 1]) crossings++;
    }
    expect(crossings).toBe(1);
    expect(signs[3]).toBe(-1);
    expect(signs[7]).toBe(1);
    expect(signs).toEqual([-1, -1, -1, -1, 1, 1, 1, 1]);
  });

  it('keeps the geometric sign for a car entering with no history', () => {
    const result = computeRadarBlips({
      ...baseInput,
      previousTargets: new Map<number, RadarTargetState>(),
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(300 + 0.4)]),
    });

    expect(result.blips[0].alongM).toBeCloseTo(0.4, 6);
    expect(result.targets.get(1)?.alongSign).toBe(1);
  });

  it('flags only the pace car with the pace tag', () => {
    const result = computeRadarBlips({
      ...baseInput,
      paceCarIdx: 1,
      carNumbers: new Map([[1, '24']]),
      ...positionsOf([pctOfArc(300), pctOfArc(304)]),
    });

    expect(result.blips).toHaveLength(1);
    expect(result.blips[0].isPaceCar).toBe(true);
    expect(
      computeRadarBlips({
        ...baseInput,
        paceCarIdx: 7,
        carNumbers: new Map([[1, '24']]),
        ...positionsOf([pctOfArc(300), pctOfArc(304)]),
      }).blips[0].isPaceCar
    ).toBe(false);
  });
  it('labels the pace car with the fixed tag, not its number', () => {
    expect(blipLabel({ carNumber: '0', isPaceCar: true }, true)).toBe('PACE');
    expect(blipLabel({ carNumber: '24', isPaceCar: false }, true)).toBe('24');
    expect(blipLabel({ carNumber: '0', isPaceCar: true }, false)).toBeNull();
    expect(blipLabel({ carNumber: '24', isPaceCar: false }, false)).toBeNull();
  });
});
