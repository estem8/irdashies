# Window-mode poll-delay readiness — 2026-11-12

The historical 56.22/53.23 Hz display/widget mismatch does not reproduce at
that magnitude in these new **instrumented short diagnostics**. They permit
proceeding to a normal-operation cost comparison; they do not themselves pass
F-3 or establish why the old runs differed.

Two isolated 180-second runs on source `005a539f` use the reconstructed
ten-widget seed and tape at 1×. Display inventory matches: 2560×1369, DPR 1,
reported display frequency 0 (unavailable, not evidence of a physical refresh
rate). This differs from the earlier topology capture's display inventory, so
do not merge the old and new numbers into one same-environment comparison.
Both new runs complete with exit 0 and fixed-duration markers.

The Inspector diagnostic wraps only existing `finishDelay` callbacks whose
first captured stack identifies iracingSdkBridge. Original timeout handles,
callback receiver and cancellation behavior are preserved. It records bounded
planned/actual delay observations, restores the original timer function and
rejects buffer overflow or overlapping delays. There is no extra poll timer,
frame generator, source suppression or changed SDK cadence. However, wrapping
the timer and retaining samples adds work, so these are not normal CPU runs.

| Diagnostic                                            | Display | Widget |
| ----------------------------------------------------- | ------: | -----: |
| Timer observations, ~100 seconds                      |   6,008 |  6,006 |
| Mean planned delay, ms                                |   6.847 |  6.670 |
| Mean actual delay, ms                                 |   6.607 |  6.532 |
| Mean actual minus planned, ms                         |  -0.240 | -0.139 |
| Telemetry ticks/s over main-report intervals 60–155 s |  59.451 | 59.664 |
| Maximum active subscription demand in those intervals |   60 Hz |  60 Hz |

The relative tick-rate difference is 0.357%. Playback advances about 100 seconds
in each observation period and stays unpaused at 1×. There is no positive
average timer lateness explaining a multi-Hz mode difference in these runs;
individual delays have tails (retained in JSON). Negative mean differences can
reflect timer resolution/rounding and do not mean a negative elapsed duration.
This does not rule out scheduler contention in the historical environment.
SDK wait/processing and no-new-data iterations remain distinct from the timer.

[Bounded evidence](2026-11-12-poll-delay.json) records distributions, observed
source status, demand, source/seed and artifact hashes. Raw data remain ignored
under `perf-results/poll-delay-{display,widget}-r1`. Script syntax/ESLint,
formatting, links and TypeScript/ESLint accompany the checkpoint.

The next normal-operation comparison must remove this wrapper and hold the
actual source cadence. Declare the gate before capture: same source/seed/tape,
DPI/display inventory and per-instance screen geometry, required publications
present, and paired mean incoming tick-rate difference at most 0.5%. Use
420-second display→widget→widget→display runs with 60 seconds warmup, repeated
CPU time and available memory metrics by PID. Reject mismatches; do not turn
this diagnostic into the acceptance run or relax its gate after seeing data.
The optional metric collection cost remains unquantified. Preserve R3's verdict
and all Windows/presentation limitations.
