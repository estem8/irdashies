import { describe, expect, it } from 'vitest';
import { progressToTrackPoint, tangentAngleAt } from './trackGeometry';

/**
 * A 400x200 rectangle walked every 20 units: 20 points along the top edge, 10
 * down the right, 20 back along the bottom, 10 up the left. Consecutive points
 * are always 20 units apart, so with TOTAL = 1200 arc length is 20 * index and
 * lap fraction maps onto the path linearly — which makes every expected value
 * below computable by hand from the corner positions.
 */
const rectangle = () => {
  const points: { x: number; y: number }[] = [];
  for (let x = 0; x <= 400; x += 20) points.push({ x, y: 0 });
  for (let y = 20; y <= 200; y += 20) points.push({ x: 400, y });
  for (let x = 380; x >= 0; x -= 20) points.push({ x, y: 200 });
  for (let y = 180; y >= 0; y -= 20) points.push({ x: 0, y });
  return points;
};

const TOTAL = 1200;
const SF = 0;
/** Lap fraction for an arc length, given the uniform spacing above. */
const pctOfArc = (arc: number) => arc / TOTAL;

describe('progressToTrackPoint', () => {
  it('interpolates between path points in place', () => {
    const output = { x: -1, y: -1 };
    progressToTrackPoint(0.5, rectangle(), TOTAL, SF, 'anticlockwise', output);

    // Arc 600 is the far corner: path index 30 of 60.
    expect(output).toEqual({ x: 400, y: 200 });
  });

  it('writes into the caller-supplied object rather than allocating', () => {
    const output = { x: 0, y: 0 };
    const result = progressToTrackPoint(
      0.25,
      rectangle(),
      TOTAL,
      SF,
      'anticlockwise',
      output
    );

    expect(result).toBeUndefined();
    // Arc 300 is 300 units along the top edge.
    expect(output).toEqual({ x: 300, y: 0 });
  });

  it('interpolates between the two points that straddle the fraction', () => {
    const output = { x: 0, y: 0 };
    // Arc 310 sits a tenth of the way from index 15 to index 16.
    progressToTrackPoint(
      pctOfArc(310),
      rectangle(),
      TOTAL,
      SF,
      'anticlockwise',
      output
    );

    expect(output.x).toBeCloseTo(310, 9);
    expect(output.y).toBeCloseTo(0, 9);
  });
});

describe('tangentAngleAt', () => {
  it('reports the heading of the straight the car is on', () => {
    // Along the top edge the path runs in +x.
    expect(
      tangentAngleAt(pctOfArc(300), rectangle(), TOTAL, SF, 'anticlockwise')
    ).toBeCloseTo(0, 9);
  });

  it('turns the heading by a quarter turn on the following straight', () => {
    // Arc 500 is on the right-hand edge, where the path runs in +y.
    expect(
      tangentAngleAt(pctOfArc(500), rectangle(), TOTAL, SF, 'anticlockwise')
    ).toBeCloseTo(Math.PI / 2, 9);
  });

  it('holds one heading across a vertex instead of jumping between segments', () => {
    // The corner at arc 400: sampling a metre either side rounds to the same
    // path index, so a car straddling the vertex does not flip its heading.
    const before = tangentAngleAt(
      pctOfArc(399),
      rectangle(),
      TOTAL,
      SF,
      'anticlockwise'
    );
    const at = tangentAngleAt(
      pctOfArc(400),
      rectangle(),
      TOTAL,
      SF,
      'anticlockwise'
    );
    const after = tangentAngleAt(
      pctOfArc(401),
      rectangle(),
      TOTAL,
      SF,
      'anticlockwise'
    );

    expect(before).toBeCloseTo(Math.PI / 4, 9);
    expect(at).toBe(before);
    expect(after).toBe(before);
  });

  it('reflects the running direction of a clockwise track', () => {
    // The same lap fraction on a clockwise track is the mirror point on the
    // bottom edge, travelled the other way — a half turn from the heading at
    // the anticlockwise position.
    const anticlockwise = tangentAngleAt(
      pctOfArc(300),
      rectangle(),
      TOTAL,
      SF,
      'anticlockwise'
    );
    const clockwise = tangentAngleAt(
      pctOfArc(300),
      rectangle(),
      TOTAL,
      SF,
      'clockwise'
    );

    expect(clockwise).toBeCloseTo(Math.PI, 9);
    expect(
      Math.abs(
        Math.abs((clockwise as number) - (anticlockwise as number)) - Math.PI
      )
    ).toBeCloseTo(0, 9);
  });

  it('refuses to report a heading it cannot derive', () => {
    expect(tangentAngleAt(0.5, [], TOTAL, SF, 'anticlockwise')).toBeNull();
    // Two points make no tangent: there is no neighbour on the far side.
    expect(
      tangentAngleAt(
        0.5,
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        TOTAL,
        SF,
        'anticlockwise'
      )
    ).toBeNull();
    expect(tangentAngleAt(0.5, rectangle(), 0, SF, 'anticlockwise')).toBeNull();
  });

  it('returns null where the two neighbouring points coincide', () => {
    // A path whose samples sit on one spot has no direction there.
    const degenerate = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ];
    expect(
      tangentAngleAt(0.5, degenerate, TOTAL, SF, 'anticlockwise')
    ).toBeNull();
  });
});
