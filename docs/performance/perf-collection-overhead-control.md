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
