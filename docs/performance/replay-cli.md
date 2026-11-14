# Overlay replay CLI

Use a Node 24+ development checkout with dependencies installed, a graphical
desktop and a working native build (`npm run irsdk:build`). The CLI starts real,
visible overlays through Electron Forge. It is a developer diagnostic.

```sh
npm run perf -- replay /path/session.ibt --speed 1
npm run perf -- replay /path/session.ibt --speed 4 --widgets saved
npm run perf -- replay /path/capture.irdt --speed max --widgets standings,input,map
npm run perf -- replay /path/capture.irdt --limit-seconds 10 --output perf-results/short
npm run perf -- --help
```

Numeric speed accepts 0.25–100. Frame-by-frame playback preserves source frames
even when processing falls behind the requested clock. `max` removes source
pacing and measures SDK/processing throughput. Both yield to Electron work;
neither promises a renderer update for each source sample. Ordinary live and
tape playback retain their existing behavior unless the frame-by-frame option
is enabled.

Without `--profile`, the command copies the bundled reconstructed profile.
`--widgets all` enables its 35 widget types; `saved` retains its enabled subset.
A comma-separated list selects types present in the profile.
`--profile /path/config.json` uses that file's active dashboard and defines its
own available widget selection. The normal application profile is not written.
Networking, auto-start and analytics are disabled in the isolated copy. The
runner uses display window mode.

Preparation streams IBT frames into a temporary `.irdt`, preserving frame bytes.
Source timing follows the declared IBT tick rate. IBT contains one session
snapshot, not the sequence of lifecycle/session events from a live capture.
Missing traffic, radio, incident or external-service inputs leave corresponding
behavior untested. `.irdt` input reuses the existing reader/transport and retains
recorded session changes.

Startup seeds one source frame while paused. The runner checks debugger
ownership, a complete topology marker for its run, and the paused native
transport before settling for `--warmup-seconds` (default 2). This is paused
startup warmup. Reports count the seed separately. `--startup-timeout` defaults
to 120 seconds. `--limit-seconds` bounds playback wall time, excluding
preparation, build, startup, paused warmup and shutdown. A limited run produces
an incomplete report, with a successful exit when capture and cleanup succeed.
SIGINT/SIGTERM abort with a nonzero exit and clean up the owned application.
Startup and cleanup failures also return nonzero; diagnostic logs can remain
without a report.

Each run requires a fresh output marker and leaves `run.json`, `profile/`,
`console.log`, `metrics.log`, `overlay-ready.png`, `report.json` and `report.md`.
Report parsing has a 64 MiB console-log budget; longer captures must use
`--limit-seconds` or split input. Exceeding the budget fails with retained logs.
The normalized IBT tape is removed on success or failure. The caller's `.irdt`
is never removed. Captures and screenshots remain ignored and uncommitted.

The report separates source consumption, SDK-returned frames and superseded
frames. SDK frame preservation does not establish delivery of every processor
output: processor cadence and snapshot rate limits/coalescing still apply.
Section totals are wall time (including SDK wait), not CPU time.
Periodic main/channel/draw observations include startup, paused warmup, playback
and drain; they are not exact playback-only counters. CPU uses playback
endpoints matched by PID and creation time; process churn makes aggregate
coverage unavailable. Working set is not private memory. GPU engine utilization
and game presentation/FPS are unavailable. Short runs include control RPC and
monitoring overhead.

DOM wrappers and the Gantry page are observed separately from named draw
counters. Presence does not prove rendering, visibility or activity. A fast max
run can finish without a named draw sample. One run cannot establish a
performance improvement, smoothness or a leak.

Public helper entrypoints:

- `tools/perf/replay/ibt.ts`: `importIbt`, bounded streaming normalization.
- `tools/perf/replay/input.ts`: `prepareReplayInput`, IBT/tape adaptation.
- `tools/perf/replay/options.ts`: `parseReplayOptions`, shared CLI options.
- `tools/perf/replay/runner.ts`: `runOverlayReplay(options, signal?)`.
- `tools/perf/replay/report.ts`: `createReplayReport`, `replayReportMarkdown`.

The Windows npm launch/taskkill fallback is implemented but unvalidated on
Windows. Linux smoke evidence and task status live in
[the active performance plan](overlay-performance-plan.md).
