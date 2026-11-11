# Renderer subscription and Track Map identity changes

Date: 2026-11-11. Branch: `perf`.
Baseline: `a2408a7d`. Candidate: `67747266`.

## Status

Stages C and D are implemented and reviewed. Four application-level captures
have completed, but one candidate run has a different renderer callback
cadence. A repeatable CPU or game frame-rate improvement is not established.
Separate React Profiler captures measure render-phase work only.

## Changes

- Relative selects only the track session flags it uses, instead of subscribing
  to the full track-state snapshot.
- The Standings TitleBar mounts its race progress subtree only when the title
  and progress bar are enabled. The progress subtree subscribes to lap position
  only while the race is active and a lap estimate is available. Checkered and
  cooldown states render completion without continuing to consume position
  updates.
- Track Map derives driver identity and class-position data separately from
  volatile lap progress. Lap position updates can refresh plotted progress
  without rebuilding the identity list. Equal class-position arrays preserve
  their previous identity using an element comparison that does not allocate.
- Review corrections preserve invalid-progress behavior: non-finite class
  positions are treated as unranked, and a non-positive or `NaN` progress value
  does not produce a visible progress bar.

The changes keep the existing data sources and visible progress behavior. They
do not add a volatile shallow comparison or change telemetry precision.

## Targeted verification

The root review reports 326 targeted tests passed, including selector,
TitleBar, and Track Map identity/progress coverage. ESLint passed. The
candidate includes the generated-artifact ignore correction at `67747266`.

## Matched capture

The baseline worktree is pinned at `a2408a7d`; the candidate is `67747266`.
Both use the verified SDK tape fixture and the same isolated seed profile.
Each run captures 420 seconds with the first 60 seconds reserved for warmup.
Settings remain closed. The seed uses five widget types with fixed custom
geometry: Standings, Relative, Input, Track Map, and Weather. Standings shows
all 40 cars. Tape controls use the same second window in every run.

All four captures completed at approximately 420 seconds, with about 360
seconds retained after warmup. Topology is complete and consistent: one visible
2280 × 1320 display window and one visible 620 × 104 tape-control window.
There are no Settings or Gantry windows. Telemetry source, seed, native addon,
widget instances, and geometry match. Startup topology does not prove that host
presentation conditions remained constant throughout a run.

| Metric | Baseline 1 | Candidate 1 | Candidate 2 | Baseline 2 |
| --- | ---: | ---: | ---: | ---: |
| Display renderer CPU, ms/s | 308.48 | 224.77 | 306.92 | 309.07 |
| GPU process CPU, ms/s | 166.73 | 107.64 | 172.29 | 168.56 |
| Main/Browser CPU, ms/s | 62.81 | 65.14 | 65.20 | 62.92 |
| Renderer rAF callbacks/s | 168.92 | 59.69 | 165.58 | 167.91 |
| rAF interval p99 mean, ms | 12.65 | 19.85 | 13.55 | 12.74 |
| Worst rAF interval, ms | 44.50 | 50.10 | 50.00 | 44.50 |
| Map draw callbacks/s, combined paths | 192.91 | 82.83 | 189.29 | 191.83 |

CPU ms/s is accumulated process CPU time divided by elapsed wall time;
1000 ms/s represents one fully used core. GPU process CPU is not GPU engine
utilization. The rAF p99 mean is the analyzer's average of reporting-interval
percentiles, not a percentile reconstructed from all frame samples. Map
callbacks combine React-commit paints and intermediate animation paints;
they do not represent presented frames.

Candidate 1 had a median rAF interval of 16.7 ms; the other three runs had
5.6 ms. All reported visible state. The logs do not identify the cause of this
cadence change. **Do not attribute candidate 1's lower CPU to the code changes.**
The first pair is confounded. The second pair has similar callback cadence,
but display-renderer CPU changes only from 309.07 to 306.92 ms/s (-0.70%),
while GPU and Browser CPU increase. That single pair does not establish a
repeatable application-level improvement or regression. More controlled
repetitions are required before making such a claim.

All four analyzer results remain **INCONCLUSIVE**: private-memory samples are
unavailable, and Relative/Standings coverage is incomplete because the tape
produces no observed `lap-times.snapshot` or `radio.snapshot` publications.
`--allow-inconclusive` permits descriptive analysis; it does not pass a gate.
Working-set variation in these short runs does not establish a memory leak.
Game FPS and presentation timing are not measured.

The ignored `perf-results/renderer-cd-comparison.json` preserves detailed
per-run values and raw renderer cadence. The manifest's `order` includes all
four runs; its `runs` list omits the separately launched baseline 1. Its full
log and completion marker were verified independently.

Fixture details: `perf-results/fixtures`, verified LFS payload, 348 MB,
40 cars and 3 classes. Seed SHA-256:
`97f08691ea0366271cfd2fbbb753379998e1921d584e4c7cf9b5b67e6be651ad`.
The run manifest is `perf-results/renderer-cd-manifest.json`.

## Separate React Profiler pair

Dedicated worktrees at the same baseline/candidate revisions were patched with
identical temporary per-widget React `Profiler` wrappers. The instrumentation
was not applied to the application-level CPU captures above and is not shipped
in the branch. Both 120-second runs used the same fresh seed, tape, playback
speed, and topology. Five widget IDs were populated in both runs.

