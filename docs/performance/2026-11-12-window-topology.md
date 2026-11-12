# Window-mode topology readiness — passed on Linux

Source `5785e419`; `window-topology-display-r1` and
`window-topology-widget-r1` each completed fixed 180-second captures, exit 0,
with no failure artifact. The source, reconstructed ten-widget seed SHA,
actual display inventory and DPR 1 matched. No application source was changed.

| Mode    | Visible overlay windows | Total renderer processes, including hidden controls |
| ------- | ----------------------: | --------------------------------------------------: |
| display |                       1 |                                                   2 |
| widget  |                      10 |                                                  11 |

All enabled widget instance IDs rendered exactly once in each mode. Native
bounds plus DOM getBoundingClientRect coordinates produced exactly the same
screen x/y/width/height for all ten widgets: maximum difference 0 px. Native
visibility was true and effective background throttling false for each overlay.
The display overlay was 1549×1009 on a 2560×1009 display. Individual native
window and DOM bounds, startup readiness and process IDs are retained in JSON.

This establishes matching geometry/topology readiness for a future repeated
normal-operation cost comparison. It does not establish image equivalence,
channel cadence in every window, lower CPU, memory savings or simulator FPS.
No default window-mode recommendation follows from window/process counts.
Settings, Gantry and extra overlays were not enabled in this fixture.

The read-only probe uses main-process Inspector to query actual BrowserWindows
and execute DOM reads in their existing renderers. It adds no subscriptions,
changes no Chromium flags, and creates an isolated profile. Targeted ESLint
and syntax checks passed. Raw logs remain ignored under perf-results.

```sh
node tools/perf/capture/window-topology-probe.mjs window-topology-display-new display
node tools/perf/capture/window-topology-probe.mjs window-topology-widget-new widget
```

Run sequentially, with no other capture occupying Inspector ports. This pair
is a readiness diagnostic, not the repeated CPU acceptance matrix.
