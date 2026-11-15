# Developing widgets with recorded telemetry

Use recorded telemetry to exercise the real SDK → processors → channels →
widget pipeline without running iRacing. Use Storybook for controlled visual
states that your recording does not contain.

## Choose a workflow

| Tool               | Best use                                                            | Profile and lifetime                                                    |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| IBT Inspector      | Edit a widget and inspect it interactively in your current overlays | Current app profile; playback stays active when Inspector closes        |
| Replay CLI         | Repeatable smoke runs, bounded stress runs and performance reports  | Isolated copy of a profile; exits and cleans up its owned app processes |
| `irsdk:replay:app` | Interactive looping playback of a full `.irdt` tape                 | Normal app profile; runs until you close the app                        |
| Storybook          | Missing traffic/events, edge cases and visual states                | Story fixtures; does not validate the native pipeline                   |

## Prerequisites

- Use Node.js 24 or newer and install dependencies with `npm ci`.
- Start commands from the repository root. Forge builds the development app;
  native changes require a compatible native addon build. Do not rebuild or
  overwrite an addon while an app process is using it: stop the app first.
- Obtain an actual `.ibt` recording or `.irdt` tape. An iRacing `.rpy` replay
  is not supported input.
- The repository's curated tape is stored in Git LFS. If it contains text
  beginning `version https://git-lfs.github.com/spec/v1`, fetch the binary:

  ```sh
  git lfs pull --include="test-data/telemetry/ai-race-10min.irdt"
  ```

## IBT Inspector

1. Run `npm start` and select the iRacing simulator. Enable and configure the
   widgets you are developing in the current dashboard.
2. Open **Settings → General → Dev Tool**. Enabling it opens Inspector;
   **Open IBT Inspector** reopens the window later.
3. Put an actual `.ibt` file in the telemetry directory displayed in Inspector:
   Electron's Documents directory followed by `iRacing/telemetry`. On Windows,
   Documents may be redirected to OneDrive. Arbitrary external paths and
   symlinks escaping this directory are rejected. Click **Refresh**.
4. Select the recording and **Load speed**, then **Load recording**. Loading
   normalizes the recording and switches the app to a paused replay. Press
   **Play** to begin, **Pause** to freeze the source while inspecting the UI.
   Start at 1× for movement/animation work; `max` is a throughput stress mode.
5. Edit the widget in the development app. Renderer edits use the normal Vite
   development reload flow. If main/native changes restart the app, load the
   recording again. Reload the recording to apply a new load speed.
6. Use **Position (seconds) → Seek** or **Restart** to jump. **Next frame**
   consumes one next source frame while paused, independently of playback speed.
   For a repeatable event, enter A/B times or use **Set A / Set B**, then
   **Loop A–B**. The interval is `[A, B)` and must span at least one declared
   source tick. **Clear loop** returns to ordinary playback. Each jump/loop
   exposes a disconnect/reconnect so histories reset; earlier laps are not
   reconstructed. Seeking, stepping, speed and loop changes are blocked during
   a capture. A loop established before capture can keep repeating during it.
7. **Save scenario** stores one recording name, dashboard profile ID, speed,
   position and active loop under `<userData>/ibt-inspector/scenario.json`.
   **Restore scenario** reloads it paused. No replay starts automatically on
   launch, and a different dashboard profile must be selected before restoring
   its scenario. Saving again replaces the previous scenario.
8. For diagnostics, **Start capture** starts metrics collection and resumes
   playback when paused. **Stop capture** writes the report. Use the report
   folder button to locate `report.json` and `samples.ndjson` under
   `<userData>/ibt-inspector/runs/`. Captures retain the latest ten runs and
   stop at the 64 MiB sample budget or one-hour limit.
9. **Stop replay** restores the previous telemetry source and removes the
   temporary normalized tape. Disabling **Dev Tool** also stops replay.
   Closing only the Inspector window keeps playback/capture running.

**Recording coverage** lists baseline telemetry requirements for enabled widgets:
missing fields are named, present baseline fields are distinguished from
unaudited widgets. This does not prove that values change or that optional
features/session events are supported. CLI JSON/Markdown includes the same
field checks. The current audited set covers Input, Radar, both maps,
Standings, Relative, Fuel, Wind, Weather, Tachometer, Shift Light and Lap Trace.

Charts show CPU/memory by process, live main/renderer V8 heap, event-loop delay,
channel activity and processing sections. Up to 240 chart points are retained;
reopening restores the two latest valid reports. The previous capture overlay
is descriptive: it does not automatically match profiles, source or duration.
The optional GC checkpoint collects attached renderer heaps only; main heap and
OS private memory remain live readings. CDP sampling and Inspector/Settings
contribute overhead. Inspector does not measure renderer draw timing, GPU
engine usage or game FPS.

## Replay CLI

```sh
npm run perf -- --help

# A new/current widget from manifest defaults; no saved config needed.
npm run perf -- replay "/path/to/session.ibt" --profile defaults --widgets input --speed 1 --limit-seconds 10 --check smoke --expect-channels driver-controls.snapshot --require-coverage on --output /tmp/widget-defaults

# A short functional check; deliberately produces an incomplete report.
npm run perf -- replay "/path/to/session.ibt" --widgets input --speed 1 --limit-seconds 10 --output /tmp/widget-smoke

# Use your configured layout and enabled widgets in an isolated copy.
npm run perf -- replay "/path/to/session.ibt" --profile "/path/to/config.json" --widgets saved --speed 1 --output /tmp/widget-profile

# Exercise a full native tape with traffic fields, if available.
npm run perf -- replay test-data/telemetry/ai-race-10min.irdt --widgets standings,relative,input --speed 4 --output /tmp/widget-traffic

# Repeat in the same process to inspect cleanup/reset behavior.
npm run perf -- replay "/path/to/session.ibt" --widgets input --speed max --repeat 3 --memory checkpoints --output /tmp/widget-memory
```

