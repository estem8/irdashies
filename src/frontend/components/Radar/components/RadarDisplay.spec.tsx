import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadarBlip } from '../radarBlips';
import { RadarDisplay, type RadarDisplayProps } from './RadarDisplay';

const blip = (over: Partial<RadarBlip> & { carIdx: number }): RadarBlip => ({
  alongM: 11,
  lateralM: 0.2,
  relYaw: 0,
  gapM: 11,
  side: null,
  sideUnknown: false,
  carNumber: '24',
  isPaceCar: false,
  fade: 1,
  ...over,
});

/**
 * Four rivals plus the player: a plain car well ahead, a car closing from
 * behind, a car the sim named a side for, and a car level with the player that
 * the sim never called.
 */
const BLIPS: RadarBlip[] = [
  blip({ carIdx: 1 }),
  blip({
    carIdx: 2,
    alongM: -4,
    lateralM: 2.4,
    gapM: 4,
    carNumber: '7',
  }),
  blip({
    carIdx: 3,
    alongM: -1,
    lateralM: -2.1,
    gapM: 1,
    carNumber: '51',
    side: -1,
  }),
  blip({
    carIdx: 4,
    alongM: 0.3,
    lateralM: 0,
    gapM: 0.3,
    carNumber: '31',
    sideUnknown: true,
  }),
];

/** Blips plus the player marker. */
const VEHICLES = BLIPS.length + 1;

const COLORS = {
  rival: '#cbd5e1',
  player: '#2fd16a',
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

const props: RadarDisplayProps = {
  blips: BLIPS,
  radarRange: 15,
  vehicleWidth: 1.9,
  vehicleLength: 4.5,
  showCarNumbers: true,
  colorRival: COLORS.rival,
  colorPlayer: COLORS.player,
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
    const [ahead, behind, alongside, level, player] = origins;
    const centreX = 320 / 2;
    const centreY = 300 / 2;
    const metresToPixels = (centreY - ahead[1]) / 11;
    expect(metresToPixels).toBeGreaterThan(0);
    expect(behind[1] - centreY).toBeCloseTo(4 * metresToPixels, 6);
    expect(alongside[1] - centreY).toBeCloseTo(1 * metresToPixels, 6);
    expect(level[1] - centreY).toBeCloseTo(-0.3 * metresToPixels, 6);
    expect(player).toEqual([centreX, centreY]);
    // Lateral offsets are metres to the driver's right of the centreline.
    expect(ahead[0] - centreX).toBeCloseTo(0.2 * metresToPixels, 6);
    expect(behind[0] - centreX).toBeCloseTo(2.4 * metresToPixels, 6);
    expect(alongside[0] - centreX).toBeCloseTo(-2.1 * metresToPixels, 6);
  });

  it('paints every rival in the rival colour and the player in their own', () => {
    render(<RadarDisplay {...props} />);
    deliverSize(300, 300);

    const vehicles = (record.fillsPerPaint.at(-1) ?? []).filter((fill) =>
      Object.values(COLORS).includes(fill)
    );

    expect(vehicles).toEqual([
      COLORS.rival,
      COLORS.rival,
      COLORS.rival,
      COLORS.rival,
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

    // A car level with us that the sim stayed silent about lights the right
    // rim and the left one: a single arch would be a side nobody measured.
    expect(centres).toHaveLength(2);
    expect(centres.some((c) => Math.abs(c - 0) < 1e-9)).toBe(true);
    expect(centres.some((c) => Math.abs(Math.abs(c) - Math.PI) < 1e-9)).toBe(
      true
    );
  });

  it('leaves the rim dark when a level car has a side the sim reported', () => {
    const withKnownSide = {
      ...props,
      blips: [blip({ carIdx: 1, alongM: 0.2, gapM: 0.2, side: 1 })],
    };
    render(<RadarDisplay {...withKnownSide} />);
    deliverSize(300, 300);

    const marks = (record.arcsPerPaint.at(-1) ?? []).filter(
      ([start, end]) => Math.abs(end - start) < 1
    );
    // The car has a side, so no rim speaks for it: nothing but the disc and
    // its clip is drawn as an arc.
    expect(marks).toHaveLength(0);
  });

  it('never changes the colour a jittering rival is painted in', () => {
    // A rival standing still with ±0.3 m of measured jitter, swept across the
    // whole range: the colour the display paints for it must never change.
    // Grading the blip by proximity made exactly this case flicker — a car
    // holding 7 m crossed the engage threshold twice a second — and the disc
    // now has one rival colour by construction, so any distance-based colour
    // reintroduced into the draw path fails here. Asserted on the fillStyle
    // handed to the canvas context, not on an internal field, so the real
    // draw path is what is covered.
    const rivalAt = (gapM: number): RadarBlip[] => [
      blip({
        carIdx: 1,
        alongM: gapM,
        lateralM: 0.4,
        gapM: Math.abs(gapM),
        carNumber: '24',
      }),
    ];
    // The sweep reaches 19 m, so the view is widened to keep every sample
    // on the disc rather than clipped off it.
    const swept = { ...props, radarRange: 20 };

    const view = render(<RadarDisplay {...swept} blips={rivalAt(5)} />);
    deliverSize(300, 300);

    const rivalFillOfLastPaint = () => {
      // The rival and nothing else was painted this frame, so the colour read
      // back is the colour the rival itself was handed.
      expect(record.vehiclesPerPaint.at(-1)).toBe(2);
      const palette = (record.fillsPerPaint.at(-1) ?? []).filter((fill) =>
        Object.values(COLORS).includes(fill)
      );
      // The rival is drawn before the player, so the first palette entry of
      // each paint is the colour the rival was handed.
      expect(palette).toHaveLength(2);
      return palette[0];
    };

    const seen = new Set<string>();
    for (let distance = 5; distance <= 19; distance += 0.5) {
      for (const jitter of [0.3, -0.3, 0.3]) {
        view.rerender(
          <RadarDisplay {...swept} blips={rivalAt(distance + jitter)} />
        );
        seen.add(rivalFillOfLastPaint());
      }
    }

    expect(seen).toEqual(new Set([COLORS.rival]));
  });
});
