# Session array identity fast path

This records the identity-only experiment. The later
[plain-record comparison](2026-11-11-session-record-comparison.md) changes the
distinct-object path and extends the benchmark with the full-field fixture.

Branch: `perf`. Parent revision: `02e8e07e`.

The earlier renderer trace attributed sampled work to `arrayShallowCompare`
through `useSessionDrivers`. Inspection found that identical array references
still traversed every element. Unrelated session-store updates, including
green/checkered flag state, retain the session arrays.

The comparator now returns immediately for identical references. Distinct
arrays still use the existing Zustand element-wise shallow comparison. This
preserves IPC-clone behavior, nested LMU rating identity, iterable/prototype
handling, field changes, and disconnect handling. It introduces no new
subscriptions, rounding, state, or per-frame allocations. Store snapshots must
remain immutable, as required by the existing Zustand subscription model.

## Local measurement

Run `node tools/perf/session-array-compare.mts` after installing dependencies.
The script compares the previous implementation with the candidate, checks
results, warms both functions, and alternates execution order for seven
repetitions of 20,000 comparisons. The fixture has 64 synthetic drivers with
four primitive fields each. Medians from Node v26.13.1 on this Linux workspace:

| Case | Previous ns/call | Candidate ns/call |
| --- | ---: | ---: |
| Same array reference | 108.16 | 4.08 |
| Equal IPC clone | 22,870.96 | 23,049.41 |
| Changed final driver | 21,630.89 | 21,514.92 |

This is a small fast-path saving (about 0.104 microseconds per call), not a
material application CPU result. Distinct-array differences are small and
not evidence of improvement. V8 microbenchmarks do not measure browser effects,
paint, compositor work, or real notification frequency. No game FPS gain is
claimed. The expensive distinct-object comparison path remains unchanged.

## Validation and next work

Comparator and store suites: 18 tests passed, including no element access for
an identical array, absent/empty inputs, cloned primitive drivers, nested LMU
ratings, changed values and lengths. The final `npm run lint` passed with the
benchmark included (TypeScript and ESLint).

The current workspace initially lacked dependencies, ignored capture artifacts,
the sanitized ten-widget seed, and the native replay build. Dependencies have
been restored using `npm ci --ignore-scripts`; existing raw reports cannot be
re-analyzed here yet. The next substantive performance step remains the short
shared trace on the saved ten-widget workload described in
[the plan](overlay-performance-plan.md), followed by an all-functionality-enabled
matched A/B. This fast path does not complete that acceptance work.
