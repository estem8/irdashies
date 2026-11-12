# Track Map same-frame draw deduplication — 2026-11-12

Source checkpoint: `a7579a32`. F-7 selected a narrow Map paint candidate using
the [existing draw attribution](2026-11-11-renderer-trace.md), where React commit
and intermediate rAF paths both paint. This does not establish that all commit
paints are redundant, or that Map dominates renderer/compositor CPU.

## Hypothesis and implementation

A target commit advances interpolation to `performance.now()` and paints it
immediately. A subsequently invoked rAF callback can carry an earlier/equal
browser-frame timestamp. Advancing to that older time cannot move beyond the
already painted target start. Drawing again is redundant.

A bounded current-code probe (`perf-results/map-same-frame-r1/`) observed 56
such callbacks out of 889 over fifteen seconds, with 332 target and two
appearance paints. The candidate skips rAF drawing when its timestamp is no
newer than `lastDrawRef`, and schedules the next callback as before. Target and
appearance commit paints, interpolation, the final settling frame, caps,
cleanup, telemetry processing and delivery stay intact. Both curved and flat
maps use this hook. This is not a global frame cap or channel batching change.

## Normal-function comparison

Linux dev app, one visible shared renderer, all ten configured widgets, viewport
1549 × 1014 and DPR 1. Same native tape/seed and helper as the
[Relative diagnostic](2026-11-12-relative-identities.md). After the helper's
55-second readiness observation, phases seek to second 55, resume at 1x, settle
five seconds and measure twenty seconds. Order A–B–B–A. No test runner, lint,
V8 sampler or trace runs during capture.

Temporary local counters distinguish callback entry, skipped callback, target
paint, appearance paint and executed rAF draw. A runtime switch enables only
the new timestamp condition; both modes execute the same counters. Source and
controller are retained in ignored artifacts, and all diagnostic code is
removed from the committed application. The extra candidate branch/counters
have unquantified overhead.

| Phase       | rAF callbacks | Skipped | rAF draws | Target / appearance draws | Total CPU, descriptive |
| ----------- | ------------: | ------: | --------: | ------------------------: | ---------------------: |
| Baseline 1  |          1184 |       0 |      1184 |                   438 / 2 |            549.95 ms/s |
| Candidate 1 |          1097 |      66 |      1031 |                   452 / 2 |            536.30 ms/s |
| Candidate 2 |          1188 |      81 |      1107 |                   431 / 2 |            533.12 ms/s |
| Baseline 2  |          1191 |       0 |      1191 |                   437 / 2 |            536.09 ms/s |

Baseline callbacks meeting the skip condition vary too: 80 then 33. Therefore
subtracting cross-phase draw totals would overstate attribution. The direct
result is exactly 66 and 81 redundant draws avoided in candidate windows,
roughly 3.3–4.0 per second; there is no claim that every inter-phase difference
was caused by this change. Required commit paints remain enabled.

Overall CPU gain is **inconclusive**: the final baseline overlaps candidates,
callback throughput varies, and source cadence is 59.268 / 58.590 / 59.459 /
59.273 Hz across three wholly contained main reporter intervals per phase.
The first pair exceeds the prior 0.5% cadence gate. Combined Map draw time in
three complete renderer intervals per phase is 10.005 / 10.268 / 8.753 / 9.313
ms/s, also not a repeatable timing win. Counters demonstrate avoided work but
do not establish an FPS, memory, GPU utilization or compositor improvement.
Retain the small guard for its bounded repeated work elimination, rather than
label it a solution to the main pipeline bottleneck.

## Behavior and checks

35 tests across animation, curved-map session transitions, FlatTrackMap and
TrackMap pass. Added cases cover an older/equal rAF timestamp, retention of the
immediate commit image, next-frame interpolation and final settling. Existing
coverage exercises caps and cleanup. TypeScript/ESLint (`npm run lint`),
formatting and whitespace checks pass.

After all timed phases, replay was paused and actual screenshots reviewed:
`/tmp/irdashies-map-frame-{baseline,candidate}.png`. Map region x=1000, y=0,
w=549, h=330 is pixel-identical (zero changed channels via ImageMagick).
This static comparison does not prove every moving frame or high-refresh/DPI
behavior. No intended appearance change. No packaged Windows/iRacing acceptance,
physical high-DPI/high-refresh test or motion recording is claimed.

Raw run: `perf-results/map-frame-ab-r1/`; controller and application completed
with exit zero at the helper's 180-second lifetime. The adjacent
[JSON evidence](2026-11-12-map-frame-deduplication.json) records measurements and
artifact hashes. Helper output remains topology-only; this report supplies the
separate hypothesis result. Remaining systemic priority is current DOM/compositor
invalidation ownership, not further micro-optimization of this inexpensive Map
callback or repeating rejected wind/mask/promotion experiments.
