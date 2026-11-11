# First Performance Step: Measurement Reliability

Date: 2026-11-11. Branch: `perf`. Starting baseline: `94f02641`.
Part of phases A/B from the [plan](overlay-performance-plan.md) has been
implemented.

## Implementation

- The perf runner passes the path through `PERF_USER_DATA_DIR`. The first
  side-effect import in main sets `app.setPath('userData', ...)`. The initial
  bundle did not execute this early enough for shared storage chunks; see the
  follow-up correction below. The normal launch bootstrap does not change anything.
- Both separate and inline forms of `--user-data-dir` are supported. Missing
  values and unsafe paths are rejected before the application starts.
- `sourceKind` is set at the point where the telemetry bridge is actually
  selected: `mock`, `tape`, `sdk-replay`, or `live`. Mock metadata is no longer
  reported as live.
- Fixture FrameRate/CpuUsage/GpuUsage values are not collected for synthetic
  sources. The analyzer reports game telemetry as `n/a` and does not pass FPS
  checks.
- Added `sdkWaitForData` and `sdkPollIteration`: elapsed wall-clock durations
  for the SDK wait and synchronous iteration. Planned sleep is excluded. The
  new spans close in `finally` on timeout, disconnect, and exception. The
  existing `processTelemetry` span is retained.
- Process CPU time is calculated from increments in Electron cumulative CPU
  seconds, accounting for PID, creationTime, and the actual observation
  interval. Fields: `cpuTimeMs`, `cpuTimeMsPerSecond`,
  `cpuSampleIntervalMs`. The first or incomplete observation is not replaced
  with zero. Process disappearance, PID reuse, a decreasing counter, and
  reporting restart reset the baseline. App-wide CPU time totals are not
  calculated.
- The analyzer sums only valid CPU intervals fully contained within the
  analysis window. Average rate is total CPU ms divided by total sampled
  seconds. The report retains CPU% and adds CPU ms, ms/s, sampled duration, and
  count.
- Capture origin includes the effective userData path and startup window
  topology. This is state from before renderer load: PID may be 0, URL empty,
  and visible false. Actual runtime PIDs/roles are taken from later process
  samples.

1000 CPU ms/s equals one fully occupied CPU core. Electron percentages use
their own normalization and remain a separate metric. Renderer frame-time in
the existing logs means rAF intervals, not render duration or screen present;
this is stated explicitly in the Markdown analyzer.

## Checks

- Integrated targeted suite: 115 tests across 11 files; all passed.
- `npm run lint`: TypeScript and ESLint passed.
- `git diff --check`: no errors.
- Checked normal frame/timeout/disconnect/exception paths for SDK spans; early
  bootstrap and CLI validation; source selection; synthetic telemetry
  suppression; CPU sampling/reset/PID reuse; weighted analyzer and window
  boundaries.

## Integration Smoke

Short local captures are stored only in the ignored `perf-results/` directory:

- `perf-p0-isolation-smoke-20261111.*` — 30 seconds; Vite detected file
  changes during the run. Used for integration diagnostics only.
- `perf-p0-reviewed-smoke-20261111.*` — verification after runtime code was
  frozen. Capture completed: one origin, four process reports; path,
  mock source/mode, absence of fixture FPS and Settings, and presence of CPU
  time were checked. The later addition of creationTime to the raw report was
  checked by an integration test.

The first capture confirmed effective path
`/tmp/irdashies-perf-p0-smoke`, `sourceKind: mock`, `simulatorMode: mock`, a
fixture FPS count of zero, and a runtime process list without Settings. Raw
process samples included CPU time/interval for the renderer, GPU, Browser, and
Utility; a valid zero CPU delta is retained.

These smoke runs are not steady-state benchmarks and do not prove reduced
load or higher game FPS. Live SDK timings are not exercised in the Linux mock;
their error and normal paths were checked by tests, while live latency remains
to be measured.

Open review items: startup topology does not confirm renderer readiness.
Before comparative captures, add a runtime topology marker or verify runtime
PIDs/windows after load. The older narrow spans and `processTelemetry` can
still miss the duration of an attempt that ends with an exception; the new
`sdkWaitForData`/`sdkPollIteration` spans include such attempts. In the
analyzer, new reports distinguish process lifetimes by PID + creationTime;
legacy reports use PID only.

## Follow-up: bundled startup order

Subsequent inspection found that the source-level first-import test did not
prove startup isolation in the bundled app. The bundler inlined the initializer
in the entry body, while shared storage chunks had already captured the old
config path. The original smoke checks verified Electron's reported userData
path, not the path retained by storage. They must not be used as proof of
profile isolation or as a baseline for widget performance.

The follow-up [capture readiness report](2026-11-11-capture-readiness.md)
documents a dedicated startup chunk, a bundled regression test, actual isolated
config-file verification, and a runtime topology marker after renderer loading.

## Next Steps

1. Pin the seed profile, geometry, and source fingerprint; capture full
   420-second baselines with Settings closed.
2. Make independent C/D changes: Relative/TitleBar selectors, stable class
   positions, and the Map qualifying fallback.
3. Repeat matching A/B runs and React Profiler, then decide whether to cap Map
   frame rate.
4. To draw conclusions about game presentation/FPS, capture a Windows
   packaged replay with PresentMon/ETW. For Settings memory, run a separate
   long capture.

Root completed integration review of work by the Luna agents. Render-engine
optimization is outside this step; deciding whether to pursue it requires a
Chromium trace and a reproducible prototype comparison on the same workload.
