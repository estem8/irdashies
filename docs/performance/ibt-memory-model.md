# CLI memory diagnostics

There is no IBT Inspector UI. The CLI launches an isolated application with a
hidden controller and a narrow diagnostic preload. The backend is loaded only
when the CLI sets `IRDASHIES_MEMORY_DIAGNOSTICS=1`; normal app startup neither
loads the module nor exposes its IPC API. Original settings are not modified.

Use Node 24+ with repository dependencies and a packaged build of this branch:

```sh
npm run package
npm run perf:ibt-memory -- \
  --app /path/to/packaged/irdashies \
  --profile /path/to/config.json \
  --recording memory-diagnostic.irdt \
  --output /tmp/ibt-memory-run
```

Pass the complete Electron configuration, not a standalone dashboard export.
The recording filename must exist in the normal iRacing telemetry library.
Output must be a new directory. Windows executable/configuration/output paths
are supported; private-memory collection is implemented for Windows and Linux.

The runner processes a warmup (default 5000 frames), then three blocks of
10000 source frames. Every block pauses inside the successful read of its
last frame. Counts are checked against both consumed and delivered frames;
empty polls do not spend the budget. EOF fails the run rather than resetting
its session. Choose smaller blocks or a longer recording if necessary.

At each paused checkpoint, main and every renderer are collected twice, then
private memory and heap usage are sampled. Source counters must remain fixed
and process identities must stay unchanged. Unknown heaps, inaccessible private
memory and stalled sampling fail the measurement rather than becoming zero.
The controller does not inject RAF/mutation observers into product renderers.

For repeatable lifecycle testing, add:

```text
--warmup-frames 10000 --frames 10000 --cycles 5 --repeat-prefix
```

This seeks to zero between captures and waits for its seed frame. It tests
cleanup/reconnects, whereas the default mode tests one continuous session.
Source-frame equality does not imply one UI draw per source frame: existing
channel and display cadences remain unchanged.

`--close-settings` requests Settings close and checks that any surviving hidden
window has removed its independently running demo preview. Hidden process memory
remains measured. Keep Settings open to include that workload, but do not compare
absolute totals across these modes as evidence of a product memory improvement.

`memory.json` contains exact counters, process and heap checkpoints, widget IDs,
configuration and ASAR hashes. Full reports stream to bounded NDJSON files under
`user-data/memory-diagnostics/runs` (64 MiB per capture, at most 32 captures).
Only the latest live sample and at most 32 checkpoints are retained in memory.
The isolated application shuts down on success, failure or cancellation.

This is a retained-memory diagnostic, not a CPU/FPS benchmark. Forced GC and
pauses change timing. `complete: true` means the protocol completed, not that a
leak has been disproven. Compare warmed floors and retaining paths. UI charts,
recording dialogs, PresentMon integration, live recording and saved scenarios
are intentionally absent. No Node inspector CLI port or weakened security fuse
is required.
