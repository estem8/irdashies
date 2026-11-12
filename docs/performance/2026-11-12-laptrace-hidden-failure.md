# Lap Trace hidden-window diagnostic — incomplete

Two Linux repetitions (`laptrace-hidden-r1`, `laptrace-hidden-r2`) exercised
both plot and brake-cue draw paths with an in-memory synthetic reference.
Neither drew during the measured 20-second native hidden interval. Both
failed the assertion requiring drawing to resume after native show.

The second repetition sampled the real LapTraceStore at each boundary:
reference present before hide and throughout hiding, absent after show.
Plot counters were 131 at hidden-start, hidden-end and shown; brake-cue
counters were 48 at all three boundaries. Track snapshots resumed normally.
The console logged `SessionNum changed to -1, restarting recorder...` at show.
The isolated profile had no persisted reference to reload.

This establishes reference loss at show in this diagnostic, not a scheduler
failure or a completed hide/show acceptance gate. Investigation must determine
why the recorder receives the unknown/reset session-number sentinel and
whether it should trigger a real session transition. No application code was
changed on this evidence alone. The capture exited 1 and the controller
confirmed candidate source restoration. Scalar boundary evidence is retained
in the adjacent JSON; screenshots/logs remain outside git.
