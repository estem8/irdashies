# System-wide snapshot pipeline attribution

Date: 2026-11-11. Branch: `perf`.

## Scope and result

This experiment attributes steady-state application cost across shared pipeline
boundaries, without changing individual widget implementations. It uses the
saved dashboard's **10 enabled instances**, rather than the earlier custom
five-widget seed. The saved configuration contains 35 instances in total;
disabled widgets and every possible alert/session state are not covered.

The large measured difference is downstream of central snapshot receipt:
selector/store application, React/effects, DOM/canvas updates, and their
resulting compositor work. Keeping IPC active while blocking central-store
application costs nearly the same as blocking snapshot delivery in main.
That makes transport alone a low-priority target for this workload.

These modes deliberately stop work and freeze data-driven UI. Their CPU deltas
are **cost counterfactuals, not an achieved optimization**, and do not establish
the cause of game FPS drops, event-driven spikes, or long-session degradation.
The unproven Weather candidate was reverted and is not part of this result.

## Method

- Source baseline `a2408a7d9bc6c085868e9e4713e36577c08e3ac7`, before the
  Relative/TitleBar/Map changes published earlier on `perf`.
- Separate experimental worktree with capture-only controls in main and
  `ChannelSnapshotStore`; no widget component file changed. The root `perf`
  branch does not contain these experimental runtime gates.
- Main control requires both `PERF_METRICS=1` and `PERF_PIPELINE_CAPTURE=1` and
  is accessed through a loopback Node Inspector. It preserves subscriptions,
  demand, source processing, publication and latest-snapshot caches.
- Original saved profile was read only. An isolated seed keeps layouts,
  enabled flags and widget settings, with analytics opted out, autostart off,
  and personal profile/device identifiers removed.
- Seed SHA-256: `4697f2f76e1e8296991b71124faf00645b6342fb3d3640636c6141ae657049ed`.
- Native tape at 1x, 40 cars and three classes. Fixture SHA-256:
  `6e23e8abab49c1a0ae7c8f6d1f298d31145a6189d3029b8ca540aad56a22b168`.
- One visible shared overlay, 1529 × 994 pixels, renderer PID 52019, plus the
  same tape-control window throughout. No renderer reload between modes.
- Enabled types: Blind Spot Monitor, Input, Lap Time Log, Lap Trace, Map,
  Radar, Relative, Sector Delta, Standings and Weather. Startup DOM and a
  screenshot verify the mounted configuration. Some content remains
  conditionally idle; for example Lap Trace waits for a clean reference lap.

After 60 seconds of startup warmup, the order is:
`live1 → ingress1 → delivery1 → delivery2 → ingress2 → live2`.
Before every phase, restore live delivery/application, seek to tape second 55,
resume, wait five seconds to seed the UI, select the mode, and settle another
five seconds. Measure the following 30 seconds, approximately tape 65–95.
Returning to live re-seeds cached snapshots; cleanup restores both controls.

| Mode | Snapshot transport | Central snapshot-store application |
| --- | --- | --- |
| live | Enabled | Enabled |
| ingress-drop | Enabled | Blocked before selector evaluation/store mutation |
| delivery-drop | Blocked in main before queue/send | No new transported snapshots |

Only snapshot channels are gated. Event channels remain enabled; the separate
session-data stream is untouched. Direct consumers outside the central store,
shared updaters, timers and autonomous animation can remain active, so the
blocked modes are not a pure SDK baseline or an empty renderer.

## CPU and renderer cadence

No Chromium trace or V8 sampler runs during these measurements. Each phase
retains five complete reporter/CPU intervals, about 25 seconds, wholly inside
its 30-second measurement window. Each mode has two repetitions. CPU ms/s
uses accumulated process CPU-time deltas; 1000 ms/s represents one fully used
core. GPU process CPU is not GPU engine utilization.

| Mean across two repetitions | live | ingress-drop | delivery-drop |
| --- | ---: | ---: | ---: |
| All-process CPU, ms/s | 643.78 | 180.16 | 173.54 |
| Browser/main CPU, ms/s | 68.98 | 65.79 | 61.98 |
| GPU process CPU, ms/s | 205.33 | 59.19 | 59.98 |
| Renderer CPU, ms/s | 369.48 | 55.19 | 51.58 |
| SDK tick rate, Hz | 59.12 | 58.75 | 58.58 |
| Renderer rAF callbacks/s | 154.28 | 179.60 | 179.92 |
| rAF interval p99 mean, ms | 16.71 | 5.70 | 5.70 |
| rAF intervals over 25 ms, % | 0.17 | 0.01 | 0.00 |

