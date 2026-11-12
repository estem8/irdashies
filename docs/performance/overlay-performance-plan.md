# Overlay Performance Improvement Plan

Date: 2026-11-12. Branch: `perf`.
Base: `tariknz/irdashies`, `main`,
`94f0264170c61b34bac61a57c296484e8f4d8c03`.

## Document ownership

This file is the sole active source for performance status, decisions,
acceptance gaps, and next priorities. Update it when evidence changes; link to
the detailed report instead of copying result tables or backlog items.

- [`../PERFORMANCE_BENCHMARKS.md`](../PERFORMANCE_BENCHMARKS.md): repeatable
  capture and analysis protocol only.
- Dated reports in this directory: experiment evidence; link them instead of
  copying their result tables or chronology into the plan.

The original saved user profile is unavailable; reconstructed workloads do not
represent it. See [`ARCHITECTURE_RULES.md`](../ARCHITECTURE_RULES.md) for
performance constraints.

## Continuation protocol

1. Read this plan first, then only the linked evidence and benchmark procedure
   relevant to the selected task. Inspect `git status` and recent commits before
   editing; preserve unrelated user changes.
2. Continue on the existing `perf` branch. Do not create temporary branches,
   another plan, handoff or status log. Isolated capture worktrees are allowed
   only when required by the benchmark, without a new development branch.
3. Select one open task by ID from the execution queue below. Check its existing
   evidence first. Stages A–G describe scope and acceptance, not an instruction
   to restart at A. Completed experiments stay complete even when acceptance
   is inconclusive. Reopen work only for a documented regression, changed input
   or a specific missing measurement.
4. Before measuring, state the hypothesis, missing evidence and completion
   criterion. Reuse existing helpers. Prefer a short targeted diagnostic;
   reserve long A/B runs for a concrete candidate. Never rerun an unchanged
   experiment solely to obtain a passing verdict.
5. After each completed step, update that task in this file with its result,
   checks, evidence link or artifact location, remaining limitation and next
   action. Update affected stage checkboxes in the same change. Use `[x]` only
   when the stated criterion is met; partial or blocked work remains `[ ]`.
   A completed diagnostic may have an inconclusive outcome without closing
   the broader acceptance requirement.
6. Commit each completed step together with its plan update on `perf`, using an
   English conventional commit message. Run TypeScript/ESLint before committing
   and appropriate behavioral checks for code changes. For documentation-only
   steps, verify links, formatting and consistency. Stage explicit task files.
   The commit containing the note identifies its checkpoint; do not add a
   follow-up commit solely to insert its own hash.
7. Before ending a run, leave the selected task's next action or exact blocker
   here and report the commit hash. If blocked, select another actionable task;
   if none is actionable, report the blockers instead of repeating closed work.
   Do not commit incomplete code merely to satisfy the checkpoint rule.

## Execution queue

This queue owns task selection and progress; the stage checklists below retain
technical acceptance detail. Blocked items are not completed. Conditional Stage
G work and reusable delivery checks are not additional queue items.

- [x] **DOC-1 — consolidate continuation instructions.** Result: one entry point,
      continuation/commit protocol, task IDs and separated historical observations.
      Existing log/handoff deletions and reference updates are included in this
      documentation checkpoint. Checks: local links, obsolete-name search,
      formatting and diff whitespace. No runtime behavior changed.
- [ ] **F-1 — attribute remaining memory growth with collection disabled.**
      Next: inspect the existing Settings, MemoryInfra and composition reports;
      select one allocation/heap ownership measurement with a collection-off control.
      Completion: identify the growing process and retained object/allocation owner,
      or record a bounded diagnostic that rules out a specific owner and name the
      next discriminating measurement. Do not mark the broader Stage F ownership
      requirement complete unless an owner is established. The completed short
      composition and long forced-GC runs need no repetition with unchanged inputs.
- [ ] **B-1 — identify and close metadata gaps.** Next: compare current capture
      origin/runtime metadata against Stage B's required fields and existing R3
      evidence. Completion: enumerate missing fields explicitly, add any necessary
      capture support and verify with a short capture; preserve unavailable fields
      as unavailable. This does not retroactively pass R3 or quantify overhead.
- [ ] **F-2 — verify reconnect/session and event delivery.** Next: inspect the
      lifecycle report and available fixtures; target only transitions not already
      exercised. Completion: evidence of reset/resume and positive required event
      delivery for each covered transition. Blocker: the current tape has no radio
      transmission; radio coverage requires a suitable fixture or simulator input.
