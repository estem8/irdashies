import { describe, expect, it } from 'vitest';
import { summarizeTrace, type TraceEvent } from './traceSummary';

const x = (name: string, ts: number, dur: number, tid = 1): TraceEvent => ({
  ph: 'X',
  name,
  ts,
  dur,
  pid: 10,
  tid,
});
const phase = (ph: string, ts: number, name?: string): TraceEvent => ({
  ph,
  ts,
  name,
  pid: 10,
  tid: 1,
});

const main = (events: TraceEvent[]) => summarizeTrace(events, 10).threads[0];
const duration = (events: TraceEvent[], name: string) =>
  main(events).events.find((event) => event.name === name)?.exclusiveMs;

describe('Chromium synchronous wall-duration attribution', () => {
  it('partitions nested spans rather than adding inclusive durations', () => {
    const events = [x('Task', 0, 10_000), x('Paint', 2_000, 3_000)];
    expect(main(events).coveredMs).toBe(10);
    expect(duration(events, 'Task')).toBe(7);
    expect(duration(events, 'Paint')).toBe(3);
    expect(
      main(events).events.find((e) => e.name === 'Paint')?.wallMsPerSecond
    ).toBe(300);
  });

  it('assigns crossing overlap to the later-started span only once', () => {
    const events = [x('A', 0, 10_000), x('B', 5_000, 10_000)];
    expect(main(events).coveredMs).toBe(15);
    expect(duration(events, 'A')).toBe(5);
    expect(duration(events, 'B')).toBe(10);
  });

  it('treats equal-start shorter spans as nested regardless of input order', () => {
    const events = [x('Paint', 0, 2_000), x('Task', 0, 10_000)];
    expect(duration(events, 'Paint')).toBe(2);
    expect(duration(events, 'Task')).toBe(8);
  });

  it('handles touching spans and gaps without charging idle time', () => {
    const events = [
      x('A', 0, 1_000),
      x('B', 1_000, 1_000),
      x('A', 4_000, 1_000),
    ];
    expect(main(events).coveredMs).toBe(3);
    expect(main(events).events.find((e) => e.name === 'A')?.calls).toBe(2);
  });

  it('pairs begin/end events and excludes unclosed boundary spans', () => {
    const events = [
      phase('E', 0),
      phase('B', 1_000, 'Task'),
      phase('B', 2_000, 'Paint'),
      phase('E', 3_000),
      phase('E', 5_000),
      phase('B', 6_000, 'Unclosed'),
    ];
    expect(main(events).coveredMs).toBe(4);
    expect(duration(events, 'Task')).toBe(3);
    expect(duration(events, 'Paint')).toBe(1);
    expect(duration(events, 'Unclosed')).toBeUndefined();
    expect(main(events).unmatchedBegins).toBe(1);
    expect(main(events).unmatchedEnds).toBe(1);
  });

  it('pairs begin/end events from buffers that arrive out of timestamp order', () => {
    const events = [phase('E', 5_000), phase('B', 1_000, 'Task')];
    expect(duration(events, 'Task')).toBe(4);
    expect(main(events).unmatchedBegins).toBe(0);
    expect(main(events).unmatchedEnds).toBe(0);
  });

  it('keeps threads separate and reads metadata without changing the time range', () => {
    const result = summarizeTrace(
      [
        {
          ph: 'M',
          name: 'process_name',
          pid: 10,
          tid: 1,
          ts: 0,
          args: { name: 'Renderer' },
        },
        {
          ph: 'M',
          name: 'thread_name',
          pid: 10,
          tid: 1,
          ts: 0,
          args: { name: 'CrRendererMain' },
        },
        x('Main', 10_000, 2_000),
        x('Worker', 10_000, 2_000, 2),
        {
          ph: 'X',
          name: 'Other process',
          pid: 20,
          tid: 1,
          ts: 9_000,
          dur: 4_000,
        },
      ],
      10
    );
    expect(result.durationMs).toBe(4);
    expect(result.processName).toBe('Renderer');
    expect(result.threads[0].name).toBe('CrRendererMain');
    expect(result.threads.map((t) => t.coveredMs)).toEqual([2, 2]);
  });

  it('excludes async, samples, invalid timestamps and nonpositive durations', () => {
    const events = [
      x('Valid', 0, 1_000),
      x('Invalid', NaN, 100),
      x('Negative', 0, -100),
      phase('b', 0, 'Async'),
      phase('e', 1_000),
      phase('P', 500, 'Sample'),
    ];
    expect(main(events).coveredMs).toBe(1);
    expect(main(events).events.map((e) => e.name)).toEqual(['Valid']);
  });

  it('reports an absent target process instead of presenting empty evidence', () => {
    expect(() => summarizeTrace([x('Task', 0, 100)], 42)).toThrow('absent');
  });

  it('handles metadata-only traces without inventing measured duration', () => {
    const result = summarizeTrace(
      [
        {
          ph: 'M',
          name: 'process_name',
          pid: 10,
          tid: 1,
          args: { name: 'Renderer' },
        },
      ],
      10
    );
    expect(result.durationMs).toBe(0);
    expect(result.startUs).toBeNull();
    expect(result.threads[0].coveredMs).toBe(0);
  });
});
