import { describe, expect, it } from 'vitest';
import {
  aggregate,
  checkSameProcess,
  parseArgs,
  parseCsv,
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

  it('reads a full 2.x header with NA values and finds dropped frames', () => {
    const header =
      'Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,CPUStartTime,FrameTime,CPUBusy,CPUWait,GPULatency,GPUTime,GPUBusy,GPUWait,VideoBusy,DisplayLatency,DisplayedTime';
    const text = [
      header,
      'iRacingSim64DX11.exe,1,0x1,DXGI,0,0,0,Hardware: Independent Flip,0.0,16.6,6.1,0.2,1.0,7.9,7.5,0.4,0,17.0,16.6',
      'iRacingSim64DX11.exe,1,0x1,DXGI,0,0,0,Hardware: Independent Flip,16.6,16.7,6.0,0.2,1.0,7.8,7.4,0.4,0,NA,NA',
    ].join('\n');
    const { frames } = readFrames(text, { skipSeconds: 0 });
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      frameTime: 16.6,
      cpuBusy: 6.1,
      gpuBusy: 7.5,
      dropped: false,
    });
    expect(frames[1].dropped).toBe(true);
    expect(summarize(frames).droppedPercent).toBe(50);
  });

  it('reads the 1.x Ms-prefixed names', () => {
    const text = [
      'Application,MsBetweenPresents,MsCPUBusy,MsGPUBusy,Dropped',
      'game.exe,16.6,6,7,0',
    ].join('\n');
    const { frames } = readFrames(text, { skipSeconds: 0 });
    expect(frames[0]).toMatchObject({
      frameTime: 16.6,
      cpuBusy: 6,
      gpuBusy: 7,
      dropped: false,
    });
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

  const setOf = (label: string, runs: number[][]) => ({
    label,
    aggregate: aggregate(
      runs.map((times) => summarize(times.map((frameTime) => ({ frameTime }))))
    ),
  });

  it('shows an absolute change when the baseline value is zero', () => {
    const calm = [10, 10, 10, 10];
    const hitchy = [10, 10, 10, 50, 50];
    const table = renderTable([
      setOf('baseline', [calm]),
      setOf('full', [hitchy]),
    ]);
    expect(table).toContain('| spikes > 2x median | 0 | 2 +2 abs |');
  });

  it('marks a mean inside the baseline range and explains the mark', () => {
    const table = renderTable([
      setOf('baseline', [
        [10, 10],
        [12, 12],
      ]),
      setOf('full', [[11.5, 11.5]]),
    ]);
    expect(table).toContain('| 11.50 +4.5% ≈ |');
    expect(table).toContain('inside the baseline min-max range');
  });

  it('does not mark a mean outside the baseline range', () => {
    const table = renderTable([
      setOf('baseline', [
        [10, 10],
        [12, 12],
      ]),
      setOf('full', [[20, 20]]),
    ]);
    expect(table).not.toContain('≈ |');
  });

  it('says when a metric has no baseline', () => {
    const withCpu = [{ frameTime: 10, cpuBusy: 4 }];
    const table = renderTable([
      setOf('baseline', [[10, 10]]),
      {
        label: 'full',
        aggregate: aggregate([summarize(withCpu)]),
      },
    ]);
    expect(table).toContain('(no baseline)');
  });

  it('requires the same process in every capture', () => {
    expect(
      checkSameProcess([
        { file: 'a.csv', process: 'game.exe' },
        { file: 'b.csv', process: 'GAME.exe' },
      ])
    ).toBe('game.exe');
    expect(() =>
      checkSameProcess([
        { file: 'a.csv', process: 'game.exe' },
        { file: 'b.csv', process: 'dwm.exe' },
      ])
    ).toThrow(/b\.csv: dwm\.exe/);
  });

  it('trims the warm-up by the timestamp column when there is one', () => {
    // Frame times are tiny but the timestamps say 10 s passed
    const text = [
      'Application,CPUStartTime,FrameTime',
      ...Array.from({ length: 11 }, (_, i) => `g.exe,${i},1`),
    ].join('\n');
    const { frames } = readFrames(text, { skipSeconds: 5 });
    expect(frames).toHaveLength(6);
    expect(summarize(frames).seconds).toBeCloseTo(5.001, 3);
  });

  it('prefers FrameTime over MsBetweenPresents when both exist', () => {
    const text = 'Application,MsBetweenPresents,FrameTime\ng.exe,99,16';
    expect(readFrames(text, { skipSeconds: 0 }).frames[0].frameTime).toBe(16);
  });

  it('keeps commas inside quoted cells in their column', () => {
    const { rows } = parseCsv('A,B\n"x,y",2');
    expect(rows).toEqual([['x,y', '2']]);
  });

  it('refuses a damaged capture', () => {
    const lines = ['Application,FrameTime'];
    for (let i = 0; i < 50; i++) lines.push('g.exe,16');
    lines.push('g.exe', 'g.exe,16,extra', 'g.exe');
    expect(() => readFrames(lines.join('\n'), { skipSeconds: 0 })).toThrow(
      /damaged/
    );
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
