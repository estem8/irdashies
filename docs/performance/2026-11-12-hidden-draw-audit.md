# Hidden drawing — Linux runtime check

The source audit suggested Radar might keep painting stale snapshots while its
native window was hidden, because its active flag describes widget visibility
and fade rather than native window visibility. That hypothesis did **not**
reproduce in the measured Linux environment. No application scheduling, window
flags or channel semantics were changed.

`hidden-draw-r2` completed its 180-second diagnostic with exit 0, duration
marker and source restoration. Native hide lasted 20.004 seconds after a
one-second settling delay. A temporary bounded wrapper counted calls through
the already loaded frontend `perfMetrics.measure` function, preserving and
restoring the original implementation. These are named draw-work invocations,
not screen presentation measurements.

| Named work                | Resume before hide, 2.032 s | Settled hidden, 20.004 s | Show, 2.025 s |
| ------------------------- | --------------------------: | -----------------------: | ------------: |
| Map commit draw           |                          45 |                        0 |            48 |
| Map intermediate rAF draw |                         119 |                        0 |           117 |
| Input trace               |                         116 |                        0 |           116 |
| Radar                     |                         121 |                        0 |           115 |

Both native hidden observations report `BrowserWindow.isVisible() === false`;
snapshots stop, and showing restores fresh snapshots plus drawing. The observer
is demonstrably connected because Radar counts increase before hide and after
show. No hidden drawing optimization is justified by this result. It does not
prove that other platforms, minimized/occluded windows or every widget behave
identically. Lap Trace plot/brake cue were idle before and after hide too, so
zero counts there are **not exercised Lap Trace coverage**.

The first attempt (`hidden-draw-r1`) could not calculate hidden draw rates from
normal renderer reports: `startRendererPerfMetrics()` drops intervals when its
rAF frame buffer is empty, leaving no complete hidden intervals. Missing rows
must not be treated as measured zero. R2 therefore uses direct counters read
at timestamped boundaries; unrelated instrumentation rAF callbacks themselves
are not widget drawing evidence. The added observers mean this run is not
normal-operation CPU acceptance.

Source observations remain useful:

- Map stops scheduling when interpolation settles; target/appearance commits
  paint immediately. Its standalone path has no `maxFps`; embedded maps pass 30.
  The cap affects intermediate paints, not immediate commit paints.
- Input schedules one rAF from new input/settings and cancels during cleanup;
  resize can paint separately.
- Radar carries its 60 Hz deadline while active. Source inspection alone did
  not predict the measured native hidden-window scheduling result.
- Lap Trace schedules from selected store/telemetry changes, rather than an
  unconditional frame loop; it still needs an exercised hidden workload.
- Snapshot gating is separate from events and Gantry's always-fed semantics.
  No delivery policy was changed to obtain zero hidden draws.

[Bounded observations](2026-11-12-hidden-draw.json) retain draw counters,
native visibility, snapshots and timestamps. Raw logs are local at
`perf-results/hidden-draw-r2`. Reproduction with a fresh ID:

```bash
node tools/perf/capture/lifecycle-probe.mjs hidden-draw-r3 hidden
```

Validation: the runtime passed, as did ESLint for the helper. The three channel
bridge/Gantry suites passed 62 tests, including hidden/minimized always-fed
subscriptions. This is unit evidence for that contract, not a runtime Gantry
race-history capture. High-refresh Map scheduling and Windows presentation
remain separate checks. Instrumentation-overhead validation also stays open:
disabled fast paths exist, but switching off `PERF_METRICS` changes capture
bootstrap and is not automatically a matched overhead comparison.
