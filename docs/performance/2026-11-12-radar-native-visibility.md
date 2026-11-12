# Radar native minimize drawing — 2026-11-12

Radar continued drawing while its native window was minimized on this Linux
host, even after Map and Input stopped. A native visibility bridge now stops
Radar's rAF and restores an immediate paint using the latest frame. The repeated
result establishes removal of hidden Radar draw work, not an application CPU,
memory, compositor or game FPS improvement.

The existing `hide()` evidence did not cover this minimize behavior. In the
new static-transition probe's pre-fix minimize interval, BrowserWindow reported
invisible/minimized and Radar executed 177 draws in about three seconds while
Map/Input counters stayed fixed. Chromium's document visibility is insufficient
for this configuration with `backgroundThrottling: false`.

The implementation uses the existing typed bridge/subscription registry pattern:
main seeds the owning BrowserWindow's native visibility and sends state changes
on show/hide/minimize/restore. Renderer listeners validate booleans and dispose
subscriptions. Window listeners are removed on close and bridge disposal;
registry cleanup handles renderer destruction/reload. The Radar drawing effect
cancels while native visibility is false; its existing active/fade behavior and
60 Hz carried deadline are unchanged. The browser/Storybook fallback remains
visible when the optional native bridge is absent. No settings or Chromium flags
changed. ChannelBus delivery and Gantry's always-fed history remain unchanged.

The controlled baseline calls the same hook and has the same bridge, but ignores
its visibility result, reproducing the previous drawing behavior. Only this
native draw gate differs between variants. Four accepted fixed 90-second
captures have identical seed and display inventory, matched minimized bounds
2560×1369, positive drawing before minimize and after restore, and these settled
interval counts:

| Order    | Variant             | Settled minimized seconds | Radar draws | Map commit/rAF and Input draws |
| -------- | ------------------- | ------------------------: | ----------: | -----------------------------: |
| A1       | Native gate ignored |                    15.010 |         898 |                              0 |
| B1       | Candidate           |                    15.006 |           0 |                              0 |
| B2       | Candidate           |                    15.007 |           0 |                              0 |
| A2 retry | Native gate ignored |                    15.008 |         899 |                              0 |

The native event journal contains only minimize before each interval ends:
there was no show/restore during the measured intervals. Each controller exits
0 with its duration marker. Candidate source is restored and hash-checked.
Raw artifact hashes and seed/source hashes are retained in the
[bounded report](2026-11-12-radar-native-visibility.json).

This is a **recovered order**, not an uninterrupted A–B–B–A capture. The original
A2 received a termination signal before preflight; its sender is unknown. Only
that missing baseline phase was retried, with 296.684 seconds between the B2
and retry A2 minimize events. The report discloses that gap. This does not close
a normal CPU gate or establish profiler overhead. An earlier attempt was
rejected because the window became visible during the interval; its resumed
Map/Input drawing must not be counted as hidden work. A subsequent bounded
method/event journal did not reproduce an unsolicited restore, so no cause for
that earlier transition is claimed.

The complete `drawing-transitions-r3` 180-second candidate probe additionally
checked paused Map interpolation settling and these static transitions:

| Case                         | Observed result                                             |
| ---------------------------- | ----------------------------------------------------------- |
| Layout resize                | Backing canvas 500×300 → 537×323                            |
| Widget scale 125%            | Logical canvas 400×240, backing 500×300, reported scale 125 |
| Colors and car-number labels | Commit draw after configuration update                      |
| Player icon                  | Temporary 32×32 PNG decoded and displayed at nonzero width  |
| Emulated DPR 2               | Canvas backing 1000×600 for logical 500×300                 |

Each case has 90 rAF canvas-content observations with no empty canvas observed.
The existing 50 ms resize debounce remains; this does not prove every
compositor-presented frame was nonblank or that all scales/physical DPRs are
covered. Screenshots were inspected; review copies are outside the repository
at `/tmp/irdashies-perf-review/`. No review images are committed. Raw diagnostic
media stay with the ignored captures. Actual 144/240 Hz displays, physical
high-DPI image quality, occlusion/hotkey modes and Windows presentation remain
unverified. No new Map scheduler is justified.

Validation: 93 tests in 13 Radar/bridge/channel/Gantry files pass, including
native-hidden cancellation with document visibility unchanged, latest-frame
restore and cleanup. All ten capture test files pass; TypeScript/ESLint,
formatting, local links, source restoration and recovered artifact verification
accompany this checkpoint. New raw captures are under
`perf-results/drawing-transitions-r3`, `native-visibility-origin-r1` and
`radar-minimize-abba-r2*`. Reproduction uses fresh IDs:

```sh
node tools/perf/capture/drawing-transitions-probe.mjs drawing-transitions-new
node tools/perf/capture/radar-minimize-matrix.mjs radar-minimize-new
# After a terminal partial run, resume only missing phases with a fresh suffix:
node tools/perf/capture/radar-minimize-matrix.mjs radar-minimize-new resume retry1
```

Do not rerun this completed diagnostic merely to eliminate the recovery gap.
Use a full matched normal-operation A/B if a broader CPU claim is needed.