The analysis retains eight complete 10-second intervals per run whose start is
at least 30 seconds after the run origin: approximately 80 seconds per side.
Console logger routes duplicate some records; identical timestamp/payload
records were deduplicated before aggregation. Render duration samples use
bounded 2048-element buffers per widget; no retained interval overflows that
capacity. Slow events include widget ID, phase, startTime, and commitTime.

| Widget | Baseline commits/s | Candidate commits/s | Baseline render ms/s | Candidate render ms/s |
| --- | ---: | ---: | ---: | ---: |
| Standings | 24.275 | 19.750 | 10.317 | 10.644 |
| Relative | 29.650 | 25.188 | 11.008 | 9.671 |
| Track Map | 24.225 | 23.988 | 11.278 | 4.499 |
| Input | 59.675 | 59.600 | 9.958 | 10.543 |
| Weather | 1.825 | 1.825 | 0.197 | 0.189 |
| Sum of these disjoint subtrees | — | — | 42.758 | 35.546 |

In this pair, Map render-phase work decreases about 60.1% with almost unchanged
commit rate, consistent with avoiding repeated identity derivation. Standings
and Relative commit rates decrease about 18.6% and 15.1%. Relative render work
decreases about 12.1%, while Standings render work increases about 3.2% despite
fewer commits. Input render work also increases about 5.9%. The sum decreases
about 16.9%. These are observations from one instrumented pair, not a repeated
production benchmark or evidence of a game FPS gain.

Renderer callback cadence is similar in this pair: about 170.18 versus
167.00 callbacks/s, with a 5.6 ms median interval in both. That check uses
complete renderer reporting intervals after the same 30-second cutoff, a
slightly different interval alignment from the 10-second profiler reports.
`actualDuration` measures React render-phase work inside a widget subtree;
it excludes effects, DOM commit, canvas drawing, raster, and presentation.
A subtree callback does not prove its root component rerendered. Instrumentation
overhead has not been separately quantified. Do not subtract these figures
from the separate CPU captures to claim an attributed CPU breakdown.

Raw logs: `perf-results/react-profiler-{baseline,candidate}-20261111.*`.
The ignored module, instrumentation helper, comparison script, and
`react-profiler-comparison.json` are under `perf-results/profile-tools/`.
The module SHA-256 is
`dc48c60d30f913c91c2d468465050379adf0a2a5f82e12aaaf7169009602545b`;
the patched OverlayContainer SHA-256 is
`3c07031c0c142139ecf3869164ea8be3d0de1d2af9ce542d029cbd016b34899f`
in both worktrees. Retained intervals contain five renders at least 2 ms in
the baseline and two in the candidate, all in update phase. The largest are
5.6 and 4.4 ms respectively; these are subtree render durations, not screen
hitch counts. Mount/startup events are outside this steady-state window.

## Pipeline review and next decisions

| Step | Evidence | Next action |
| --- | --- | --- |
| SDK wait | New spans cover the blocking wait and whole synchronous poll iteration. Typical wait can approach the 16 ms timeout; it is elapsed wait, not CPU consumption. | Preserve cancellation, paused replay refresh, and scheduling. Do not infer busy CPU from the wait span. |
| SDK read/conversion | Baseline 2: `sdkTelemetryRead` averages about 0.564 ms, versus 0.610 ms for `processTelemetry`; about 59 reads/s. | Split native materialization from JS copying before considering metadata caching. This is a main-process candidate, not evidence that it explains renderer CPU. |
| Derived processors | Track-state processing averages about 0.007 ms; its publish span about 0.004 ms in this workload. | Profile individual processors only when a channel shows material cost. Preserve event/crossing calculations and required rates. |
| IPC | Input, track-state, and sortable channels arrive around 59, 24, and 5 Hz. Publication spans do not isolate all clone/send/renderer costs. | Measure payload bytes and delivery cost per channel/window before changing IPC representation. |
| Stores/selectors | Behavioral tests show irrelevant flags/class-position updates preserve selection, while real changes notify. | If needed, count selector evaluation/equality/notification separately with bounded opt-in instrumentation. |
| React | C/D remove disabled progress subscriptions and repeated map identity derivation. | Compare per-widget commits and actualDuration above; this measures render phase, not DOM commit or canvas paint. |
| Canvas | Map currently records both commit paints and rAF paints under one metric, roughly 190 callbacks/s in the higher-cadence runs. | First split the counters by trigger. Trace layout, paint, raster, compositor, and GC before changing draw scheduling. |
| Screen/game | No game or packaged Windows presentation capture is available here. | Validate with the same iRacing replay and PresentMon/ETW on Windows; keep refresh, cap, sync, camera, and geometry fixed. |

The connected no-data branch retains a 25 Hz polling deadline and paused-seek
refresh. In baseline 1, roughly 225 of 21,604 poll iterations received no data.
These observations do not justify changing polling behavior. SDK read timings
are elapsed measurements and must not be added to CPU time as though they were
independent samples.

The next priority is identifying renderer/compositor work outside React with a
Chromium trace, alongside separate commit/rAF map counters. A renderer-engine
rewrite is not justified by these captures: it would change a much larger
surface before the dominant work is attributed. Native and IPC changes remain
conditional follow-ups, as defined in stages E–G of the plan.

## Scope and limitations

This is native Linux SDK tape playback, not an iRacing game session. It can
compare application and renderer behavior for the recorded input, but it does
not measure actual game presentation intervals or establish an FPS benefit in
iRacing. Fixture-recorded performance fields are not measurements of the
current host. The missing coverage, single profiler pair, and cadence mismatch
limit the conclusions to the observations documented above.
