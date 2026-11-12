# Overlay Performance Improvement Plan

Date: 2026-11-11. Branch: `perf`.
Base: `tariknz/irdashies`, `main`,
`94f0264170c61b34bac61a57c296484e8f4d8c03`.

Latest continuation instructions: [PERF_HANDOFF.md](PERF_HANDOFF.md).
The static-logo layer reduction and equivalent blind-spot translation are
implemented candidates. The [R3 normal matrix](2026-11-12-normal-matrix.md)
completed four runs; CPU is lower in both pairs, but full acceptance remains
inconclusive because input coverage and other gates remain open. Windows access
is unavailable; the overall plan is not complete.

Status: profile isolation, source attribution, CPU-time sampling, SDK spans,
and runtime topology are implemented. Stages C/D are implemented and reviewed;
four 420-second Linux tape captures have completed in A–B–B–A order.
The [capture-readiness report](2026-11-11-capture-readiness.md) documents the
bundled startup correction. Results and remaining limitations are recorded in
the [subscription report](2026-11-11-renderer-subscriptions.md). A separate
full-grid React Profiler pair has completed; its render-phase results are documented there.
Stage E draw counters and an initial stage F Chromium trace are documented in
the [trace report](2026-11-11-renderer-trace.md). Scheduling changes and the
remaining stages E–G stay conditional; Windows game presentation and packaged
cost have not been measured. A short in-process group comparison is documented
in the [widget group report](2026-11-11-widget-group-comparison.md).
Current focus: system-wide attribution on the saved 10-widget profile. The
[system pipeline report](2026-11-11-system-pipeline-attribution.md) compares
normal operation with central-store application and main snapshot delivery
blocked, while preserving subscriptions and processor demand. It identifies
the expensive downstream update path; it is not an optimization or a game FPS
result. The unproven Weather experiment was reverted. Earlier five-widget
results are scoped diagnostics, not coverage of the full catalog.

Follow-up: the [session-array fast-path report](2026-11-11-session-array-fast-path.md)
records a small identical-reference comparator saving with unchanged IPC-clone
semantics. This microbenchmark does not validate total application CPU or
complete the downstream trace/acceptance work below.
The subsequent [plain-record comparison report](2026-11-11-session-record-comparison.md)
records reduced temporary allocation and a 14–15% local comparison-time saving
for equal full-field fixture clones in two runs. The later R3 matrix measures
the combined candidate's total CPU; it does not isolate comparator contribution.

The [reconstructed ten-widget attribution](2026-11-11-shared-renderer-attribution.md)
restores tape playback and adds two complete group/DOM trace runs with loss-free
CDP completion. Mask removal and an HTML wind-arrow experiment show no supported
gain. The equivalent blind-spot transform and static-logo demotion are now
implemented, with [normal-run evidence](2026-11-12-normal-matrix.md),
[manufacturer scale/DPR checks](2026-11-12-manufacturer-visual.md) and
[replay lifecycle smoke](2026-11-12-lifecycle.md). The original saved seed
remains unavailable; the reconstructed workload is documented separately.

Architecture constraints: [ARCHITECTURE_RULES.md](../ARCHITECTURE_RULES.md).

## Current completion and next priorities

Checked items below mean the stated work is complete; they do not imply that
the whole stage passed its exit criterion or that game FPS improved.

| Stage                             | Current status                                                                                    | Remaining acceptance work                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A — reproducible baseline         | Partial: isolated profiles, source attribution, topology checks and long replay captures complete | Complete environment inventory, two valid matched A/B repetitions and packaged Windows/game validation    |
| B — instrumentation               | Partial: process CPU, SDK spans, React aggregates and canvas counters implemented                 | Complete metadata coverage and measure instrumentation overhead; persist trace completion/buffer evidence |
| C — Relative / TitleBar           | Implementation and behavioral checks complete                                                     | Confirm contribution to total application CPU in matched A/B                                              |
| D — stable Map data               | Core implementation and behavioral checks complete; render-phase improvement observed             | Direct identity-recomputation/allocation measurements and repeatable total-cost validation                |
| E — canvas / hidden windows       | Draw attribution complete; scheduling optimization not implemented                                | Measure and reduce redundant drawing while preserving immediate repaint, animation and hide/show behavior |
| F — windows / compositor / memory | Initial trace and ten-widget system pipeline attribution complete                                 | Separate downstream costs, cover lifecycle spikes, Settings, hidden windows and long-session memory       |
| G — native / IPC                  | Deferred: steady-state transport is not the leading target in the measured workload               | Reopen only if another workload identifies a native/transport bottleneck                                  |