- [ ] **E-1 — close remaining drawing/visibility checks.** Next: enumerate
      untested static-cache/resize/DPR and native visibility transitions against
      existing hidden-draw reports, then exercise those transitions only.
      Completion: immediate repaint and correct stop/resume without a blank frame
      in the added cases. Actual 144/240 Hz checks remain blocked by absent hardware;
      do not replace them with simulated cadence or introduce an unmeasured scheduler.
- [ ] **F-3 — compare window-mode cost with matched input cadence.** Next:
      diagnose the known 56.22/53.23 Hz mismatch before another long comparison.
      Completion: repeated matched A/B CPU/memory evidence with equal geometry,
      source cadence and workload, or a documented blocker. Existing geometry
      verification is complete and must not be redone as the task's sole result.
- [ ] **A-1 — packaged Windows and simulator presentation acceptance.**
      Blocked: Windows/iRacing access is unavailable. Completion: same-target
      packaged A/B and actual simulator presentation evidence under the declared
      workload. Remote CI is also blocked by HTTP 422 (Actions disabled); dispatch
      only after that external condition changes. Linux CI and historical Windows
      checks do not close this item.

## Current completion and next priorities

Checked items below mean the stated work is complete; they do not imply that
the whole stage passed its exit criterion or that game FPS improved.

| Stage                             | Verified evidence                                                                                                              | Open requirement                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| A — reproducible baseline         | Isolated source/seed/environment/topology; completed Linux R3 A–B–B–A                                                          | Full analyzer acceptance remains inconclusive; packaged Windows and real simulator presentation absent                               |
| B — instrumentation               | SDK/process/React/draw boundaries; bounded diagnostics and clock guards; completed collection on/off experiment                | Quantitative overhead is inconclusive, not zero; some activity/metadata coverage remains incomplete                                  |
| C — Relative / TitleBar           | Implementation and behavioral checks; combined normal-operation matrix                                                         | Combined six-file gain does not isolate this change's CPU contribution                                                               |
| D — stable Map data               | Behavioral tests, render-phase result and repeated direct identity construction measurement                                    | App-wide allocation bytes and isolated CPU contribution are not established                                                          |
| E — canvas / hidden windows       | Map/Input/Radar hidden draw stop/resume; exercised Lap Trace stop/resume after reference-reset fix                             | Actual high-refresh displays and additional visibility/static-cache transitions remain unverified; no new scheduler change justified |
| F — windows / compositor / memory | Compositor/visual diagnostics; repeated 20-minute memory checks; Gantry hidden history; window-mode geometry; Settings cleanup | Memory allocation ownership unresolved; repeated cost comparison and broader lifecycle coverage remain open                          |
| G — native / IPC                  | Deferred conditional work                                                                                                      | Reopen only with measured native/transport bottleneck; no redesign justified by current evidence                                     |

Evidence and constraints for the execution queue (not additional tasks):

1. Preserve the unresolved memory distinction. The
   [repeated long-session check](2026-11-12-settings-memory.md),
   [MemoryInfra diagnostic](2026-11-12-native-memory.md) and
   [clean/dirty/anonymous controls](2026-11-12-memory-composition.md) are complete
   in their stated scopes. Linux private growth exceeds the smaller reported
   live allocation changes; a retained native leak and allocation owner remain
   unproven. The short natural-GC composition controls cannot retroactively
   explain every byte of the long forced-GC run.
2. Cover actual reconnect/session transitions and active radio input where
   available. [Conditional demand](2026-11-12-input-demand.md) explains absent
   lap-time publication in the ordinary seed; the separate
   [feature-enabled runtime](2026-11-12-lap-times-features.md) verifies positive
   history delivery. The tape contains no radio transmission. Keep R3's original
   inconclusive verdict; these later diagnostics do not turn it into a full pass.
3. Continue only unresolved drawing/window work. Native hide/show is verified
   for [Map/Input/Radar](2026-11-12-hidden-draw-audit.md),
   [exercised Lap Trace](2026-11-12-laptrace-hidden.md), and
   [Gantry hidden history](2026-11-12-gantry-hidden.md).
   [Window topology](2026-11-12-window-topology.md) has matching instance geometry,
   but is not a repeated CPU comparison. High-refresh hardware remains absent.
   Do not introduce scheduling changes without a measured need.
4. Keep instrumentation qualification explicit. The
   [collection on/off experiment](2026-11-12-collection-overhead.md) has mixed-sign
   deltas and a disclosed recovery gap. Do not repeat the full normal matrix
   merely to obtain a favorable result or subtract an assumed zero overhead.
   [Map identities](2026-11-12-map-identities.md) now have a completed direct
   four-run diagnostic; total allocation bytes remain a different claim.
