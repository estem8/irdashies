import { describe, expect, it, vi } from 'vitest';
import type { Session, Telemetry } from '@irdashies/types';
import { TireProcessor } from './TireProcessor';

vi.mock('../tyreLog', () => ({
  tyreLog: vi.fn(),
  startTyreRun: vi.fn(),
  tyreFile: vi.fn(),
  stamp: vi.fn(() => '2026-10-26 000000'),
}));
import { tyreLog } from '../tyreLog';

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
      estimated: false,
      tempEstimated: false,
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

  it('starts over when the session number changes', () => {
    const p = new TireProcessor();
    p.onFrame(frame({ ...tires(80, 1), SessionNum: 0 }));
    p.onFrame(frame({ ...tires(80, 1), SessionNum: 0 }));
    const version = p.snapshot().version;
    p.onFrame(frame({ ...tires(80, 1), SessionNum: 1 }));
    // clear() bumps the version even though the new reading looks alike.
    expect(p.snapshot().version).toBeGreaterThan(version);
  });

  it("shows the start value of a new session, not the last one's frozen reading, before driving", () => {
    const p = new TireProcessor();
    p.onFrame(frame({ ...tires(80, 1), SessionNum: 0 }));
    // The race grid: iRacing still reports the previous stop's uneven zones.
    const stale = {
      ...tires(65, 1),
      LFtempCL: 59,
      LFtempCR: 69,
      SessionNum: 1,
    };
    p.onFrame(frame(stale));
    expect(p.snapshot().corners.lf?.temp[2]).toBeLessThanOrEqual(44);
    expect(p.snapshot().corners.lf?.tempEstimated).toBe(false);
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
    const info = vi.mocked(tyreLog);
    info.mockClear();
    const lines = () =>
      info.mock.calls.filter((c) => !/keys\(|CALIB|TireFit/.test(String(c[0])));
    const p = new TireProcessor();
    p.onFrame(frame(tires(80, 1), 0));
    p.onFrame(frame(tires(81, 1), 1));
    expect(lines()).toHaveLength(1);
    p.onFrame(frame(tires(81, 1), 2.5));
    expect(lines()).toHaveLength(2);
    p.onFrame(frame(tires(81, 0.95), 3));
    expect(lines()).toHaveLength(3);
    expect(lines()[2][0]).toContain('WEAR-CHANGED');
  });

  describe('stint tracking', () => {
    // Laps are driven by LapCompleted; a refresh is a change in the readings.
    const at = (
      wear: number,
      lap: number,
      extra: Record<string, number | boolean> = {}
    ) => frame({ ...tires(80, wear), LapCompleted: lap, ...extra });

    it('does not estimate during the first stint', () => {
      const p = new TireProcessor();
      p.onFrame(at(1, 0));
      p.onFrame(at(1, 5));
      const lf = p.snapshot().corners.lf;
      expect(lf?.estimated).toBe(false);
      expect(lf?.wear).toEqual([100, 100, 100]);
    });

    it('derives a rate at the first refresh and resets after a tire change', () => {
      const p = new TireProcessor();
      p.onFrame(at(1, 0));
      // Stop after 10 laps: 10 points lost. All four tires are changed.
      p.onFrame(at(0.9, 10, { PitSvFlags: 0xf }));
      const lf = p.snapshot().corners.lf;
      expect(lf?.wearPerLap).toEqual([1, 1, 1]);
      expect(lf?.wear).toEqual([100, 100, 100]);
      expect(lf?.estimated).toBe(true);
      // Four laps into the next stint the estimate follows the rate.
      p.onFrame(at(0.9, 14, { PitSvFlags: 0xf }));
      expect(p.snapshot().corners.lf?.wear).toEqual([96, 96, 96]);
    });

    it('keeps the reading as the baseline when a tire is not changed', () => {
      const p = new TireProcessor();
      p.onFrame(at(1, 0));
      p.onFrame(at(0.9, 10, { PitSvFlags: 0x1 }));
      // LF was changed; RF was not and carries on from its reading.
      expect(p.snapshot().corners.lf?.wear).toEqual([100, 100, 100]);
      expect(p.snapshot().corners.rf?.wear).toEqual([90, 90, 90]);
    });

    it('ignores a stint too short to give a rate', () => {
      const p = new TireProcessor();
      p.onFrame(at(1, 0));
      p.onFrame(at(0.99, 1, { PitSvFlags: 0xf }));
      expect(p.snapshot().corners.lf?.estimated).toBe(false);
    });

    it('starts over after a lifecycle reset', () => {
      const p = new TireProcessor();
      p.onFrame(at(1, 0));
      p.onFrame(at(0.9, 10, { PitSvFlags: 0xf }));
      p.onLifecycle({ type: 'sessionNumChange' });
      p.onFrame(at(0.8, 3));
      expect(p.snapshot().corners.lf?.estimated).toBe(false);
      expect(p.snapshot().corners.lf?.wear).toEqual([80, 80, 80]);
    });
  });

  describe('saved calibration', () => {
    const session = {
      DriverInfo: { DriverCarIdx: 0, Drivers: [{ CarIdx: 0, CarPath: 'car' }] },
      WeekendInfo: { TrackName: 'track', SubSessionID: 1 },
    } as unknown as Session;

    it('does not count a stop that taught the model nothing', () => {
      const store = { load: vi.fn(), save: vi.fn() };
      const p = new TireProcessor(store);
      p.init(session);
      // Two readings in a row with no driving between them: nothing to learn.
      p.onFrame(frame(tires(80, 1), 0));
      p.onFrame(frame(tires(81, 0.9), 1));
      expect(store.save).not.toHaveBeenCalled();
    });
  });

  describe('load from suspension travel', () => {
    const travel = (m: number) =>
      Object.fromEntries(
        ['LF', 'RF', 'LR', 'RR'].map((c) => [`${c}SHshockDefl`, m])
      );

    it('reads the SH-named shock travel NASCAR cars publish', () => {
      const p = new TireProcessor();
      p.onFrame(frame({ ...tires(80, 1), ...travel(0.05), Speed: 0 }, 0));
      p.onFrame(frame({ ...tires(80, 1), ...travel(0.075), Speed: 30 }, 1));
      expect(p.snapshot().corners.lf?.load).toBe(1.5);
    });
  });

  describe('snapshot', () => {
    const pressure = (kpa: number) => ({
      LFcoldPressure: kpa,
      RFcoldPressure: kpa,
      LRcoldPressure: kpa,
      RRcoldPressure: kpa,
    });

    it('keeps the object of a tire that did not change', () => {
      const p = new TireProcessor();
      p.onFrame(frame({ ...tires(80, 1), ...pressure(160) }, 0));
      const before = p.snapshot().corners;
      const version = p.snapshot().version;
      // Only the right front changes its pressure.
      p.onFrame(
        frame({ ...tires(80, 1), ...pressure(160), RFcoldPressure: 150 }, 1)
      );
      const after = p.snapshot().corners;
      expect(p.snapshot().version).toBe(version + 1);
      expect(after.lf).toBe(before.lf);
      expect(after.lr).toBe(before.lr);
      expect(after.rf).not.toBe(before.rf);
      expect(after.rf?.pressure).toBe(150);
    });

    it('does not publish again when nothing a card shows changed', () => {
      const p = new TireProcessor();
      p.onFrame(frame({ ...tires(80, 1), ...pressure(160) }, 0));
      const version = p.snapshot().version;
      p.onFrame(frame({ ...tires(80, 1), ...pressure(160) }, 1));
      expect(p.snapshot().version).toBe(version);
    });
  });
});
