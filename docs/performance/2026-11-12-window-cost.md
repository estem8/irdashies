# Normal window-mode cost pair — rejected, 2026-11-12

F-3 remains open. The first normal display/widget pair completed its captures,
but the comparison was rejected because continuous geometry equality is
unproven. The reverse pair was not launched. No current window-mode CPU or
memory gain is established by these results.

Both isolated Linux development captures ran for 420 seconds at source
`f3255f9a`, with the capture-harness diff in this checkpoint. No timer wrapper,
heap profiler, delivery suppression or rendering suppression was installed.
Existing optional metrics stayed enabled. The ten-widget seed, tape SHA,
source, complete captured environment and initial per-instance screen
coordinates/size/DPR match exactly. Playback stays at 1× and advances normally.
The source and environment are not the historical topology pair's baseline.

| Capture | Complete steady intervals | Analyzed seconds | Incoming telemetry Hz | Process count |
| ------- | ------------------------: | ---------------: | --------------------: | ------------: |
| Display |                        71 |          355.098 |                59.508 |             5 |
| Widget  |                        71 |          355.113 |                59.727 |            14 |

Sixty seconds of warmup are excluded; the last partial report interval is not
invented. Both have more than 300 seconds of complete steady evidence, fixed
duration markers and exit 0. PID/creation-time sets are stable and CPU samples
are present. The mean cadence difference is approximately 0.369%, within the
predeclared 0.5% limit. That alone does not pass the comparison.

The bounded native event observer records these **move notifications** inside
the widget steady window:

- Lap Trace, BrowserWindow 11: 182.371 seconds after capture origin.
- Blind Spot, BrowserWindow 7: 187.889 seconds after capture origin.

Actual bounds at those moments were not recorded. The notifications therefore
do not establish how far a window moved, or whether this was a same-bounds
notification, but they prevent proving continuous equality from the initial
geometry snapshot. No actor or application/window-manager cause is identified.
The validator correctly rejects the run instead of ignoring the events,
relaxing the geometry criterion, or comparing a shorter convenient interval.
There is no uninterrupted 300-second widget interval on either side of both
notifications. Normal teardown close/move events occur after 420 seconds and
are excluded from the measured interval.

The valid display-only summary is retained descriptively: summed Electron
process CPU 578.009 ms/s and summed mean working set 1267.625 MiB. It is not a
mode comparison or a candidate improvement. Working-set sums include shared
pages, are not private memory or physical RAM ownership, and do not establish a
leak. Vite/Forge/controller CPU is outside Electron process totals. Collection
overhead, packaged Windows and simulator presentation remain unavailable or
unquantified. Widget CPU/memory differences are deliberately not presented as
accepted comparative evidence.

[Bounded evidence](2026-11-12-window-cost.json) includes both capture completions,
input cadence, process coverage, move notifications, source/seed/tape and raw
artifact hashes. Raw data remain ignored under
`perf-results/window-cost-r1-{display1,widget1}`; the controller's failure marker
is under `perf-results/window-cost-r1/failed-pair.json`.

The capture support keeps the existing topology helper, adds explicit 420-second
cost mode and source/environment checkpoints, and emits only a bounded number
of native geometry/visibility events. The summary validates duration, CPU
coverage, process lifetimes, visibility, required publications, initial geometry
and paired cadence. Tests reject missing CPU, process replacement, lost
intervals, hidden overlays, missing input, changed source/environment/geometry,
excess cadence differences, geometry notifications and event overflow. All
11 capture test files pass; TypeScript/ESLint, formatting and links accompany
the checkpoint. This successful guard behavior is **not successful performance
acceptance**.

Next: a short targeted native-window trace must record actual bounds and
setter-call origins for the Lap Trace/Blind Spot move notifications before any
new long cost comparison. Confirm stable placement or diagnose a real move;
do not repeat this pair solely to seek a passing verdict. The current blocker
is missing proof of stable geometry, not a quantified window-mode bottleneck.
The existing Windows/iRacing and high-refresh blockers remain unchanged.

A fresh comparison, after resolving that trigger, uses:

```sh
node tools/perf/capture/window-cost-matrix.mjs window-cost-new pair
# Only after the first pair passes its predeclared gates:
node tools/perf/capture/window-cost-matrix.mjs window-cost-new finish
```
