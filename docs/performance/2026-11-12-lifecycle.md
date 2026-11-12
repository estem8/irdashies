# Replay lifecycle smoke — 2026-11-12

The candidate completed an isolated 90-second Electron replay run with a
duration marker, exit 0 and candidate-source restoration. The probe attaches
after the normal 55-second preflight and adds diagnostic observers for
track-state and session lifecycle. It is functional evidence, not a CPU
comparison or a physical simulator reconnect test.

Observed and asserted:

- Seek from about 57 seconds to 300: transport reached 301.92 seconds and
  track-state SessionTime advanced from 147.78 to 392.80.
- Seek back to 30: transport reached 31.92 and SessionTime returned to 122.80.
  Each seek delivered `disconnect` then `enter`, in that order.
- Pause retained transport position 31.9393 across two seconds; resume
  advanced it to 33.96. The track-state stream resumed as well.
- `BrowserWindow.hide()` made the overlay actually invisible. Track-state
  observer count remained **157 → 157** over the three-second settled hidden
  interval, while replay continued.
- Showing the window restored actual visibility and fresh track-state:
  count **157 → 202**, SessionTime **124.88 → 130.88**. Application text remained
  present. This does not prove the correctness of every widget's displayed value.

`document.visibilityState` stayed `visible` even during hide. With
`backgroundThrottling: false`, this is documented Electron behavior:
[BrowserWindow page visibility](https://www.electronjs.org/docs/latest/api/browser-window#page-visibility).
The initial probe incorrectly expected `hidden`; it was corrected to inspect
`BrowserWindow.isVisible()` and actual snapshot delivery. No application fix or
Chromium flag change was needed. Snapshot gating does not prove rAF/drawing
stops: those remain separate measurements, as do Gantry's always-fed semantics.

The [nine observations](2026-11-12-lifecycle.json) retain exact values. Raw
logs/profiles are local at `perf-results/lifecycle-r2`. Reproduction:

```bash
node tools/perf/capture/lifecycle-probe.mjs lifecycle-r3
```

Use a fresh run ID. This invokes the existing candidate-only smoke controller;
do not run other builds/captures concurrently. Test evidence on the same
candidate: 104 tests in 11 targeted files passed, covering SessionStore,
comparators, channel reset/lifecycle, Map identity, TitleBar, blind-spot
transition cleanup, replay context and standings replay behavior. ESLint passed
for the runtime probe. The runtime fixture does not cover actual driver
join/leave, a real simulator disconnect/reconnect, every session type transition,
long-session leaks or Windows presentation.