Next work, in priority order:

1. Reconcile the private-memory metrics and finish ownership attribution.
   The [repeated memory diagnostic](2026-11-12-settings-memory.md) localized
   main/overlay growth. A [completed light MemoryInfra diagnostic](2026-11-12-native-memory.md)
   now shows much smaller Chromium private-footprint/live-allocation changes
   than Linux private growth. Preserve this distinction; separate clean/dirty/
   anonymous/file PSS sampling is prepared. Settings listeners/DOM do not
   accumulate, and no unbounded native leak has been established.
2. Complete remaining hidden-drawing coverage. The
   [Linux native-hide probe](2026-11-12-hidden-draw-audit.md) observed zero
   Map/Input/Radar work while hidden and repaint after show, so no Radar change
   is justified. Lap Trace was idle; Gantry runtime history and other native
   visibility modes remain separate. Change scheduling only with measured need.
3. Finish instrumentation-overhead, input-coverage and allocation evidence gaps.
   Do not repeat the normal matrix without a new change or a specific concern:
   R3 already completed two pairs with lower CPU, but its analyzer verdict is
   inconclusive. Preserve that verdict and explain each missing gate.
4. Complete remaining join/leave, actual reconnect and session-transition checks;
   replay seek/pause/native hide/show smoke has passed. Preserve required Input
   and Lap Trace samples, event ordering, precision and lifecycle resets.
5. Verify packaged Windows/iRacing presentation before claiming game FPS or
   frame-time improvement. Windows access is unavailable. A new CI dispatch
   also returned HTTP 422 because Actions is disabled; the earlier successful
   Windows CI covers its checkpoint only.

Settings/memory investigations remain open and should move forward when the
reported trigger or a capture implicates them. A renderer rewrite or native/IPC
redesign is not the next implementation step on the current evidence.

## 1. Goal and scope

Reduce CPU time, unnecessary React updates, canvas/compositor work, and memory
pressure while preserving Input smoothness, calculation accuracy, and replay
behavior. Check whether reduced load is accompanied by improved game frame time.

Data path: SDK → native/JS → processors → ChannelBus/IPC → renderer
selectors/stores → React → canvas/DOM → Chromium compositor → screen.

Make changes in small, independent steps. For each step, keep the original and
modified build, profile, input data, and A/B results. Changes to the native API,
threads, and IPC format require separate justification after measurement; they
are not part of the initial React optimization.

## 2. Initial observations and limitations

Previous demo captures were taken on branch `fix/input-trace-canvas`, revision
`20ef8608`, and are not a baseline for this branch. Raw local artifacts are in
the ignored `perf-results/` directory:

- `demo-full-20261111.log`, `demo-empty-20261111.log`, and their summaries;
- `react-profiler-demo-20261111.console.log`.

Observations to recheck:

| Observation                                         | Limitation on the conclusion                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Full/empty: average App CPU 5.37% / 0.21%           | Full included Settings and two renderer processes; empty had one. This is not the isolated cost of widgets            |
| Full: working-set slope about 19 MB/min             | Of that, Settings: 14.76; overlay renderer: 0.76 MB/min. Private memory was unavailable; no leak has been established |
| Renderer p99 about 5.7 ms                           | This is an rAF interval, not CPU render time or actual present time                                                   |
| React actualDuration usually below 1 ms             | The render phase of five widget subtrees was measured; layout/effects/paint/compositor were not covered               |
| One actualDuration of 22.6 ms in the first interval | The aggregate does not link the maximum to mount/update; a recurring hitch has not been established                   |
| `processTelemetry` p99 about 0.16 ms in demo        | The mock mode does not measure the native SDK or its synchronous wait                                                 |

Candidates confirmed in the new base:

- Relative subscribes to the full track state for `sessionFlags`.
- TitleBar subscribes to the full track state for `lapDistPct`, including
  before returning `null` when the title is disabled.
- Map calculates identities in `useMemo` with a dependency on the
  `carIdxClassPosition` array reference, which may change after every IPC
  delivery.
- The regular Track Map does not set `maxFps`; the embedded variant is limited
  to 30 FPS.
- Live `waitForData(16)` runs before the existing `processTelemetry` span.
- Native reads materialize metadata and buffers for all variables on every
  call; JS already partially reuses value arrays.

## 3. Stage A — reproducible baseline and metric definitions

