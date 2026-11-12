# Direct Map identity work diagnostic

Prepared protocol, not executed yet:

```sh
systemd-inhibit --what=idle:sleep --mode=block --why="irDashies perf capture" node tools/perf/capture/long-matrix.mjs map-identities-r2 identity
node tools/perf/capture/report-map-identities.mjs perf-results/map-identities-r2
```

This runs the existing pinned baseline/candidate sources in A–B–B–A order for
180 seconds each, with the same profile, replay and explicitly recorded viewport.
The hook is temporarily instrumented after source-hash verification. The usual
controller restores the uninstrumented candidate after verified child shutdown.
Each run saves the exact instrumented source and hash outside the repository.

Numeric counters observe execution of the identity `useMemo`, executions with a
driver roster, each identity object construction, and progress recomputation.
They retain no input objects and do not mutate any snapshots, selected arrays or
props. Counts include work React might discard before commit. The diagnostic
counts these specific objects; it does not estimate bytes or total allocations.
The reporter requires an exercised progress path and identity construction,
monotonic counters, advancing replay, matched source/seed/runtime/geometry and
at least 90 seconds of observations after warmup. Zero identity recomputation
in a steady interval is valid when the initially populated roster stays stable.

These instrumented runs cannot establish total application CPU improvement.
They address the direct recomputation/object-rate evidence gap in stage D;
normal operation, heap ownership and actual simulator presentation remain
separate evidence. The combined normal R3 CPU result does not isolate Map.

Preparation checks: syntax, targeted ESLint and source-transform unit cases
passed. Both pinned hook versions transformed and transpiled successfully.
Runtime execution and report verification remain pending. Source shape changes are rejected instead of silently omitting a
counter. Do not run this protocol concurrently with another capture.

R1 baseline completed, but candidate startup hit the old five-second topology
limit. It is retained as partial evidence. R2 uses the validated 30-second
capture-only startup grace and early main PID for graceful failure cleanup;
readiness criteria, warmup and measured counters remain strict. No GPU flags
are changed. The slow-loading regression test, TypeScript and lint pass.
