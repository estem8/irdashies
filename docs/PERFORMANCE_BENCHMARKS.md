# irDashies Performance Benchmarks

This document owns the repeatable benchmark procedure and CLI examples, not the
active roadmap. Current status, decisions, acceptance gaps, and priorities live
in the [performance plan](./performance/overlay-performance-plan.md). Its
[reference-workloads section](./performance/overlay-performance-plan.md#reference-workloads)
lists the comparison baselines; choose one with the same build target and
workload. A newer capture does not automatically replace a packaged reference.
Dated reports linked from the plan preserve experiment-specific evidence.

## What the harness captures

When launched through `npm run perf:run`, irDashies records structured samples
without changing the saved dashboard:

- iRacing-reported FPS, foreground/background CPU usage, and GPU usage
- irDashies total and per-process CPU and working-set memory
- telemetry tick cadence and `processTelemetry` / IPC broadcast percentiles
- per-channel processor executions, publications, deliveries, and effective rates
- active-widget input coverage and observed channel change rates
- native telemetry/session reads, lifecycle work, payload projection, session
  publication, and renderer telemetry-callback percentiles
- Electron main-process event-loop stalls
- per-renderer animation-frame timing and frames over 25 ms / 50 ms

The metrics are disabled during normal app launches.

For quick development iteration, the default target is the Vite development
build. Before accepting a result as a release baseline, package the app and add
`--target packaged` to every run:

```powershell
npm run package
npm run perf:run -- --target packaged --mode observer --scenario release-observer --duration-seconds 420
```

Do not compare a development run with a packaged run. Vite, source maps, React
development checks, and hot-module tooling materially change renderer memory
and startup work.

The iRacing FPS values come from the simulator telemetry stream. They are good
for controlled A/B regressions but are not a substitute for PresentMon
present-to-present frame times. If these runs show an FPS-neutral hitch, use an
ETW/PresentMon trace as the second-stage investigation.

For an isolated `.irdt` tape, the iRacing FPS/CPU/GPU variables are historical
values recorded in the tape. They do not measure the host while the benchmark
is running and must not be used for A/B conclusions.

For a replay running inside the actual simulator, keep the normal live SDK
connection and pass `--simulator-mode replay` to label the metadata. This flag
does not start a tape publisher; `--replay-input` selects the isolated publisher.
Pin and verify replay frame/session/camera and normal-speed playback separately.

`--user-data-dir <directory>` forwards an isolated profile directory to
Electron, including through Forge for the development target. Use a path
without spaces or shell metacharacters. Seed it from the saved profile,
document any benchmark-only visibility overrides, and start each repeat from
the same seed. Verify visible content after startup settles, especially when
`IsOnTrack` is false in replay. Counts of windows or enabled widgets do not
prove content visibility or input coverage. The [full saved-profile capture
report](./performance/2026-11-01-main-full-profile.md) records a worked example.

### Diagnosis is not acceptance

Use short traces, subtree isolation and delivery/store suppression to identify
where work occurs. Their deltas include the downstream work they stop; they
are not achieved optimizations. A microbenchmark or a removed
`compositeFailed` warning also does not prove lower application CPU. Reserve
long, repeated normal-operation A/B runs for validating a concrete candidate.

Use a monotonic clock for elapsed intervals and shutdown deadlines; keep UTC
wall timestamps separately for correlation. Reject significant wall-clock
changes, suspend/observation gaps, or missing samples instead of treating them
as an application hang or silently compressing the interval. The long-matrix
controller records monotonic CPU-sample times and rejects wall/monotonic drift
over two seconds. Keep the machine awake for unattended captures with a temporary
inhibitor where available, without changing saved power settings.

Cold development renderers may take more than five seconds to load. The
long-matrix controller requests a validated 30-second topology grace within its
60-second warmup, while retaining full readiness checks. Origin records the main
PID early so failed-start cleanup can request graceful shutdown before any
process-group fallback. Diagnose the first failure in timestamp order: GPU or
zygote messages emitted during group teardown do not establish a GPU startup bug.

Before the measured interval, verify and record:

- Exact source/build state, seed and fixture hashes, playback position/speed,
  active widget instances/settings and actual visible content.
- Window roles, bounds, visibility, DPR and renderer cadence. Include auxiliary
  windows such as tape controls; normalize their startup/show state before
  measurement instead of changing comparison rules after a mismatch appears.
- Comparable required channel/input activity, event delivery and lifecycle
  behavior. Reduced work caused by frozen data or missing samples is not a win.
- Instrumentation mode. Tracing, V8/React profiling and heap collection add
  work; do not mix them into the ordinary CPU acceptance run or run unrelated
  tests/builds alongside local measurements.

Report process CPU in ms/s, distinguish rAF scheduling from presentation, and
keep trace wall duration separate from accumulated CPU time. GPU-process CPU
is not GPU-engine utilization. Do not double-count nested spans or add
overlapping thread durations as frame time. Missing memory/coverage metrics
must remain unavailable, not zero or a passed gate.

Capture controllers must use isolated profiles, preserve raw artifacts and
source manifests, and restore temporary source/runtime changes on success,
failure and cancellation. Verify child termination and candidate source hashes
before starting another run. An existing output directory or lock file is not
proof that a capture is still running. Reject confounded comparisons and retain
the reason; a passing command or `--allow-inconclusive` cannot override that.

For repeated static graphics, inspect layer count as well as CPU/memory before
forcing GPU promotion. For continuous motion, inspect layout/paint and verify
that replacing layout animation preserves actual rendered positions, timing,
clipping and hide/show at the supported widget scales and DPR. Keep effects
that are needed for appearance unless a measured alternative preserves them.

## Controlled replay benchmark

Use a replay with a representative field size and the same fixed cockpit camera
for every run. A replay is preferred because live-session traffic, weather, and
physics load change between samples.

Before starting:

1. Keep iRacing resolution, graphics, mirrors, FPS cap, and camera identical.
2. Do not resize or edit overlays during a run.
3. Close browsers, launchers, recording software, and other variable GPU loads.
4. Let the replay and camera settle for 60 seconds.
5. Run each mode for at least 6 minutes. Stop it with Ctrl+C.

For the curated native telemetry tape, pass `--replay-input`. The runner selects
the isolated SDK addon, waits until the development native rebuild is complete,
starts the publisher, and stops it with the app:

```powershell
$replay = 'test-data\telemetry\ai-race-10min.irdt'
```

### 1. SDK observer baseline

This connects to iRacing and samples telemetry, but creates no Electron overlay
or settings windows.

```powershell
npm run perf:run -- --mode observer --scenario replay-observer --duration-seconds 420 --replay-input $replay
```

### 2. Empty transparent-window baseline

This creates the normal transparent overlay windows with every widget disabled.
It measures the window, renderer bootstrap, and global-provider substrate
without widget rendering. It does not isolate Windows composition alone because
each renderer still mounts the dashboard, telemetry, session, pit-lane, and
reference-lap providers.

```powershell
npm run perf:run -- --mode empty --scenario replay-empty --duration-seconds 420 --replay-input $replay
```

To distinguish renderer/window substrate from telemetry IPC and store
notification work, run empty mode once with renderer delivery disabled and once
with it enabled:

```powershell
npm run perf:run -- --mode empty --scenario replay-empty-off --duration-seconds 420 --telemetry-delivery off --replay-input $replay
npm run perf:run -- --mode empty --scenario replay-empty-on --duration-seconds 420 --telemetry-delivery on --replay-input $replay
```

`--telemetry-delivery` controls only the dedicated raw Telemetry Inspector
stream. To isolate typed channel delivery while keeping subscribers and
processors active, use `--channel-delivery`:

```powershell
npm run perf:run -- --mode full --scenario channels-off --duration-seconds 420 --channel-delivery off --replay-input $replay
npm run perf:run -- --mode full --scenario channels-on --duration-seconds 420 --channel-delivery on --replay-input $replay
```

The off run still records processor executions and channel publications. It
suppresses snapshot seeding, coalescing timers, structured cloning, IPC sends,
and renderer callbacks, as well as the reactive downstream selector/React/paint
work those callbacks would trigger. The on/off delta therefore does not isolate
IPC transport cost and is not an achieved optimization.

### 3. Full dashboard

This loads the current dashboard, but omits the settings and gamepad-host
windows so the measurement is focused on overlays.

```powershell
npm run perf:run -- --mode full --scenario replay-full --duration-seconds 420 --replay-input $replay
```

`--telemetry-payload raw` is a benchmark-only counterfactual for measuring the
cost of sending every SDK variable. Normal launches and the default benchmark
path retain the renderer allowlist.

### Individual overlay windows

General Settings → Individual Overlay Windows enables one transparent window
per enabled widget while locked. This mode increases CPU usage compared with
shared display windows. The default remains one shared window per display.
Edit Layout temporarily restores shared display windows for dragging
and resizing; locking restores individual windows. Completely off-screen
widgets temporarily recover onto the primary display without changing their
saved positions. Individual windows can span connected displays. Profile-name
banners are shown in shared mode only; individual windows still hide and reveal
together during a profile switch.

Individual windows use a dedicated locked-widget renderer, without the layout
editor or Settings/Gantry startup imports. Widget registration stays automatic;
each `widget.ts` uses `lazyWidget` from `@irdashies/domain/lazyWidget` to defer
its implementation until rendered. Shared display windows also benefit from
deferred widget loading, while retaining their existing layout editor. Supporting
pit-lap, push-to-pass and timing subscriptions in an individual window are scoped
to that widget's type and configuration.

Changing the mode or entering/leaving Edit Layout recreates renderers. Local
chart history and an in-progress Lap Trace recording restart; saved laps and
main-process telemetry calculations are retained. Set up the layout before
starting a lap you want to record.

Compare the same packaged build, layout, widget set and replay using the
benchmark-only `--window-mode` override. It does not save the selected mode to
the profile. The effective mode is recorded as `overlayWindowMode` in each
sample's scenario metadata.

```powershell
npm run perf:run -- --target packaged --mode full --window-mode display --scenario windows-display --duration-seconds 420 --replay-input $replay
npm run perf:run -- --target packaged --mode full --window-mode widget --scenario windows-widget --duration-seconds 420 --replay-input $replay
npm run perf:analyze -- perf-results/<widget-run>.log --baseline perf-results/<display-run>.log --warmup-seconds 60
```

Add the same `--widgets` filter to both commands to compare a subset. A filter
selects widget types and includes every instance of those types. Include
total app CPU, aggregate private memory, renderer process count and frame
timing; do not compare a single renderer's memory against the combined default
window. Repeat regressions with the run order reversed. A single-monitor or
remote desktop result does not establish multi-monitor compositor performance.
Tape FPS values remain historical and cannot measure current game FPS impact.

For an actual iRacing replay, `IsOnTrack` can remain false and suppress expensive
widgets even when their windows exist. Add `--replay-visible-widgets` to both
captures to override `showOnlyWhenOnTrack` in memory, keep Radar visible without
pit/proximity hiding, and show Flags' no-flag state. This does not alter saved
settings or invent missing simulator data. Verify actual Fuel/Radar content
before measuring; the blind-spot channel can still remain idle in a replay.

If Windows Application Control blocks an unsigned packaged executable, use
`--target dev` for both captures instead. Development captures can compare modes
within that build, but cannot establish a release baseline or be compared with
earlier packaged measurements.

### 4. Widget isolation

Repeat only if the full dashboard materially regresses FPS or frame pacing.
Comma-separated widget types can be tested together. The filter is applied in
memory and is never persisted.

```powershell
npm run perf:run -- --mode full --widgets standings --scenario replay-standings --duration-seconds 420 --replay-input $replay
npm run perf:run -- --mode full --widgets relative --scenario replay-relative --duration-seconds 420 --replay-input $replay
npm run perf:run -- --mode full --widgets map --scenario replay-map --duration-seconds 420 --replay-input $replay
```

Use the widget type from `WidgetIndex.tsx`, not a widget instance ID.

The runner reads each selected widget's `widgetRuntimeDefinition.ts` and embeds
its declared input channels in the structured scenario metadata. The analyzer
reports whether every declared channel was exercised and its publication
(change) and delivery rates. A memory claim is inconclusive when an active
widget's declared inputs did not change during the measured window.

## Visibility phases

Use a fixed visibility schedule to verify that hidden windows stop channel
demand and resume cleanly. If `--duration-seconds` is omitted, the phase
durations determine the capture duration.

```powershell
npm run perf:run -- --mode full --scenario visibility-demand --visibility-phases visible:120,hidden:120,visible:120 --replay-input $replay
```

The app emits one capture-origin marker after overlays are created. Phase zero
and the fixed-duration timer start from that same origin; analyzer window
offsets are relative to it rather than process startup or the first periodic
report. Each transition is also written as a structured visibility marker.

Evidence is evaluated per phase. Visible phases require at least one
publication from every declared active-widget input. Hidden phases instead
require zero demand-driven processor executions and zero channel deliveries.
Intervals that straddle a transition are excluded from that phase's evidence
so visible work cannot be attributed to the hidden phase.

## Scenario metadata

Record the conditions required to reproduce the run:

```powershell
npm run perf:run -- --target packaged --mode full --scenario phase4-full --duration-seconds 420 --replay-input $replay --field-count 59 --class-count 4 --display-geometry 7680x1440 --fps-cap 120 --sync-mode gsync
```

The runner always records target, live/replay mode, requested and active widget
types, channel/Inspector delivery modes, telemetry payload mode, and widget
input requirements. The optional field count, class count, display geometry,
FPS cap, and sync mode flags complete the controlled-workload record.

## Analyse and compare

Each run writes `perf-results/<run-id>.log`. Analyse a single run:

```powershell
npm run perf:analyze -- perf-results/<run-id>.log --warmup-seconds 60
```

Compare the empty or full dashboard against the observer:

```powershell
npm run perf:analyze -- perf-results/<candidate>.log --baseline perf-results/<observer>.log --warmup-seconds 60
```

Use a fixed interval when the relevant workload occupies only part of the
capture:

```powershell
npm run perf:analyze -- perf-results/<candidate>.log --baseline perf-results/<baseline>.log --warmup-seconds 0 --analysis-start-seconds 120 --analysis-end-seconds 360
```

Analysis rejects inconclusive evidence by default after writing the summary.
It exits non-zero when the measured interval is shorter than five minutes,
private bytes are incomplete or too sparsely sampled, scenario/widget metadata
is missing or inconsistent, or a visibility phase violates its workload
expectations. Use `--allow-inconclusive` only for exploratory inspection of a
partial run.

The analyzer writes adjacent `.summary.json` and `.summary.md` files. Its
initial regression gates are:

| Metric                                  |              Gate |
| --------------------------------------- | ----------------: |
| iRacing average FPS vs observer         | no worse than -2% |
| iRacing sampled FPS p1 mean vs observer | no worse than -5% |
| `processTelemetry` p99 mean             |            < 3 ms |
| Minimum interval telemetry rate         |          >= 20 Hz |
| Steady-state app private-memory slope   |        < 5 MB/min |
| Renderer frames over 50 ms              |            < 0.1% |

Treat a failed gate as a signal to inspect, not proof of causality. Repeat any
failed A/B pair once before making an architectural decision.

Private memory is the acceptance metric because aggregate working set includes
shared Chromium pages and can double-count them across processes. Working-set
slope remains in the report as diagnostic context. The private-memory gate is
reported as **INCONCLUSIVE**, never pass/fail, unless the analysis contains at
least five minutes of private-byte samples covering every included Electron
process, at least two observations with adequate span and no gap over 60
seconds, consistent scenario metadata, and valid per-phase channel evidence.
When either side of an A/B comparison is inconclusive, every comparison check
is reported as **INCONCLUSIVE**.

## Live-session benchmark

Use a real multiplayer practice after the replay A/B matrix. Run the full
dashboard for at least 20 minutes, ideally covering a join burst and a session
transition:

```powershell
npm run perf:run -- --mode full --scenario live-practice-churn --duration-seconds 1500
```

Record these notes alongside the result:

- session and series
- car/track and field/class count
- monitor resolution and refresh rate
- iRacing FPS cap and whether VSync/G-Sync is active
- approximate times of joining, entering the car, session transition, and any
  visible stutter

The live run validates memory slope, join/transition spikes, and subjective
stutter. Do not compare its FPS directly with the replay baseline.

## Interpreting the mode deltas

| Observation                                        | Likely next investigation                                           |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Observer already hurts iRacing                     | SDK polling/main loop or CPU scheduling                             |
| Empty regresses vs observer                        | renderer/provider bootstrap, transparent composition, window bounds |
| Full regresses vs empty                            | React work, canvas/SVG paint, telemetry fanout, widget allocation   |
| One widget reproduces most of the full delta       | profile that widget's render/paint path                             |
| FPS is stable but 50 ms renderer frames rise       | renderer main-thread stalls or GC                                   |
| Renderer timing is clean but visible hitch remains | compositor/GPU present trace with PresentMon/ETW                    |

## Architectural decision rule

Do not begin the worker-thread SDK loop, channel bus, binary IPC, or native
rewrite solely from subjective stutter. Use the smallest change matching the
measured layer:

- SDK observer regression: investigate the blocking SDK loop and worker thread.
- Full-vs-empty CPU regression: reduce renderer wake-ups or move derived
  telemetry to typed, rate-limited channels/processors.
- Empty-window GPU regression: reduce transparent surface area/window count or
  change the Chromium composition path.
- A single widget's paint regression: optimize that renderer before moving
  application-wide architecture.

Current follow-up work and evidence gates are tracked only in the
[active performance plan](./performance/overlay-performance-plan.md).
