import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadarBlip } from '../radarBlips';
import {
  MAP_VEHICLE_MIN_WIDTH_PX,
  PULSE_STEPS_PER_SECOND,
  pulseAlpha,
  RadarDisplay,
  VEHICLE_LABEL_MIN_WIDTH_PX,
  type RadarDisplayProps,
} from './RadarDisplay';

const blip = (over: Partial<RadarBlip> & { carIdx: number }): RadarBlip => ({
  alongM: 11,
  lateralM: 0.2,
  relYaw: 0,
  gapM: 11,
  side: null,
  rimSignal: null,
  carNumber: '24',
  isPaceCar: false,
  fade: 1,
  ...over,
});

/**
 * Three painted rivals plus the player: a plain car well ahead, a car closing
 * from behind, a car with a left rim signal, and a level car whose silent side
 * lights both rims but is not painted.
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
    rimSignal: 'left',
  }),
  blip({
    carIdx: 4,
    alongM: 0.3,
    lateralM: 0,
    gapM: 0.3,
    carNumber: '31',
    rimSignal: 'both',
  }),
];

/** Three painted rivals plus the player marker. */
const VEHICLES = 4;

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
  /** One entry per paint: every `fillText` drawn, as text and x position. */
  textsPerPaint: [string, number][][];
  /** One entry per paint: every `lineTo` on the road, as x and y. */
  lineTosPerPaint: [number, number][][];
  /** One entry per paint: every road quadratic's control and endpoint. */
  quadraticsPerPaint: number[][][];
  /** One entry per paint: global alpha assigned with each stroke style. */
  strokeAlphasPerPaint: number[][];
  /** One entry per paint: the width and length passed to each vehicle. */
  vehicleSizesPerPaint: [number, number][][];
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
        record.lineTosPerPaint.push([]);
        record.quadraticsPerPaint.push([]);
        record.strokeAlphasPerPaint.push([]);
        record.vehicleSizesPerPaint.push([]);
      }
      if (name === 'fillText') {
        const last = paint();
        record.textsPerPaint[last].push([String(args[0]), args[1] as number]);
      }
      if (name === 'roundRect') {
        const last = paint();
        record.vehiclesPerPaint[last] =
          (record.vehiclesPerPaint[last] ?? 0) + 1;
        record.vehicleSizesPerPaint[last].push([
          args[2] as number,
          args[3] as number,
        ]);
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
      if (name === 'lineTo') {
        record.lineTosPerPaint[paint()].push([
          args[0] as number,
          args[1] as number,
        ]);
      }
      if (name === 'quadraticCurveTo') {
        record.quadraticsPerPaint[paint()].push([
          args[0] as number,
          args[1] as number,
          args[2] as number,
          args[3] as number,
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
      if (property === 'strokeStyle' && record.strokesPerPaint.length > 0) {
        record.strokesPerPaint[record.strokesPerPaint.length - 1].push(
          String(value)
        );
        record.strokeAlphasPerPaint[
          record.strokeAlphasPerPaint.length - 1
        ].push((target.globalAlpha as number | undefined) ?? 1);
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
  colorAlongside: '#ef4444',
  colorPlayer: COLORS.player,
  bgOpacity: 30,
  trackLengthM: 5000,
  showMap: false,
  mapPath: new Float64Array([
    -45, 0, -30, 1, -15, 3, 0, 4, 15, 3, 30, 1, 45, 0,
  ]),
  mapPointCount: 7,
  mapWindowM: 90,
  mapBorderColor: '#334155',
  mapBorderOpacity: 80,
  mapFillColor: '#64748b',
  mapFillOpacity: 45,
  nowSeconds: 0,
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
      lineTosPerPaint: [],
      quadraticsPerPaint: [],
      strokeAlphasPerPaint: [],
      vehicleSizesPerPaint: [],
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

  it('paints every eligible blip and the player, and repaints on resize', () => {
    render(<RadarDisplay {...props} />);
    deliverSize(300, 300);
    deliverSize(320, 300);

    expect(record.vehiclesPerPaint.length).toBeGreaterThanOrEqual(2);
    expect(record.vehiclesPerPaint.every((count) => count === VEHICLES)).toBe(
      true
    );
    expect(record.lineTosPerPaint.at(-1)).toHaveLength(0);
    expect(record.quadraticsPerPaint.at(-1)).toHaveLength(0);

    // Draw order is the blips, then the player. The 11 m car sits ahead of the
    // centre and the cars behind it below, in the same pixels per metre: a car
    // drawn a lap ahead would put the ratio off by orders of magnitude.
    const origins = record.originsPerPaint.at(-1) ?? [];
    expect(origins).toHaveLength(VEHICLES);
    const [ahead, behind, alongside, player] = origins;
    const centreX = 320 / 2;
    const centreY = 300 / 2;
    const metresToPixels = (centreY - ahead[1]) / 11;
    expect(metresToPixels).toBeGreaterThan(0);
    expect(behind[1] - centreY).toBeCloseTo(4 * metresToPixels, 6);
    expect(alongside[1] - centreY).toBeCloseTo(1 * metresToPixels, 6);
    expect(player).toEqual([centreX, centreY]);
    // Lateral offsets are metres to the driver's right of the centreline.
    expect(ahead[0] - centreX).toBeCloseTo(0.2 * metresToPixels, 6);
    expect(behind[0] - centreX).toBeCloseTo(2.4 * metresToPixels, 6);
    expect(alongside[0] - centreX).toBeCloseTo(-2.1 * metresToPixels, 6);
  });

  it('paints the following road, a car at metre offsets, and no rim arcs in map view', () => {
    render(
      <RadarDisplay
        {...props}
        showMap
        blips={[blip({ carIdx: 1, alongM: 4, gapM: 4, rimSignal: 'both' })]}
      />
    );
    deliverSize(300, 300);

    const paint = record.vehiclesPerPaint.length - 1;
    // Each interior sample controls a quadratic that ends halfway to the next
    // sample, so the canvas reads the shared buffer directly without building
    // an intermediate midpoint array. The final sample closes the ribbon.
    expect(record.quadraticsPerPaint[paint]).toHaveLength(
      props.mapPointCount - 2
    );
    expect(record.lineTosPerPaint[paint]).toHaveLength(1);
    const [controlX, controlY, endX, endY] =
      record.quadraticsPerPaint[paint][0];
    const scale = 148 / (props.mapWindowM / 2);
    const centre = 150;
    expect(controlX).toBeCloseTo(centre + 1 * scale, 6);
    expect(controlY).toBeCloseTo(centre + 30 * scale, 6);
    expect(endX).toBeCloseTo(centre + 2 * scale, 6);
    expect(endY).toBeCloseTo(centre + 22.5 * scale, 6);

    // The border and surface are both configured and painted in that order.
    const configuredStrokes = record.strokesPerPaint[paint].filter((stroke) =>
      [props.mapBorderColor, props.mapFillColor].includes(stroke)
    );
    expect(configuredStrokes).toEqual([
      props.mapBorderColor,
      props.mapFillColor,
    ]);
    const configuredAlphas = record.strokeAlphasPerPaint[paint].filter(
      (alpha) => alpha === 0.8 || alpha === 0.45
    );
    expect(configuredAlphas).toEqual([0.8, 0.45]);
    expect(record.vehiclesPerPaint[paint]).toBe(2);

    const [car] = record.originsPerPaint[paint];
    expect(car[0]).toBeCloseTo(centre + 0.2 * scale, 6);
    expect(car[1]).toBeCloseTo(centre - 4 * scale, 6);

    // Map view has only the full-circle clip. It has no background disc and a
    // rim signal in map view must not add the short disc arcs.
    expect(record.arcsPerPaint[paint]).toHaveLength(1);
    expect(
      record.arcsPerPaint[paint].filter(
        ([start, end]) => Math.abs(end - start) < 1
      )
    ).toHaveLength(0);
    expect(record.fillsPerPaint[paint]).not.toContain('rgba(0, 0, 0, 0.3)');
  });

  it('draws a level unknown-side car in map view, where the overlap is the signal', () => {
    // The disc hides it and lights both rims instead. The map has no rim, so
    // the car has to be painted on top of the player or the overlap is lost.
    const level = [
      blip({ carIdx: 1, alongM: 0.3, gapM: 0.3, rimSignal: 'both' }),
    ];

    const view = render(<RadarDisplay {...props} showMap blips={level} />);
    deliverSize(300, 300);
    expect(record.vehiclesPerPaint.at(-1)).toBe(2);

    view.rerender(<RadarDisplay {...props} blips={level} />);
    expect(record.vehiclesPerPaint.at(-1)).toBe(1);
  });

  it('keeps every map vehicle identifiable without enlarging true-scale cars', () => {
    const view = render(
      <RadarDisplay
        {...props}
        showMap
        radarRange={20}
        blips={[blip({ carIdx: 1 })]}
      />
    );
    deliverSize(300, 300);

    const trueMapWidth = 1.9 * (148 / 30);
    expect(trueMapWidth).toBeLessThan(MAP_VEHICLE_MIN_WIDTH_PX);
    expect(record.vehicleSizesPerPaint.at(-1)).toEqual([
      [MAP_VEHICLE_MIN_WIDTH_PX, expect.any(Number)],
      [MAP_VEHICLE_MIN_WIDTH_PX, expect.any(Number)],
    ]);
    expect(VEHICLE_LABEL_MIN_WIDTH_PX).toBeLessThanOrEqual(
      MAP_VEHICLE_MIN_WIDTH_PX
    );
    expect(record.textsPerPaint.at(-1)).toEqual([['24', 0]]);

    // The floor only lifts bodies below it: the disc keeps physical scale, and
    // at a 20 m range that is already above the label gate.
    const trueDiscWidth = 1.9 * (148 / 20);
    view.rerender(
      <RadarDisplay {...props} radarRange={20} blips={[blip({ carIdx: 1 })]} />
    );
    expect(record.vehicleSizesPerPaint.at(-1)?.map(([width]) => width)).toEqual(
      [trueDiscWidth, trueDiscWidth]
    );
    expect(trueDiscWidth).toBeGreaterThan(VEHICLE_LABEL_MIN_WIDTH_PX);
    expect(record.textsPerPaint.at(-1)).toEqual([['24', 0]]);
  });

  it('paints every rival in the rival colour and the player in their own', () => {
    render(<RadarDisplay {...props} />);
    deliverSize(300, 300);

    expect(record.fillsPerPaint.at(-1)).toContain('rgba(0, 0, 0, 0.3)');
    const vehicles = (record.fillsPerPaint.at(-1) ?? []).filter((fill) =>
      Object.values(COLORS).includes(fill)
    );

    expect(vehicles).toEqual([
      COLORS.rival,
      COLORS.rival,
      COLORS.rival,
      COLORS.player,
    ]);
  });

  it('lights the left arc for a left signal', () => {
    render(
      <RadarDisplay
        {...props}
        blips={[blip({ carIdx: 1, rimSignal: 'left' })]}
      />
    );
    deliverSize(300, 300);
    const marks = (record.arcsPerPaint.at(-1) ?? []).filter(
      ([start, end]) => Math.abs(end - start) < 1
    );
    expect(marks).toHaveLength(1);
    expect(Math.abs((marks[0][0] + marks[0][1]) / 2 + Math.PI) < 0.01).toBe(
      true
    );
  });

  it('lights the right arc for a right signal', () => {
    render(
      <RadarDisplay
        {...props}
        blips={[blip({ carIdx: 1, rimSignal: 'right' })]}
      />
    );
    deliverSize(300, 300);
    const marks = (record.arcsPerPaint.at(-1) ?? []).filter(
      ([start, end]) => Math.abs(end - start) < 1
    );
    expect(marks).toHaveLength(1);
    expect(Math.abs((marks[0][0] + marks[0][1]) / 2) < 0.01).toBe(true);
  });

  it('lights both arcs for a both signal and none without a signal', () => {
    const view = render(
      <RadarDisplay
        {...props}
        blips={[blip({ carIdx: 1, alongM: 0.3, gapM: 0.3, rimSignal: 'both' })]}
      />
    );
    deliverSize(300, 300);
    let marks = (record.arcsPerPaint.at(-1) ?? []).filter(
      ([start, end]) => Math.abs(end - start) < 1
    );
    expect(record.vehiclesPerPaint.at(-1)).toBe(1);
    expect(marks).toHaveLength(2);
    expect(
      marks.some(([start, end]) => Math.abs((start + end) / 2) < 0.01)
    ).toBe(true);
    expect(
      marks.some(([start, end]) => Math.abs((start + end) / 2 + Math.PI) < 0.01)
    ).toBe(true);

    view.rerender(
      <RadarDisplay {...props} blips={[blip({ carIdx: 1, rimSignal: null })]} />
    );
    marks = (record.arcsPerPaint.at(-1) ?? []).filter(
      ([start, end]) => Math.abs(end - start) < 1
    );
    expect(marks).toHaveLength(0);
  });

  it('paints a vehicle for a named side but not for both', () => {
    const view = render(
      <RadarDisplay
        {...props}
        blips={[blip({ carIdx: 1, rimSignal: 'left' })]}
      />
    );
    deliverSize(300, 300);
    expect(record.vehiclesPerPaint.at(-1)).toBe(2);
    expect(record.fillsPerPaint.at(-1)).toContain(COLORS.rival);

    view.rerender(
      <RadarDisplay
        {...props}
        blips={[blip({ carIdx: 1, rimSignal: 'right' })]}
      />
    );
    expect(record.vehiclesPerPaint.at(-1)).toBe(2);
    expect(record.fillsPerPaint.at(-1)).toContain(COLORS.rival);

    view.rerender(
      <RadarDisplay
        {...props}
        blips={[blip({ carIdx: 1, alongM: 0.3, gapM: 0.3, rimSignal: 'both' })]}
      />
    );
    expect(record.vehiclesPerPaint.at(-1)).toBe(1);
    expect(record.fillsPerPaint.at(-1)).not.toContain(COLORS.rival);
  });

  it('paints a both-signal car that is not level with the player', () => {
    // The rim signal only says the sim named no side. Four metres up the road
    // the car is ahead of us, not across from us, and hiding it there would
    // throw away a car the driver needs to see.
    render(
      <RadarDisplay
        {...props}
        blips={[blip({ carIdx: 1, alongM: 4, gapM: 4, rimSignal: 'both' })]}
      />
    );
    deliverSize(300, 300);
    expect(record.vehiclesPerPaint.at(-1)).toBe(2);
    expect(record.fillsPerPaint.at(-1)).toContain(COLORS.rival);
  });

  it('uses the alongside colour for a rim arc', () => {
    render(
      <RadarDisplay
        {...props}
        colorAlongside="#123456"
        blips={[blip({ carIdx: 1, rimSignal: 'left' })]}
      />
    );
    deliverSize(300, 300);
    expect(record.strokesPerPaint.at(-1)).toContain('#123456');
  });

  it('quantises the pulse to at most nine levels and repeats each second', () => {
    const sampleCount = PULSE_STEPS_PER_SECOND * 4;
    const firstSecond = Array.from({ length: sampleCount }, (_, i) =>
      pulseAlpha(i / PULSE_STEPS_PER_SECOND)
    );
    expect(new Set(firstSecond).size).toBeLessThanOrEqual(9);

    for (let second = 1; second < 4; second += 1) {
      for (let i = 0; i < sampleCount; i += 1) {
        expect(pulseAlpha(second + i / PULSE_STEPS_PER_SECOND)).toBe(
          firstSecond[i]
        );
      }
    }
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
