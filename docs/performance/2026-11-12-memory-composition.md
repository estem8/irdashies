# Linux memory composition controls — 2026-11-12

In these short runs, private growth is dominated by dirty/anonymous memory,
not private clean/file-backed growth. The larger overlay increases occur with
optional metrics collection enabled, but retained objects or a leak have not
been identified. These are natural-GC endpoints, not post-GC heap measurements.

Endpoint changes in MiB, over each run's approximately 350-second steady window:

| Phase | Process |  Private | Private clean | Private dirty | PSS anonymous | PSS file |
| ----- | ------- | -------: | ------------: | ------------: | ------------: | -------: |
| on1   | main    |  +21.855 |        -0.242 |       +22.098 |       +22.098 |   +0.094 |
| on1   | overlay | +109.398 |        +0.879 |      +108.520 |      +109.176 |   +1.188 |
| off1  | main    |   +4.484 |        -0.285 |        +4.770 |        +4.770 |   -0.108 |
| off1  | overlay |  +21.398 |        +0.906 |       +20.492 |       +21.146 |   +1.046 |
| off2  | main    |  +16.898 |        -0.059 |       +16.957 |       +16.957 |   +0.358 |
| off2  | overlay |   +2.480 |        +1.391 |        +1.090 |        +1.744 |   +1.652 |
| on2   | main    |  +22.543 |        -0.211 |       +22.754 |       +22.754 |   -0.042 |
| on2   | overlay |  +79.203 |        +0.547 |       +78.656 |       +79.312 |   +0.690 |

Do not add anonymous RSS, private clean/dirty and PSS together: they are distinct
accounting views. The parser verifies the private clean+dirty+hugetlb decomposition
when all fields exist, preserves missing optional counters as null, and checks
PID lifetime, sample completeness and observation gaps. Unit cases cover those
guards. Individual maxima/minima/slopes and other roles are in the JSON report.

Overlay anonymous endpoint growth is about 109/79 MiB on, versus 21/2 MiB off.
Main dirty growth is about 22 MiB in both on runs, versus 5/17 MiB off. The small
sample count, natural GC/allocator timing and delayed recovered on2 limit causal
interpretation. This is evidence to separate instrumentation from production
memory investigations, not proof that the collector retains those bytes.

These controls cannot reconstruct the missing clean/dirty breakdown of the
older 20-minute Settings/MemoryInfra diagnostic: workload, Settings, viewport,
forced GC and tracing differ. Its private-footprint discrepancy remains open.
The present result does not support attributing this workload's private increase
mainly to file-backed pages. Further ownership work should use collection-off
controls before treating instrumented growth as an application memory leak.

[Machine-readable composition](2026-11-12-memory-composition.json),
[CPU/recovery qualifications](2026-11-12-collection-overhead.md).
No MemoryInfra/native allocation stack profile or Windows result is claimed.
