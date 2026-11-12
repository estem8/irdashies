# Perf checkpoint — 2026-11-12

Goal: finish `perf`. **Not complete.** User requested a GitHub checkpoint before
usage limits. R3 completed all four 420-second runs with exit 0. See the
[normal matrix report](2026-11-12-normal-matrix.md): CPU is lower in both pairs
(18.02% and 7.61%), but full acceptance remains inconclusive.
Earlier R2 completed A1/B1 only; B2 is incomplete and A2 is absent.
Candidate source is restored (the six measured files match HEAD).
Windows/iRacing access is unavailable, confirmed by the user; do not
claim game FPS or Windows acceptance.

## Latest execution status

- `map-identities-r1` is terminal: baseline a1 completed; b1 hit the app's
  default five-second topology readiness timeout while windows were loading.
  Candidate restoration/child termination are verified. Log chronology shows
  timeout first, then controller process-group termination, then GPU errors.
  Earlier GPU-startup attribution for this and R5 on2/light-memory smoke was
  premature: those GPU messages are teardown evidence, not an established cause.
- Capture-only startup grace now validates PERF_RUNTIME_TOPOLOGY_TIMEOUT_MS
  (1000–60000 ms, default unchanged at 5000). The controller requests 30000 ms,
  within 60 seconds of warmup, and still requires complete readiness. Origin
  records the main PID before readiness, so failure cleanup can signal main
  first rather than the entire GPU/renderer process group. 31 targeted tests,
  TypeScript and targeted ESLint pass, including a renderer loading after 6s.
  Next is a fresh same-protocol `map-identities-r2 identity` four-phase run.
  No capture is currently active; r1 a1 remains separate partial evidence.

- CURRENT: on2 retry completed 420 seconds, exit 0 and candidate restoration.
  All four successful measurements are assembled in ignored
  `collection-overhead-r5-recovered`, with original failed startup preserved.
  Strict source/seed/viewport/runtime/cadence and PID checks pass. CPU overhead
  is inconclusive: on-minus-off +3.314% / -4.141%, on/on variation 40.663 ms/s;
  UTC recovery gap 8388.267 seconds is an additional confounder. See
  `2026-11-12-collection-overhead.{md,json}`. Do not claim zero overhead.
  New smaps controls show mainly dirty/anonymous changes and larger on-mode
  growth; no retained leak is established. See memory-composition report.
  No capture is active. Next: direct Map identity diagnostic, then exercised
  Lap Trace hidden and Gantry probes. CI remains deferred for the user's limits.

- CURRENT: R5 is terminal. on1/off1/off2 each completed 420 seconds with exit 0;
  on2 failed topology preflight (cause not yet diagnosed). Controller exit 1,
  child termination verified and candidate restored. No full overhead result.
  The first three phases' scalar CPU/private-memory evidence is preserved in
  `2026-11-12-overhead-r5-partial.json` on the wip/perf-r5-checkpoint branch.
  Current source remains 2e5354cc. No capture is active. Preserve the three
  successful phases; inspect on2 startup diagnostics before deciding how to
  collect the missing last leg. User requested immediate GitHub preservation.

- `collection-overhead-r4 overhead` is terminal: on1 completed 420 seconds;
  off1 was interrupted after about 225 seconds of observed playback when wall
  time advanced about three hours. Controller failed its Date.now shutdown
  deadline; child termination and candidate restoration are verified. The user
  confirmed changing the clock. This is not evidence of an app shutdown hang,
  and the incomplete matrix is not an overhead result.
- Capture deadlines/elapsed CPU intervals now use performance.now; a >2-second
  wall/monotonic divergence rejects a capture explicitly. Unit cases cover
  forward/backward clock changes. Temporary `systemd-inhibit --what=idle:sleep`
  acquisition succeeded; no system configuration changed. Next full run is R5
  under that inhibitor. Keep HEAD fixed across all four phases.
- Prepared but unexecuted: lifecycle-probe hidden-laptrace mode injects a
  matching synthetic reference only into the isolated renderer store to exercise
  plot/brake-cue drawing before/hide/show. Requires runtime verification after
  CPU/identity captures. Gantry draft is only in ignored
  `perf-results/prepared-tools/gantry-probe.mjs`: it still needs a dedicated
  Gantry-enabled diagnostic seed/controller path because PERF_WIDGET_TYPES
  overrides saved enabled flags. Do not run the draft as currently written.

