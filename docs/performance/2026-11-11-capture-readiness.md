# Capture Readiness and Bundled Profile Isolation

Date: 2026-11-11. Branch: `perf`.
This follow-up addresses measurement issues found before stages C/D are applied.

## Bundled startup correction

The earlier source-level first import did not guarantee execution order after
bundling: the initializer was inlined in the entry body below shared chunk
imports. Storage could retain the normal config path even though later calls to
`app.getPath('userData')` returned the requested isolated directory.

`vite.main.config.mts` now places `perfUserData` in its own startup chunk. The
built main chunk requires it before logger/dashboard/storage dependencies.
The bundle regression test builds the actual initializer alongside an eagerly
evaluated shared storage consumer, then verifies the path captured by that
consumer with performance mode enabled and disabled. A source import assertion
alone is insufficient.

Real Forge smoke verification pre-created a test config containing a sentinel
and analytics opt-out. After the app ran, the same isolated file retained the
sentinel and contained the generated profile/dashboard. This verifies storage
writes, in addition to Electron's reported path.

## Runtime topology

`[PerfRunTopology:JSON]` is a separate startup-only marker. It leaves capture
origin, duration and visibility-phase clocks unchanged. Readiness requires a
loaded main frame, nonempty URL, and positive renderer PID. The event-driven
wait has a common deadline, bounded passes for newly created windows, shutdown
cancellation, cleanup and explicit incomplete/error reporting.

Electron can emit `did-finish-load` while `isLoadingMainFrame()` is still true.
The adapter also observes `did-stop-loading`; the actual smoke exposed this
ordering and a regression test preserves it. Timeout is not treated as success.

The analyzer records readiness evidence and compares normalized window roles,
counts and bounds. PIDs, window IDs, URL host/port, visibility and process type
counts are descriptive rather than comparison keys. Legacy captures remain
readable with unknown topology evidence. Later window changes are not tracked
by this one-time startup marker.

## Verified input and integration evidence

The public repository's `.irdt` file was an LFS pointer. The fixture was fetched
outside the repository and verified against the pointer:

- SHA-256: `6e23e8abab49c1a0ae7c8f6d1f298d31145a6189d3029b8ca540aad56a22b168`.
- Size: 348,187,160 bytes; native transport reports about 600 seconds.
- 333 variables; initial session has 40 participating cars and three classes.
- Native in-process tape playback works on Linux. It does not require the
  Windows shared-memory replay publisher used by `perf:run --replay-input`.
- The fixture's recorded FPS/CPU/GPU remain excluded from current-host game
  performance metrics through `sourceKind: tape`.

Local ignored captures:

- `tape-bootstrap-confirmation-20261111.*`: verified actual config storage;
  exposed the missing `did-stop-loading` readiness event. Its topology marker
  is incomplete, so it is not comparison evidence.
- `tape-topology-confirmation-20261111.*`: readiness marker complete, no timeout,
  no snapshot errors, two loaded windows with positive PIDs. The second window
  is tape controls, not Settings; keep it identical in paired captures.

The confirmed isolated config is under `/tmp/irdashies-perf-bootstrap-confirmed`.
Raw captures and the 348 MB fixture stay outside tracked documentation.
These short runs validate integration and do not establish a performance gain.

## Next capture

Pin this preparation commit in an isolated worktree. Copy one seed config for
each run, use the verified tape at speed 1 without looping, and use identical
widget layout, controls, display geometry and instrumentation. Capture 420
seconds and discard 60 seconds of warmup. Implement C/D in separate worktrees
and review their commits before applying them to the candidate.
