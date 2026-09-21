import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRadarMotion } from './useRadarMotion';
import type { RadarBlip } from '../radarBlips';

const TRACK_LENGTH_M = 500;

const blip = (carIdx: number, alongM: number, lateralM = 0): RadarBlip => ({
  carIdx,
  alongM,
  lateralM,
  relYaw: 0,
  gapM: Math.abs(alongM),
  level: Math.abs(alongM) <= 1.5 ? 'critical' : 'far',
  side: null,
  carNumber: null,
  isPaceCar: false,
  inPit: false,
  fade: 1,
});

describe('useRadarMotion', () => {
  let callbacks: FrameRequestCallback[];
  let nextFrameId: number;
  let clock: number;

  const advanceClock = (ms: number) => {
    clock += ms;
  };

  beforeEach(() => {
    callbacks = [];
    nextFrameId = 0;
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return ++nextFrameId;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    delete window.rendererPerfBridge;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  interface Observed {
    along: number[];
  }

  const recordDraw =
    (observed: Observed) =>
    (alongM: Float64Array, _lateralM: Float64Array, count: number) => {
      observed.along.push(alongM[0]);
      void count;
    };

  it('glides a car between its snapshot positions in metre units', () => {
    const observed: Observed = { along: [] };
    const Harness = ({ blips }: { blips: readonly RadarBlip[] }) => {
      useRadarMotion(blips, TRACK_LENGTH_M, false, recordDraw(observed));
      return null;
    };

    const start: RadarBlip[] = [blip(1, 0)];
    const view = render(<Harness blips={start} />);
    expect(observed.along).toHaveLength(1);
    expect(observed.along[0]).toBeCloseTo(0, 6);
    // The first snapshot has no previous value: one paint, no frames.
    expect(callbacks).toHaveLength(0);

    // Retarget 2 m ahead; halfway through the 40 ms cadence the drawn value is
    // strictly between the endpoints. Metre units prove the lap-fraction
    // round-trip. Retargeting a moving car starts the RAF loop.
    advanceClock(0);
    view.rerender(<Harness blips={[blip(1, 2)]} />);
    observed.along = [];
    act(() => callbacks.shift()?.(20));
    expect(observed.along[0]).toBeGreaterThan(0.01);
    expect(observed.along[0]).toBeLessThan(1.99);

    act(() => callbacks.shift()?.(40));
    expect(observed.along[observed.along.length - 1]).toBeCloseTo(2, 6);
    expect(callbacks).toHaveLength(0);
  });

  it('never teleports: consecutive draws differ by no more than the target delta', () => {
    const observed: Observed = { along: [] };
    const Harness = ({ blips }: { blips: readonly RadarBlip[] }) => {
      useRadarMotion(blips, TRACK_LENGTH_M, false, recordDraw(observed));
      return null;
    };

    const view = render(<Harness blips={[blip(1, 0)]} />);
    while (callbacks.length) {
      act(() => callbacks.shift()?.(clock + 8));
      clock += 8;
    }

    view.rerender(<Harness blips={[blip(1, 2)]} />);
    let previous = 0;
    while (callbacks.length) {
      act(() => callbacks.shift()?.(clock + 8));
      clock += 8;
      const current = observed.along[observed.along.length - 1];
      expect(Math.abs(current - previous)).toBeLessThanOrEqual(2.5);
      previous = current;
    }
    expect(previous).toBeCloseTo(2, 1);
  });

  it('keeps the loop alive while the pulse is active', () => {
    const observed: Observed = { along: [] };
    const Harness = ({
      blips,
      pulse,
    }: {
      blips: readonly RadarBlip[];
      pulse: boolean;
    }) => {
      useRadarMotion(blips, TRACK_LENGTH_M, pulse, recordDraw(observed));
      return null;
    };

    const staticBlips = [blip(1, 3)];
    const view = render(<Harness blips={staticBlips} pulse={false} />);
    // No movement, no pulse: no frames were requested.
    expect(callbacks).toHaveLength(0);

    // Turning the pulse on keeps a frame in flight even though nothing moves.
    view.rerender(<Harness blips={staticBlips} pulse={true} />);
    expect(callbacks.length).toBeGreaterThan(0);
  });

  it('stops requesting frames once settled without a pulse', () => {
    let draws = 0;
    const Harness = ({ blips }: { blips: readonly RadarBlip[] }) => {
      useRadarMotion(blips, TRACK_LENGTH_M, false, (a, l, c) => {
        void a;
        void l;
        void c;
        draws++;
      });
      return null;
    };

    const view = render(<Harness blips={[blip(1, 1)]} />);
    view.rerender(<Harness blips={[blip(1, 1)]} />);
    // The second retarget has no movement: one paint, no frames.
    expect(callbacks).toHaveLength(0);
    expect(draws).toBe(2);
  });
});