- `overhead-readiness-r1 overhead smoke` completed both on/off 90-second phases,
  exit 0 with candidate restored. Each state has four valid external CPU and
  existing-store snapshot samples at 1549x1014/DPR1; runtime inventories match.
  On emitted 18 main/17 renderer report rows; off emitted zero of both while
  snapshots continued advancing. See `2026-11-12-collection-overhead-readiness.json`.
  This is readiness, not an overhead estimate. Next full matrix:
  `node tools/perf/capture/long-matrix.mjs collection-overhead-r4 overhead`.
  Keep HEAD/app/capture source fixed throughout its four phases. Do not commit
  on perf until it finishes; prepare unused docs/tools without committing.

- `collection-overhead-r3 overhead` failed before measurement: an early
  existing-store snapshot check found Driver Controls not ready. Child shutdown
  and candidate restoration are verified; no overhead result. The snapshot
  readiness check now follows 55 seconds of warmup. Next validation is a short
  two-phase on/off readiness capture (`overhead-readiness-r1 overhead smoke`,
  90 seconds per phase). The full four-phase report must reject this short run.
  No active capture at this preparation checkpoint.

- `collection-overhead-r2 overhead` failed preflight after the virtual display
  returned to 2560x1369: actual overlay height 1014, requested diagnostic height 1009. Zero completed phases/samples, child termination verified and candidate
  restored. Existing-store snapshot access initialized successfully before the
  geometry assertion. This is not an overhead result. Next run uses normal
  default 1014 geometry (no height override), ID `collection-overhead-r3`.

- `collection-overhead-r1 overhead` was deliberately cancelled during on1
  (no completed phases), exit 130, candidate restored and child termination
  verified. It omitted input-cadence evidence with collectors off and is not an
  overhead result. The updated diagnostic reads existing channel-store snapshot
  versions without subscriptions and reports cadence mismatches as incomparable.
  Its unit cases and targeted ESLint pass. R2 geometry rejection is recorded
  above. Inspect handles/files before starting another capture.

- `native-light-smoke-r2 native-smoke 1009` completed 180 seconds with exit 0,
  ten loss-free one-shot traces and the candidate restored. All checkpoints
  retain main malloc/V8 and renderer malloc/PartitionAlloc/V8 aggregate sizes;
  main PartitionAlloc is empty (not zero). Traces are 1.56–2.07 MB. See
  `2026-11-12-memory-infra-light-readiness.json` for bounded provider evidence.
- `native-memory-r4 native 1009` completed 1380 seconds, exit 0, marker present,
  candidate restored, five loss-free light dumps spanning 120–1320 seconds.
  See `2026-11-12-native-memory.{md,json}`. Main/overlay/Settings Linux private
  endpoint changes are +59.391/+37.719/+18.676 MiB; Chromium private footprint
  changes +16.926/+14.523/-1.488 MiB. Main malloc live allocated objects grow
  5.650 MiB and post-GC V8 3.748 MiB. These metrics are not equivalent; the run
  does not establish a leak or account for all private growth. Next captures
  persist separate clean/dirty/anonymous/file PSS fields to investigate the gap.
  Parser/native report and overhead/source-transform tests pass. Native capture
  is finished; the overhead handle above is current. Check it before launch.

- `native-memory-r3 native 1009` failed at the 720-second dump because CDP
  reported trace data loss. Only the 120/420 checkpoints are valid; do not
  interpret this as a completed native growth profile.
- A light MemoryInfra configuration is prepared with the loss guard retained.
  `native-light-smoke-r1` failed topology preflight before dump validation:
  A five-second topology timeout preceded teardown and the later zygote/GPU
  errors (1002). Coredump metadata confirms SIGTRAP for PID 41341, but those
  teardown messages do not establish an independent GPU startup defect.
  This does not establish the cause of the earlier R1 window disappearance.
  The user did not notice whether that earlier window was manually closed.
- Overhead collection control and the direct Map identity diagnostic are now
  integrated into `perf` (collector commit `6093158b`, tools through
  `48926ec5`). The integrated 32 tests / 5 files, TypeScript, targeted ESLint,
  four Node test files and both real hook-source transformations passed.
  Runtime overhead and direct identity counts remain unmeasured. Run overhead
  first using external cumulative CPU in on/off/off/on order; then the separate
  instrumented identity probe. Both protocols explicitly support current 1009
  diagnostic height without weakening the normal A/B 1014-pixel validator.

