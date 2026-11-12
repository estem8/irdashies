# Hidden drawing: source audit and queued runtime check

Prepared while the Settings memory test runs. This is source inspection,
not evidence that a hidden-window performance gate has passed. No application
code, window flags or channel semantics were changed.

| Path                       | Current source behavior                                                                                                                                          | Remaining evidence                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map `useProgressAnimation` | `advance()` stops scheduling after interpolation reaches its target; target updates and appearance commits paint immediately. No native-window visibility input. | Confirm settled hidden intervals contain no Map paints; preserve immediate show/resize repaint. Existing unit cases cover settle, cap and unmount but have not been re-run during the memory test. |
| Input `InputTrace`         | Samples on prop updates, schedules one rAF and cancels its pending frame during effect cleanup. Resize can paint independently.                                  | Confirm snapshot gating leaves no recurring hidden trace paints; do not discard required Input samples as a drawing optimization.                                                                  |
| Radar `RadarDisplay`       | Carries a 60 Hz paint deadline, and requeues while `active` is true. `Radar` supplies `visible                                                                   |                                                                                                                                                                                                    | painting`; neither is native `BrowserWindow` visibility. | Measure whether hidden native windows keep drawing stale snapshots. Source suggests a candidate; do not claim measured waste yet. |
| Lap Trace                  | Shared scheduler requests at most one frame on selected store changes or telemetry; it does not unconditionally loop.                                            | Confirm hidden draw rate separately from any sample/history retention requirement.                                                                                                                 |
| ChannelBus/Gantry          | Snapshot delivery is visibility gated. Event delivery is retained; the main bridge additionally recognizes always-fed renderers.                                 | Do not make all hidden subscriptions inactive to stop a canvas. Gantry incident/history behavior needs independent checks.                                                                         |

Relevant sources:

- `src/frontend/components/TrackMap/useProgressAnimation.ts`
- `src/frontend/components/Input/InputTrace/InputTrace.tsx`
- `src/frontend/components/Radar/components/RadarDisplay.tsx`
- `src/frontend/components/Radar/Radar.tsx`
- `src/frontend/components/LapTrace/hooks/lapTraceFrameScheduler.ts`
- `src/app/bridge/channelBus.ts` and `channelBridge.ts`

The lifecycle helper now has a **prepared, not yet executed** `hidden` mode:

```bash
node tools/perf/capture/lifecycle-probe.mjs hidden-draw-r1 hidden
```

Run only after the memory captures. It uses the 180-second diagnostic controller,
retains the seek/pause/show assertions, and extends settled native hide to 20
seconds. Timestamped observations allow selecting renderer metric intervals
entirely inside hide; compare `trackMapCommitDraw`, `trackMapRafDraw`,
`inputTraceFrame`, `radarFrame` and Lap Trace counters before/hidden/after.
Do not classify a mixed boundary interval as hidden. This probe changes the
workload and adds observers, so it is not normal-operation CPU acceptance.

Instrumentation caveat: `startRendererPerfMetrics()` itself schedules a
continuous rAF to measure frame intervals. Therefore total rAF callbacks need
not become zero even when widget painting stops. Use the named widget draw
counters above, not the mere presence of animation callbacks, to identify
hidden widget work. Main `TelemetryPerfMetrics` and frontend named timers have
disabled fast paths, but that source fact does not measure their enabled cost.
Instrumentation-overhead acceptance requires externally sampled CPU with the
same playback, windows and subscriptions; merely disabling `PERF_METRICS`
would also alter the capture bootstrap and is not automatically a matched pair.

Map cap scope: current standalone maps pass no `maxFps`; embedded maps pass 30.
The cap applies to intermediate rAF paints, while commits still paint immediately.
A future 60 Hz candidate must count both paths and retain immediate repaint.
Virtual-clock tests at 60/144/240 Hz can check scheduling arithmetic, but cannot
stand in for actual high-refresh presentation or compositor measurements.

Remaining plan order: complete and repeat Settings memory checkpoints; run the
hidden drawing probe; implement a drawing change only if measured cost warrants
it; then test lifecycle/show/resize and perform a separate matched acceptance
comparison for that change. High-refresh Map scheduling and real Windows game
presentation remain separate checks.
