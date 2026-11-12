# Conditional input demand — Linux runtime diagnostic

Source `ea360a76`, `input-demand-r1 smoke`, 90 seconds, exit 0, candidate
restored. The unchanged reconstructed ten-widget fixture ran at 1549×1014 /
DPR 1. A CDP read sampled existing ChannelSnapshotStore state at tape position
56.66 seconds, without registering subscriptions or changing widget settings.

| Channel                | Active selections | Bridge subscribed | Snapshot     |
| ---------------------- | ----------------: | ----------------- | ------------ |
| lap-times.snapshot     |                 0 | No                | Absent       |
| radio.snapshot         |                 2 | Yes               | Version 0    |
| track-state.snapshot   |                46 | Yes               | Version 1234 |
| relative-gaps.snapshot |                 1 | Yes               | Version 240  |

The presentation LapTimesStore also had no history and zero lap times.
Both Standings and Relative configure lapTimeDeltas.enabled=false and
avgLapTime.enabled=false. Standings additionally sets
classHeaderStyle.estimatedLaps.enabled=false. Their actual updater calls
subscribe to lap-times only when one of those features is enabled. This
matches the observed absence of direct demand; the host may still execute
LapTimesProcessor for its RelativeGap dependency without publishing that
channel to a renderer. ProcessorHost.publishIfChanged requires directDemand.

Radio had a consumer and an initial empty snapshot. The independent whole-tape
[diagnostic](2026-11-12-tape-input-coverage.md) found RadioTransmitCarIdx=-1 in
all 36,000 frames, explaining no changes after the initial snapshot. Snapshot
version 0 is consistent with that input; it is not a missing subscription.

These observations explain the two absent analysis-window publications for
this configuration. They do not verify enabled lap-time columns or active
radio transitions, nor retroactively satisfy the analyzer's complete widget
input coverage gate. Keep the original normal-matrix verdict inconclusive.
A separate feature-enabled fixture and exercised radio input are needed for
that broader behavior scope; do not splice fabricated values into the old
CPU comparison or force unnecessary subscriptions into the application.

Scalar evidence is in the adjacent JSON. The one-time read script remains in
ignored perf-results/coverage-diagnostic/runtime.mjs. No application changes
were made from this investigation.
