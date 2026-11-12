# Radar static rings cache — 2026-11-12

## Hypothesis and application change

A current 10-second V8 renderer sample after 55 seconds of warmup attributed
173.8 ms of leaf time to Radar `drawRings`, the largest named application leaf.
It repeatedly strokes the same rings and paints distance labels each frame.
Raw sample: `perf-results/renderer-hotspot-r2/renderer.cpuprofile` and
`top-functions.json`. This motivated an application change rather than another
window-topology experiment.

`RadarRingsLayer` owns one lazily allocated transparent canvas per active Radar
painting effect. Size, range, ring spacing, units and font loading invalidate it;
DPR/widget scale are captured when that effect is created. Existing effect
recreation handles size/scale changes. Drawing copies device pixels 1:1, retaining
the original layer order, clipping and context state. Failure to obtain a cache
context uses the original drawing function. Disposal removes font listeners.
Road, cars, warnings, subscriptions and the animation cadence are unchanged.

## Matched normal-operation observation

Baseline source: `85dafdb8`, plus this cache change. Both paths ran in the same
Linux development app with all ten configured widgets operating normally, one
shared display renderer, DPR 1 and viewport 1549 × 1014. An ephemeral controller
switched only `RadarRingsLayer.prototype.draw`: baseline called the original ring
function; candidate called the cache implementation. Both used the same counting
wrapper, restored afterwards. No source suppression or CPU profiler ran during
timed phases. Each phase sought the same tape to 55 seconds, settled for five
seconds, then measured 30 seconds at 1x. Baseline tape position was
59.954–89.973; candidate 59.939–89.957.

| Metric                                                 |    Baseline |       Cache |
| ------------------------------------------------------ | ----------: | ----------: |
| Radar draws, full 30-second phase                      |        1759 |        1739 |
| Mean Radar drawing time, complete diagnostic intervals |   0.2638 ms |   0.2437 ms |
| Radar drawing time per second, complete intervals      |   15.492 ms |   14.172 ms |
| Total process CPU, descriptive endpoint delta          | 541.42 ms/s | 519.71 ms/s |

Each drawing mean weights five wholly contained five-second intervals by draw
count (1468 / 1454 draws). The observed per-draw reduction is 7.6%; cadence differs
by about 1.1%. CPU sums unique process lifetimes using cumulative CPU seconds.
One sequential pair does not establish repeatability, uncertainty or causality
for overall CPU. No overall CPU, FPS, compositor or memory improvement is claimed.
The direct work reduction is deterministic: subsequent frames blit the cached
layer instead of rebuilding arcs and labels. The measured whole-Radar gain is
modest, and the cache is retained on that scoped basis.

## Behavior, cost and verification

48 Radar tests passed across nine files, including cache reuse, settings/size
invalidation, disabled rings, font invalidation/disposal and fallback. Existing
Radar tests cover dynamic scene behavior. `npm run lint` passed, including
TypeScript. Formatting and `git diff --check` passed.

A browser comparison drew the same static scene with and without caching for
metric/imperial units at ratios 0.75, 1, 1.5, 1.875 and 2. All ten cases preserve
placement and readable labels. Offscreen composition introduces small
antialiasing differences: maximum channel difference 3–8 of 255. Actual PNGs
were reviewed at `/tmp/irdashies-rings-review/{before,after}.png`, outside git.
This synthetic scene is not full traffic, physical DPI or native iRacing testing.

The cache adds one bounded pixel surface: approximately 0.35 MiB at 301 pixels
and ratio 1, or 1.38 MiB at ratio 2, excluding browser texture overhead. There is
no history or shared global cache. Physical high refresh/DPI, Windows and native
runtime acceptance remain open in the active plan.

Raw run: `perf-results/radar-rings-ab-r1/` (ignored). The adjacent
[JSON evidence](2026-11-12-radar-rings.json) records measurements and SHA-256 hashes
of phases, logs, pixel comparison results and the ephemeral controller.
