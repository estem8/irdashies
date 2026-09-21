import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadarBlip } from '../radarBlips';
import { RadarDisplay, type RadarDisplayProps } from './RadarDisplay';

/** Two cars in range: enough to paint vehicles, none critical so no pulse. */
const BLIPS: RadarBlip[] = [
  {
    carIdx: 1,
    alongM: 11,
    lateralM: 0.2,
    relYaw: 0,
    gapM: 11,
    level: 'far',
    side: null,
    carNumber: '24',
    isPaceCar: false,
    inPit: false,
    fade: 1,
  },
  {
    carIdx: 2,
    alongM: -4,
    lateralM: 2.4,
    relYaw: 0,
    gapM: 4,
    level: 'nearby',
    side: null,
    carNumber: '7',
    isPaceCar: false,
    inPit: false,
    fade: 1,
  },
];

/** Blips plus the player marker. */
const VEHICLES = BLIPS.length + 1;

interface PaintRecord {
  /** One entry per paint: the vehicles drawn in it. */
  vehiclesPerPaint: number[];
  /**
   * One entry per paint: the canvas origin each vehicle was placed at, in draw
   * order. jsdom has no rasteriser, so these are the only positions available.
   */
  originsPerPaint: [number, number][][];
}

const observers: ((entries: unknown) => void)[] = [];

/**
 * jsdom has no canvas, so `getContext` is answered with a recorder. Any method
 * the draw code reaches for is created on demand, `roundRect` counts vehicles
 * and `translate` records where each one was placed.
 */
const createFakeContext = (record: PaintRecord) => {
  const methods: Record<string, unknown> = {};
  const paint = () => record.vehiclesPerPaint.length - 1;
  const method = (name: string) =>
    vi.fn((...args: unknown[]) => {
      if (name === 'clearRect') {
        record.vehiclesPerPaint.push(0);
        record.originsPerPaint.push([]);
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
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
};

const props: Omit<RadarDisplayProps, 'nowSeconds'> = {
  mode: 'disc',
  blips: BLIPS,
  overlap: { left: 0, right: 0 },
  radarRange: 15,
  nearbyRange: 7,
  vehicleWidth: 1.9,
  vehicleLength: 4.5,
  showCarNumbers: true,
  pulseWhenCritical: false,
  showOverlapIndicator: true,
  colorFar: '#3b82f6',
  colorNearby: '#f59e0b',
  colorCritical: '#ef4444',
  colorPlayer: '#2fd16a',
  colorInPit: '#6b7280',
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
    record = { vehiclesPerPaint: [], originsPerPaint: [] };
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
    // centre and the 4 m one behind it, in the same pixels per metre: a car
    // drawn a lap ahead would put the ratio off by orders of magnitude.
    const origins = record.originsPerPaint.at(-1) ?? [];
    expect(origins).toHaveLength(VEHICLES);
    const [ahead, behind, player] = origins;
    const centreX = 320 / 2;
    const centreY = 300 / 2;
    const metresToPixels = (centreY - ahead[1]) / 11;
    expect(metresToPixels).toBeGreaterThan(0);
    expect(behind[1] - centreY).toBeCloseTo(4 * metresToPixels, 6);
    expect(player).toEqual([centreX, centreY]);
    // Lateral offsets are metres to the driver's right of the centreline.
    expect(ahead[0] - centreX).toBeCloseTo(0.2 * metresToPixels, 6);
    expect(behind[0] - centreX).toBeCloseTo(2.4 * metresToPixels, 6);
  });
});