Dependencies: none. Priority: P0.

- [ ] Record the source SHA and tracked-file state, build versions,
      Electron/Chromium, OS, CPU/GPU/driver, displays, DPI, and refresh rate.
- [ ] Keep one seed profile: widget instances, config, layout, window mode,
      Gantry, Settings, number of windows, channels, and visibility rules.
- [x] Create identical isolated copies of the seed for each run. Verify the
      actual storage path: the previous `--user-data-dir` did not provide the
      expected startup-storage isolation. Do not change user settings.
- [x] Separate workloads: Linux mock, deterministic SDK tape, and actual
      replay/game session. Record the actual source in metadata; do not leave
      `simulatorMode: live` on a mock capture or assess FPS using fixture fields.
- [ ] Capture baseline and candidate on the same target. Use Dev for the React
      Profiler; verify final cost with a packaged build on Windows.
- [x] For steady state, capture 420 seconds: exclude 60 seconds of warmup and
      analyze the following 360 seconds. This leaves more than the 300 seconds
      required by the analyzer. Capture startup as a separate scenario.
- [ ] Complete two valid repetitions in A–B / B–A order. The early pair with
      mismatched 60/165–169 Hz cadence remains confounded. R3 later completed
      matched A–B–B–A runs with lower CPU in both pairs, but missing channel input
      coverage and private-memory integration keep the full analyzer gate open.
      See its report; do not restart capture merely because this box is open.

Workload matrix:

| Scenario                                                       | What to hold constant/check                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Full and empty                                                 | Same overlay geometry and process topology; Settings closed in both      |
| Settings alone                                                 | Same open page and preview; memory and CPU separate from overlay         |
| Relative, Standings, Map, Input, Radar, Lap Trace individually | Same seed and input data; change one factor at a time                    |
| Full grid                                                      | Number of cars/classes, changing channel inputs, visible rows            |
| Visibility                                                     | visible → hidden → visible, hotkey hide, Gantry separately               |
| Lifecycle                                                      | join/leave burst, disconnect/reconnect, camera change, replay pause/seek |

Metrics and units:

- App/process CPU% and CPU time: obtain CPU time from the delta of accumulated
  user+system time for each PID, in ms and ms/s. State how percentages are
  normalized and account for new/closed PIDs. Do not double-count Node main CPU
  and Electron Browser CPU.
- rAF interval: p50/p95/p99/max, number of intervals >25/>50 ms. This is the
  renderer scheduler cadence, separate from render duration and present.
- React: render-phase actualDuration, baseDuration, phase, commits/s, total
  render ms/s. A callback for a subtree does not prove that its root rerendered.
- Chromium trace: scripting, effects/commit work, layout, paint, raster,
  compositor, and GC; separate GPU process CPU from GPU engine utilization.
- Game: PresentMon/ETW present intervals, p95/p99/max, and hitch count using a
  threshold selected in advance. Record camera, FPS cap, sync, and the same replay.
- Memory: renderer JS heap, process working set, private memory when available,
  and GPU memory when available. The sum of working sets may include shared
  pages; growth alone does not prove a leak.

Stage A exit criterion: the baseline is reproducible, profile and topology
match, the data source is correctly identified, and coverage/duration/missing
metrics are stated explicitly. `--allow-inconclusive` does not turn a result
into a passed gate.

## 4. Stage B — correct instrumentation

Dependencies: A. Priority: P0.

- [x] Add opt-in spans for SDK wait, telemetry/session reads, full synchronous
      processing, and the entire poll-loop iteration. Clearly distinguish
      wall-clock wait, CPU time, and the planned delay until the next poll.
- [x] Preserve the previous spans for comparison. Correctly finish new spans
      on timeout, exception, disconnect, and stop.
- [x] Extend existing metric types/allowlists and the analyzer consistently;
      do not add a standalone IPC firehose.
- [ ] Record window IDs, renderer role, active instances, subscriptions/rates,
      and the actual mock/tape/live source in metadata.
- [x] For React, capture interval aggregates and a bounded list of slow render
      events: widget instance ID/type, phase, actualDuration, startTime, and
      commitTime. Align timelines with the capture origin.
- [ ] Keep data in bounded buffers; emit aggregates infrequently. Compare
      captures with instrumentation on/off and estimate its overhead.
- [x] Store traces separately from lightweight perf captures: sampling/profiling
      adds load and is not a direct estimate of a normal packaged run.

