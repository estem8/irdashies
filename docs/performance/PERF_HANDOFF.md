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

- `native-light-smoke-r2 native-smoke 1009` completed 180 seconds with exit 0,
  ten loss-free one-shot traces and the candidate restored. All checkpoints
  retain main malloc/V8 and renderer malloc/PartitionAlloc/V8 aggregate sizes;
  main PartitionAlloc is empty (not zero). Traces are 1.56–2.07 MB. See
  `2026-11-12-memory-infra-light-readiness.json` for bounded provider evidence.
- `native-memory-r4 native 1009` is running with this light configuration
  (controller PID 50922, terminal session 33883). Observe this handle or the
  authoritative result files before launching anything else. No long result
  is claimed yet. Do not run builds/tests or heavy analysis while it captures.

- `native-memory-r3 native 1009` failed at the 720-second dump because CDP
  reported trace data loss. Only the 120/420 checkpoints are valid; do not
  interpret this as a completed native growth profile.
- A light MemoryInfra configuration is prepared with the loss guard retained.
  `native-light-smoke-r1` failed topology preflight before dump validation:
  Chromium logged zygote communication failures, repeated GPU launch failure
  (1002), then a fatal GPU-unusable exit. Coredump metadata confirms SIGTRAP
  for Electron PID 41341; the underlying launch failure remains unresolved.
  This does not establish the cause of the earlier R1 window disappearance.
  The user did not notice whether that earlier window was manually closed.
- Overhead collection control is saved separately on origin branch
  `chore/perf-collection-overhead`, commit `3ccb5f8c`. It preserves capture
  bootstrap while disabling optional collectors/reporters. 32 tests,
  TypeScript and targeted ESLint passed. Runtime overhead is not measured;
  the commit has not yet been integrated into `perf`.

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
