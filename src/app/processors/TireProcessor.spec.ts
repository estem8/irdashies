import { describe, expect, it, vi } from 'vitest';
import type { Telemetry } from '@irdashies/types';
import { TireProcessor } from './TireProcessor';

vi.mock('../logger', () => ({ default: { info: vi.fn() } }));
import logger from '../logger';

const frame = (
  values: Record<string, number | boolean>,
  time = 0
): Telemetry => {
  const out: Record<string, { value: unknown[] }> = {
    SessionTime: { value: [time] },
  };
  for (const [key, value] of Object.entries(values))
    out[key] = { value: [value] };
  return out as unknown as Telemetry;
};

const tires = (temp: number, wear: number) => {
  const out: Record<string, number> = {};
  for (const c of ['LF', 'RF', 'LR', 'RR']) {
    for (const z of ['L', 'M', 'R']) {
      out[`${c}tempC${z}`] = temp;
      out[`${c}wear${z}`] = wear;
    }
  }
  return out;
};

describe('TireProcessor', () => {
  it('publishes rounded temperature and wear percent per tire', () => {
    const p = new TireProcessor();
    p.onFrame(frame(tires(87.6, 0.9234)));
    expect(p.snapshot().corners.lf).toEqual({
      temp: [88, 88, 88],
      wear: [92.3, 92.3, 92.3],
    });
    expect(Object.keys(p.snapshot().corners)).toHaveLength(4);
  });

  it('only bumps the version when a displayed number changes', () => {
    const p = new TireProcessor();
    p.onFrame(frame(tires(87.6, 0.9234)));
    const version = p.snapshot().version;
    p.onFrame(frame(tires(87.8, 0.92341)));
    expect(p.snapshot().version).toBe(version);
    p.onFrame(frame(tires(90, 0.9234)));
    expect(p.snapshot().version).toBe(version + 1);
  });

  it('omits a tire whose zones are not all reported', () => {
    const p = new TireProcessor();
    const values = tires(80, 1);
    delete values.RRwearM;
    p.onFrame(frame(values));
    expect(p.snapshot().corners.rr).toBeUndefined();
    expect(p.snapshot().corners.lf).toBeDefined();
  });

  it('clears on lifecycle changes and ignores replays', () => {
    const p = new TireProcessor();
    p.onFrame(frame(tires(80, 1)));
    p.onLifecycle({ type: 'enter', replay: true });
    expect(p.snapshot().corners).toEqual({});
    p.onFrame(frame(tires(80, 1)));
    expect(p.snapshot().corners).toEqual({});
  });

  it('logs a diagnostic line on an interval and immediately on wear change', () => {
    const info = vi.mocked(logger.info);
    info.mockClear();
    const p = new TireProcessor();
    p.onFrame(frame(tires(80, 1), 0));
    p.onFrame(frame(tires(81, 1), 1));
    expect(info).toHaveBeenCalledTimes(1);
    p.onFrame(frame(tires(81, 1), 2.5));
    expect(info).toHaveBeenCalledTimes(2);
    p.onFrame(frame(tires(81, 0.95), 3));
    expect(info).toHaveBeenCalledTimes(3);
    expect(info.mock.calls[2][0]).toContain('WEAR-CHANGED');
  });
});