- `native-memory-r2 native` was rejected at preflight: the virtual display
  changed from 2560x1369 to 2560x1009 and the overlay was 1549x1009 rather than
  1549x1014. No memory checkpoints were accepted. The normal A/B validator
  remains fixed at 1549x1014. A separate native-only explicit height argument
  now records and checks actual diagnostic geometry at every checkpoint:
  `node tools/perf/capture/settings-probe.mjs native-memory-r3 native 1009`.
  Such subsystem attribution is within one run at the current display size;
  it is not a matched repeat of the earlier 1014-pixel captures.
- `memoryDumpSummary.mjs` merges split provider events by PID without summing
  overlapping allocator nodes. Its unit cases and both available partial R1
  dumps pass. Hex byte scalars beyond JS Number precision are preserved exactly
  as decimal objects (some providers contain sentinel/underflow-like values),
  never rounded into misleading memory totals. The full native report remains
  unexecuted until a complete capture exists.
- `native-memory-r1 native` failed before its 420-second checkpoint after the
  overlay closed at 05:05:52 local time. The handle is missing, the controller
  wrote `failed.json` with verified child termination, and only preview-active
  plus steady-120 dumps exist. No full-duration acceptance or allocation-growth
  conclusion follows from this partial run. Cause of closure is unknown; the
  user did not notice whether it was manual. Native-only controller diagnostics
  now record JS close/destroy call stacks and native close/quit/crash events in
  ignored console.log, without preventing closure. Retry with a fresh output ID.
