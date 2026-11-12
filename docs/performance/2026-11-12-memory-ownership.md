# Collection-off V8 ownership diagnostic — 2026-11-12

The bounded diagnostic rules out **net retained main-process V8 used-heap
growth in this measured interval**. It does not identify the owner of the
previous long-session private-memory growth. Overlay private growth did not
repeat across the control and sampled phases, so no allocation site is
established as its cause. No application optimization is claimed.

`memory-ownership-r2` completed two 420-second candidate-only Linux development
runs, exit 0, duration markers and candidate-source restoration. The source
checkpoint is `e0f88105`; the capture controller changes are retained in each
phase's ignored `source.diff`. Both use the reconstructed ten-widget seed,
Settings closed, looping disabled, the same tape at 1×, 1549×1009 / DPR 1,
and `PERF_METRICS_COLLECTION=off`. The existing preflight asserts the renderer
metric bridge is absent and snapshots are live. External process/rAF sampling
remains enabled and is itself diagnostic work.

Both phases force GC near 55 and 390 seconds. Only `off-sampled` enables V8
allocation sampling (32 KiB interval), excluding objects collected by either
minor or major GC. Sampling stops after endpoint GC. It estimates allocations
still live that were made after sampling started, not total allocation traffic,
exact retained size, retaining paths, or a leak. Objects predating sampling and
native allocations are outside that profile.

| Phase   | Process | Post-GC V8 used-heap delta MiB | Linux private delta MiB | Sampled live allocations MiB |
| ------- | ------- | -----------------------------: | ----------------------: | ---------------------------: |
| Control | Main    |                         -0.216 |                  +0.711 |                  unavailable |
| Control | Overlay |                         +2.689 |                  +8.215 |                  unavailable |
| Sampled | Main    |                         -0.410 |                  +0.668 |                        1.107 |
| Sampled | Overlay |                         +0.639 |                 -11.883 |                        3.780 |

Heap boundaries are 55.31–390.92 and 55.55–390.94 seconds (see JSON for exact
values). External private endpoints are 65.07–396.23 and 65.08–396.30 seconds;
they are nearby samples, not simultaneous GC measurements. Do not subtract
heap or subsystem counters from private memory to infer native retained bytes.
Backing storage grows about 0.50–0.51 MiB in main and 0.61 MiB in overlay;
embedder heap is unchanged in main and grows 1.07/0.17 MiB in overlay. These
accounting views are retained separately and must not be added as disjoint
memory components.

The sampled main allocation sites include Node timer processing (~450 KiB),
YAML construction (~162 KiB), and SDK session reads/normalization (~77 KiB
at each of two sites). Overlay samples include preload delivery (~423 KiB),
React development JSX construction under Standings, driver-position mapping
and Radar painting. These are allocation stacks for currently live objects;
they do not identify who retains them. Main's live samples coexist with a net
heap decrease, demonstrating why a nonzero sampled site is not evidence of
accumulating objects. Build chunk names containing `perfMetrics` also contain
bundled processors and do not establish collector activity.

The control/sample difference, one phase per mode, boundary GC, and short
Settings-closed workload prevent attribution of the older Settings-open
20-minute result. This result does not rule out a long-session or native leak.
The next discriminating measurement is collection-off, Settings-preview-active
steady state with external dirty/anonymous counters and post-GC heap checkpoints
across at least 20 minutes. If private growth reproduces while V8 remains flat,
use a native live-allocation sampler on that growing process; verify sampler
availability first and retain an unsampled control. Do not repeat the already
completed instrumented long runs or infer ownership from RSS alone.

The first attempt was rejected before measurement because expected viewport
height 1014 differed from actual 1009. It has zero completed phases and is not
included. The repeat corrected the declared viewport without relaxing checks.

[Bounded evidence](2026-11-12-memory-ownership.json) includes source/seed metadata,
heap counters, top allocation stacks and raw artifact hashes. Raw profiles and
logs remain ignored under `perf-results/memory-ownership-r2`. The report checks
both completed collection-off phases, timing, sample gaps, process lifetimes,
and matched source/seed/declared environment. No Windows or game presentation
result is claimed.

```sh
PERF_DIAGNOSTIC_VIEWPORT_HEIGHT=1009 node tools/perf/capture/long-matrix.mjs memory-ownership-new ownership
node tools/perf/capture/report-ownership.mjs perf-results/memory-ownership-new /tmp/memory-ownership.json
```

Validation: capture completed; report executed against both phases; all ten
capture test files passed, including allocation-site aggregation and invalid
sample checks. TypeScript/ESLint and formatting checks are recorded with the
plan checkpoint.
