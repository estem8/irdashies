# Runtime metadata gap audit — 2026-11-12

B-1 now has explicit window/subscription/instance attribution in new captures.
The short runtime verification passed; R3's original inconclusive verdict and
the unquantified collection overhead remain unchanged. No performance gain is
claimed from this instrumentation change.

The audit compared `perfRunConfig`, startup origin/topology, main interval
reports, renderer reports and ChannelBus counters against Stage B. Missing
fields and their disposition:

| Gap in earlier captures                                                  | New support                                                                                                 | Remaining qualification                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup window ID/PID without WebContents identity or periodic inventory | `runtimeWindows`: BrowserWindow ID, WebContents ID, OS PID, route and native visibility on each main report | Inventory failure omits the field; no zero-filled substitute. Process creation times remain in process samples.                                                                                         |
| Unique enabled widget types hide duplicate instances                     | `scenarioMetadata.configuredWidgetInstances`: enabled ID/type pairs, refreshed with the applied profile     | Configuration is distinct from mounting or visible content.                                                                                                                                             |
| No renderer instance observation                                         | `widgetDomIds` on existing renderer interval samples                                                        | Current DOM wrapper IDs, deduplicated each report; inner widget DOM may add IDs. This is not pixel visibility or proof of active input. Hidden renderers without rAF intervals may have no report.      |
| Main report drops existing renderer/channel counters                     | Interval `rendererPublications` / `rendererDeliveries`, keyed `WebContentsID:channel`                       | Divide deliveries by `intervalMs / 1000` for observed rate; publication and delivery mean different operations. Shared-window counts do not identify an individual widget consumer.                     |
| No effective subscription rate/active state                              | `subscriptions`: renderer ID, channel, effective `rateHz` or `event`, active state                          | Point-in-time demand, not a history of transitions or an observed delivery rate. Hidden snapshot subscriptions can remain registered but inactive.                                                      |
| Preload `process.pid` is namespace-local (`1` in this runtime)           | Existing log IPC adds trusted `osPid`, `webContentsId`, `windowId` from its sender                          | Legacy `pid` is preserved for compatibility; use `osPid` to join OS process samples. Missing/unavailable attribution remains unavailable. Old reports cannot be retroactively repaired from this field. |

The receiving log bridge enriches only enabled renderer perf JSON, retaining
its existing literal log-level allowlist. It creates no new IPC stream or
subscription. Renderer DOM scans, window enumeration and subscription snapshots
occur at the existing report interval; the collection-off path does not run
them. Tests verify sender identity overrides claimed IDs, interval deltas,
subscription rate clamping/hide/removal, unavailable window inventory and
removal of DOM wrappers from later reports.

Destroyed renderer counters are removed from ChannelBus; aggregate channel
counts persist. Current subscription snapshots contain no destroyed targets.
The reporter keeps only the previous counter snapshot, not a window history.
The last partial interval of a destroyed window is not guaranteed to appear
in per-window diagnostics; aggregate counters and explicit process lifetimes
must remain separate evidence. This bounds diagnostic identity retention;
it is not an established cause or fix for the earlier memory growth.

`metadata-runtime-r2 display` completed the existing 180-second isolated
controller, exit 0 and fixed-duration marker. At source checkpoint `ccaa988d`
with the instrumentation diff, the reconstructed ten-widget profile ran on
Linux at 1549×1009 / DPR 1. Twenty-two main intervals after startup+60 seconds
were checked: all subscription IDs join to an actual WebContents; all ten
configured instances match the renderer's DOM IDs; `osPid`/WebContents/window
identity joins agree. Driver-controls delivery is positive in every checked
interval, 58.44–60.00 Hz. This is metadata coverage for the observed windows,
not validation of every source, window topology or lifecycle transition.

The first short capture completed and exposed namespace-local PID `1`; it
motivated the receiving-side identity fix. The second verifies that fix. No
normal matrix, long memory run or window-mode cost comparison was repeated.
Raw captures remain ignored under `perf-results/metadata-runtime-r{1,2}`.
[Bounded evidence](2026-11-12-runtime-metadata.json) records the checked
identities, subscriptions, interval counts/rates and artifact/source hashes.

Unavailable fields remain explicit: Linux Electron private bytes in the normal
report, GPU engine/memory attribution, actual presentation and Windows/iRacing
measurements. The new fields cannot reconstruct those metrics. No per-widget
allocation or callback CPU ownership follows from per-window subscription data.
Additional report work has unquantified overhead; do not subtract an assumed
zero cost or retroactively pass the old gate.

Validation: 95 tests across seven affected metrics/config/log/channel/Gantry
suites passed; TypeScript/ESLint, formatting and whitespace checks accompany
the checkpoint. Runtime reproduction with a fresh ID:

```sh
node tools/perf/capture/window-topology-probe.mjs metadata-runtime-new display
```
