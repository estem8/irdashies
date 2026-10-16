# Game A/B: what the overlay costs iRacing

`npm run perf:run` measures what irDashies itself uses (CPU, renders,
deliveries). It does not show the effect on the game's frame time. This is the
procedure for that, using PresentMon captures of iRacing and
`tools/perf/presentmon-compare.mjs` to compare them.

Needs Windows, a packaged build (the unsigned zip from a "Fork build" release)
and [PresentMon](https://github.com/GameTechDev/PresentMon) 2.x. Run both
PresentMon and the sim as the same user; PresentMon may need an elevated shell.

## Conditions that must not change between runs

- Same car, track, weather and time of day. Best: watch the same stretch of one
  iRacing replay (same session, same start frame) for every run.
- Same resolution, graphics settings, frame cap and monitor refresh.
- Close other overlays and recorders. Let the PC cool down or warm up the same
  way each time; run one throwaway capture first.
- Packaged build, no DevTools open. Do not run `perf:run` or the telemetry
  inspector at the same time.
- Each state at least three times, 90 seconds each, in a mixed order
  (`A B C A B C`), not all of one state in a row.

## States to capture

| Label       | How                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------- |
| `baseline`  | irDashies not running                                                                    |
| `empty`     | irDashies running, every widget disabled in the dashboard (the empty transparent window) |
| `still`     | widgets on, iRacing in the garage or paused replay (no data changing)                    |
| `full`      | your normal dashboard, driving or replaying                                              |
| `full-30hz` | as `full`, with Advanced > Telemetry Rate set to 30 Hz (repeat for 20, 10, 5 if useful)  |
| `<widget>`  | one widget enabled at a time, to find the expensive one                                  |

`full` against `full-30hz` shows what a rate cap would give back. Reset the cap
to "No cap" afterwards; it is kept across restarts.

## Capture

PresentMon 2.x console application (flags checked against its
`README-ConsoleApplication.md`; run `PresentMon.exe --help` to confirm for your
version):

```powershell
.\PresentMon-2.x.x-x64.exe --process_name iRacingSim64DX11.exe `
  --output_file captures\full-1.csv --v2_metrics --no_console_stats `
  --timed 95 --terminate_after_timed --stop_existing_session
```

`--v2_metrics` makes the CSV use `FrameTime`, `CPUBusy` and `GPUBusy`;
`--v1_metrics` gives `MsBetweenPresents` and friends, which the tool also reads.
If you run the DX12 build of the sim, use its executable name instead (the
tool itself picks the process with the most frames, so only the capture needs
the name). The PresentMon Capture GUI writes the same columns to
`%LOCALAPPDATA%\Intel\PresentMon\Capture\pmcap-*.csv`; the tool reads those too.

Start it when the replay or session is already running, and keep the sim in the
foreground. The tool drops the first 5 seconds of every capture (warm-up); 95
seconds of capture leaves 90.

## Compare

```sh
node tools/perf/presentmon-compare.mjs \
  baseline=captures/baseline-1.csv,captures/baseline-2.csv,captures/baseline-3.csv \
  empty=captures/empty-1.csv,captures/empty-2.csv,captures/empty-3.csv \
  full=captures/full-1.csv,captures/full-2.csv,captures/full-3.csv \
  --json captures/result.json
```

The first set is the baseline; every other column shows the change against it.
Each cell is the mean over the runs with the min to max in brackets. Options:
`--process <exe>` (default: the process with the most frames), `--skip-seconds N`.

Read it like this:

- Compare p50, p95 and p99 frame time first. Average FPS is a secondary number.
- `spikes` counts frames longer than twice the median, the visible hitches.
- CPU busy and GPU busy appear when the capture has those columns. Dropped
  frames come from the 1.x `Dropped` column, or from `NA` in 2.x `DisplayedTime`
  (a frame that never reached the screen).
- A change smaller than the min to max spread of the baseline is noise. Say
  "no measurable difference" then, not a percentage.
- `empty` against `baseline` is the cost of the transparent window itself;
  `full` against `empty` is the cost of the widgets.

## If the game gets slower but irDashies looks cheap

The next step is a Windows Performance Recorder trace with GPUView, to see
compositor and GPU scheduling. Do that only when the captures show a
difference that `perf:run` and the Chromium profile cannot explain.

## Results

Record the machine, build (`irdashies-win32-x64-<sha>`), PresentMon version and
the table from the tool for each series. Do not draw conclusions from a single
run or from one machine.
