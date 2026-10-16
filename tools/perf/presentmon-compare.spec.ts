import { describe, expect, it } from 'vitest';
import {
  aggregate,
  parseArgs,
  percentile,
  readFrames,
  renderTable,
  summarize,
} from './presentmon-compare.mjs';

const csv2 = (rows: string[]) =>
  ['Application,FrameTime,CPUBusy,GPUBusy', ...rows].join('\n');

describe('presentmon-compare', () => {
  it('interpolates percentiles', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10], 0.99)).toBe(10);
    expect(percentile([], 0.5)).toBeNaN();
  });

  it('reads PresentMon 2.x columns for the busiest process', () => {
    const rows = [
      ...Array.from({ length: 6 }, () => 'iRacingSim64DX11.exe,10,4,6'),
      'dwm.exe,16,1,1',
    ];
    const { process, frames } = readFrames(csv2(rows), { skipSeconds: 0 });
    expect(process).toBe('iRacingSim64DX11.exe');
    expect(frames).toHaveLength(6);
    expect(frames[0]).toMatchObject({ frameTime: 10, cpuBusy: 4, gpuBusy: 6 });
  });

  it('reads PresentMon 1.x columns', () => {
    const text = [
      'Application,MsBetweenPresents,Dropped',
      'game.exe,16.6,0',
      'game.exe,33.3,1',
    ].join('\n');
    const { frames } = readFrames(text, { skipSeconds: 0 });
    expect(frames.map((frame) => frame.frameTime)).toEqual([16.6, 33.3]);
    expect(summarize(frames).droppedPercent).toBe(50);
  });

  it('trims the warm-up by elapsed frame time', () => {
    const rows = Array.from({ length: 10 }, () => 'game.exe,1000,1,1');
    const { frames } = readFrames(csv2(rows), { skipSeconds: 3 });
    // Frames that start before the three second mark are dropped
    expect(frames).toHaveLength(7);
  });

  it('fails clearly without a frame time column', () => {
    expect(() => readFrames('Application,Other\na,1')).toThrow(/frame time/i);
  });

  it('counts spikes against the median', () => {
    const frames = [10, 10, 10, 10, 50].map((frameTime) => ({ frameTime }));
    const summary = summarize(frames);
    expect(summary.p50).toBe(10);
    expect(summary.spikes).toBe(1);
    expect(summary.cpuBusy).toBeUndefined();
  });

  it('renders deltas against the first set', () => {
    const make = (label: string, p50: number) => ({
      label,
      aggregate: aggregate([
        summarize([p50, p50, p50].map((frameTime) => ({ frameTime }))),
      ]),
    });
    const table = renderTable([make('baseline', 10), make('full', 11)]);
    expect(table).toContain('| frame time p50 (ms) | 10.00 | 11.00 +10.0% |');
  });

  it('parses label=files groups and rejects a single set', () => {
    expect(
      parseArgs(['a=1.csv,2.csv', 'b=3.csv', '--skip-seconds', '2'])
    ).toEqual({
      skipSeconds: 2,
      groups: [
        { label: 'a', files: ['1.csv', '2.csv'] },
        { label: 'b', files: ['3.csv'] },
      ],
    });
    expect(() => parseArgs(['a=1.csv'])).toThrow(/two sets/);
  });
});
