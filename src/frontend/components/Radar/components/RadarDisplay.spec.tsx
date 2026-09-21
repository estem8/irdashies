import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadarBlip } from '../radarBlips';
import { RadarDisplay, type RadarDisplayProps } from './RadarDisplay';

const blip = (over: Partial<RadarBlip> & { carIdx: number }): RadarBlip => ({
  alongM: 11,
  lateralM: 0.2,
  relYaw: 0,
  gapM: 11,
  level: 'far',
  side: null,
  sideUnknown: false,
  carNumber: '24',
  isPaceCar: false,
  lapping: false,
  inPit: false,
  fade: 1,
  ...over,
});

/**
 * Four rivals plus the player: a plain car well ahead, a car lapping the player
 * closing from behind, a critical car the sim named a side for, and a car level
 * with the player that the sim never called. None pulse, so every paint is at
 * full strength and colours can be read back exactly.
 */
const BLIPS: RadarBlip[] = [
  blip({ carIdx: 1 }),
  blip({
    carIdx: 2,
    alongM: -4,
    lateralM: 2.4,
    gapM: 4,
    level: 'nearby',
    carNumber: '7',
    lapping: true,
  }),
  blip({
    carIdx: 3,
    alongM: -1,
    lateralM: -2.1,
    gapM: 1,
    level: 'critical',
    carNumber: '51',
    lapping: true,
    side: -1,
  }),
  blip({
    carIdx: 4,
    alongM: 0.3,
    lateralM: 0,
    gapM: 0.3,
    level: 'critical',
    carNumber: '31',
    sideUnknown: true,
  }),
];

/** Blips plus the player marker. */
const VEHICLES = BLIPS.length + 1;

const COLORS = {
  far: '#cbd5e1',
  nearby: '#f59e0b',
  critical: '#ef4444',
  player: '#2fd16a',
  lapping: '#3b82f6',
  inPit: '#6b7280',
};

interface PaintRecord {
  /** One entry per paint: the vehicles drawn in it. */
  vehiclesPerPaint: number[];
  /**
   * One entry per paint: the canvas origin each vehicle was placed at, in draw
   * order. jsdom has no rasteriser, so these are the only positions available.
   */
  originsPerPaint: [number, number][][];
  /**
   * One entry per paint: the explicit `fillStyle` colours assigned in order.
   * The disc background is an `rgba(...)` string, so the palette entries are
   * the vehicles.
   */
  fillsPerPaint: string[][];
  /**
   * One entry per paint: every `arc` drawn, as its start and end angle. The
   * disc's own circle and its clip are full turns; the rim marks are short.
   */
  arcsPerPaint: [number, number][][];
  /**
   * One entry per paint: the explicit `strokeStyle` colours assigned in order.
   * Vehicle outlines are rgba, so a palette entry here is an edge marker.
   */
  strokesPerPaint: string[][];
  /** One entry per paint: how many `stroke` calls were made. */
  strokeCountPerPaint: number[];
  /** One entry per paint: every `fillText` drawn, as text and x position. */
  textsPerPaint: [string, number][][];
}

const observers: ((entries: unknown) => void)[] = [];

/**
 * jsdom has no canvas, so `getContext` is answered with a recorder. Any method
 * the draw code reaches for is created on demand; `roundRect` counts vehicles,
 * `translate` records where each one was placed, `fillStyle` records what it was
 * painted in and `arc` records the rim marks.
 */