Stage B exit criterion: the report shows complete work boundaries, timestamps
are comparable, slow events include phase/instance, and memory use is bounded.

## 5. Stage C — narrow Relative and TitleBar subscriptions

Dependencies: A/B. Priority: P1. Potential files:
`Standings/Relative.tsx`, `Standings/components/TitleBar/TitleBar.tsx`,
`context/ChannelStore/useTrackStateSnapshot.ts`, and existing specs.

- [x] Relative: replace the full snapshot with the existing `sessionFlags`
      selector; preserve flag contour and color behavior.
- [x] TitleBar: enable the progress subscription only when the title,
      progress bar, and applicable session mode actually need that value. Keep
      hook order stable; use `enabled` or split progress into a child component.
- [x] Choose frequency/precision based on visible progress: first remove
      irrelevant notifications, then evaluate frequency reduction separately.
- [x] Check session/lap-count hook dependencies: a disabled title must not
      retain unnecessary high-frequency work in its subtree.
- [x] Check position changes with constant flags, flag changes, Practice/Race
      modes, disabled title and progress, finish, and replay seek.

Stage C exit criterion: changes to unrelated track-state fields do not notify
the flag selector; disabled progress does not keep its own movement subscription.
Other consumers may retain the shared renderer subscription. UI updates for
other reasons are acceptable. Record before/after commits and render ms/s.

## 6. Stage D — stable Map data

Dependencies: C or an independent A/B from baseline. Priority: P1.
Main file: `TrackMap/hooks/useDriverProgress.tsx`.

- [x] Select class positions using a selector with semantic array equality, so
      equal values after IPC preserve the selected reference.
- [x] Use suitable existing equality or a local pure comparator; account for
      undefined, length, and actual changes to individual positions.
- [x] Separate infrequent changes to identities/classes/qualifying/roster/focus
      from position progress, which continues updating at its own frequency.
- [x] Stabilize fallback qualifying data if the conversion creates a new array
      on every render. Preserve reset/disconnect semantics.
- [ ] Count identity recomputations and allocation rate. Do not mutate snapshots
      or selected arrays to artificially preserve references.
- [x] Check equal values in new payload objects, position changes, join/leave,
      pace car, spectator, multiclass, qualifying fallback, and focus.

Stage D exit criterion: equal class positions do not trigger repeated identity
grouping/sorting; real changes update the map correctly. Equality costs less
than the eliminated work on a representative full grid.

## 7. Stage E — canvas frequency and work in hidden windows

Dependencies: D, separate A/B for each change. Priority: P2.

- [x] Split Map counters into draw on React commit and intermediate rAF draw.
      The existing combined metric includes both paths and is not screen FPS.
      The trace report verifies count/duration equality for all 23 intervals.
- [ ] Compare the existing Map mode with a 60 FPS cap on 60/144/240 Hz displays.
      Account for the fact that current `maxFps` limits intermediate frames, while
      paint in the layout effect runs independently of the cap.
- [ ] If needed, improve carried-deadline scheduling without systematically
      lowering 60 FPS to a value tied to a multiple of refresh rate.
- [ ] Check that rAF stops after interpolation completes and when the
      widget/window is hidden. Do not add background timers to bypass pausing.
- [ ] Preserve immediate repaint after static-cache and size changes, DPR/widget
      scale, colors, icons, and data changes. Do not introduce one blank frame.
- [ ] Radar already limits paints to 60; check actual draw rate and `active`
      lifecycle before changing its scheduling.
- [ ] If a new user setting is needed, describe it in the type, manifest
      defaults/properties, and settings; use the existing merge.

Stage E exit criterion: CPU/draw work decreases beyond repeat noise; movement,
fade/hide, scaling, and replay do not regress. For visual changes, prepare
before/after screenshots and a short motion recording.

## 8. Stage F — windows, Settings, memory, and compositor

Dependencies: A/B; independent of C–E. Priority: P1 for diagnosis.

- [ ] Capture Settings closed/open on the same page, with preview
      enabled/disabled; attribute CPU/heap/working set by PID.
- [ ] Capture allocation/heap profiles during sustained growth; check cleanup
      of preview, listeners, timers, canvas, and objects across repeated open/close.
- [x] For memory trends, use at least 20 minutes of steady state and repeat;
      compare heap after GC at identical checkpoints; do not infer a leak from RSS.
      Completed for visible Standings preview with looping tape; see the memory
      report. Allocation ownership and other workload modes remain open.
