# Lap Trace native hide/show — passed on Linux

Source `1fe4f696`, capture `laptrace-hidden-r3`, reconstructed ten-widget
fixture, 1549×1014 / DPR 1. Both plot and brake-cue paths were exercised with
a synthetic in-memory reference matching the actual track/car metadata.

| Boundary                    | Plot frames | Brake-cue frames | Reference present |
| --------------------------- | ----------: | ---------------: | ----------------- |
| Before hide, after settling |         120 |               49 | Yes               |
| After 20 seconds hidden     |         120 |               49 | Yes               |
| Two seconds after show      |         239 |               95 | Yes               |

Native visibility was checked through BrowserWindow. Track snapshot delivery
stopped while hidden and resumed after show. The complete controller ran for
180 seconds, exited 0 and restored candidate source; no failure/cancellation
artifacts exist. Scalar boundary evidence is in the adjacent JSON.

The two preceding runs failed: on show, ProcessorHost recreated the inactive
LapTraceSampleProcessor and force-published its initial snapshot with unknown
`sessionNum: null`. The recorder converted null to -1 and treated it as a real
session change, clearing the injected reference. The fix keeps the last known
session number until a nonnegative integer arrives. It retains real session
change handling and does not alter channel visibility or draw scheduling.

All 25 recorder tests pass. Two new regression cases (null and -1) fail against
the old implementation and pass with the fix; they also verify a later genuine
session change still initializes the recorder. TypeScript and targeted ESLint
pass. This is synthetic-reference Linux lifecycle evidence, not validation of
recorded lap accuracy, total CPU improvement, Windows or simulator FPS.
