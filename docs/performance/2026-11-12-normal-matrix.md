# Normal-operation Linux matrix — 2026-11-12

R3 completed A–B–B–A, four isolated 420-second runs, all exit 0 with the
fixed-duration marker. Candidate source hashes were verified restored afterward.
The controller and application checkpoint is `64819740`; baseline substitutions
are pinned in `prepare-matrix.mjs`. This compares the combined six-file candidate,
not the individual contribution of each optimization.

Scope: Electron development build, Linux, reconstructed ten-widget tape profile,
1549 × 1014 visible overlay, DPR 1. Tape controls remain hidden at creation at
(0, 0, 620, 104). All four environment inventories are identical. The source tape,
seed, full delivery modes, requested widgets and instrumentation are unchanged.
No tracing, tests or concurrent builds ran during measurement. External Linux
private-memory sampling ran every ten seconds in every variant.

Analysis uses 60–420 seconds. CPU time is the sum of per-process CPU deltas
divided by their sampled intervals, expressed as milliseconds of CPU per second;
it is not normalized machine CPU percent. Interval-mean p99 is the mean of
reporter interval p99 values, not a global frame percentile.

| Metric                               | A1 baseline | B1 candidate | B2 candidate | A2 baseline |
| ------------------------------------ | ----------: | -----------: | -----------: | ----------: |
| Total CPU ms/s                       |      706.93 |       579.56 |       596.09 |      645.19 |
| Telemetry Hz                         |       59.61 |        59.57 |        59.57 |       59.63 |
| Renderer frame interval p99 mean, ms |       22.93 |        21.79 |        21.11 |       23.84 |
| Worst renderer interval, ms          |        50.0 |         49.9 |         50.0 |       216.5 |
| Mean external private memory, MB     |      619.89 |       544.50 |       587.66 |      586.92 |
| Peak external private memory, MB     |      655.36 |       579.70 |       603.61 |      619.45 |

Pair CPU deltas are **−127.36 ms/s (−18.02%)** for B1/A1 and
**−49.10 ms/s (−7.61%)** for B2/A2. Both favor the candidate, with substantial
baseline variation. The effect should not be presented as a universal percentage.
Input/Lap Trace processor rates remain about 59.6 Hz and Radar/track-state about
25.0 Hz. Their delivery rates remain comparable; these are normal coalesced
snapshot delivery paths, not diagnostic suppression runs.

Overall acceptance remains **inconclusive**. The analyzer exits nonzero for
missing in-log private memory and incomplete widget input coverage. External
`smaps_rollup` supplies 36 complete, PID/creation-time-matched observations per
run, spanning about 350 seconds inside the analysis window. These measurements
are retained separately and do not change the analyzer's verdict. Memory is
lower in the first pair and nearly equal on average in the second; this does not
establish a memory improvement or satisfy the repeated 20-minute leak check.

`lap-times.snapshot` and `radio.snapshot` did not publish during the analysis
window, so Standings/Relative input coverage is incomplete. Do not remove those
requirements to make this capture pass. Replay seek, session transitions,
hide/show, manufacturer scale/DPR checks, Settings/long-session memory and
instrumentation-overhead checks remain open. Windows/iRacing/PresentMon evidence
is unavailable; no game FPS or presentation claim follows from this matrix.

The [bounded evidence](2026-11-12-normal-matrix.json) includes per-process CPU,
channel rates, coverage failures, geometry, environment and raw artifact hashes.
Raw captures and screenshots remain in ignored `perf-results/normal-final-r3`.

Reproduction after capture:

```bash
node tools/perf/analyze.ts perf-results/normal-final-r3/b1/metrics.log --baseline perf-results/normal-final-r3/a1/metrics.log --warmup-seconds 60 --analysis-start-seconds 60 --analysis-end-seconds 420
node tools/perf/analyze.ts perf-results/normal-final-r3/b2/metrics.log --baseline perf-results/normal-final-r3/a2/metrics.log --warmup-seconds 60 --analysis-start-seconds 60 --analysis-end-seconds 420
node tools/perf/capture/report-matrix.mjs perf-results/normal-final-r3
```

The first two commands intentionally retain the nonzero inconclusive verdict
and still write summaries; run the third separately.
