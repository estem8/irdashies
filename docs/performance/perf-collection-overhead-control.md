# Metrics collection control for overhead measurement

`PERF_METRICS=1` enables the existing isolated capture bootstrap, replay
visibility overrides and fixed-duration lifecycle. Setting
`PERF_METRICS_COLLECTION=off` additionally disables optional default main metrics
collectors and renderer reporter arguments. It leaves that bootstrap enabled.
The default is unchanged; only the exact value `off` disables collection.

This separates a future on/off overhead experiment from changing widget/input
configuration. The flag does not suppress telemetry/channel delivery, alter
precision or disable independently requested heap/trace profilers. Existing
explicit constructor overrides remain supported. Common disabled-path and
startup allocations are not removed by this control.

Validation: 32 targeted tests, TypeScript and targeted ESLint passed. The tests
check unchanged bootstrap config and disabled main/renderer collection. No
runtime overhead result has been measured yet. A runtime comparison still needs
external CPU sampling, matched seed/environment/geometry/cadence and repeated
collection-on/off runs; the disabled side cannot supply its own metrics.

Prepared in a separate worktree while native-memory capture runs; application
source in the active `perf` worktree was not changed.

Prepared runtime protocol (not yet executed):

```sh
node tools/perf/capture/long-matrix.mjs collection-overhead-r4 overhead
node tools/perf/capture/report-collection-overhead.mjs perf-results/collection-overhead-r4
```

The controller uses candidate sources throughout, orders collection on/off/off/on,
and keeps the capture bootstrap active for all four 420-second runs. Both sides
receive identical CDP process CPU sampling, private-memory reads and an external
rAF counter. CPU comes from cumulative per-process CPU seconds, not optional
collector logs. The report excludes the first 60 seconds, requires at least
300 seconds of steady-state observations, rejects process churn, stopped replay,
missing counters and mismatched source/seed/environment/viewport. An optional explicit
diagnostic height is recorded when supplied; the default normal A/B height stays 1014. Source/seed fixtures must be prepared in the executing worktree first.

Only syntax checks have run for the new controller mode and reporter. Targeted ESLint passed. Runtime
validation remains pending. The report test cases now pass after the separate
native-memory capture completed. A matched rAF rate does not establish
identical widget drawing or actual simulator presentation. Interpret the paired
CPU differences alongside on/on and off/off run variation, including an
inconclusive outcome when the difference is below that variation.

The first attempt was cancelled during on1 before any completed phase: it did
not record input cadence with collection off. It is not overhead evidence.
The updated sampler also reads version scalars from existing Track State,
Driver Controls and Radar channel stores, without adding subscriptions. This
uses the current store implementation's private snapshot field in diagnostic
code only, and fails if an expected snapshot is absent. The report records
version-change rates (not exact delivered-callback counts) and marks comparisons
incomparable if rAF or snapshot rates differ by more than 5% or 1 Hz. Inputs
that remain unchanged are explicitly marked inactive; this is not complete
input coverage for other fixtures. Separate clean/dirty and PSS breakdowns are
retained when available.

R2 was rejected at preflight because the virtual display changed back to
2560x1369 and the overlay height was 1014 instead of the requested 1009.
The next R3 run uses the default 1014 viewport; all geometry/environment gates
remain strict. This failed startup is not a CPU sample or overhead result.

R3's early snapshot check failed before measurement because Driver Controls
had no initialized snapshot yet. Readiness now follows the 55-second warmup.
Validate both collection states with a separate short protocol first:

```sh
node tools/perf/capture/long-matrix.mjs overhead-readiness-r1 overhead smoke
```

This runs on/off for 90 seconds each. It tests initialization and external
sampling, not overhead acceptance; the full report intentionally requires all
four 420-second phases and cannot accept this short run.

Readiness r1 completed on/off with exit 0 and candidate restoration. Both modes
have four valid external CPU/workload samples at 1549x1014; snapshot versions
advance in both. Main/renderer reporting is present on and absent off. See
[readiness evidence](2026-11-12-collection-overhead-readiness.json). The full R4
matrix is next. Keep HEAD fixed during the matrix: every phase records its
source revision, so even documentation commits mid-matrix would break matching.