Choose a **new output directory for each run**; an existing `run.json` marker
prevents overwriting a previous run. Without `--output`, results go to
`perf-results/replay-<timestamp>`.

`--profile` accepts the complete app `config.json`, not a dashboard-only JSON.
Without it, the CLI uses `tools/perf/fixtures/reconstructed-ten-widget.json`;
this is a reconstructed workload, not your current dashboard. Widget selection
uses manifest type IDs and only selects widgets already present in that profile:

- `--widgets all` (default): enable all instances present in the profile.
- `--widgets saved`: preserve the enabled selection.
- `--widgets input,standings`: enable instances of those types.

For a new widget, use `--profile defaults` to discover the current manifest
files, or add/configure it in the app and pass that saved profile. The defaults
profile uses manifest layouts/configs; it does not import your app settings.
`all` does not discover missing widgets in an old saved profile. The runner forces
shared display-window mode, disables autostart/network/web-server settings and
writes only its isolated profile. It is not a window-mode comparison tool.

Speeds range from 0.25 to 100 or `max`. Numeric playback preserves source frames
when processing falls behind; achieved wall-time speed can therefore be lower.
`max` removes pacing. `--limit-seconds` is a per-cycle wall-time limit;
`--warmup-seconds` settles the paused app before playback, not a replay warmup.
`--repeat` accepts 1–20; `--memory checkpoints|allocations` requires at least two
cycles. `--settings standings` adds a visible Settings preview workload;
`--collection off` disables the existing periodic metric collection.

### Read the result

- `report.md` / `report.json`: completion, input variables/warnings, consumed
  and SDK-returned frames, source supersession, process CPU and working set,
  processing sections, channel and observed draw counters.
- `console.log`, `metrics.log`, `run.json`, `profile/config.json`: logs and
  reproducibility inputs.
- `overlay-ready.png`: startup readiness screenshot, not proof of animation.
- Memory modes add checkpoint/summary files; allocation mode adds sampling
  artifacts. Forced GC/profiling affects measured time and CPU.

`finished: false` is expected after a time limit. A bounded run may exit zero
while reporting incomplete playback; inspect the report, not only the exit code.
Check source failure/supersession and required channel activity. A mounted widget
wrapper or positive draw count does not prove correct widget behavior. Periodic
counters can include paused startup/drain; CPU endpoints have a separate scope.
The original input is preserved and normalized IBT input is removed on cleanup.

### Enforce regression checks

Checks are opt-in. They are written to `report.json` (`assertions`) and
`report.md`; any failed assertion makes the CLI exit nonzero after cleanup.

- `--check smoke`: require returned SDK frames, a healthy source, zero source
  supersession and mounted selected widgets. A deliberately limited run can pass.
- `--check complete`: smoke checks plus completed playback.
- `--expect-channels driver-controls.snapshot,track-state.snapshot`: require
  positive deliveries for each named channel, not merely processor execution.
- `--require-coverage on`: require known baseline fields for every selected
  widget. Both missing fields and unaudited widgets fail this check.

These checks do not assert pixel correctness, value changes, listener leak
absence or complete event coverage. Keep domain/processor tests for those
behaviors; a positive channel delivery is narrower evidence.

## Interactive looping with a native tape

```sh
npm run irsdk:replay:app -- --input test-data/telemetry/ai-race-10min.irdt --speed 1 --loop
```

This launcher accepts `.irdt` only and uses the normal app profile. It is useful
for sustained UI development with recorded traffic. Unlike the CLI it does not
create an isolated profile or automatically produce a performance report.

## Recording coverage and troubleshooting

IBT files generally describe the player's telemetry and one session-info
snapshot. They do not recreate the full changing shared-memory session or event
history. Inspect the CLI report's `input.variables` and Inspector warnings before
using a recording as evidence for a widget.

- Controls, fuel, player lap data, Wind/Weather can be exercised when their
  fields are present and changing. Display rounding can hide small changes.
- Radar, maps, Standings and Relative need appropriate traffic fields such as
  `CarIdxLapDistPct`, `CarIdxPosition`, `CarIdxEstTime` and camera/focus data.
  The local Ferrari/Nordschleife IBT used during development lacks several of
  these fields and cannot validate traffic behavior.
- Active radio, reconnect/session transitions and incident/event history need
  matching temporal input or live iRacing. Replay deliberately suppresses some
  live-only behavior; use targeted fixtures/Storybook for absent cases.
- **File is not an irDashies telemetry tape:** check for an LFS pointer, wrong
  extension or unsupported recording format.
- **Widgets absent from profile:** use a current full config containing the
  widget's manifest type; do not use an instance ID in `--widgets`.
- **No IBT files:** check the displayed Documents directory and Refresh.
- **Replay source failed:** preserve the displayed native failure reason and
  verify the addon was rebuilt with the current code. Windows runtime source
  initialization still needs native Windows validation; cross-compilation and
  Linux tests alone do not close that acceptance requirement.
- **CLI startup timeout:** inspect `console.log` for Forge/native build errors,
  missing display access or incomplete topology; use `--startup-timeout` up to
  600 seconds if startup compilation is slow.

Use 1× and matched profiles/input for performance comparisons. Accelerated replay
is a stress test; neither tool measures actual simulator presentation. Follow
[the benchmark procedure](PERFORMANCE_BENCHMARKS.md) for optimization claims and
[the active plan](performance/overlay-performance-plan.md) for remaining work.
