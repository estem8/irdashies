# Plain session record comparison

Branch: `perf`. Baseline: `02e8e07e`'s element-wise Zustand shallow comparator.
This follows the [identity fast path](2026-11-11-session-array-fast-path.md).

## Change and evidence

The earlier renderer trace sampled `compareEntries` through session-driver
selectors. Installed Zustand's plain-object path creates `Object.entries`
arrays, a pair array per property and two temporary Maps per driver comparison.
The session comparator now compares enumerable own string keys directly for
plain, non-iterable objects. It still allocates two key arrays per compared
record; it no longer materializes entry pairs or Maps for these records.

Object values remain compared with `Object.is`, without deeper traversal.
Key ordering does not matter; missing versus undefined fields, enumerability,
NaN and signed zero retain their existing behavior. Nested LMU ratings retain
identity semantics. Arrays, iterable records, Map, Set, null prototypes and
custom prototypes delegate to Zustand. No telemetry precision, subscription
rate, lifecycle or drawing behavior changes.

The supported fast path is immutable, data-only session records received over
IPC. Accessors/proxies with mutation during comparison are not a session-data
contract. As with Zustand, mutating a previously published snapshot in place
is unsupported.

## Reproduction and results

Run `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/perf/session-array-compare.mts`.
The standalone tool checks return values, warms both functions, alternates
baseline/candidate order, and retains all seven per-case timings plus their
medians. Cloning/setup happens outside timed loops. Each invocation runs 20,000
comparisons per synthetic case and 2,000 per fixture case per repetition.
The baseline is the original implementation, before either local fast path.

Two consecutive invocations ran after tests/lint finished, without concurrent
project checks. Environment: Node v26.13.1, Linux 7.2.15-arch1-1, AMD Ryzen 5
9600X. The repository session fixture has 41 drivers with the complete driver
field shape; the synthetic fixture has 64 drivers with four primitive fields.
Session JSON SHA-256:
`865a22d0e74e3544e43b9009598ab7a5a0660c2fef9dc6808fa4764a0c55f770`.

Median microseconds per array comparison:

| Workload | Run 1 baseline | Run 1 candidate | Run 2 baseline | Run 2 candidate |
| --- | ---: | ---: | ---: | ---: |
| Synthetic, equal clone | 12.191 | 6.845 | 12.775 | 7.029 |
| Synthetic, final driver changed | 10.843 | 6.841 | 11.190 | 6.863 |
| Full-field fixture, equal clone | 80.626 | 69.290 | 82.504 | 70.031 |
| Full-field fixture, final driver changed | 81.031 | 68.338 | 83.253 | 69.367 |

Equal full-field clone comparisons are about 14–15% cheaper in these two local
runs. This is a function microbenchmark, not an application CPU or game FPS
measurement. Notification frequency and other renderer costs determine the
application impact; the earlier short pipeline capture had no session-data
publications, so it cannot validate this candidate. Dev V8/Node timings cannot
substitute for packaged Electron/Windows acceptance.

Raw runs (ignored, outside tracked source):
`perf-results/session-array/plain-record-r1.json` and `plain-record-r2.json`.
The tool includes environment metadata and the fixture hash in every output.

## Checks and remaining work

Differential tests compare results with Zustand for plain records, enumerable
and inherited keys, primitives, nested references, iterable/custom objects and
a deterministic 729-pair record matrix. Store tests check stable selections,
real field changes, nested rating clones and disconnect reset. JSDOM's Node
`structuredClone` produces a different object realm from literals, so both
simulated IPC payloads are cloned; prototype checks intentionally remain intact.

The affected store, standings-domain, TrackMap, standings-hook and Radar suites
passed together: 358 tests in 34 files. TypeScript and ESLint passed with the
candidate and benchmark; the final check includes the corrected cloned-payload
test fixtures. Prettier and `git diff --check` passed. There is no visual change.
Application-wide acceptance remains open: reproduce the ten-widget shared trace
and measure total CPU/frame-interval tails with all functionality enabled.
This workspace's `.irdt` is a Git LFS pointer, not the recorded tape; the old
sanitized seed and raw capture files are also absent. Restoring those inputs
is necessary to repeat that exact workload. This change does not resolve the
larger paint/compositor cost identified in the pipeline report.

Subsequent work restored the verified tape and native runtime under
`perf-results/`; see the [new attribution report](2026-11-11-shared-renderer-attribution.md).
The original saved user seed is still unavailable.
