# Reconstructed ten-widget renderer attribution

Branch `perf`, base `02e8e07e`, with the local session-comparator candidate.
Continues the [pipeline investigation](2026-11-11-system-pipeline-attribution.md).

## Restored workload and method

The real 348,187,160-byte tape was downloaded and verified against SHA-256
`6e23e8abab49c1a0ae7c8f6d1f298d31145a6189d3029b8ca540aad56a22b168`.
Electron 45.2.0's release ZIP was verified using the locked npm package's
checksum. The Linux tape addon was built from existing sources using g++ and
N-API headers. Native source was not modified. Host: Linux, Node v26.13.1,
AMD Ryzen 5 9600X.

The old raw captures and saved user seed were unavailable. A reconstructed
seed uses the same ten widget types, default settings, explicit placement,
Standings `showAll`, and replay visibility overrides. Analytics, autostart and
the component webserver are off. This is **not the original saved profile**.
Overlay viewport: 1549 × 1014, DPR 1. Forty cars and three classes are present;
some Standings rows extend below its viewport. Lap Trace is mounted but waiting
for a clean reference lap in this segment.

Two independent application runs each warm up for 60 seconds, then take six
short phases in the same renderer. Each phase restores all widgets, pauses and
seeks to tape second 55, resumes at 1x, waits five seconds, changes subtree
visibility, settles five seconds, and traces about 15 seconds. Final full
phases check drift. Subtree removal can change demand; costs are not additive.
Shared updaters, session data and events remain enabled.

All twelve traces have completed CDP streams with `dataLossOccurred: false`.
Both applications restored visibility and exited zero. Startup topology is
complete and viewport/PID stay unchanged within each run. Earlier controller
attempts failed before tracing and are excluded. Readiness now waits for the
topology marker; Inspector uses `createRequire` rather than a global `require`.

## Group attribution

Run `perf-results/shared-attribution-r3/`, overlay PID 85839. Exclusive
synchronous main-thread **wall ms/s**, not CPU time:

| Phase                              | FunctionCall | Compositor artifact update | Style recalc | Layout | Paint |
| ---------------------------------- | -----------: | -------------------------: | -----------: | -----: | ----: |
| Full before                        |       145.50 |                      49.99 |        15.00 |   3.80 |  5.69 |
| Without Radar                      |       133.93 |                      50.06 |        15.25 |   4.36 |  5.76 |
| Radar only                         |        32.57 |                       0.00 |         0.00 |   0.00 |  0.00 |
| Without Standings/Relative/Weather |       112.48 |                       6.45 |        15.46 |   0.68 |  3.25 |
| Standings/Relative/Weather         |        48.47 |                      38.55 |         2.80 |   0.44 |  1.78 |
| Full after                         |       153.25 |                      54.24 |        15.17 |   4.22 |  6.09 |

The expensive `PaintArtifactCompositor::Update` remains associated with the
DOM group and its interactions. Radar contributes separate drawing work.
Full endpoint total CPU under tracing is 1202 / 1238 ms/s, rAF about 58.6/s.
Only two wholly contained five-second reporter intervals are retained per
phase. The global V8 sampler adds substantial Browser and tape-control work;
these are not ordinary application CPU figures or a performance gate.

## DOM split and rejected controls

Run `perf-results/shared-dom-r1/`, overlay PID 91198, same seed and method:

| Phase                     | FunctionCall, wall ms/s | Compositor artifact update, wall ms/s |
| ------------------------- | ----------------------: | ------------------------------------: |
| Full before               |                  148.28 |                                 50.99 |
| Standings only            |                   34.05 |                                  0.00 |
| Relative + Weather        |                   34.65 |                                  9.22 |
| Weather only              |                   10.04 |                                  3.32 |
| Full, name masks disabled |                  142.77 |                                 56.53 |
| Full after                |                  162.08 |                                 58.37 |

The mask control temporarily overrides mask-image for classes containing
`mask-`. Its marker is present in the captured DOM. It is removed before the
final full phase and in cleanup. It demonstrates no supported improvement;
removing the name fade is not an accepted implementation change.

Original `Animation` events repeatedly identify WindDirection's SVG `rotate`
target with `compositeFailed: 524288`. Chromium names that bit
`kSVGTargetHasIndependentTransformProperty` in its
[failure-reason enum](https://chromium.googlesource.com/chromium/src/+/59c1b7deb132b7478bb27f2f7b773b1b71236e5d/third_party/blink/renderer/core/animation/compositor_animations.h).
A temporary HTML wrapper preserves the same rotation/transition and removes
those failure markers. However, two full phases in
`perf-results/shared-wind-candidate-r1/` still show 54.76 / 49.53 compositor
wall ms/s. No overall improvement is established. Tape-control startup
visibility also differs, preventing an accepted process-CPU comparison.
**The WindDirection experiment was reverted.**

The traces also identify frequent `top` animation on BlindSpotMonitorIndicator.
The next candidate replaces it with geometrically equivalent translation,
preserving data, transition timing and hide/show behavior. It remains
experimental pending full-profile and visual/lifecycle validation.

## Tools, artifacts and remaining gates

`tools/perf/traceSummary.ts` and `summarize-trace.mts` now provide the parser in
tracked source. It attributes X/B/E intervals once, handles out-of-order
buffers and thread metadata, reports unmatched boundary spans, and keeps
threads separate. Its ten synthetic tests cover nesting, crossing overlap,
equal starts, gaps, boundary truncation, invalid/async events and absent PIDs.

Successful directories retain traces, summaries, phase-metrics, seeds, source
diffs, topology and pretrace screenshots. The DOM controller is saved as
`shared-dom-r1/controller.mjs`, SHA-256
`8d06afed622014e370271dc842231e6bd28a2679bfd31e10703825ebe0c4ed41`.
Later runs copy their controller at startup and save browser-version metadata.
Raw captures/media remain ignored and uncommitted.

The phase-metrics files contain process CPU, channel rates, draw counters and
rAF tails using only wholly contained reporter intervals. Percentile rows are
means of interval percentiles, not pooled percentiles. All retained intervals
have zero session-publication samples.

Open: normal sampler-free long matched A/B, hide/show and replay/lifecycle
spikes, Settings/long-session memory, and packaged Windows/iRacing presentation.
These diagnostics do not complete the overall perf plan or show game FPS gains.

## Later probes and checkpoint

Input `will-change: transform` was tested A–B–A–B in
`perf-results/shared-input-promotion-r1/`; compositor work remained about
50–54 wall ms/s without repeatable benefit. It was not added to Input.

Removing only forced 3D promotion from manufacturer sprites, retaining their
scale and images, produced the following in `shared-logo-layers-r1`:

| Phase        | Layers | Compositor artifact, wall ms/s | Renderer CPU, ms/s |
| ------------ | -----: | -----------------------------: | -----------------: |
| Original 1   |     64 |                          49.97 |             553.18 |
| 2D sprites 1 |     17 |                          25.91 |             477.99 |
| Original 2   |     64 |                          48.40 |             536.22 |
| 2D sprites 2 |     17 |                          27.13 |             474.00 |

The real-code candidate now removes manufacturer `translateZ(0)`. Normal-run
acceptance is pending. Blind-spot transform geometry was independently checked
in Storybook/Chromium: two heights, five positions, both sides, zero coordinate
difference from the original. Its isolated total CPU contribution is unproven.
See [PERF_HANDOFF.md](PERF_HANDOFF.md) for the exact continuation point, new
tracked capture tools and remaining gates. The user confirms Windows access
is currently unavailable.
