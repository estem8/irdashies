# Enabled lap-time feature delivery — passed on Linux

Source `19739a00`, capture `lap-times-features-r3`, 300 seconds, exit 0,
candidate restored, no failure/cancellation artifacts. The explicit diagnostic
seed enables lap deltas and average lap in both Standings and Relative, plus
estimated laps in Standings. It retains the source tape and other ten-widget
settings. Overlay geometry is declared as 1549×1009 / DPR 1 for the current
display; it differs from the earlier 1549×1014 CPU matrix.

| Observation      | Tape seconds | Channel version | Presentation version | Positive times | History samples |
| ---------------- | -----------: | --------------: | -------------------: | -------------: | --------------: |
| First sample     |        55.19 |               2 |                    2 |              0 |               0 |
| Exercised result |       195.94 |               5 |                    5 |              5 |               5 |

Both observations had two active lap-times selections and an IPC subscription.
At the exercised result the presentation store's lap times and complete history
arrays matched the channel snapshot exactly. No diagnostic subscriptions were
added. Native playback, processor aggregation, publication, renderer channel
store and presentation-store mirroring are therefore exercised together with
actual recorded values. This does not establish rendered cell accuracy for
every option, active radio transitions, session transitions or simulator FPS.

The ordinary fixture deliberately disables these features and has no direct
lap-times subscription; see [conditional demand](2026-11-12-input-demand.md).
This feature-enabled scenario is separate evidence, not a replacement seed
for the old CPU matrix. That matrix remains inconclusive under its existing
gates. No application code changed in this investigation.

Earlier feature R1 completed 180 seconds, establishing initial delivery only:
the first positive last-lap time in the tape occurs at 191.79 seconds. R2 was
rejected at preflight because the display height changed to 1009 while 1014
was expected. Neither is an exercised-history pass. R3 explicitly declares the
current height and requires positive history plus presentation/channel equality.
Syntax and targeted ESLint pass for the probe/controller.

Reproduce on a 1009-pixel display:

```sh
PERF_DIAGNOSTIC_VIEWPORT_HEIGHT=1009 node tools/perf/capture/lap-times-probe.mjs lap-times-features-new
```

The observer polls existing stores every five seconds; after passing it waits
for the fixed capture to finish. The adjacent JSON retains scalar observations
and seed/source identity. Raw logs and screenshots remain outside git.
