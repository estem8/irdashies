# Collection overhead experiment — 2026-11-12

No consistent CPU overhead is resolved above run variation. This does not prove
zero or negligible overhead. Collection on/off preserves the isolated capture
bootstrap, replay, channel delivery, candidate source and viewport.

| Phase | Collection | Total CPU ms/s | rAF Hz | Driver Controls version changes/s |
| ----- | ---------- | -------------: | -----: | --------------------------------: |
| on1   | on         |        582.704 | 59.503 |                            59.528 |
| off1  | off        |        564.011 | 59.599 |                            59.496 |
| off2  | off        |        565.455 | 59.540 |                            59.520 |
| on2   | on         |        542.041 | 59.664 |                            59.490 |

The paired on-minus-off changes are +18.692 CPU ms/s (+3.314%) and -23.414
CPU ms/s (-4.141%). On/on varies by 40.663 CPU ms/s; off/off varies by 1.444.
GPU and renderer variation dominate the on/on difference. Do not average the
mixed-sign differences into a claimed negative or zero profiler cost, and do
not subtract this estimate from the older normal R3 candidate improvement.

All four successful phases last 420 seconds. Each supplies 36 external CPU
samples over more than 350 seconds after 60 seconds of warmup. Cumulative
per-process CPU deltas and elapsed durations use the monotonic timebase.
Source/seed/viewport/runtime inventories match; all PID lifetimes remain stable.
The rAF and Track State/Driver Controls/Radar version-rate checks pass. Version
changes are not exact delivery-callback counts. No new subscriptions were added.

Recovery qualification: original R5 on1/off1/off2 completed, but on2 failed GPU
startup before preflight and produced zero measured external CPU samples. Only
that missing phase was retried. The app/source remains 2e5354cc; the retry runner
differs only in its phase schedule (verified text/hashes). Original failure and
successful raw files remain intact. The composite dataset links those original
files and records the recovery separately. UTC timestamps show 8388.267 seconds
between the last off2 CPU sample and the retried on2 origin. That long gap is an
additional confounder; this recovered comparison is not an uninterrupted
acceptance matrix or a statistically established overhead bound.

Collection-on emits main/renderer metrics; collection-off emits neither, while
external sampling and snapshots continue. The short readiness check establishes
that separation independently. Results apply to this Linux dev/tape candidate
workload and observer setup, not every profiler or the packaged application.
Windows/iRacing presentation and production overhead remain unverified.

[Machine-readable CPU evidence and recovery](2026-11-12-collection-overhead.json).
Raw roots: perf-results/collection-overhead-r5, collection-overhead-r5-on2-retry,
and collection-overhead-r5-recovered. The original failure is never relabeled
successful. No new GitHub Actions run was dispatched.
