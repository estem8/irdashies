/** Chromium trace timestamps/durations are microseconds, not CPU time. */
export interface TraceEvent {
  ph: string;
  name?: string;
  pid: number;
  tid: number;
  ts?: number;
  dur?: number;
  args?: { name?: string };
}

interface Span {
  name: string;
  start: number;
  end: number;
}

interface ThreadSpans {
  pid: number;
  tid: number;
  name?: string;
  spans: Span[];
  boundaries: TraceEvent[];
  stack: TraceEvent[];
  unmatchedEnds: number;
}

/** Attribute overlapping synchronous spans once, to the innermost span. */
const summarizeThread = (thread: ThreadSpans, durationUs: number) => {
  const edges = thread.spans.flatMap((span) => [
    { at: span.start, span, entering: true },
    { at: span.end, span, entering: false },
  ]);
  edges.sort((a, b) => a.at - b.at);
  const active = new Set<Span>();
  const totals = new Map<string, { exclusiveUs: number; calls: number }>();
  for (const span of thread.spans) {
    const total = totals.get(span.name) ?? { exclusiveUs: 0, calls: 0 };
    total.calls++;
    totals.set(span.name, total);
  }
  let coveredUs = 0;
  let previousAt = edges[0]?.at ?? 0;
  let owner: Span | undefined;
  for (let index = 0; index < edges.length;) {
    const at = edges[index].at;
    if (owner) {
      const elapsed = at - previousAt;
      coveredUs += elapsed;
      const total = totals.get(owner.name);
      if (total) total.exclusiveUs += elapsed;
    }
    // Apply all edges at the same instant before assigning the next interval.
    while (index < edges.length && edges[index].at === at) {
      const edge = edges[index++];
      if (edge.entering) active.add(edge.span);
      else active.delete(edge.span);
    }
    owner = undefined;
    for (const span of active) {
      if (
        !owner ||
        span.start > owner.start ||
        (span.start === owner.start && span.end <= owner.end)
      ) {
        owner = span;
      }
    }
    previousAt = at;
  }
  return {
    pid: thread.pid,
    tid: thread.tid,
    name: thread.name,
    coveredMs: coveredUs / 1000,
    unmatchedBegins: thread.stack.length,
    unmatchedEnds: thread.unmatchedEnds,
    events: [...totals]
      .map(([name, total]) => ({
        name,
        calls: total.calls,
        exclusiveMs: total.exclusiveUs / 1000,
        wallMsPerSecond:
          durationUs > 0 ? (total.exclusiveUs / durationUs) * 1000 : null,
      }))
      .sort((a, b) => b.exclusiveMs - a.exclusiveMs),
  };
};

/**
 * Synchronous X/B/E wall-time attribution for one process. Async/sample events
 * are excluded. Unclosed boundary spans are reported and never synthesized.
 * Threads overlap in real time: their totals must not be added as frame time.
 */
export function summarizeTrace(events: readonly TraceEvent[], pid: number) {
  const threads = new Map<number, ThreadSpans>();
  let processName: string | undefined;
  let start = Infinity;
  let end = -Infinity;
  let selectedEvents = 0;
  for (const event of events) {
    if (event.ph !== 'M' && Number.isFinite(event.ts)) {
      const at = event.ts as number;
      start = Math.min(start, at);
      end = Math.max(
        end,
        at +
          (event.ph === 'X' && Number.isFinite(event.dur)
            ? Math.max(0, event.dur as number)
            : 0)
      );
    }
    if (event.pid !== pid) continue;
    selectedEvents++;
    let thread = threads.get(event.tid);
    if (!thread) {
      thread = {
        pid,
        tid: event.tid,
        spans: [],
        boundaries: [],
        stack: [],
        unmatchedEnds: 0,
      };
      threads.set(event.tid, thread);
    }
    if (event.ph === 'M') {
      if (event.name === 'thread_name') thread.name = event.args?.name;
      if (event.name === 'process_name') processName = event.args?.name;
      continue;
    }
    if (!Number.isFinite(event.ts)) continue;
    const at = event.ts as number;
    if (
      event.ph === 'X' &&
      Number.isFinite(event.dur) &&
      (event.dur ?? 0) > 0
    ) {
      thread.spans.push({
        name: event.name ?? '(unnamed)',
        start: at,
        end: at + (event.dur as number),
      });
    } else if (event.ph === 'B' || event.ph === 'E') {
      thread.boundaries.push(event);
    }
  }
  if (!selectedEvents) throw new Error(`Process ${pid} absent from trace`);
  for (const thread of threads.values()) {
    // Trace buffers need not arrive in timestamp order. Equal timestamps keep
    // their original order, so zero-length and nested B/E pairs remain valid.
    thread.boundaries.sort((a, b) => (a.ts as number) - (b.ts as number));
    for (const event of thread.boundaries) {
      if (event.ph === 'B') {
        thread.stack.push(event);
        continue;
      }
      const begin = thread.stack.pop();
      if (!begin) {
        thread.unmatchedEnds++;
      } else if ((event.ts as number) > (begin.ts as number)) {
        thread.spans.push({
          name: begin.name ?? '(unnamed)',
          start: begin.ts as number,
          end: event.ts as number,
        });
      }
    }
  }
  const durationUs =
    Number.isFinite(start) && Number.isFinite(end) ? end - start : 0;
  return {
    pid,
    processName,
    eventCount: events.length,
    selectedEventCount: selectedEvents,
    durationMs: durationUs / 1000,
    startUs: Number.isFinite(start) ? start : null,
    endUs: Number.isFinite(end) ? end : null,
    threads: [...threads.values()].map((thread) =>
      summarizeThread(thread, durationUs)
    ),
  };
}