const createFakeContext = (record: PaintRecord) => {
  const methods: Record<string, unknown> = {};
  const paint = () => record.vehiclesPerPaint.length - 1;
  const method = (name: string) =>
    vi.fn((...args: unknown[]) => {
      if (name === 'createLinearGradient') {
        return { addColorStop: () => undefined };
      }
      if (name === 'clearRect') {
        record.vehiclesPerPaint.push(0);
        record.originsPerPaint.push([]);
        record.fillsPerPaint.push([]);
        record.arcsPerPaint.push([]);
        record.strokesPerPaint.push([]);
        record.textsPerPaint.push([]);
        record.strokeCountPerPaint.push(0);
      }
      if (name === 'stroke') {
        const last = paint();
        record.strokeCountPerPaint[last] += 1;
      }
      if (name === 'fillText') {
        const last = paint();
        record.textsPerPaint[last].push([String(args[0]), args[1] as number]);
      }
      if (name === 'roundRect') {
        const last = paint();
        record.vehiclesPerPaint[last] =
          (record.vehiclesPerPaint[last] ?? 0) + 1;
      }
      if (name === 'translate') {
        const last = paint();
        record.originsPerPaint[last].push([
          args[0] as number,
          args[1] as number,
        ]);
      }
      if (name === 'arc') {
        const last = paint();
        record.arcsPerPaint[last].push([args[3] as number, args[4] as number]);
      }
    });
  return new Proxy(methods, {
    get: (target, property: string) => {
      if (!(property in target)) target[property] = method(property);
      return target[property];
    },
    set: (target, property: string, value) => {
      if (property === 'fillStyle' && record.fillsPerPaint.length > 0) {
        record.fillsPerPaint[record.fillsPerPaint.length - 1].push(
          String(value)
        );
      }
      if (property === 'strokeStyle' && record.strokesPerPaint.length > 0) {
        record.strokesPerPaint[record.strokesPerPaint.length - 1].push(
          String(value)
        );
      }
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
};

const props: Omit<RadarDisplayProps, 'nowSeconds'> = {
  mode: 'disc',
  blips: BLIPS,
  radarRange: 15,
  nearbyRange: 7,
  vehicleWidth: 1.9,
  vehicleLength: 4.5,
  showCarNumbers: true,
  pulseWhenCritical: false,
  colorFar: COLORS.far,
  colorNearby: COLORS.nearby,
  colorCritical: COLORS.critical,
  colorPlayer: COLORS.player,
  colorLapping: COLORS.lapping,
  colorInPit: COLORS.inPit,
  bgOpacity: 30,
  trackLengthM: 5000,
};

const deliverSize = (width: number, height: number) => {
  act(() => {
    for (const observer of observers) {
      observer([{ contentRect: { width, height } }]);
    }
  });
};

describe('RadarDisplay', () => {
  let record: PaintRecord;

  beforeEach(() => {
    record = {
      vehiclesPerPaint: [],
      originsPerPaint: [],
      fillsPerPaint: [],
      arcsPerPaint: [],
      strokesPerPaint: [],
      textsPerPaint: [],
      strokeCountPerPaint: [],
    };
    observers.length = 0;
    const context = createFakeContext(record);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: (entries: unknown) => void) {
          observers.push(callback);
        }
        observe() {
          /* size is delivered by deliverSize */
        }
        disconnect() {
          /* nothing to tear down */
        }
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        void this;
        return context;
      } as never
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('paints every blip and the player, and repaints on resize', () => {
    render(<RadarDisplay {...props} />);
    deliverSize(300, 300);
    deliverSize(320, 300);

    expect(record.vehiclesPerPaint.length).toBeGreaterThanOrEqual(2);
    expect(record.vehiclesPerPaint.every((count) => count === VEHICLES)).toBe(
      true
    );

    // Draw order is the blips, then the player. The 11 m car sits ahead of the
    // centre and the cars behind it below, in the same pixels per metre: a car
    // drawn a lap ahead would put the ratio off by orders of magnitude.
    const origins = record.originsPerPaint.at(-1) ?? [];
    expect(origins).toHaveLength(VEHICLES);
    const [ahead, lapping, critical, level, player] = origins;
    const centreX = 320 / 2;
    const centreY = 300 / 2;
    const metresToPixels = (centreY - ahead[1]) / 11;
    expect(metresToPixels).toBeGreaterThan(0);
    expect(lapping[1] - centreY).toBeCloseTo(4 * metresToPixels, 6);
    expect(critical[1] - centreY).toBeCloseTo(1 * metresToPixels, 6);
    expect(level[1] - centreY).toBeCloseTo(-0.3 * metresToPixels, 6);
    expect(player).toEqual([centreX, centreY]);
    // Lateral offsets are metres to the driver's right of the centreline.
    expect(ahead[0] - centreX).toBeCloseTo(0.2 * metresToPixels, 6);
    expect(lapping[0] - centreX).toBeCloseTo(2.4 * metresToPixels, 6);
    expect(critical[0] - centreX).toBeCloseTo(-2.1 * metresToPixels, 6);
  });

  it('paints rivals neutral, lapping cars blue, and critical over blue', () => {
    render(<RadarDisplay {...props} />);
    deliverSize(300, 300);

    const vehicles = (record.fillsPerPaint.at(-1) ?? []).filter((fill) =>
      Object.values(COLORS).includes(fill)
    );

    // A car a lap up reads blue for the whole approach, and the moment it is
    // actually alongside red takes over: the pass is what to act on.
    expect(vehicles).toEqual([
      COLORS.far,
      COLORS.lapping,
      COLORS.critical,
      COLORS.critical,
      COLORS.player,
    ]);
  });

  it('marks both rims for a car level with the player whose side is unknown', () => {
    render(<RadarDisplay {...props} />);
    deliverSize(300, 300);

    // The rim marks are the short arcs; the disc and its clip are full turns.
    const marks = (record.arcsPerPaint.at(-1) ?? []).filter(
      ([start, end]) => Math.abs(end - start) < 1
    );
    const centres = marks.map(([start, end]) => (start + end) / 2);

    // A car the sim named a side for points at that side, and only that one.
    const namedBearing = -Math.PI / 2 + Math.atan2(-2.1, -1);
    expect(centres.some((c) => Math.abs(c - namedBearing) < 1e-9)).toBe(true);
    expect(centres).toHaveLength(3);

    // A car level with us that the sim stayed silent about lights the right
    // rim and the left one: a single arch would be a side nobody measured.
    expect(centres.some((c) => Math.abs(c - 0) < 1e-9)).toBe(true);
    expect(centres.some((c) => Math.abs(Math.abs(c) - Math.PI) < 1e-9)).toBe(
      true
    );
  });

  it('leaves the rim dark when a level car has a side the sim reported', () => {
    const withKnownSide = {
      ...props,
      blips: [
        blip({ carIdx: 1, alongM: 0.2, gapM: 0.2, level: 'critical', side: 1 }),
      ],
    };
    render(<RadarDisplay {...withKnownSide} />);
    deliverSize(300, 300);

    const marks = (record.arcsPerPaint.at(-1) ?? []).filter(
      ([start, end]) => Math.abs(end - start) < 1
    );
    // One arch, at the side the sim gave — not a symmetric pair.
    expect(marks).toHaveLength(1);
    expect((marks[0][0] + marks[0][1]) / 2).toBeCloseTo(
      -Math.PI / 2 + Math.atan2(0.2, 0.2),
      9
    );
  });

  it('marks both edges of the lane for an unknown side in the portrait view', () => {
    // The same view, with the one flag flipped: the only difference in what is
    // stroked is the two edge marks, so the count is the mark count.
    const marked = props.blips.map((blip) =>
      blip.sideUnknown ? blip : { ...blip, sideUnknown: blip.gapM <= 0.5 }
    );
    const withMarks = { ...props, mode: 'portrait' as const, blips: marked };
    render(<RadarDisplay {...withMarks} />);
    deliverSize(300, 300);
    const strokesWithMarks = record.strokeCountPerPaint.at(-1) ?? 0;
    // The marks took the car's own colour, and nothing else in this view
    // strokes in a palette colour.
    expect(record.strokesPerPaint.at(-1)).toContain(COLORS.critical);

    const withoutMarks = {
      ...props,
      mode: 'portrait' as const,
      blips: marked.map((blip) => ({ ...blip, sideUnknown: false })),
    };
    record = {
      vehiclesPerPaint: [],
      originsPerPaint: [],
      fillsPerPaint: [],
      arcsPerPaint: [],
      strokesPerPaint: [],
      textsPerPaint: [],
      strokeCountPerPaint: [],
    };
    observers.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        void this;
        return createFakeContext(record);
      } as never
    );
    render(<RadarDisplay {...withoutMarks} />);
    deliverSize(300, 300);
    const strokesWithout = record.strokeCountPerPaint.at(-1) ?? 0;

    // Both edges, and only the marks, are the difference.
    expect(strokesWithMarks - strokesWithout).toBe(2);
  });

  it('lights both side strips for an unknown side in the bars view', () => {
    const unknown = {
      ...props,
      mode: 'bars' as const,
      blips: [
        blip({
          carIdx: 1,
          alongM: 0.3,
          gapM: 0.3,
          level: 'critical',
          carNumber: '31',
          sideUnknown: true,
        }),
      ],
    };
    render(<RadarDisplay {...unknown} />);
    deliverSize(300, 300);

    // The label lands at both edges: a strip is lit on each side, rather than
    // the car being placed in one lane the sim never named.
    const labels = (record.textsPerPaint.at(-1) ?? []).filter(
      ([text]) => text === '31'
    );
    expect(labels).toHaveLength(2);
    expect(labels.map(([, x]) => x).sort((a, b) => a - b)).toEqual([4, 296]);
  });
});