5. Verify packaged Windows/iRacing presentation before game FPS/frame-time
   claims. Windows access is unavailable. The user's later explicit CI request
   authorized dispatch, but GitHub rejected it with HTTP 422 (Actions disabled),
   despite the permissions API reporting enabled. No current-head remote run
   exists. [Full local CI](2026-11-12-local-ci.md) passed on Linux; the earlier
   Windows run covers its historical checkpoint only.

Settings/memory investigations remain open and should move forward when the
reported trigger or a capture implicates them. A renderer rewrite or native/IPC
redesign is not the next implementation step on the current evidence.

## Earlier findings and closed decisions

These summarize the lasting outcomes from the older Phase 0.5–2a records. Their
measurements are historical, not current baselines; current acceptance is
defined by the stages and reference workloads below.

| Finding                                                                                      | Disposition                                                                                                                                                                            | Current interpretation                                                                                                         |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Early steady-state and driver-join memory growth                                             | Legacy tests observed roughly 13–20 MB/min steady growth and 5–6 MB per joining driver. Phase 2a fixes reduced growth in specific workloads.                                           | Not globally resolved: newer development runs still show private-memory growth with an unresolved owner. Stage F remains open. |
| `L1`/`L2`/`S5`: synchronous storage writes, repeated session parsing, analytics-log pressure | The identified hot-path write, YAML parse, and warning-forwarding issues were addressed in earlier remediation runs.                                                                   | Closed for that remediation; no current regression is established here.                                                        |
| `P1`/`P2`/`P4`: telemetry fanout and raw high-frequency subscriptions                        | Payload projection, typed-channel delivery, and targeted selector changes landed in earlier phases.                                                                                    | Implementation work is complete; the combined R3 result remains inconclusive and does not isolate every change's cost.         |
| `H3`/`H4` and Standings allocation churn                                                     | Boot-reset and uneventful PitLap clone issues were fixed and validated in Phase 2a workloads.                                                                                          | Closed for the measured cases; retain the current acceptance limits above.                                                     |
| `A2`/`A3`/`L5`/`A7`: disconnect cleanup and per-driver state                                 | Disconnect cleanup and leave emission were implemented and tested. Mid-session absence detection was declined because transient `SessionInfo` omissions can create false leave events. | Disconnect path closed; mid-session leave detection is an explicit design decision, not an open fix.                           |
| Per-renderer reference-lap fetches                                                           | Reference-lap work moved to the main-process `ReferenceLapProcessor` and `reference-laps.snapshot` channel (`bf119e05`).                                                               | Closed; no per-renderer fetch-dedup task remains.                                                                              |
| Tier 2b filesystem-level write-count proof                                                   | The old run log did not establish whether debounce behavior reduced actual disk writes.                                                                                                | Not an active performance gate; revisit only for a concrete storage regression or new evidence.                                |

## Reference workloads

Use references only for the same build target and workload. The latest located
packaged result is not a measurement of current `main`; packaged current-main
drift remains unmeasured.

| Reference                                     | Scope and result                                                                                                                                                                                  | Qualification                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| August packaged pair, `28cbf61e` → `f189c2ee` | Full 40-car tape, 17 widget types; app CPU 3.709% → 3.679%, private-memory slope 16.574 → 9.273 MiB/min. [Evidence](2026-08-09-packaged-reference.json).                                          | Latest located packaged reference; memory target still missed and event-driven input coverage incomplete.                                 |
| 1 November `a5200766` saved-profile replay    | Two 420-second development runs, 59-car actual replay and 20 saved widget instances; app CPU 4.483–4.604%, private-memory slope 20.320–43.683 MiB/min. [Report](2026-11-01-main-full-profile.md). | Descriptive, incomplete input coverage; not a packaged release baseline.                                                                  |
| 1 November shared/widget window comparison    | Six-instance development replay; app CPU 2.010% shared vs 4.699% individual, private-memory slopes 9.853 vs 20.221 MiB/min. [Report](2026-11-01-window-mode.md).                                  | Scoped comparison with missing input coverage; not a full-workload or release result.                                                     |
| 12 November R3 normal matrix                  | Four 420-second Linux tape runs; CPU was lower in both pairs (18.02% and 7.61%). [Report](2026-11-12-normal-matrix.md).                                                                           | Current campaign comparison; formal acceptance remains inconclusive because input coverage and private-memory integration are incomplete. |

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

Historical observations at the starting base, before the changes below.
Relative/TitleBar and Map identity findings were addressed in C/D; SDK wait
instrumentation was addressed in B. This list is not a current backlog:

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