- [ ] Compare display/shared and individual/widget modes with identical
      instances, layout, and DPI; record actual geometry of all windows.
- [x] Capture an initial Chromium Performance trace with Settings closed and
      attribute layout/paint/raster/compositor spans; see the
      [trace report](2026-11-11-renderer-trace.md). This is diagnostic evidence,
      not a normal-run CPU estimate or complete causal attribution.
- [x] Localize steady-state load across shared snapshot pipeline boundaries on
      the saved ten-widget profile; see the
      [system pipeline report](2026-11-11-system-pipeline-attribution.md).
- [ ] Separate the downstream React/effects, DOM/canvas and compositor costs
      enough to select a shared implementation change; validate it without
      diagnostic work suppression.
- [ ] Check hidden windows with `backgroundThrottling: false`: snapshot gating
      is separate from rAF, event delivery, and Gantry history retention.
- [ ] Preserve Gantry's required always-fed semantics and event delivery; do
      not change Chromium flags or hardware acceleration without a separate A/B.

Stage F exit criterion: the owner of load/memory growth is identified by
process and objects; window changes are confirmed by trace and game presentation
capture.

## 9. Stage G — conditional native/IPC optimization

Current decision: defer interface/transport changes. In the completed R3 normal
matrix, the Browser/main process accounts for 13.05–14.58% of summed process CPU
(84.48–92.26 CPU ms/s). This includes SDK, processors and other main work; it
does not isolate native materialization. It also does **not** bound end-to-end
IPC cost, since deserialization/store work is in renderers. Together with the
downstream traces and measured compositor candidate, this supports continuing
renderer/drawing investigation first, not declaring transport free or redesigning
the native API without new attribution.

Dependencies: live profile B/F. Priority: P3, only when there is measured benefit.

- [ ] If SDK materialization dominates: measure copied bytes, number of
      objects/buffers, and conversion cost; propose metadata caching or a minimal
      typed read path while preserving existing consumers.
- [ ] If main-thread blocking dominates: design an async native wait or separate
      host; check SDK thread ownership, stop/cancellation, reconnect, and replay
      seek. Preserve N-API guards and buffer safety.
- [ ] If IPC dominates: measure bytes/rate/delivery by channel and window, then
      reduce a specific payload. Preserve coalescing, rate ceilings, event ordering,
      latest snapshot, and seeded delivery after show.
- [ ] Do not reduce Input accuracy, FuelLevel/SessionTime threshold calculations,
      or frame-delta speed calculations; these are covered by the no-round rules.

Stage G exit criterion: the gain exceeds measured overhead of the new interface
and copying; public consumers and lifecycle behavior are preserved.

## 10. Delivery order and checks

Proposed independent commits/PRs:

1. `chore: make overlay performance captures comparable` — stages A/B.
2. `perf: narrow relative and title bar subscriptions` — C.
3. `perf: preserve track map identity data between position updates` — D.
4. `perf: limit redundant track map paints` — E, if A/B confirms benefit.
5. Separate Settings/memory or window-rendering fix — based on F results.
6. Separate native/IPC work — only after decision G.

For each implementation step:

- [ ] Write branch documentation, commit messages, and PR titles/descriptions
      in English.
- [ ] Run targeted behavioral tests: no notification for irrelevant data,
      correct updates for real changes, cleanup, replay/disconnect. New domain
      selectors require specs.
- [ ] Run TypeScript/ESLint before commit; broaden tests for affected
      dependencies when store/channel/native lifecycle changes.
- [ ] Capture before/after React profiles on a full grid, including root and
      descendants; do not substitute commit/paint duration for render duration.
- [ ] Repeat matching A/B from A; show CPU ms/s, distributions, topology,
      channel activity, frame intervals, and missing data.
- [ ] Claim game FPS regression/improvement only from actual game present
      capture; exclude mock/tape fixture FPS from this assessment.
- [ ] Complete applicable architecture checklist items; keep raw captures and
      review media outside tracked files, and store concise results in docs.
- [ ] Follow the PR template; visual changes require actual GitHub screenshot
      attachments, before/after images, and verification that they render in the PR.

Use short, in-process group isolation to find expensive paths before expanding
the workload matrix. Keep window geometry and source cadence checked, split a
suspect group, and profile individual widgets only after evidence narrows the
search. Reserve long matched A/B repetitions for validating a proposed fix;
do not run the whole matrix for each widget by default.

The final report must list completed changes and unresolved limitations. Do not
call a change an optimization without a reproducible gain.
