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
  carNumber: '24',
  isPaceCar: false,
  lapping: false,
  inPit: false,
  fade: 1,
  ...over,
});

/**
 * Three rivals plus the player: a plain car well ahead, a car lapping the
 * player closing from behind, and one already critical. None pulse, so every
 * paint is at full strength and colours can be read back exactly.
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
}

const observers: ((entries: unknown) => void)[] = [];

/**
 * jsdom has no canvas, so `getContext` is answered with a recorder. Any method
 * the draw code reaches for is created on demand; `roundRect` counts vehicles,
 * `translate` records where each one was placed and `fillStyle` records what it
 * was painted in.
 */
const createFakeContext = (record: PaintRecord) => {
  const methods: Record<string, unknown> = {};
  const paint = () => record.vehiclesPerPaint.length - 1;
  const method = (name: string) =>
    vi.fn((...args: unknown[]) => {
      if (name === 'clearRect') {
        record.vehiclesPerPaint.push(0);
        record.originsPerPaint.push([]);
        record.fillsPerPaint.push([]);
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
    record = { vehiclesPerPaint: [], originsPerPaint: [], fillsPerPaint: [] };
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
    const [ahead, lapping, critical, player] = origins;
    const centreX = 320 / 2;
    const centreY = 300 / 2;
    const metresToPixels = (centreY - ahead[1]) / 11;
    expect(metresToPixels).toBeGreaterThan(0);
    expect(lapping[1] - centreY).toBeCloseTo(4 * metresToPixels, 6);
    expect(critical[1] - centreY).toBeCloseTo(1 * metresToPixels, 6);
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
      COLORS.player,
    ]);
  });
});
