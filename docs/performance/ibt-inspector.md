# IBT Inspector

Enable **App Settings → General → Dev Tool** to open IBT Inspector. The same
settings row can reopen it after the tool window is closed. The option is saved
with the active dashboard and defaults to off for existing profiles.

The tool lists up to 500 `.ibt` files from Electron's Documents directory plus
`iRacing/telemetry`. On a typical Windows installation this is
`C:\Users\<user>\Documents\iRacing\telemetry`; redirected Documents folders are
resolved by Electron. Missing folders show an empty list. Refresh after recording
new telemetry. File access errors are displayed separately.

Select a recording and load speed, then **Load recording**. Loading normalizes
IBT into a temporary tape and seeds it paused. **Play/Pause** controls the current
recording. Numeric speed preserves source frames if processing falls behind;
**Maximum throughput** removes pacing and is a stress test. Changing Load speed
applies to the next load.

Playback uses the current profile's overlays and their ordinary channel demand,
rate limits and visibility behavior. It temporarily overrides the simulator/demo
source. **Stop replay** restores the previous source preferences. Closing only
the inspector window leaves replay running. Disabling Dev Tool stops replay,
finishes capture and removes normalized input. The original IBT is read-only.

**Start capture** starts playback if paused and records existing periodic main
performance reports. **Stop capture** saves `report.json` and `samples.ndjson`;
**Show report** reveals the summary file in the system file manager. Captures also
finish at the end of the source, on Stop replay, tool disable or app shutdown.

Reports are stored under the app's user-data directory in
`ibt-inspector/runs/<run>/`. The tool retains the ten most recent runs and limits
each to 64 MiB of samples or one hour. Slow/unwritable disks stop capture with an
error rather than growing an unbounded write queue. Source normalization is
streamed and temporary input is removed on stop/load failure.

The summary records source counters, processing wall-time totals, valid sampled
application CPU rates and maximum observed working set. Raw periodic samples
also contain channel publications/deliveries and per-process observations.
Unknown CPU stays null when no valid resource sample exists. Main reports span
interval boundaries; Settings/Inspector work is included. These are descriptive
observations, not an isolated overlay benchmark. No renderer draw timings,
private memory, GPU engine utilization or game presentation/FPS are measured by
this capture mode.

IBT supplies one session snapshot and the telemetry fields present in that file.
Traffic arrays, radio and incident/lifecycle data may be absent. SDK frame counts
do not prove one draw per sample, nor full widget coverage. Input warnings are
shown in the tool and saved with the report.

The main process validates file names, speeds and transport commands. Resolved
IBT files must stay inside the telemetry directory. Source changes serialize
through the existing SDK setup queue and use the existing lifecycle/channels.
The CLI importer delegates to the same application-owned IBT normalizer.

Current verification evidence and remaining platform limits are recorded in
[the performance plan](overlay-performance-plan.md), task INSPECTOR-1.
