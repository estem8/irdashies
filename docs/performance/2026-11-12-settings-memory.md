# Repeated Settings memory diagnostic — 2026-11-12

Both isolated runs completed 1,380 seconds with duration markers, exit 0 and
candidate-source restoration. Source checkpoint, six candidate file hashes,
seed and complete environment inventories match. Standings Settings preview
remained visible and playing. Forced-GC observations at 120/420/720/1020/1320
seconds span 20 minutes; each run also has 120 complete PID/creation-time-matched
external private-memory observations in that interval.

| Post-GC V8 used heap, decimal MB | R1 first → last | R2 first → last |
| -------------------------------- | --------------: | --------------: |
| Settings                         |   60.07 → 60.56 |   60.02 → 60.92 |
| Overlay                          |   49.42 → 52.17 |   49.10 → 52.32 |
| Main                             |   15.97 → 20.00 |   16.07 → 20.01 |

Settings listeners remain **488** in all ten checkpoints. DOM nodes change
from 4,682 to 4,676 and remain there. Overlay listeners remain 152; its node
counts vary with the replay (2,045–2,234), without accumulating across tape
loops. Settings heap has a small non-monotonic drift: fitted slopes are
0.0126 and 0.0499 MB/min. Main heap growth flattens near 20 MB in both runs.
These observations do not reproduce the earlier large Settings working-set
slope as retained V8 heap or accumulating DOM/listeners. They do not prove the
absence of every possible leak.

**Private memory still grows and remains an open investigation.** Linux
`smaps_rollup` values below are MiB, whereas V8 heap above is decimal MB.

| Process                         | R1 fitted private MiB/min | R2 fitted private MiB/min |
| ------------------------------- | ------------------------: | ------------------------: |
| Main/Browser                    |                     2.049 |                     1.890 |
| Overlay                         |                     3.541 |                     2.536 |
| Settings                        |                     0.174 |                     0.411 |
| GPU                             |                     0.373 |                     0.371 |
| Hidden tape controls            |                     0.329 |                     0.279 |
| Total including network service |                     6.445 |                     5.478 |

Most of the fitted growth is in overlay/main, and is much larger than their
post-GC V8 used-heap growth. This localizes the process owners, not the retained
allocation owners: private pages may include native/browser allocations,
allocator retention and caches. The current aggregate samples cannot
distinguish these. Do not call this a proven native leak, a solved leak, or a
memory improvement from the candidate. Additional allocation/mapping attribution
should target overlay/main rather than assuming Settings preview is responsible.

Scope: Linux Electron development build, reconstructed ten-widget profile,
synthetic Standings preview and a ten-minute tape that loops twice. Forced GC
changes workload scheduling; CPU from these runs is not acceptance evidence.
The runs do not cover preview-off long steady state, a packaged build, real
simulator continuity, other Settings pages or all window modes.

[Bounded evidence](2026-11-12-settings-memory.json) retains all five observations,
per-process summaries, source/environment metadata and raw artifact hashes.
Raw captures stay local under `perf-results/settings-memory-r{1,2}`.

```bash
node tools/perf/capture/report-memory.mjs perf-results/settings-memory-r1 perf-results/settings-memory-r2
```

The report refuses incomplete runs/checkpoints or mismatched source, seed and
environment. Its actual two-run execution and ESLint passed. It deliberately
does not assign an automatic leak verdict.
