# MemoryInfra allocator diagnostic — 2026-11-12

The completed Linux diagnostic localizes a small increase in live malloc/V8
accounting, but does not explain all private-memory growth or establish a leak.
The external Linux private metric and Chromium private footprint diverge
substantially. They must not be treated as equivalent native heap measurements.

`native-memory-r4 native 1009` completed 1380 seconds, exit 0, with the fixed
completion marker and candidate restoration. Source checkpoint:
`dc0f59d35eec16fcf07fb30c6eee4a0ef3aee518`. Five post-GC checkpoints at
120/420/720/1020/1320 seconds span 20 minutes. Every checkpoint has one named,
loss-free light MemoryInfra dump; all three process lifetimes stay fixed.
The same ten-widget reconstructed profile and looping 10-minute tape are used.
The overlay is 1549x1009 at DPR 1, so this is not a matched repeat of earlier
1014-pixel memory runs. Tracing/forced GC make it diagnostic, not CPU acceptance.

All figures below are endpoint changes in MiB (2^20 bytes), not slopes:

| Process  | Linux private | Chromium private footprint | post-GC V8 used heap | malloc allocated objects | malloc size | malloc virtual size |
| -------- | ------------: | -------------------------: | -------------------: | -----------------------: | ----------: | ------------------: |
| Main     |       +59.391 |                    +16.926 |               +3.748 |                   +5.650 |     +10.855 |             +20.000 |
| Overlay  |       +37.719 |                    +14.523 |               +0.663 |                   +1.086 |      +3.749 |             +24.000 |
| Settings |       +18.676 |                     -1.488 |               +0.258 |                   +1.152 |      +1.281 |              +4.000 |

The Linux metric is the capture tool's sum of smaps_rollup Private_Clean,
Private_Dirty and Private_Hugetlb. Chromium's private_footprint_bytes is retained
separately from its process totals. External sample offsets from the named
checkpoints are 0.594–3.438 seconds. This run did not persist separate clean,
dirty, anonymous and file-backed PSS values, so it cannot reconcile the two
metrics. Subsequent captures now retain those fields when the kernel supplies
them; unavailable optional counters are omitted instead of becoming zero.

Main Chromium private footprint changes 71.742 → 80.816 → 85.328 → 88.324 →
88.668 MiB: its last five-minute interval grows only 0.344 MiB. Main post-GC
heap similarly flattens to 19.122 MiB. These observations do not establish
unbounded growth. malloc size exceeds allocated-object growth, while virtual
size is reservation/accounting rather than a count of live objects.

Overlay PartitionAlloc size changes +0.692 MiB, Blink GC size +7.586 MiB,
V8 size +2.970 MiB, cc size +1.047 MiB, and web cache size -6.728 MiB.
Parkable string original/size counters stay constant while effective_size
changes +6.679 MiB; a change in effective accounting alone does not prove additional string
content. Settings PartitionAlloc size decreases 4.925 MiB. These subsystem
counters overlap: do not sum them, subtract them from Linux private memory,
or interpret provider size as retained JavaScript objects. Main PartitionAlloc
is empty, not zero. Oversized scalar counters remain exact objects and are not
included in numeric deltas.

The earlier R3 detailed trace lost data at 720 seconds and remains rejected.
R4's validated light configuration retains the aggregate malloc/PartitionAlloc/
V8 counters with much smaller traces. This solves capture reliability for this
run; allocation stacks and the full private-memory discrepancy remain open.
A targeted native allocation sampler is conditional on the next attribution
step. Chromium's sampling profiler tracks sampled currently live allocations;
sampling totals are estimates, not an exact heap census.

Evidence: [bounded machine-readable report](2026-11-12-native-memory.json),
[light provider readiness](2026-11-12-memory-infra-light-readiness.json).
Raw traces and samples remain under ignored perf-results/native-memory-r4.
The parser/report tests cover provider merging, exact large counters, missing
critical evidence, process-lifetime changes and lost trace data. Targeted ESLint
passes. No Windows/iRacing or actual presentation result is claimed.

Accounting references: [Chromium MemoryInfra documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/memory-infra/README.md),
[Chromium native sampling profiler](https://github.com/chromium/chromium/blob/main/base/sampling_heap_profiler/sampling_heap_profiler.h).
