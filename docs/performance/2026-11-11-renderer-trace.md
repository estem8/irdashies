# Track Map draw attribution and Chromium trace

Date: 2026-11-11. Branch: `perf`. Capture build: `5b354cec`.

## Instrumentation change

Track Map now reports `trackMapCommitDraw` and `trackMapRafDraw` alongside the
existing combined `trackMapAnimationFrame` metric. Appearance and target
layout effects count as commit draws; intermediate and final animation
callbacks count as rAF draws. Scheduling, interpolation, precision, and visible
behavior are unchanged.

The timing helper reads the clock once before and once after drawing, then
records the identical duration under the combined and selected breakdown
names. It invokes the draw only once and creates no additional per-frame
closure. With profiling disabled it still invokes the callback directly.
Buffers remain bounded and reporting uses the existing aggregate log path.
The second bridge record adds overhead when profiling is enabled; that
recording cost is outside the timed draw. It is not a measured production
performance improvement.

The analyzer reports rates and interval p99 values for both paths. Historical
logs without these fields show `n/a`, while a measured loop with an idle
interval reports zero count. Percentiles are not additive; counts and summed
durations partition the legacy metric.

Validation: 47 targeted tests passed across timing helper, animation hook,
renderer aggregation, and analyzer. TypeScript and ESLint passed. Tests cover
partition equality, return values, exceptions, disabled profiling, animation
cleanup/cap behavior, and missing-versus-zero compatibility.

## Capture method

A fresh copy of the same five-widget seed used in the previous report was run
with native tape playback at 1x, no looping, 40 cars and three classes.
Settings remained closed. Runtime topology is complete: one visible
2280 × 1320 display renderer and one 620 × 104 tape-control window. The
120-second app run completed with exit code zero. Installed versions were
Electron 45.2.3, React 19.3.1, Zustand 5.1.0, and Vite 8.3.6; the launcher
used Node v24.22.2 on Linux.

- Seed SHA-256: `97f08691ea0366271cfd2fbbb753379998e1921d584e4c7cf9b5b67e6be651ad`.
- Fixture SHA-256: `6e23e8abab49c1a0ae7c8f6d1f298d31145a6189d3029b8ca540aad56a22b168`.
- Trace began after 60 seconds of warmup and recorded about 25 seconds.
- A local CDP connection collected timeline, V8 sampling, Blink, compositor,
  GPU, GC, and task events. No React Profiler wrapper was installed.
- V8 sampling and tracing add load. This diagnostic is not a matched production
  CPU A/B or a measurement of iRacing presentation.

## Draw breakdown before tracing

Every one of the 23 renderer reporting intervals satisfies both count and
duration partition equality. Five complete intervals after 30 seconds of
warmup and before tracing cover 25 seconds without the tracing sampler:

| Path | Draw callbacks/s | Timed draw ms/s | Mean callback, ms |
| --- | ---: | ---: | ---: |
| React commit | 22.96 | 4.320 | 0.1882 |
| rAF | 59.84 | 16.972 | 0.2836 |
| Combined | 82.80 | 21.292 | 0.2571 |

Renderer rAF cadence in that window is about 59.88 callbacks/s, with a 16.7 ms
median interval. These figures cannot be compared as a code improvement against
the earlier runs at roughly 168 callbacks/s. The extra commit draws account
for about 27.7% of calls and 20.3% of timed draw duration in this window.
They can be required to repaint immediately after a cache or size change;
these counters do not establish that all commit paints are redundant.

## Trace findings

The trace contains 809,232 events over approximately 25.086 seconds. Source
renderer PID 16448 is identified by runtime topology and trace metadata.
The parser finds two V8 profiles and resolves all sampled node IDs. It records
16 unmatched begin spans and no unmatched end spans; unclosed spans are not
included in the duration breakdown. A zero count of trace data-loss events is
not a substitute for a persisted CDP completion flag.

On the overlay's main thread, the union of recorded synchronous duration events
covers 4,879.84 ms. The following rows assign nested/overlapping event intervals
once per thread. These are traced wall durations, not scheduler CPU time:

