# irDashies Architecture Rules — for LLM Coding Agents

> **Purpose:** Current hard rules for any contributor (human or LLM) working in this codebase. The historical review that informed them is archived in [`archive/architecture-2026/`](./archive/architecture-2026/). When this file conflicts with general LLM training intuitions or with `AGENTS.md`, **this file wins for architecture concerns.**
>
> **How to use:** Before opening a PR, scan the relevant section, then run the [Pre-PR Checklist](#pre-pr-checklist) at the end. These are project requirements, not a claim that every legacy path already complies. Searches are review aids, not proof of runtime correctness or performance. Report relevant deviations; do not expand an unrelated change into a repository-wide refactor.

---

## 0. The non-negotiable invariants

These four rules cause real damage when broken. Verify them on every change.

| ID     | Rule                                                                                                                              | Quick check                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **N1** | No synchronous `fs.*Sync` outside startup. Use `fs.promises.*` and debounce writes.                                               | `grep -rn "writeFileSync\|readFileSync" src/app` excluding startup paths         |
| **N2** | The frontend never imports from `src/app/`. Type-only imports are also forbidden — use `src/types/` instead.                      | `grep -rn "from.*['\"]\.\./.*app/\|from.*['\"]@.*app/" src/frontend`             |
| **N3** | A widget folder never imports from another widget folder. Shared logic lives in `src/frontend/domain/` or behind a typed channel. | `grep -rn "from.*components/" src/frontend/components/<X>` for any pair `(X, Y)` |
| **N4** | No raw `ipcMain.handle` arg is dispatched to a method name, file path, or process flag without an allowlist.                      | Review every `ipcMain.handle` and `ipcMain.on` body                              |

---

## 1. Layered Architecture

Frontend and main-process dependencies are separate. Imports flow downward
within each side, subject to the more specific rules below. Both sides may
import the shared `src/types/` contracts; the frontend never imports `src/app/`.

```
Frontend                              Main process
  components/<Widget>/                  bridge/
  domain/                               processors/
  context/                              sessionLifecycle/
  utils/                                storage/
                                        irsdk/ → irsdk/native/

Shared leaf: src/types/ (contracts and main-safe pure data/helpers)
```

### Rules

- **R1.1** Internal project imports in frontend code follow the frontend/shared layers above. Widgets consume shared contracts, utilities, context and domain APIs through the project aliases, or their own folder. This is not a ban on third-party imports such as React or Phosphor. Existing shared presentation components are not sibling widgets; do not introduce cross-widget dependencies through them.
- **R1.2** Widget folder `<X>` may not `from '../<Y>/...'` for any other widget `<Y>`. If you need shared logic, hoist to `frontend/domain/`.
- **R1.3** Storage modules must not import from `bridge` or `processors`. Main-process composition code wires persistence to its consumers; the diagram does not override processor I/O restrictions in R5.4.
- **R1.4** Native addon code is closed; no upward imports. Anything the JS layer needs must be exposed through the existing N-API surface.
- **R1.5** `src/types/` must not import from `src/app/` or `src/frontend/`. It is leaves-only.

**Enforcement:** add `eslint-plugin-boundaries` rules. Until then, reviewers/LLMs grep for cross-layer imports before merging.

---

## 2. Telemetry rules

### 2.1 Subscribing to telemetry

Prefer existing typed channel/domain APIs. The raw-hook rules below apply
where raw telemetry is already required; they do not justify reintroducing
the legacy telemetry firehose into a channel-based widget.

- **R2.1** Float arrays from `CarIdx*` MUST be subscribed via `useTelemetryValuesRounded(key, precision)`, never `useTelemetryValues(key)` — unless the key is on the **No-round list** below.
- **R2.2** Display subscriptions to continuous scalar floats (for example `LapDistPct`) use `useTelemetryValueRounded(key, precision)` unless the signal is on the no-round list. No-round inputs, including `SessionTime`, retain full precision and required sample cadence. Boolean/integer/string subscriptions do not need rounding. These hooks filter notifications; they do not round or replace stored raw telemetry.
- **R2.3** A telemetry side-effect/updater should subscribe through the existing typed channel/store updater rather than rerendering React solely to run an effect. Use `useTelemetryStore.subscribe` only for an actual legacy raw-telemetry consumer. Preserve every sample needed for history, crossings or calculations.

### 2.2 Telemetry precision

| Use case                                       | Hook                        | Precision |
| ---------------------------------------------- | --------------------------- | --------- |
| Track-map position                             | `useTelemetryValuesRounded` | 3dp       |
| Position sorting (Standings)                   | `useTelemetryValuesRounded` | 3dp       |
| Time delta display (0.1 s)                     | `useTelemetryValuesRounded` | 2dp       |
| Reference-lap interpolation                    | `useTelemetryValuesRounded` | 4dp       |
| Throttle / Brake / Clutch / SteeringWheelAngle | `useTelemetryValues`        | —         |
| `CarSpeedsProcessor` inputs                    | full precision              | —         |
| `FuelLevel` / `SessionTime` thresholds         | `useTelemetryValues`        | —         |

### 2.3 No-round list (do not round, ever)

`Throttle`, `Brake`, `Clutch`, `SteeringWheelAngle`, `FuelLevel`, `FuelLevelPct`, `SessionTime`, anything fed into `CarSpeedsProcessor`, anything fed into a fuel-projection threshold.

**Enforcement:** review `rg -n "useTelemetryValues\(['\"]CarIdx" src/frontend` against the signal type and purpose. Integer/boolean arrays and documented full-precision inputs are valid; the search alone cannot classify them.

---

## 3. Stores and Session Lifecycle

### 3.1 Stores

- **R3.1** New renderer stores that hold session-derived state MUST be added to the centralized disconnect reset in `useResetOnDisconnect`. If they also need session-number or driver lifecycle handling, consume the existing typed lifecycle/snapshot source instead of creating another global event source.
- **R3.2** A store that grows unboundedly (history, recorded laps, per-driver maps) MUST cap itself or clear on `sessionNumChange`. Document the cap in the store file.
- **R3.3** Stores live in `src/frontend/context/<StoreName>/`. Their updaters live in the same folder, not in `OverlayContainer/` or anywhere else.
- **R3.4** A store exposes its data via a typed hook (`use<Thing>Snapshot()`); selectors that other widgets consume live in `frontend/domain/`, not in a sibling widget folder.

### 3.2 Session lifecycle

- **R3.5** There is exactly one main-process `sessionLifecycle` source in `src/app/sessionLifecycle/`. Renderers consume lifecycle state through the existing typed channel and snapshot hooks.
- **R3.6** Code that aggregates over time must preserve the existing distinction between live, mock, and replay sources and must handle replay resets or scrubbing explicitly.

---

## 4. IPC, Bridges, and Channels

### 4.1 Bridge definition

- **R4.1** New bridges are defined via `defineBridge<I>(channel, impl)`. Hand-rolled `contextBridge.exposeInMainWorld` blocks are forbidden in new code.
- **R4.2** Do not keep unscoped cross-window subscriber callback sets. Typed channels use `ChannelBus`/`setupChannelBridge`; other subscription bridges use `defineRendererSubscriptionBridge`/`RendererSubscriptionRegistry` with disposal. The `defineBridge` function only exposes a typed preload API; it does not itself register subscribers or clean them up.
- **R4.3** Every IPC handler (`ipcMain.handle`, `ipcMain.on`) MUST validate input. Specifically:
  - String arguments that select a method/property name → check against an explicit allowlist (e.g. `['debug','info','warn','error']`).
  - Path arguments → resolved against an allowed-base prefix and reject any traversal (`..`, absolute paths outside the prefix).
  - Anything that becomes a Chromium switch, environment variable, or shell argument → allowlist by name.

### 4.2 Channels

- **R4.4** New telemetry/session-derived streaming data goes over **named typed channels**, not the legacy `'telemetry'` firehose. Command/query RPCs use typed bridges and validated IPC; they do not need artificial telemetry processors. Each telemetry channel has:
  - A typed snapshot or event payload in the shared contracts, normally `src/types/channels/`.
  - A processor in `src/app/processors/` that owns it.
  - A renderer hook `use<Name>Snapshot()` in `src/frontend/context/`.
- **R4.5** A channel snapshot MUST be the minimum payload the consumers need. Do not re-broadcast the full telemetry shape inside a "convenience" channel.
- **R4.6** Channel subscriptions are per-window. Destroyed targets are removed; hidden windows normally do not receive broadcasts. Use the existing bridge's visibility/lifecycle handling, which reads the owning `BrowserWindow` via `BrowserWindow.fromWebContents(sender)?.isVisible()`, plus the per-window subscription map.
  - **Exception: the enabled Gantry.** It has to hold the whole session (standings, lap history, fuel, incidents, session names) whether it is on screen, minimised or closed, so it receives every channel and `sessionData` regardless of visibility (`setupChannelBridge`'s `isAlwaysFed`, `OverlayManager.isGantryWebContents`). Closing it while the widget is enabled hides the window rather than destroying it. Do not extend this exception to other windows.

---

## 5. Processors (main-process derived telemetry)

- **R5.1** A `TelemetryProcessor` is a class implementing:
  ```ts
  interface TelemetryProcessor<S, Channel extends string = string> {
    readonly channel: Channel;
    readonly tickRateHz: number | 'event'; // 'event': host does not throttle onFrame
    init(session: Session): void;
    onFrame(frame: Telemetry): void;
    onLifecycle(event: SessionLifecycleEvent): void;
    snapshot(): S;
    dispose?(): void;
  }
  ```
- **R5.2** Processors MUST be deterministic given a sequence of frames + lifecycle events. They are unit-tested with recorded fixtures in `src/app/processors/<Name>.spec.ts`.
- **R5.3** A processor declares the cadence needed for correct processing. Typical choices are `60` for controls/co-sampled recordings, `25` for positional data and `5` for sortable data; these are defaults, not an exhaustive whitelist. In the current host, `'event'` processors still see every incoming frame while demanded; publication is change/version driven. Processing cadence is distinct from channel delivery limits. Do not lower it merely because the UI displays fewer updates.
- **R5.4** Processors do not perform I/O (storage, logging beyond `logger.warn`/`error`, network). Pull dependencies through a constructor-injected interface so tests can stub them.

---

## 6. Storage and Persistence

- **R6.1** All disk I/O in `src/app/storage/` MUST be async. `writeFileSync` / `readFileSync` are forbidden in new code.
- **R6.2** Writes are debounced (default 250 ms). The debouncer flushes on `app.before-quit`.
- **R6.3** Any persisted collection that grows over time MUST declare a cap (count, size, or age) and prune on save.
- **R6.4** Read errors return a typed safe default and call `logger.warn` with the path and error. They never throw to the bridge.

---

## 7. Widgets

### 7.1 Adding a widget

Follow the repository's widget checklist in `AGENTS.md`. Widgets are
auto-discovered with `import.meta.glob`: a main-safe manifest in
`src/types/widgets/<id>.ts` (name, menu label, default layout and config) and
a `widget.ts` in the widget's component folder (id and component). The old
central lists (`WIDGET_MAP`, `WIDGET_NAMES`, `widgetItems`, `defaultDashboard`)
are derived from these. Only the settings section still needs one line in
`WIDGET_SETTINGS`.

### 7.2 Widget rules

- **R7.1** Widgets are pure consumers. They subscribe to channel snapshots and selectors from `frontend/domain/`. They do not derive cross-widget data themselves. Register new widgets through the manifest and `widget.ts` described in `AGENTS.md`.
- **R7.2** Heavy memoised components need stable props. Prefer primitives; stable object/array references selected or memoised upstream are also valid. Avoid freshly allocated equivalent props on every tick. A custom `propsAreEqual` is an option when measured and correct, not a requirement for every object prop or a reason to introduce deep comparison.
- **R7.3** UI text is plain strings. **Never use emojis** — use Phosphor icons (`@phosphor-icons/react`).
- **R7.4** Styling is Tailwind-only. No custom CSS unless theme-level.
- **R7.5** Every widget has a `.stories.tsx` decorated with `TelemetryDecorator()` or the appropriate channel-snapshot decorator.

---

## 8. Settings and Migration

- **R8.1** Additive settings changes update the widget type and its manifest's default `config` in `src/types/widgets/<id>.ts`; `deepMergeConfig` fills missing fields when dashboards load.
- **R8.2** Breaking changes (rename, retype, or remove) require an explicit, tested migration at the dashboard-load boundary. Keep a migration close to the storage code unless the project adopts a shared registry later.
- **R8.3** Treat persisted dashboard data as untrusted. Migrations and merge logic must validate shapes and fall back to typed defaults when values are incompatible.
- **R8.4** Do not introduce a settings-version or migrator framework as incidental work. That was an unimplemented Phase 2b proposal and requires its own design and migration plan.

---

## 9. Profiles

- **R9.1** Code that needs the active dashboard MUST resolve the profile via `getCurrentProfileId()` and `getDashboard(profileId)`.
- **R9.2** `'default'` is the canonical built-in profile and may be used for creation, fallback, deletion protection, and explicitly global/default-backed settings. Do not use it accidentally where the active profile is intended.

---

## 10. Native code (`src/app/irsdk/native/`)

- **R10.1** Every pointer returned by `irsdk_*` functions MUST be null-checked before dereference. `irsdk_getVarHeaderEntry` returns NULL for invalid indices and pre-init state.
- **R10.2** Every JS-supplied index MUST be range-checked against `header->numVars` before use.
- **R10.3** Every N-API method that reads `info[N]` MUST verify `info.Length() > N` and `info[N].IsNumber()` (or appropriate type) before extracting.
- **R10.4** `_GENERATED_telemetry.ts` is generated by `src/app/irsdk/native/scripts/generate-var-types.js`. After changing native telemetry variables, run that generator directly and commit the result. There is currently no package script or CI freshness guard.

---

## 11. Logging and Errors

- **R11.1** Direct `console.log` / `console.warn` / `console.error` are forbidden (ESLint enforces `no-console`). Use the project logger.
- **R11.2** `logger[level]` calls MUST use a literal level (`logger.warn(...)`), never `logger[dynamicVar](...)`.
- **R11.3** `process.on('uncaughtException')` and `process.on('unhandledRejection')` MUST be registered in `src/main.ts` and forward to the logger and analytics.
- **R11.4** Logged messages MUST NOT include user-identifiable file paths verbatim if the entry will be forwarded to analytics. Strip `app.getPath('userData')` and `os.homedir()` prefixes before logging.

---

## 12. Security

- **R12.1** New `BrowserWindow` instances rely on Electron secure defaults. Do not set `nodeIntegration: true`, `contextIsolation: false`, `sandbox: false`, or `webSecurity: false`. If you must, the PR description explains why.
- **R12.2** Every new window registers `webContents.setWindowOpenHandler(() => ({ action: 'deny' }))` and `webContents.on('will-navigate', e => e.preventDefault())`.
- **R12.3** Renderer-supplied input that influences next launch (Chromium switches, environment, file system writes) is allowlisted by name. No free-form passthrough.
- **R12.4** Production renderers MUST have an explicitly reviewed CSP, with `script-src 'self'` and narrowly enumerated connections, normally `'self'` and the configured local websocket origin. Any additional source needs a feature-specific justification, not a blanket wildcard. Keep Vite/Storybook development exceptions separate. Verify each entry point; this requirement does not establish that every existing HTML entry already supplies that policy.

---

## 13. Performance hygiene

- **R13.1** Instrument new significant high-frequency work at a meaningful pipeline/draw boundary using the existing `perfMetrics` APIs. Reuse an existing enclosing span for small leaf helpers; do not add a timer or IPC report per element merely to satisfy this rule. Keep callbacks/buffers bounded, preserve the disabled fast path, and account for profiling overhead in the benchmark.
- **R13.2** Avoidable per-frame allocations in processing/drawing hot paths require a benchmark before accepting them. Reuse processor/drawing buffers only under their existing ownership, versioning and serialization contracts. Do not mutate renderer-store snapshots, selected arrays or React props to preserve references. Ordinary React element construction is not by itself a violation of this rule.
- **R13.3** A new widget MUST be checked with React DevTools Profiler at full grid before merge. Cell-component re-renders per second are documented in the PR description.
- **R13.4** Do not add promotion hints (`translateZ(0)`, `transform-gpu`, permanent `will-change`) to repeated static sprites, icons or rows merely on the assumption that GPU promotion is faster. When changing this behavior, measure the representative full-grid workload: inspect layer count, total application CPU and available memory metrics, plus image quality at supported widget scales/DPR. Promotion can be beneficial; hints do not guarantee a layer, and fewer layers alone do not prove a win. This is not a blanket ban or a demand to rewrite untouched legacy uses.
- **R13.5** For visual motion that does not need to reflow surrounding content, prefer `transform`/`opacity` to animating `top`, `left`, `width` or `height`. Preserve geometry, interpolation, transition suppression and hide/show behavior; verify resizing, widget scale and DPR. A transform or a compositing-warning fix is a candidate, not proof of lower total cost.
- **R13.6** Separate performance diagnosis from acceptance. Microbenchmarks, React render duration, trace spans and modes that suppress delivery/rendering cannot establish an application-wide improvement. Validate claims with matched, repeated, normal-operation A/B runs following [PERFORMANCE_BENCHMARKS.md](PERFORMANCE_BENCHMARKS.md), retaining required samples, precision, event ordering and lifecycle behavior. If evidence is missing or confounded, label the change experimental/unverified. Claim game FPS/frame-time improvements only from actual simulator presentation evidence.

---

## 14. Testing

- **R14.1** New processors MUST ship with a `*.spec.ts` driving recorded frame sequences through `init` → `onFrame*` → `snapshot` and asserting the snapshot.
- **R14.2** New domain selectors (`frontend/domain/`) MUST ship with `*.spec.ts(x)` covering their pure logic.
- **R14.3** Widget components MUST ship with `.stories.tsx`. Visual regression is verified in Storybook.

---

## Pre-PR Checklist

Run through this list before opening any PR. LLM agents: include a filled copy in the PR description.

```
[ ] N1 — no new fs.*Sync outside startup
[ ] N2 — no new frontend → src/app/ imports (including type-only)
[ ] N3 — no new cross-widget imports (`components/<X>/` → `components/<Y>/`)
[ ] N4 — every new ipcMain handler validates renderer input
[ ] R2.1/R2.2 — telemetry hooks use the rounded variants (or the key is on the no-round list)
[ ] R3.1 — new session-derived renderer stores participate in centralized reset/lifecycle handling
[ ] R4.1 — new bridges use defineBridge
[ ] R6.1 — new storage code is async
[ ] R7.1 — new widget is added through the manifest, `widget.ts` and `WIDGET_SETTINGS` flow
[ ] R8.1/R8.2 — settings defaults are updated; breaking changes ship a tested load-time migration
[ ] R10.1 — native code null-checks pointers and bounds-checks indices
[ ] R11.1 — logging uses the project logger and literal level names
[ ] R13.1 — high-frequency code is wrapped in perfMetrics
[ ] R13.4/R13.5 — repeated static layers and motion costs are justified; visual geometry, scaling and lifecycle behavior are preserved
[ ] R13.6 — performance claims have matched normal-operation evidence; diagnostic suppression and missing gates are explicitly identified
[ ] R14.1 — new processors and selectors have *.spec.ts coverage
[ ] Storybook story exists for any new visual component
[ ] PR description includes: architecture impact (affected rules/layers, or "None") and before/after perf numbers if hot-path
```

---

## Forbidden patterns — quick reference

```ts
// FORBIDDEN — sync I/O on main process
fs.writeFileSync(path, JSON.stringify(data));
fs.readFileSync(path, 'utf8');

// FORBIDDEN — frontend importing from app
import { something } from '../../app/foo';
import type { X } from '../../app/foo'; // also forbidden — use src/types/

// FORBIDDEN — cross-widget import
import { useDriverStandings } from '../Standings/hooks/useDriverStandings';

// FORBIDDEN — raw telemetry float-array subscription
const positions = useTelemetryValues('CarIdxLapDistPct');

// FORBIDDEN — dynamic logger level dispatch
logger[level](message);

// FORBIDDEN — IPC arg flowing into a method/path/flag without an allowlist
ipcMain.handle('do-thing', (_e, name) => api[name]());
ipcMain.handle('save-flags', (_e, raw) => writeFlags(raw)); // see chromiumFlags

// FORBIDDEN — new store inventing another global lifecycle source
const mySessionEvents = new EventEmitter();

// FORBIDDEN — hand-rolled bridge expose in new code
contextBridge.exposeInMainWorld('myBridge', { foo, bar });
```

## Required patterns — quick reference

```ts
// REQUIRED — async + debounced storage write
import { promises as fsp } from 'node:fs';
import { debounce } from '@irdashies/utils/debounce';
export const saveData = debounce(async (data) => {
  await fsp.writeFile(path, JSON.stringify(data), 'utf8');
}, 250);

// REQUIRED — rounded telemetry subscription
const positions = useTelemetryValuesRounded('CarIdxLapDistPct', 3);

// REQUIRED — renderer store participates in centralized disconnect reset
if (prevRunning.current && !running) {
  useMyStore.getState().reset();
}

// REQUIRED — bridge via defineBridge with input validation
defineBridge<LogBridge>('logBridge', {
  log: (level, ...args) => {
    ipcRenderer.send('log', level, ...args);
  },
});
// Validation belongs at the main-process trust boundary.
ipcMain.on('log', (_event, level: unknown, ...args: unknown[]) => {
  switch (level) {
    case 'debug':
      logger.debug(...args);
      break;
    case 'info':
      logger.info(...args);
      break;
    case 'warn':
      logger.warn(...args);
      break;
    case 'error':
      logger.error(...args);
      break;
  }
});

// REQUIRED — channel-based cross-process data flow
class FuelProjectionProcessor implements TelemetryProcessor<FuelProjectionSnapshot> {
  readonly channel = 'fuel.projection';
  readonly tickRateHz = 5;
  // init / onFrame / onLifecycle / snapshot
}

// REQUIRED — widget registration: manifest + widget.ts (see AGENTS.md)
// src/types/widgets/mywidget.ts
export default defineWidgetManifest({
  id: 'mywidget',
  name: 'My Widget',
  enabled: false,
  layout,
  config,
});
// src/frontend/components/MyWidget/widget.ts
import { lazyWidget } from '@irdashies/domain/lazyWidget';
import type { WidgetModule } from '@irdashies/domain';
export default {
  id: 'mywidget',
  component: lazyWidget(() =>
    import('./MyWidget').then((module) => ({ default: module.MyWidget }))
  ),
} satisfies WidgetModule;
```
