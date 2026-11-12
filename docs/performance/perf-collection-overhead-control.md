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
PERF_DIAGNOSTIC_VIEWPORT_HEIGHT=1009 node tools/perf/capture/long-matrix.mjs collection-overhead-r2 overhead
node tools/perf/capture/report-collection-overhead.mjs perf-results/collection-overhead-r2
```

The controller uses candidate sources throughout, orders collection on/off/off/on,
and keeps the capture bootstrap active for all four 420-second runs. Both sides
receive identical CDP process CPU sampling, private-memory reads and an external
rAF counter. CPU comes from cumulative per-process CPU seconds, not optional
collector logs. The report excludes the first 60 seconds, requires at least
300 seconds of steady-state observations, rejects process churn, stopped replay,
missing counters and mismatched source/seed/environment/viewport. The explicit
1009-pixel diagnostic height is recorded; the default normal A/B height stays 1014. Source/seed fixtures must be prepared in the executing worktree first.

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