| Overlay main-thread event | Exclusive duration, ms / capture | Calls |
| --- | ---: | ---: |
| FunctionCall | 2242.32 | 19363 |
| PaintArtifactCompositor::Update | 1055.37 | 1458 |
| RasterImplementation::RasterCHROMIUM | 230.35 | 3321 |
| Document::recalcStyle | 182.18 | 1547 |
| Blink.PrePaint.UpdateTime | 85.19 | 1470 |
| LocalFrameView::performLayout | 83.26 | 639 |
| Paint | 76.14 | 1499 |

These selected rows do not account for all recorded work. The renderer's
separate compositor thread covers another 830.75 ms of synchronous spans;
GPU and worker threads are distinct. Durations across threads overlap in time
and must not be added to produce a frame time.

V8 leaf sample attribution on the renderer includes approximately 267.58 ms in
an anonymous `trackDrawingUtils.ts` callback and 280.59 ms across Zustand
`compareEntries` and iterable `entries` functions. Map stack paths lead through
`drawDrivers`, the TrackCanvas dynamic draw, and the animation callback.
Zustand paths lead through `arrayShallowCompare` and `useSessionDrivers`,
including TrackMap's `useDriverProgress` and the Relative/Standings
`useIsSingleMake`/`useDrivers` paths. This narrows the next equality investigation
to session-driver comparisons rather than the new primitive Map comparator.
The generic `run` frame has
825.64 ms of leaf attribution but no source URL; it is not a sufficient basis
for changing a particular application function, although its ancestry passes
through React scheduler/commit work. These values identify paths
for closer inspection, not precise CPU bills. Vite profile line numbers refer
to served JavaScript and must not be used as raw TypeScript line numbers.
The renderer's sampled garbage-collector attribution is about 80.19 ms;
this capture does not establish GC as the primary source of repeated hitches.

Profiling itself introduces visible startup work:
`CpuProfiler::StartProfiling` records approximately 143.91 ms on the renderer
and 42.64 ms on Browser. A large `dispatchEvent` sample appears around profiler
startup. These events are not evidence of a recurring application/game hitch.
Likewise, Browser's roughly 20.75 seconds of sampled native SDK-stack residence
includes blocking wait: it does not mean the main process consumed that much
CPU. SDK wait, telemetry conversion, and accumulated process CPU remain
separate measurements.

## Review decision and next measurements

The trace confirms that React render duration alone omits material work:
compositing-artifact updates, canvas drawing, style/layout/paint, effects, and
bridge callbacks. It does not identify the widget responsible for every such
span or establish the cause of game FPS spikes.

1. Keep the draw categories for further captures. Do not remove immediate
   commit paints merely because they are additional calls.
2. Run full/Input-only/Map-only traces with the same geometry and stable
   measured renderer cadence. Attribute compositing invalidations and draw
   costs to the responsible widget before changing its update mechanism.
3. Follow the sampled Zustand comparison paths to their actual callers. Any
   narrower comparator must preserve existing equality semantics, including
   session/driver object handling; do not reintroduce deeper comparisons or
   round calculation inputs to make notifications disappear.
4. Validate SDK waiting and actual game presentation separately on Windows.
   Moving native waits or replacing the renderer is a larger change requiring
   its own evidence and lifecycle/cancellation design.

A full renderer-engine rewrite is not justified by this trace. The next
implementation should target a measured source of invalidation, allocation,
or unnecessary work and be checked with a controlled before/after capture.

## Artifacts and limits

Raw artifacts stay in ignored `perf-results/`:

- `renderer-stage-e-20261111.log`, launcher log, and run manifest;
- `traces/renderer-stage-e-20261111.json` and its summary;
- `trace-tools/` capture, summary, and synthetic validation helpers;
- `launch-renderer-trace.py`, which records the source SHA and waits for the
  performance origin before scheduling the trace.

Trace SHA-256:
`cd76badbbdeb80719f50135cc67f444e94ada573c45a112e8d67bcc4c0627cac`.
The trace file is approximately 158 MiB. Its requested buffer-size limit was
not verified against this Electron CDP schema; no 64 MiB cap is claimed.
The trace parser handles complete and begin/end spans, attributes overlapping
time once per thread, and maps V8 sampler-thread chunks back to their source
thread. Unclosed boundary spans and sampling/trace startup work limit exact
attribution. Trace event wall durations and V8 sample attribution are not the
same as accumulated process CPU time. In particular, a synchronous native wait
can retain a sampled JS/native frame while the process consumes little CPU.
