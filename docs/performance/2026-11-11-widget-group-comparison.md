# Widget group comparison in one application run

Date: 2026-11-11. Branch: `perf`. Source: `7fe617c5`.

## Result

The expensive compositing-artifact updates occur in both Full references,
are absent in Map-only, and are much smaller in Input-only. The next suspect
group is **Standings / Relative / Weather, or interactions involving those
widgets**. This experiment does not identify an individual widget within that
group. Map retains a measurable canvas/raster path of its own.

Use this group result to narrow subsequent work. Do not run every widget
through a long baseline/candidate protocol before identifying a specific issue.
Long matched repetitions remain necessary when validating a proposed fix.

## Method and validation

One application process was warmed for 60 seconds. Four phases followed:
Full → Map-only → Input-only → Full. Each phase paused native tape playback,
sought to 55 seconds, resumed at 1x, waited five seconds, and captured about
15 seconds beginning near tape position 60. The Full seed has Standings,
Relative, Input, Map, and Weather, with all 40 cars shown in Standings.
The final Full phase checks drift without repeating application startup.

The existing transient `widget-toggle-hide` renderer event unmounts selected
widget subtrees. The saved dashboard remains enabled and unchanged. Shared
container updaters remain mounted, and other consumers may keep channel demand
active. Therefore these are mounted-subtree contributions within a shared
pipeline, not standalone or additive costs. Direct test events do not update
the main-process hidden-ID set; no renderer reload occurred during the phases.

Verified for all four phases:

- same renderer PID 21687 and visible 2280 × 1320 overlay window;
- DPR 1, identical widget positions/sizes when present, and expected DOM IDs;
- same five-widget seed, native tape, playback speed, source revision and
  capture categories;
- rAF prechecks about 60 Hz, with similar reporting-interval cadence below;
- replay position about 60 immediately before each trace; the later status
  after export is around 78–79 seconds and includes export time;
- final full state restored, application exited zero at the fixed 240-second
  deadline. An earlier coordinator startup failure produced no traces and is
  excluded from this comparison.

## Process CPU and renderer cadence

The following figures come from **trace-instrumented** PerfMetrics/PerfRenderer
logs. Each phase retains only two complete five-second reporting intervals,
about ten seconds. The pretrace five-second windows have no fully contained
reporting interval, so no untraced per-phase CPU comparison is available.
These short samples are diagnostic, not a production performance gate.

CPU ms/s is accumulated process CPU time divided by sampled wall seconds;
1000 ms/s represents one fully used core. GPU process CPU is not GPU engine
utilization. rAF callback cadence is not game FPS or screen presentation.

| Metric | Full before | Map-only | Input-only | Full after |
| --- | ---: | ---: | ---: | ---: |
| Renderer CPU, ms/s | 309.00 | 108.00 | 125.82 | 299.02 |
| GPU process CPU, ms/s | 104.00 | 75.00 | 36.95 | 110.01 |
| Browser CPU, ms/s | 101.00 | 91.00 | 93.87 | 99.01 |
| All process CPU, ms/s | 514.01 | 274.01 | 256.65 | 509.08 |
| Renderer rAF callbacks/s | 59.40 | 60.00 | 58.30 | 59.30 |

The Full endpoint CPU totals differ by about 1%, and their rAF rates are
59.4 and 59.3 callbacks/s. This supports using the phases as a short diagnostic
comparison; it does not remove order, cache, or tracing overhead effects.

## Trace event attribution

All event rows are included in the analysis: an omitted top-N row was not
interpreted as zero. Each trace spans about 15.04–15.07 seconds. The table
normalizes exclusive synchronous event duration on the overlay's main thread
by the event-window length. Nested/overlapping spans are attributed once.
These are **wall durations**, not accumulated CPU time, and must not be added
to the process CPU table above.

| Main-thread event, wall ms/s | Full before | Map-only | Input-only | Full after |
| --- | ---: | ---: | ---: | ---: |
| FunctionCall | 107.54 | 22.72 | 40.53 | 104.66 |
| PaintArtifactCompositor::Update | 40.43 | 0.00 | 1.65 | 40.74 |
| RasterImplementation::RasterCHROMIUM | 8.90 | 9.47 | 0.62 | 8.85 |
| Document::recalcStyle | 4.78 | 0.00 | 3.21 | 4.83 |
| Layout | 2.15 | 0.00 | 0.88 | 2.23 |
| Paint | 2.32 | 0.00 | 0.46 | 2.31 |

The main-thread covered event union is approximately 207.63 / 49.34 / 67.92 /
198.01 ms/s respectively. Compositing-artifact update cost is stable across
Full references (40.44 → 40.74 ms/s), while Map-only records no such calls and
Input-only records about 1.65 ms/s. This narrows the expensive invalidation path
to the remaining group or combined interactions. It does not justify calling
Standings, Relative, or Weather individually the culprit yet.

Map-only keeps roughly 9.47 ms/s of main-thread raster-implementation spans,
versus 0.62 ms/s in Input-only; the Map drawing path therefore deserves its own
investigation, independently of the larger Full compositing path. V8 stack
samples continue to show `drawDrivers` and session-driver shallow comparisons.
Full has more shallow-comparison attribution than Map-only, consistent with
additional `useSessionDrivers` consumers; sample residence is not an exact CPU
bill.

## Decision and limits

Next, split the remaining group into Standings versus Relative/Weather using
short phases and inspect the responsible invalidations. Do not change the
renderer engine or remove required immediate canvas paints based on this
experiment alone. This is source-repository dev-mode Linux tape playback, not
an iRacing game run. No improvement in game FPS is claimed.

High-resolution tracing and sampling add load, including profiler startup
work. The order is fixed and there is no empty control. Shared processors,
updaters, and subscriptions prevent additive widget-cost arithmetic. CDP
completion did not supply a data-loss boolean in these sidecars; this remains
unknown. Boundary spans and sampled stacks retain the trace limitations
explained in the [previous trace report](2026-11-11-renderer-trace.md).

The capture sidecar clock envelope includes profiler start/stop and completion
latency, so it is longer than the event trace itself. The retained CPU intervals
were independently checked against the event windows using a local
wall/monotonic-clock calibration; the same ten-second samples remain inside.
No production gate is considered passed.

## Local artifacts

Raw data remains ignored under `perf-results/`:

- `renderer-groups-r2-20261111.log`, launcher log and run manifest;
- `traces/widget-groups-r2-20261111/phase-comparison-groups-r2-20261111.json`;
- four phase traces, capture sidecars, and full event/profile summaries there;
- `renderer-groups-r2-20261111.phase-metrics.json`;
- `launch-renderer-groups.py` and `trace-tools/` phase/capture/analysis helpers.

Only this English report and the plan update are added to the repository.
No production source or UI behavior changed in this comparison.
