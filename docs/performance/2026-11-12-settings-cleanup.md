# Settings preview cleanup diagnostic — 2026-11-12

An isolated candidate-only 180-second run opened Standings settings after the
55-second overlay preflight. It exercised three preview pause/resume cycles,
close-to-tray, reopen and final pause. Settings heap was collected after forced
GC at every observation. The controller completed with exit 0, its duration
marker, and candidate-source restoration. This is a diagnostic workload; GC,
extra windows and preview cycles invalidate comparison with the normal matrix.

All three paused observations returned to **1,447 DOM nodes / 335 JS event
listeners**, and all three resumed observations to **4,682 / 488**. The iframe
count alternated **0 / 1**, without duplicates. Paused V8 used heap was
47,788,596 → 47,802,332 → 47,843,692 bytes, approximately 47.8 MB. Resumed heap
was 65.56 → 66.24 → 65.05 MB; final pause was 47.97 MB. No monotonic retained
preview/listener/DOM accumulation is established by these three cycles.
The Settings native window's preview `hide`/`show` listener counts also return
to **0/0** on every pause and **1/1** on every resume; reopen does not duplicate
those listeners. These counts are preserved in the same observations.

Closing to tray retains the Settings renderer and its preview iframe: this
matches the current native window close-to-tray policy and the observed
`document.visibilityState` behavior. Heap at the hidden checkpoint remained
65.05 MB, rather than the paused state of approximately 47.8 MB. The preview bus
has native hide/show gating, so retained iframe existence alone does not prove
continued snapshot delivery or a leak. Whether retaining the hidden preview
is a worthwhile further resource optimization remains separate from proving
a defect. No production behavior was changed for this measurement.

These short observations cannot satisfy the planned repeated 20-minute memory
check. Forced GC changes scheduling and only reports reachable V8 heap; it does
not account for all native/GPU memory. Full per-PID working sets, window bounds,
native show/hide listener counts and heap/DOM observations are in the
[bounded results](2026-11-12-settings-cleanup.json). Raw capture is local at
`perf-results/settings-cleanup-r2`.

```bash
node tools/perf/capture/settings-probe.mjs settings-cleanup-r3
```

Use a fresh output ID. The helper's first attempt had an insufficient startup
timeout and produced no Settings measurements; it is excluded. The revised
helper passed ESLint and its successful runtime execution. Preview component,
preview runtime and preview bridge unit suites also passed.
