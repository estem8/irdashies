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
PERF_DIAGNOSTIC_VIEWPORT_HEIGHT=1009 node tools/perf/capture/long-matrix.mjs collection-overhead-r1 overhead
node tools/perf/capture/report-collection-overhead.mjs perf-results/collection-overhead-r1
```

The controller uses candidate sources throughout, orders collection on/off/off/on,
and keeps the capture bootstrap active for all four 420-second runs. Both sides
receive identical CDP process CPU sampling, private-memory reads and an external
rAF counter. CPU comes from cumulative per-process CPU seconds, not optional
collector logs. The report excludes the first 60 seconds, requires at least
300 seconds of steady-state observations, rejects process churn, stopped replay,
missing counters and mismatched source/seed/environment/viewport. The explicit
1009-pixel diagnostic height is recorded; the default normal A/B height stays 1014. Source/seed fixtures must be prepared in the executing worktree first.

Only syntax checks have run for the new controller mode and reporter. Runtime
validation, lint and report verification remain pending while the separate
native-memory capture occupies the machine. A matched rAF rate does not establish
identical widget drawing or actual simulator presentation. Interpret the paired
CPU differences alongside on/on and off/off run variation, including an
inconclusive outcome when the difference is below that variation.
