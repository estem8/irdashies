# Relative roster identity hypothesis — 2026-11-12

Source checkpoint: `b269e503`, with the candidate below. Continues F-6 from the
[pipeline review](2026-11-12-pipeline-review.md).

## Question and change

Does rebuilding Relative's unchanged driver projection on every render trigger
avoidable full-row derivation? If so, does retaining that projection establish
a larger application CPU improvement?

`useDrivers` maps session participants to new driver and nested class objects.
That array is an input to the relative-row `useMemo`, so its new identity forces
row construction even on renders caused by unrelated channel updates. The
candidate wraps the existing projection in `useMemo([sessionDrivers])`. The
existing session selector preserves the driver-array reference when equivalent;
actual edits, join/leave and disconnect/reconnect invalidate it. There is no
shared mutable cache and no telemetry, channel rate or drawing change.

## Normal-workload diagnostic

One application, ten normal widgets, one visible shared display renderer,
1549 × 1014 viewport, DPR 1, 41 roster entries, Linux development build. No CPU
sampler, trace, test runner or lint ran during capture. All source and delivery
paths stayed enabled. The controller reused the topology capture helper and
waited for its 55-second readiness observation. Each phase sought tape second
55, resumed at 1x, settled five seconds, and measured twenty seconds (tape roughly
59.92–79.94). Order A–B–B–A checks whether the local effect reverses.

Temporary instrumentation counted calls/projections/entries and used the
existing rebuild timer for Relative. Baseline forced the projection memo to
recompute on every render; candidate used the stable dependency. This adds a
memo hook and one unstable dependency object to the diagnostic baseline versus
the original code. Both paths have the same boundary counters. Instrumentation
was saved in the raw run and removed before final checks/commit. It adds no
new production flags, timers or logging. These are diagnostic normal-function
phases, not packaged production acceptance.

| Phase       | Hook calls | Projected roster entries created | Full Relative row rebuilds | Row build elapsed total | All-process CPU |
| ----------- | ---------: | -------------------------------: | -------------------------: | ----------------------: | --------------: |
| Baseline 1  |        335 |                           13,735 |                        335 |                 14.8 ms |     560.19 ms/s |
| Candidate 1 |        333 |                                0 |                        132 |                  4.4 ms |     541.07 ms/s |
| Candidate 2 |        336 |                                0 |                        132 |                  5.9 ms |     543.07 ms/s |
| Baseline 2  |        333 |                           13,653 |                        333 |                 15.4 ms |     551.70 ms/s |

The projection count drops from 333–335 builds to zero within each measured
candidate window; initial mounting and post-seek construction occur during
settling. Entry counts exclude nested class objects, array containers and all
other allocations; they are not allocated bytes or retained-memory measurements.
Hook renders remain about 16.7/s. Row rebuilds drop about 60.5%, to 6.6/s,
reproducing in both candidate phases and reversing on return to baseline.
Required dynamic row rebuilding continues.

## Interpretation and limits

The scoped hypothesis is confirmed: an unstable roster projection causes
unnecessary row rebuilding. Retain the small application change on that basis.
However, these synchronous functions are cheap: baseline projection work is
only 0.6–0.8 ms over twenty seconds, and eliminated row building saves roughly
0.5 ms per second. This is not evidence that they dominate application load.

Total CPU trends lower by 2–3% depending on grouping, but is **inconclusive**.
Twenty-second phases and two observations per mode do not establish a robust
end-to-end effect. Source tick rates in three wholly contained reporter
intervals per phase are 59.196 / 59.663 / 59.603 / 59.594 Hz; first-pair mismatch
exceeds the prior 0.5% cadence gate. Track-state delivery also varies from
21.53 to 22.60/s. All-process CPU includes those other workloads, and the
instrumentation overhead is unbounded. Do not attribute its delta solely to
the memo change, claim an FPS gain, or repeat this unchanged experiment to
force acceptance. No Windows/iRacing, physical high-DPI, long-session memory or
larger batching/semantic-array hypothesis is validated.

## Verification and artifacts

61 tests passed across four files: recorded multiclass Relative/Standings
behavior plus projection identity tests. The new tests exercise parent renders,
structured-cloned channel delivery, identity edits/class/rating changes,
join/leave and disconnect/reconnect. The first test attempt used the fixture
bridge's mutable in-process snapshot and therefore failed to stimulate a real
IPC-like update; the test now clones delivery as Electron does.
`npm run lint` passed (TypeScript and ESLint), plus formatting and diff checks.
There is no intended visual change.

Raw artifacts: `perf-results/relative-roster-ab-r1/`, ignored. The application
completed its 180-second lifetime and controller exited zero. The adjacent
[JSON evidence](2026-11-12-relative-identities.json) records phase deltas,
source/delivery cadence and artifact hashes, including the ephemeral controller
and source instrumentation. Existing helper result scope remains topology-only;
this report supplies the separate, bounded hypothesis analysis.

The next systemic candidate should address downstream commit/paint amplification
or a more expensive measured path, rather than extending this small roster fix
into an unmeasured data-model rewrite.
