# Performance findings: delivery rates, the 60 Hz loop and what costs CPU

Base: `tariknz/irdashies` `main` at `d7e88dad`. Everything here is a branch off
that commit, so each piece can be taken alone. This page is the evidence and
the map; the code is in the branches.

## How it was measured

- Packaged builds on one machine (Ryzen 5 9600X, Windows 11), curated tape
  `ai-race-10min.irdt` through `irsdk_replay.exe`, `PERF_METRICS=1`, 20 s
  warm-up and 120 s measured.
- Two or three runs per side. A full dashboard varies by about 1 percentage
  point of CPU between runs, so differences under that are noise. A single
  widget run (`PERF_WIDGET_TYPES=...`) varies by about 0.02 points, so use those
  for CPU. Counts (renders, deliveries, ticks) are exact either way.
- Not measured: FPS in the live game, other hardware, battery.
- `tools/perf/render-count.mjs` (branch `chore/render-count-tool`) produced the
  render, mount and DOM-mutation numbers. It attaches over DevTools and changes
  nothing in the app.

## Findings

### 1. The channel bus dropped frames

`ChannelBus.queueDelivery` parked a publish that arrived a little before its
slot behind a catch-up timer. The next publish arrived before that timer had
made the slot, so every other frame was delivered.

| Channel (subscribed rate)                            | Delivered / published before |       after |
| ---------------------------------------------------- | ---------------------------: | ----------: |
| `driver-controls` (60 Hz), 60 Hz loop with JS pacing |                  32.8 / 59.3 | 58.3 / 59.3 |
| `radar`, `lap-log` (25 Hz)                           |                  21.1 / 25.0 | 25.0 / 25.0 |
| `track-state` (25 Hz)                                |                  22.1 / 25.0 | 26.0 / 25.0 |
| `car-speeds` (10 Hz)                                 |                   9.2 / 10.0 | 10.0 / 10.0 |

The fix keeps a due time per subscription, delivers a publish that lands within a
quarter of an interval of it, and moves the slot on by one interval from the slot
rather than from the publish. Six specs reproduce the loss (309 of 598 delivered
before the change). **Cost:** subscribers now get their declared rate, which is
more work: about +0.9 points of CPU and +14% commits on the full dashboard (one
comparison, spread about 0.9, so read it as "around a point").

### 2. #804 needs no timer change once the bus delivers

With the bus fix, the JS deadline pacing alone reaches 60 Hz; `timeBeginPeriod(1)`
adds nothing.

| Build                  | ticks/s | `driver-controls` delivered / published | Input renders/s |
| ---------------------- | ------: | --------------------------------------: | --------------: |
| main                   |    39.9 |                             37.8 / 39.9 |             479 |
| JS pacing, old bus     |    59.2 |                             32.8 / 59.3 |             415 |
| native timer, old bus  |    59.7 |                             58.4 / 59.7 |             738 |
| JS pacing + new bus    |    59.3 |                             58.3 / 59.3 |             737 |
| native timer + new bus |    59.7 |                             59.3 / 59.6 |             750 |

With the old bus the extra ticks never reached the renderer; JS pacing alone was
wasted work.

What the 60 Hz path costs, measured on Input and LapTrace alone (two runs per
side, stable to about 0.05 points), `release/perf-findings` against main:

|                                         |        main | F (pacing + bus + row buffer) | release branch |
| --------------------------------------- | ----------: | ----------------------------: | -------------: |
| ticks/s                                 |        37.8 |                          59.4 |           59.4 |
| `driver-controls` delivered / published | 35.5 / 37.8 |                   58.5 / 59.5 |    58.4 / 59.4 |
| App CPU %                               |        1.94 |                          2.13 |           2.12 |
| Main process CPU %                      |        0.32 |                          0.18 |           0.17 |
| Renders/s                               |         458 |                           747 |            747 |

So 57% more ticks and 65% more deliveries cost about +0.2 points of CPU (about
+10%), and the main process gets cheaper. An earlier comparison on the full
dashboard showed about +1.2 points; its run-to-run spread was 0.85, so that
figure is not reliable. The assembled branch behaves like F within noise.

### 3. What costs CPU

Same build, widgets switched on in memory with `PERF_WIDGET_TYPES`:

| Widgets              |  App CPU % |
| -------------------- | ---------: |
| none (empty overlay) |       0.32 |
| Broadcast            |       1.11 |
| Input + LapTrace     |       2.10 |
| full dashboard       | 7.5 to 8.3 |

