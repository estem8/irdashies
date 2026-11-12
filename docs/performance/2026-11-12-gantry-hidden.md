# Gantry hidden history diagnostic — passed on Linux

Source `de1adbfd`, capture `gantry-hidden-r4`, 300 seconds, controller exit 0,
candidate restored, no failure/cancellation artifacts. Gantry was enabled in
an isolated reconstructed fixture. Its diagnostic saved layout was 1400×800
inside the existing overlay extent; actual native Gantry bounds were
1230×1319 under the window manager. The overlay stayed 1549×1014 / DPR 1.
This is lifecycle evidence, not a matched CPU acceptance run.

| Boundary                | Track version | Lap-history version | Total crossings |
| ----------------------- | ------------: | ------------------: | --------------: |
| Closed to tray, settled |          1227 |                   1 |               0 |
| Hidden for 20 seconds   |          1727 |                  39 |              40 |
| Hidden for 180 seconds  |          5729 |                  78 |              80 |
| Shown                   |          5779 |                  78 |              80 |

The same native window ID 3 and renderer PID 354283 survived native close,
180 seconds hidden and show. `getBackgroundThrottling()` stayed false. The
existing renderer stores received track state and new crossings while hidden;
no diagnostic subscriptions were added. Session data remained present with
one session entry and unchanged session number. After show, all 80 crossings
were retained. Disabling Gantry through the active profile dashboard bridge
removed its native window. No application implementation changes were needed.

The initial three attempts were rejected before the hidden-history scenario:
r1 had an expanded overlay because of Gantry's saved layout; r2 called the
renderer getCurrentDashboard stub; r3 queried a missing WebPreferences field
instead of effective background throttling. None count as successful tests.
Targeted ESLint and syntax checks passed for the corrected diagnostic tools.

This verifies live hidden snapshots and lap-history retention for this tape.
It does not cover all incident/event types, session transitions, minimize,
live simulator input, Windows, total CPU or simulator FPS. Scalar observations
are retained in the adjacent JSON; raw logs/media remain outside git.