- [x] Record source/build state and matched Linux environment inventories for
      R3; see the [normal matrix](2026-11-12-normal-matrix.md). This closes
      campaign capture bookkeeping, not packaged Windows acceptance. Record
      fresh source/environment metadata for each future comparison.
- [x] Keep one declared seed within each comparison: widget instances, config,
      layout, window mode, Gantry, Settings, windows, channels and visibility.
      Reconstructed and diagnostic seeds are recorded separately; the original
      user seed remains unavailable.
- [x] Create identical isolated copies of the seed for each run. Verify the
      actual storage path: the previous `--user-data-dir` did not provide the
      expected startup-storage isolation. Do not change user settings.
- [x] Separate workloads: Linux mock, deterministic SDK tape, and actual
      replay/game session. Record the actual source in metadata; do not leave
      `simulatorMode: live` on a mock capture or assess FPS using fixture fields.
- [x] Capture baseline and candidate on the same Linux development target;
      R3 and the render-phase diagnostic are complete in their stated scopes.
- [ ] Verify final cost with a packaged build on Windows (A-1; blocked).
- [x] For steady state, capture 420 seconds: exclude 60 seconds of warmup and
      analyze the following 360 seconds. This leaves more than the 300 seconds
      required by the analyzer. Capture startup as a separate scenario.
- [x] Complete two matched repetitions in A–B / B–A order: R3 completed a
      matched A–B–B–A capture. The capture requirement is complete, but the full
      analyzer gate remains inconclusive because of input-coverage and
      private-memory gaps. See its report; do not restart capture merely because
      acceptance remains open.

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
- [x] Record source kind, startup topology, runtime process roles and channel
      rates in existing captures; see the
      [instrumentation report](2026-11-11-perf-instrumentation.md) and R3 report.
- [ ] Audit field completeness for runtime window IDs, active instances and
      per-window subscription/rate attribution; enumerate and close specific
      missing fields under B-1. Existing aggregate/source metadata is not an
      instruction to rerun the normal matrix.
- [x] For React, capture interval aggregates and a bounded list of slow render
      events: widget instance ID/type, phase, actualDuration, startTime, and
      commitTime. Align timelines with the capture origin.
- [x] Keep diagnostic buffers bounded and emit aggregates infrequently; run the
      collection on/off comparison. Its recovered result is inconclusive due to
      mixed-sign deltas and an 8,388-second recovery gap; it establishes no
      overhead bound. Do not call the overhead zero or subtract an assumed cost.
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
- [x] Count identity recomputations and specific identity-object construction
      rate without mutating snapshots or selected arrays. The
      [direct four-run diagnostic](2026-11-12-map-identities.md) observes about
      879–888 identity objects/s baseline versus 0.363/s candidate, with matched
      progress/input cadence. This is not total allocation bytes or retained heap.
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

Only items phrased “if needed” or “if a new setting is needed” are conditional;
other unchecked Stage E checks remain open as described in the status table.

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
- [x] Compare display/shared and individual/widget modes with the same instances,
      layout, and DPI; record all window geometry. Geometry matched, but input
      rates differed (56.22 vs 53.23 Hz), so this is not a CPU comparison.
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
- [x] Verify hidden draw stop/resume for Map/Input/Radar, exercised Lap Trace,
      and Gantry history retention/disable cleanup in the tested scenarios.
- [ ] Complete remaining visibility/lifecycle coverage: other native hide modes,
      rAF versus snapshot/event delivery, and full Gantry incident/event coverage.
- Preserve Gantry's always-fed contract. Do not change Chromium flags or
  hardware acceleration without a separate A/B; this is a constraint, not an
  outstanding implementation task.

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

No Stage G item is active. The unchecked items below are conditional triggers,
not current tasks; reopen them only after attribution shows a native/IPC bottleneck.

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
      Invariant: do not reduce Input accuracy, FuelLevel/SessionTime threshold
      calculations, or frame-delta speed calculations; follow the no-round rules.

Stage G exit criterion: the gain exceeds measured overhead of the new interface
and copying; public consumers and lifecycle behavior are preserved.

## 10. Future delivery checks

The initial C/D implementation and instrumentation are already on `perf`; those
proposed commits are superseded. Remaining code changes are evidence-gated:

1. Stage E drawing/scheduling change only after matched A/B identifies a gain
   beyond run variation without visual or lifecycle regressions.
2. Stage F Settings/memory/window change only after attribution identifies an
   owner and a reproducible consumer-visible cost.
3. Stage G native/IPC change only after a measured transport or SDK bottleneck.

The checklist below applies to each future change/PR; unchecked boxes are a
reusable gate, not branch backlog.

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
