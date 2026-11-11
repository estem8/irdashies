# Perf checkpoint — 2026-11-12

Goal: finish `perf`. **Not complete.** User requested a GitHub checkpoint before
usage limits. Long capture R2 completed A1 and B1, but its process handle is
now missing, B2 is incomplete and A2 is absent. The matrix is not accepted.
Candidate source is restored (the six measured files match HEAD).
Windows/iRacing access is unavailable, confirmed by the user; do not
claim game FPS or Windows acceptance.

## Latest execution status

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
- Next: inspect partial logs for renderer/channel loss before another matrix;
  B2's final log contains no overlay renderer and zero channel activity, so
  it must not contribute performance acceptance evidence.

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
2. Run `node tools/perf/capture/prepare-matrix.mjs`. It snapshots the current
   candidates and fixed baselines: C/D source files from `94f02641`, newer
   comparison/indicator/logo files from `02e8e07e`. Instrumentation remains
   identical. Do not substitute HEAD as the baseline after this checkpoint.
3. Inspect `tools/perf/capture/long-matrix.mjs`, then run:

   ```bash
   node tools/perf/capture/long-matrix.mjs normal-final-r3
   ```

   Use a fresh output directory; do not overwrite the partial R2 evidence.
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
   widget scale/DPR. Blind-spot visual reproduction is:

   ```bash
   node tools/perf/capture/blindspot-visual.mjs
   ```

6. Finish lifecycle/seek/hide/show checks, Settings/memory investigation and
   final validation. Preserve the remaining Windows presentation gate as open.
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
Capture scripts are experimental diagnostic tooling; the revised controller
still needs a complete four-run acceptance execution.