The overlay itself is almost free; the cost is in the widgets, and the full run
is mostly Input, LapTrace and the rest of the dashboard together.

Capping Input alone (isolated run, 60 Hz loop):

| Input rate | App CPU % | Renders/s | Loop ticks/s |
| ---------- | --------: | --------: | -----------: |
| 60 Hz      |      1.71 |       742 |         59.5 |
| 30 Hz      |      1.13 |       381 |         30.0 |
| 20 Hz      |      0.94 |       254 |         25.0 |

The cost follows the delivered frames almost linearly. The existing
`channelRates` already allow this per widget in code; the "Settings UI exposure"
item in the Phase 3 plan is what a user-facing cap would be. Not in this
release. A LapTrace cap does nothing today: `useLapTraceRecorder` subscribes to
`lap-trace.sample` at a fixed 60 Hz, which is right for recording, so display
and recording rates would have to be separated first.

### 4. What did not matter

These looked promising and did not move CPU beyond run-to-run noise:

- **React render counts.** 22% fewer renders on the full dashboard (Broadcast
  1329 to 546) changed neither commits, DOM mutations nor CPU.
- **DOM mutations.** The Flag LED blink is 35% of all mutations (580 per second at
  4 renders); switching it off changed CPU by +0.4 points, inside the noise.
- Splitting `track-state`, and moving the pipeline to a utility process: channel
  traffic is about 0.45 MB/s and the main process is 0.3 to 0.5% CPU.

So the render and selector branches below are tidying with measured render
reductions, not CPU wins. They are separate so they can be declined.

### 5. Smaller defects found on the way

- Fuel remounted its whole layout five times a second (a component declared
  inside a component), about 35 mounts per second. Fixed with a spec that fails
  without the change.
- `battle` asked for `relative-gaps` at 25 Hz while `RelativeGapProcessor` ticks at
  5 Hz and the widget documents 5 Hz gaps; since #806 it receives 5 either way.
- The `session-bar` processor ticks at 25 Hz for a channel that sends at most 10.
  Listed as a known case in the contract spec; not changed.

## Branches

Every branch is based on `d7e88dad`. `release/perf-findings` merges all of them.

| Branch                             | What                                                                                   | Evidence                                                        | Needs          |
| ---------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------- |
| `perf/telemetry-row-buffer`        | #803: read telemetry through one reusable row buffer                                   | main process CPU 0.50 to 0.26-0.29%, ~20 MB less private memory | native rebuild |
| `perf/telemetry-loop-js-pacing`    | #804: absolute-deadline loop pacing, replaces the timer change                         | 59.3 vs 39.9 ticks/s, no timer resolution change                | the bus fix    |
| `fix/channel-delivery-schedule`    | the bus fix in 1                                                                       | section 1, six specs fail without it                            | none           |
| `test/channel-rate-contract`       | spec for widget, processor and channel rate mismatches; Battle's gaps at 5 Hz explicit | removes a silent mismatch                                       | none           |
| `fix/fuel-layout-remount`          | Fuel layout no longer remounted                                                        | spec fails without it                                           | none           |
| `perf/session-bar-field-selectors` | session-bar items and four widget roots read the fields they show                      | Battle 141 to 57 renders/s, InfoBar 27 to 6; CPU unchanged      | none           |
| `perf/broadcast-memo-rows`         | `memo` on Broadcast rows, badges and arrows                                            | Broadcast 1329 to 546 renders/s; CPU unchanged                  | none           |
| `chore/render-count-tool`          | the measuring tool, `npm run perf:renders`                                             | n/a                                                             | none           |

The native timer branch (`perf/telemetry-loop-timer`) is left as it is. The
tables above suggest it is not needed.

## Taking it

```sh
git remote add estem8 https://github.com/estem8/irdashies
git fetch estem8

git merge estem8/release/perf-findings            # everything
git merge estem8/fix/channel-delivery-schedule    # or one topic at a time
git cherry-pick -x d7e88dad..estem8/fix/fuel-layout-remount
```

A build of any of them: run the "Fork build" workflow in `estem8/irdashies` with the
branch as input, which publishes an unsigned zip as a pre-release.

## Questions for the maintainer

1. #804: is JS pacing plus the bus fix acceptable in place of `timeBeginPeriod`?
2. Battle at 5 Hz for gaps (consistent with the Phase 3 `gapTiming` guidance and the
   widget's own comment), or should `RelativeGapProcessor` tick faster?
3. A user-facing update-rate cap for Input (default 60) under "Settings UI
   exposure"; would a separate display rate for LapTrace be welcome?
