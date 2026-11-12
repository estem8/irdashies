# Direct Map identity work — 2026-11-12

Identity derivation and its object construction decrease sharply while volatile
progress computation continues. In each candidate interval the identity memo
runs once; baseline runs it on virtually every progress update. This addresses
the direct stage-D recomputation/object-rate gap, not total allocation bytes
or an isolated application CPU claim.

All four 180-second A–B–B–A phases complete with exit 0 and candidate restoration.
Source checkpoint 07c7330e; ten-widget reconstructed tape profile, 40 driver
identity objects per derivation, 1549x1014/DPR1. Each analysis interval has 12
observations over approximately 110 seconds after the first 60 seconds.

| Run | Variant   | Identity computations | Computations/s | Identity objects/s | Progress computations/s |
| --- | --------- | --------------------: | -------------: | -----------------: | ----------------------: |
| a1  | baseline  |                  2447 |        22.1904 |            887.618 |                  22.190 |
| b1  | candidate |                     1 |         0.0091 |              0.363 |                  21.686 |
| b2  | candidate |                     1 |         0.0091 |              0.363 |                  22.249 |
| a2  | baseline  |                  2424 |        21.9728 |            878.913 |                  21.973 |

The paired specific identity-object reduction is about 99.96%. Progress rates
remain within 2.3% in both pairs; Track State/Radar version changes remain about
25/s and Driver Controls about 59.5/s. All steady PID lifetimes remain stable.
The reduction is not explained by freezing progress or stopping incoming data.
These are render/memo computations, not simulator telemetry sampling rates.

The observer increments numeric counters at the real memo/object-construction
sites, including work React may discard. It retains no identity objects and
does not mutate snapshots, selected arrays or props. Each exact instrumented
source is saved with a verified SHA; hashes repeat across both runs of each
variant. The controller restores the uninstrumented candidate afterward.

Progress objects and other allocations still exist. These counts cannot be
converted into bytes, retained heap, total application savings or game FPS.
The earlier full-field React Profiler pair observed lower Map render-phase
work (11.278 to 4.499 ms/s), including its selector/equality work, but that is a
separate diagnostic with five widget subtrees. The later normal R3 CPU result
measures the combined candidate and does not isolate Map's CPU contribution.

Readiness correction: R1's candidate hit the old five-second topology limit.
With validated 30-second capture-only grace, R2's four readiness delays were
5.450/6.588/6.211/5.430 seconds; all pass the same readiness criteria. The old
limit would reject each cold start. GPU teardown messages are not independent
GPU-startup evidence. No GPU flags changed.

[Source hashes, counters and scalar observations](2026-11-12-map-identities.json),
[earlier render-phase evidence](2026-11-11-renderer-subscriptions.md).
Raw source/profiles/screenshots remain under ignored perf-results/map-identities-r2.
