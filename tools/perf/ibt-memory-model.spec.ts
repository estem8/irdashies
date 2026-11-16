import { describe, expect, it } from 'vitest';
import type { TapeReplayStatus } from '../../src/types/tapeReplay';
import {
  requirePausedReplay,
  requireSameProcesses,
  validateAdvance,
} from './ibt-memory-model';

const paused: TapeReplayStatus = {
  position: 1,
  duration: 100,
  speed: 1,
  paused: true,
  ended: false,
  frameByFrame: true,
  maximumSpeed: true,
  framesRemaining: 0,
  framesConsumed: 100,
  framesDelivered: 100,
};

describe('IBT retained-memory workload model', () => {
  it('accepts only an exact, fully delivered block that ended paused', () => {
    expect(
      validateAdvance(
        paused,
        { ...paused, framesConsumed: 110, framesDelivered: 110 },
        10
      )
    ).toEqual({ consumed: 10, delivered: 10 });
    expect(() =>
      validateAdvance(
        paused,
        { ...paused, framesConsumed: 111, framesDelivered: 111 },
        10
      )
    ).toThrow('Unequal workload');
    expect(() =>
      validateAdvance(
        paused,
        { ...paused, framesConsumed: 110, framesDelivered: 109 },
        10
      )
    ).toThrow('Unequal workload');
  });

  it.each([
    { paused: false },
    { framesRemaining: 1 },
    { framesRemaining: undefined },
    { frameByFrame: false },
    { maximumSpeed: false },
    { ended: true },
    { failed: true },
  ])('rejects an incomparable checkpoint %j', (override) => {
    expect(() => requirePausedReplay({ ...paused, ...override })).toThrow(
      'Memory measurement requires'
    );
  });

  it('does not treat absent native frame counters as a measured workload', () => {
    expect(() =>
      validateAdvance(paused, { ...paused, framesConsumed: undefined }, 10)
    ).toThrow('Unequal workload');
  });

  it('detects renderer replacement instead of reporting its lower memory as a fix', () => {
    expect(() =>
      requireSameProcesses(['1:100', '2:200'], ['2:200', '1:100'])
    ).not.toThrow();
    expect(() =>
      requireSameProcesses(['1:100', '2:200'], ['1:100', '2:300'])
    ).toThrow('Process topology changed');
  });
});
