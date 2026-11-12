# End-to-end pipeline code review — 2026-11-12

Source checkpoint: `54542d54`. Read-only application review; no new runtime
experiment. Findings below distinguish code mechanisms from measured impact.
Existing suppression diagnostics localize load but do not estimate the gain of
implementing any candidate.

## Pipeline and priorities

SDK capture → native materialization → JS conversion → lifecycle/processors →
versioned snapshot → per-window channel queue → IPC/preload → selectors →
React/secondary stores → DOM/canvas → Chromium compositor.

| Priority | Boundary                               | Evidence and plausible amplification                                                                                                                                                                                                                                                                                                                                                                                                   | Candidate and discriminating check                                                                                                                                                                                                                                                                           |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | IPC → selectors → derived rows         | `ChannelSnapshotStore.receive` evaluates each due selection independently. Structured-cloned arrays have new identities. Whole-snapshot consumers in `useDriverStandings` and `useDriverPositions` feed many arrays into memo dependencies; unrelated array copies can invalidate derived work. TrackMap already solved its class-position selection locally, not across these consumers.                                              | Stabilize only unchanged selected values under immutable ownership, or separate stable identities from dynamic rows. Count full-grid rebuilds and compare equality cost against eliminated work. Keep real position/flag/roster changes visible.                                                             |
| P1       | Relative identity and row construction | `useDriverPositions.tsx:useDrivers` maps the roster and nested class objects on every render without memoization. Its result is a dependency of the full relative-row rebuild. That rebuild recreates maps for session positions/qualifying, joins all cars and applies rating calculations; `useDriverRelatives` then sorts and slices.                                                                                               | Memoize roster projection by the session-driver reference and split infrequent qualifying/rating work from motion. This is concrete avoidable allocation; its application CPU effect remains unmeasured.                                                                                                     |
| P1       | Independent channel delivery → React   | `ChannelBus.queueDelivery` has a separate deadline/pending slot per channel/window, and each `deliver` sends a separate IPC message. Central stores notify synchronously per received channel; there is no cross-channel application transaction. A consumer depending on several channels can see multiple update opportunities per source frame. Earlier normal pipeline diagnostic observed about 220 deliveries/s for 13 channels. | First measure commits per source update in Standings/Relative. Only if redundant commits dominate, consider snapshot batching. Never coalesce required Input/Lap Trace samples or events, change dependency ordering, or add a blanket frame of latency. Separate tasks do not prove separate React commits. |
| P1       | React commit → canvas → compositor     | `useProgressAnimation` draws on target commits and on appearance commits; `maxFps` limits only intermediate rAF draws. Independent delivery/parent updates can therefore create extra paints outside the cap. Existing traces place significant work downstream, including DOM/compositor interactions.                                                                                                                                | Attribute duplicate commit/rAF paints, then consolidate draws while preserving immediate repaint after canvas reset, size/static-layer changes and interpolation. A global FPS cap alone is not a fix.                                                                                                       |
| P2       | Processor publication                  | `ProcessorHost.publishIfChanged` calls `snapshot()` before checking its token. `SessionBarProcessor.snapshot` copies the object and two arrays even if its version did not change; its `snapshotVersion()` method is not part of the host interface and is unused there. SessionBar also mixes near-static track/session text with moving fuel/wind/clock and broad snapshot subscribers.                                              | Lazy/version-first snapshot materialization and narrow field selectors are candidates. Preserve owned snapshot lifetime and delayed bus sends. This looks smaller than downstream work; do not prioritize by code smell alone.                                                                               |
| P2       | SDK wait and native conversion         | Main loop synchronously calls `waitForData(16)`. Native `GetTelemetryData` visits every variable, recreates metadata strings/objects and copies value buffers; JS converts each variable afterward. Demand adjusts poll rate, but not the set of materialized variables.                                                                                                                                                               | Blocking wait is a responsiveness/latency risk, distinct from busy CPU. Existing live read elapsed time was about 0.6 ms/call; not current native iRacing evidence. Reopen metadata caching/minimal reads or off-thread wait only with native attribution, thread/lifecycle/cancellation checks.             |
| P2       | Renderer fan-out/history/Settings      | Central channel sharing is per renderer, so additional windows repeat selectors, derived models and UI work. Settings preview has its own iframe/runtime. Some global updaters gate on dashboard-wide enabled widgets rather than actual display-local consumers. Gantry intentionally retains session processing while hidden.                                                                                                        | Audit actual demand when choosing a concrete multiwindow/Settings fix. Existing window CPU comparison failed cadence/geometry controls, so it establishes no winning topology. Long private-memory growth has no confirmed allocation owner. Preserve Gantry history.                                        |

## What existing measurements establish

The [pipeline diagnostic](2026-11-11-system-pipeline-attribution.md) kept source,
processor demand and publications active. Mean summed CPU was 643.78 ms/s with
normal work and 180.16 ms/s when central snapshot application was suppressed;
main CPU was 68.98 versus 65.79 ms/s. Suppressing delivery instead gave
173.54 ms/s total. These historical, short, artificial modes prioritize work
after receipt; they do not prove transport is free or promise a 72% optimization.
They also do not represent the current branch's normal CPU after later fixes.

[Renderer attribution](2026-11-11-shared-renderer-attribution.md) associates
substantial compositor work with the DOM group and interactions. Forced logo
promotion was already addressed; wind-wrapper, mask and Input promotion probes
did not establish wins and must not be repeated without new evidence.
[Radar rings caching](2026-11-12-radar-rings.md) is a small local change, with an
observed one-pair gain that does not explain or resolve the systemic load.

## Review conclusion

The leading systemic hypothesis is amplification of dynamic updates through
unstable identities, broad subscriptions, repeated derived-row construction and
multiple paint opportunities. Prioritize eliminating unchanged work near the
renderer ingress/domain boundary, then measure commits/paint and normal total
CPU. Do not start by moving all processing to workers, replacing IPC, lowering
telemetry accuracy or rewriting the renderer. Code inspection identifies causes
of extra work, not their magnitude; use one concrete candidate at a time.

Validation: read current SDK bridge/native materialization, host/registry/bus,
preload, selector store, Standings/Relative domain paths, Map scheduler and
session updater/preview entry points; checked against linked prior evidence.
No application behavior changed and no performance tests were rerun.