Per-repetition total CPU is 634.4 / 653.2 ms/s in live, 174.8 / 185.5 in
ingress-drop, and 177.5 / 169.6 in delivery-drop. The live endpoints differ by
about 3%; the small ingress/delivery difference is comparable to repeat spread.
Do not interpret their mean difference as a precise isolated IPC CPU bill.

The modal reporting-interval median is **5.6 ms in all six phases**. Live has
fewer rAF callbacks and a longer tail, rather than the 5.6-versus-16.7 ms
cadence-class mismatch found in an earlier experiment. Callback throughput
and tails change when dynamic work is stopped; they remain outcome measures,
not proof of actual display presentation. No over-50-ms rAF interval occurred
in these retained windows. The p99 row is a mean of interval percentiles,
not a percentile reconstructed from all raw frame intervals.

## Pipeline controls and interpretation

All six phases match source, configured widget types, window identity/bounds,
active snapshot subscribers and active event subscription signatures.
There are 13 active snapshot channels, with one registered subscriber each.
Main snapshot publications remain about 228/s; live and ingress-drop deliver
about 220/s. Ingress-drop counts 6,591 and 6,600 discarded central-store
updates. Delivery-drop records zero snapshot deliveries while publications
continue. Thus lower cost was not caused by turning off the source or dropping
processor demand. Publication rates have some natural variation, particularly
the blind-spot and session-timing channels.

In live, `sdkTelemetryRead` averages about 0.585–0.619 ms/call and
`processTelemetry` about 0.673–0.707 ms/call at roughly 59 ticks/s.
The read span is contained within processing and must not be added to it.
These are elapsed section durations, distinct from accumulated CPU time.
SDK wait averages about 6.4–7.1 ms/call in live, with interval p99 around
16 ms; blocking wait duration is not busy CPU consumption.

The experiment supports prioritizing shared renderer update/commit/paint
scheduling and compositor work before optimizing steady-state transport or
moving telemetry calculations. It does not separate React rendering, effects,
DOM layout/paint, canvas drawing and composition from one another. Any shared
scheduling/batching experiment must retain every required Input/Lap Trace
sample, ordering, precision, event behavior and lifecycle resets, and must
measure normal total CPU/frame pacing with all functionality enabled.

## Missing evidence

- Event subscriptions were preserved, but no event delivery occurred in these
  windows. Join/leave bursts, reconnect and session transitions need separate
  systemic workloads; no conclusion about their spike cost follows here.
- `sessionPublish` has zero samples in all retained intervals. The separate
  raw Telemetry Inspector callback count is also zero; that callback metric
  does not measure session-data callbacks. This capture does not quantify
  active session-data publication or Inspector traffic.
- A 360-second application lifetime is not five minutes of evidence per mode.
  Short phase windows and two repetitions are diagnostic, not a release gate.
- No packaged Windows/iRacing present-time data, private-memory acceptance
  evidence, long-session leak test or full widget-catalog coverage is claimed.
- First attempt failed before measurement because the Vite process exhausted
  memory while the worktree contained a recursive artifact-directory symlink.
  That symlink was removed; the failed attempt is excluded. The successful
  run completed all six phases, restored live mode and exited zero.

## Artifacts and validation

Ignored local artifacts:

- `perf-results/system-pipeline-r2-20261111.log`;
- `perf-results/system-pipeline-r2-20261111.final-phase-metrics.json`;
- `perf-results/system-pipeline/captures/pipeline-phases-system-pipeline-r2-20261111.json`;
- launch manifest, preflight screenshot and sanitized seed under
  `perf-results/system-pipeline/`;
- per-file instrumentation hashes in
  `perf-results/system-pipeline-instrumentation.json`;
- source instrumentation in the detached experimental worktree, outside the
  production feature-branch diff.

Capture controls passed 34 targeted tests, TypeScript, ESLint and diff checks.
Tests preserve events through both gates, verify pending-timer cancellation,
cache reseeding and continued subscriber registration. The analysis uses
fully contained sample intervals and checks gate effects against bus counters.
This follows the exploratory/acceptance distinction in
[PERFORMANCE_BENCHMARKS.md](../PERFORMANCE_BENCHMARKS.md).