- `native-memory-smoke-r2 native-smoke` completed 180 seconds with exit 0 and
  source restoration. MemoryInfra exported ten named traces, each with exactly
  one manual dump and no reported loss, with malloc/PartitionAlloc/V8 and browser
  subsystem accounting. [Readiness evidence](2026-11-12-memory-infra-readiness.json).
  The first continuous smoke exposed a returned-GUID versus trace-ID offset;
  never equate those blindly. Each point now owns a separate trace/filename,
  which also avoids keeping a trace buffer active throughout the 20-minute gap.
  This is provider validation, not an allocation-owner conclusion.
  Use a fresh ID for the next native capture; preserve failed R1/R2 evidence.
  It reuses the 1380-second diagnostic and forced-GC checkpoints, adding
  detailed memory-infra dumps. Compare subsystem counters without summing
  overlapping parents/children or assuming private pages equal live objects.
  Raw dumps may contain paths/addresses; keep them ignored and publish only
  bounded scalar evidence. See Chromium's
  [MemoryInfra accounting](https://chromium.googlesource.com/chromium/src/+/main/docs/memory-infra/README.md).
- `settings-memory-r1 memory` completed from checkpoint `23a67264`: five post-GC
  points spanning 20 minutes, fixed 1380-second duration marker, exit 0 and
  source restoration. Settings heap was 60.07/60.72/60.99/60.39/60.56 decimal MB;
  listeners stayed 488. This is one run, not the repeated memory conclusion.
- `settings-memory-r2 memory` also completed: duration marker, exit 0 and
  source restoration. No memory capture remains running. The actual two-run
  report passed its source/seed/environment/checkpoint assertions. See
  [memory results](2026-11-12-settings-memory.md): Settings heap/listeners show
  no large accumulation, but private-memory growth in overlay/main remains
  unresolved. Do not treat V8 heap stability as proof of native-memory stability.
- `hidden-draw-r2` completed the native-hide runtime check with direct named
  work counters: Map/Input/Radar have zero calls in the settled 20-second
  hidden interval and resume after showing. No scheduling change is justified
  by this Linux result. See the [hidden drawing report](2026-11-12-hidden-draw-audit.md).
  The first attempt lacked complete hidden reporter intervals and cannot be
  treated as measured zero. Lap Trace was idle, so its hidden behavior remains
  unexercised. Channel/Gantry suites passed 62 tests; runtime Gantry history is
  not covered. No capture remains running.
- `perf-results/normal-final-r2/runs.json` records A1 and B1 completing with
  exit 0. Both preflights show a visible 1549 × 1014 overlay at DPR 1 and
  hidden 620 × 104 tape controls at (0, 0). B2 has partial logs only.
- The previous R1 pilot was rejected because auxiliary controls differed in
  placement/first-paint state. A benchmark-only two-flag guard now keeps the
  controls hidden at creation; ordinary application behavior is preserved.
- The current controller has abortable CDP/waits, requires the duration marker,
  and verifies child termination before restoring sources. Its cleanup helper
  has deterministic shutdown/error tests. These latest cleanup changes were
  made after R2 started and are not validated by that partial run.
- Windows CI passed for candidate checkpoint `50657bdd`:
  https://github.com/estem8/irdashies/actions/runs/43101017184
  Tests, lint and Storybook succeeded; release/signing were skipped. This does
  not verify iRacing presentation or the subsequent capture-tool changes.
- A later dispatch attempt for current checkpoint `23a67264` failed with GitHub
  HTTP 422: `Actions has been disabled for this repository`. No new CI run was
  created. Repository Actions settings were not changed. The earlier successful
  run remains historical evidence for its own SHA, not validation of later code.
- Next: inspect partial logs for renderer/channel loss before another matrix;
  B2's final log contains no overlay renderer and zero channel activity, so
  it must not contribute performance acceptance evidence.
- Follow-up: B2 logs record `Display 73 overlay window closed` at 01:10:49,
  approximately 48 seconds after origin. No adjacent renderer-crash message
  establishes the cause. The controller now rejects early overlay CDP closure,
  writes `failed.json` for non-cancellation failures, and rejects calls made
  after a CDP socket has closed without waiting for the request timeout.
- `normal-recovery-smoke-r1` completed its 90-second candidate run with exit 0,
  duration marker, matched preflight and source restoration. The CDP and child
  shutdown helper test files pass, as does ESLint for these controller changes.
  This is a smoke check, not a repeated performance acceptance comparison.

## Current candidate

- Earlier committed Relative/TitleBar subscription and Map identity changes.
- Session array identity fast path and plain-record shallow comparison, with
  differential tests and a reproducible microbenchmark.
- BlindSpotMonitorIndicator uses equivalent `translateY` instead of animated
  `top`. Storybook/Chromium verified identical bounds at two heights and five
  positions on both sides: maximum difference **0 px**. Hide/show, transition
  suppression, initial delay and cleanup tests pass.
- CarManufacturer retains `scale(1.25)` but removes forced `translateZ(0)` on
  each static sprite. In one renderer's full-profile A–B–A–B probe, layers are
  **64 → 17 → 64 → 17**; compositor-artifact exclusive wall ms/s is
  **49.97 → 25.91 → 48.40 → 27.13**. Renderer CPU under tracing is
  **553.18 → 477.99 → 536.22 → 474.00 ms/s**. This supports a candidate,
  not a normal-run application CPU claim. LMU rank sprites are unchanged.

Rejected: removing name masks, HTML wrapping of the wind arrow, and permanent
Input promotion. None demonstrated a supported full-profile gain. Their
diagnostic controls are only in the capture tool, not production code.

## Resume here

1. Read `overlay-performance-plan.md` and the
   [shared renderer report](2026-11-11-shared-renderer-attribution.md).
2. Continue the open coverage/lifecycle, visual scale/DPR, Settings/long-memory
   and instrumentation-overhead checks from the R3 report. Do not repeat the
   normal matrix without a new change or a specific unresolved concern.
   To prepare a justified future matrix, `node tools/perf/capture/prepare-matrix.mjs`
   snapshots the current
   candidates and fixed baselines: C/D source files from `94f02641`, newer
   comparison/indicator/logo files from `02e8e07e`. Instrumentation remains
   identical. Do not substitute HEAD as the baseline after this checkpoint.
3. Inspect `tools/perf/capture/long-matrix.mjs`, then run:

   ```bash
   node tools/perf/capture/long-matrix.mjs normal-final-r4
   ```

   Use a fresh output directory; do not overwrite R2/R3 evidence.
   It temporarily swaps six source files, launches four isolated 420-second
   captures in A–B–B–A order, keeps auxiliary tape controls hidden, checks
   viewport/source, and restores candidate source in `finally`. Reserve about
   30 minutes. No tests, tracing, heap profiles or other captures during it.
   It assumes this host's 1549 × 1014, DPR 1 viewport; reject/update explicit
   geometry assumptions for another machine instead of accepting a mismatch.

4. Analyze the 60–420-second windows using `tools/perf/analyze.ts`; require
   comparable source/topology/cadence/channel activity and two valid pairs.
   Keep coverage/missing-metric warnings explicit. The external controller
   also records Linux private memory from smaps_rollup every ten seconds;
   seven-minute runs are not the planned long-session leak test.
5. Recheck actual final-code manufacturer rendering in Storybook, including
   widget scale/DPR. **Completed on this Chromium:** see
   [manufacturer visual check](2026-11-12-manufacturer-visual.md): 54 elements,
   12 scale/DPR combinations, exact geometry and small raster differences.
   Windows, animation and exhaustive simulator-sheet coverage are not implied.
   Blind-spot visual reproduction is:

   ```bash
   node tools/perf/capture/blindspot-visual.mjs
   ```

6. Finish lifecycle/seek/hide/show checks, Settings/memory investigation and
   final validation. Replay seek/pause and native-window hide/show smoke now
   passed: [lifecycle report](2026-11-12-lifecycle.md), with 104 targeted tests.
   Actual simulator reconnect/join/leave, hidden rAF and Gantry semantics are
   not established by that smoke. Preserve the Windows presentation gate as open.
   The [short Settings cleanup diagnostic](2026-11-12-settings-cleanup.md)
   also passed: three pause/resume cycles returned to stable DOM/listener counts.
   Closing to tray retains the preview frame; that is not evidence of a leak.
   Repeated 20-minute, post-GC observations are now collected. Follow the
   memory report's remaining overlay/main allocation-attribution gap.
   Prepared command (run twice with distinct IDs, sequentially):

   ```bash
   node tools/perf/capture/settings-probe.mjs settings-memory-r1 memory
   node tools/perf/capture/settings-probe.mjs settings-memory-r2 memory
   ```

   Each is a 1,380-second diagnostic: Standings preview remains visible/playing,
   forced-GC checkpoints at 120/420/720/1020/1320 seconds span 20 minutes.
   Settings, overlay and main heaps are sampled separately, with Settings/overlay
   DOM counters and external private-memory samples. The ten-minute live-overlay
   tape loops; this is not an uninterrupted simulator session or CPU acceptance.
   `settings-progress.json` is saved at each checkpoint; keep partial evidence
   separate if a run fails. No tests/builds/other captures during measurement.
   Publish a PR only when requested; visual PRs require actual screenshot
   attachments per AGENTS.md, not local paths.

## Preserved inputs and tools

- `tools/perf/fixtures/reconstructed-ten-widget.json` is a sanitized synthetic
  seed from default manifests, **not the unavailable original user profile**.
  It contains no user ID, credentials, or user file paths.
- Capture controllers are now under `tools/perf/capture/`: shared tracing,
  phase metrics, trace summarization, visual verification and the long matrix.
  Run from repository root. They launch GUI/browser processes and loopback
  Inspector/CDP endpoints; sandbox escalation may be needed.
- The verified native tape is local at `perf-results/ai-race-10min.irdt`.
  The tracked test-data file remains an LFS pointer. On a fresh machine fetch
  the recording from the repository's Git LFS/media endpoint, verify SHA-256
  `6e23e8abab49c1a0ae7c8f6d1f298d31145a6189d3029b8ca540aad56a22b168`, and build
  the tape addon using the existing native build instructions.
- Scalar logo probe results and browser geometry evidence are committed as
  `2026-11-11-logo-layer-probe.json` and `2026-11-11-blindspot-geometry.json`.
  Full traces, recordings, profiles and screenshots stay in ignored
  `perf-results/`; they are **not uploaded to GitHub**.
- Local review screenshots: `perf-results/blindspot-visual/before.png`,
  `after.png`, and `perf-results/shared-logo-layers-r1/{full1,demoted-logos1}.png`.

Validation before checkpoint: 358 affected renderer tests in 47 files passed;
the standalone trace-attribution suite has 10 passing tests; TypeScript and
ESLint passed for the application candidate. Six tape-control tests also pass.
Capture scripts are experimental diagnostic tooling. R3 exercised a complete
four-run execution; the overall acceptance gaps are recorded in its report.
