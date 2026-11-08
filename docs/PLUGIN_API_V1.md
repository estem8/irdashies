# irDashies Widget Plugin API v1

**Status:** Proposed v1 contract. The `widget-plugins` branch implements the host loader and renderer integration; author SDK packaging and packaged-Electron runtime proof remain open. See [`PLUGIN_WIDGET_ARCHITECTURE.md`](./PLUGIN_WIDGET_ARCHITECTURE.md) for implementation status and phase acceptance criteria.

Plugin authors: start with the [widget plugin development guide](./PLUGIN_WIDGET_DEVELOPMENT.md).
The TypeScript package source lives in `packages/plugin-api`; it is buildable
and packable from a checkout but is not published to npm yet.

## Goal

A widget author builds and distributes a widget package independently of irDashies. A user places the ZIP in the per-user `plugins/` directory; irDashies discovers it on startup and makes the widget available in the normal dashboard UI. Updating a widget does not require rebuilding or reinstalling irDashies.

irDashies remains the host: it owns overlay windows, widget placement and sizing, dashboard persistence, settings UI, visibility, and data delivery. A plugin renders only its widget content in a host-provided slot.

## v1 decisions

- One ZIP package contributes one widget. A later API version may permit multiple widgets per package.
- Plugins render in the existing renderer and do not create windows or load main-process modules. Renderer-global bridges may still be reachable; see the trust boundary below.
- v1 plugins are trusted executable code supplied by the user. Renderer loading is not a security sandbox. Do not present arbitrary community plugins as safe merely because they have a manifest.
- For well-behaved plugins, the host supplies only explicitly declared, approved channel snapshots; v1 does not add a plugin-specific raw IPC or generic channel-bridge API. Because plugins execute in the shared renderer, this is not a security boundary: they can potentially access any capabilities already exposed to renderer code. Treat installed plugins as trusted executable code.
- Plugin settings are declarative and validated by the host. A custom plugin-owned settings React page is out of scope for v1.
- Discovery occurs at application startup. Installing or replacing a ZIP requires an application restart in v1; hot install/HMR is a later developer-experience feature.
- A validated package remains installed from the app's cache; deleting its source ZIP does not uninstall it. A failed replacement leaves the last valid package active. v1 has no uninstall flow.
- The OBS/VR component server delivers plugin manifests over its WebSocket bridge and serves only validated installed entry/styles/assets through a plugin-ID-scoped HTTP route. Network exposure follows the component server's existing bind setting; no arbitrary filesystem paths are served.
- No marketplace, automatic network updates, main-process extensions, or plugin-defined telemetry processors in v1.

## Package layout

The ZIP contains one top-level plugin directory:

```text
weather-widget.zip
└── weather-widget/
    ├── plugin.json
    └── dist/
        ├── index.js
        ├── index.css               # optional, listed in plugin.json
        └── assets/                 # optional images/fonts referenced by CSS
```

`plugin.json` is UTF-8 JSON. `entry` must resolve to a regular file inside the package. Packages must not depend on files outside their own root. `node_modules/`, native binaries, and arbitrary install scripts are not part of v1.

## Manifest

```json
{
  "manifestVersion": 1,
  "id": "author.weather-widget",
  "name": "Weather Widget",
  "version": "1.0.0",
  "apiVersion": 1,
  "entry": "dist/index.js",
  "styles": ["dist/index.css"],
  "widget": {
    "name": "Weather",
    "defaultLayout": { "width": 220, "height": 320 },
    "defaultConfig": {
      "units": "auto",
      "showWind": true
    },
    "settings": [
      {
        "key": "units",
        "type": "select",
        "label": "Units",
        "options": ["auto", "metric", "imperial"]
      },
      {
        "key": "showWind",
        "type": "boolean",
        "label": "Show wind"
      }
    ]
  },
  "requires": {
    "channels": ["session-bar.snapshot", "track-state.snapshot"]
  }
}
```

`defaultConfig` is the single source of default values; settings specs describe controls and constraints, not duplicate defaults.

Settings are data-only declarations. The host renders them with the same
controls and visual patterns used by built-in widget settings; plugins do not
provide custom settings JSX or CSS. Boolean settings use the host's standard
switch. A number with both `min` and `max` uses the host's range slider and
shows its current value; an unbounded number uses a numeric field. `step` sets
the slider increment. Select and text settings use the host's standard fields.
Widget enabled state belongs to the dashboard instance and is controlled by
the host; it is not a plugin config setting.

### Manifest rules

`settings` is a restricted v1 schema for host-rendered controls (`boolean`, `number`, `select`, and `text`). The host validates values against the manifest at load and update boundaries; unsupported schema types reject the manifest.

- `manifestVersion` versions the JSON structure. Unsupported versions reject the package.
- `id` is the stable widget type ID and must be unique among built-in and installed widgets. It must match `^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$` and be at most 128 characters; never derive identity from the ZIP filename. Updating a package keeps the same ID and saved widget configuration.
- `version` is the plugin's SemVer version. `apiVersion` is the integer major version of the host plugin contract. Additive compatible API changes stay on the same major; incompatible changes increment it. A host rejects packages requiring an unsupported API major.
- v1 fixes `entry` to `dist/index.js` and requires it to be a classic UMD/IIFE script. The host derives its global export name from `id`: `IrdashiesPlugin_` + the ID with `.` replaced by `$dot$` and `-` replaced by `$dash$`. Optional `styles` is a list of relative CSS paths; each must resolve to a regular `.css` file inside the package. Absolute paths, traversal, symlinks escaping the package root, duplicate IDs, and malformed manifests reject that package without preventing other plugins from loading.
- `defaultLayout` declares initial width and height. The host chooses the initial position when a user adds the widget. The host continues to control position, scale, and overlay placement.
- `defaultConfig` is authoritative for default values; the host merges it with saved config and validates both saved and updated values against the declared settings schema.
- `requires.channels` lists public snapshot channels only. Every channel must exist in the host's public plugin SDK. Event channels, raw telemetry, and private/internal channels are not available in v1. The host applies its own channel rate cap; a plugin cannot raise it.
- All externally installed widgets appear under the host-owned Plugins menu category in v1. Plugins cannot add arbitrary navigation or menu sections.

The example channel list demonstrates the contract shape, not a complete Weather data contract. The current built-in Weather runtime definition requests `session-bar.snapshot` and `track-state.snapshot`, but a plugin can consume only fields included in the public typed payloads. A dedicated public weather snapshot may be required before migrating the current Weather implementation.

The host's current public channel allowlist is `PUBLIC_PLUGIN_CHANNELS` in
`src/types/plugins.ts`. It contains only snapshot channels; lifecycle events,
race-control event channels, replay context and stream-chat snapshots are not
admitted. This allowlist is the source to keep aligned with the distributable
author SDK when that package is published.

## Runtime entry contract

The plugin entry is a classic UMD/IIFE script, not a native ESM module. The host loads it lazily from the validated package URL and loads its validated CSS URLs on first use. The bundle exports one React component under the global name derived from the manifest ID. The host exposes `window.__IRDASHIES_PLUGIN_HOST__ = { React, jsxRuntime }`; plugin builds externalize `react` and `react/jsx-runtime` to those values so hooks use the host's React instance rather than a duplicate. Plugin styles must be scoped to the widget root to avoid changing the core UI.

The exported React component receives typed props from the versioned SDK:

```ts
import type {
  PublicChannelName,
  PublicChannelPayloads,
} from '@irdashies/plugin-api';

type PluginSnapshots<K extends PublicChannelName> = Partial<{
  [C in K]: PublicChannelPayloads[C];
}>;

interface WidgetProps<Config, Snapshots> {
  widgetId: string;
  config: Readonly<Config>;
  snapshots: Readonly<Snapshots>;
  theme: Readonly<Record<string, string>>;
  preview: boolean;
  onConfigChange(patch: Partial<Config>): void;
}
```

The host currently supplies an empty read-only theme map; theme variables are reserved for a future API addition. `snapshots` contains only channels declared by the manifest and approved by the host. `onConfigChange` accepts a partial patch; the host validates it against the manifest before persisting it. Props and snapshots are read-only inputs.

Example plugin source before bundling:

```tsx
import type { PluginSnapshots, WidgetProps } from '@irdashies/plugin-api';

type WeatherConfig = {
  units: 'auto' | 'metric' | 'imperial';
  showWind: boolean;
};
type WeatherChannels = 'session-bar.snapshot' | 'track-state.snapshot';
type WeatherSnapshots = PluginSnapshots<WeatherChannels>;

export default function WeatherWidget(
  props: WidgetProps<WeatherConfig, WeatherSnapshots>
) {
  return <section />;
}
```

The plugin build must externalize the host React peer modules to `window.__IRDASHIES_PLUGIN_HOST__.React` and `.jsxRuntime` and expose the component under the ID-derived global name. The host must load the script without `eval`, `blob:`, or relaxing the renderer CSP. External file-script loading and the shared React globals must be proven in the Electron renderer before the loader is considered complete. Plugins still execute in the shared renderer and can reach renderer-global bridges; they are trusted code, not sandboxed.

## Host responsibilities

The host must:

1. Read manifests and build a runtime registry that combines built-in and external widgets.
2. Validate package paths, manifest fields, ID conflicts, API compatibility, declared channels, defaults, and settings values.
3. Load widget code lazily; disabled or unused widgets must not execute their entry module.
4. Subscribe only to declared and approved channels while the widget needs data, at rates no higher than the channel registry permits; unsubscribe when it is no longer mounted.
5. Keep dashboard identity and plugin configuration when a plugin is temporarily missing or disabled. Show an unavailable-widget state instead of dropping saved data.
6. Isolate a plugin render failure to that widget host and report the plugin ID and failure through the project logger.
7. Keep package updates atomic: validate and stage the replacement before it becomes active. A failed update must leave the last valid package intact.

ZIP parsing/extraction must reject path traversal, unsafe links, duplicate archive paths, malformed manifests, and packages exceeding configured size/file-count limits. Plugin code remains trusted code after extraction; these checks protect package integrity and filesystem boundaries, not renderer execution.

## Current repository constraints

- `src/frontend/WidgetIndex.tsx` discovers `widget.ts` through build-time `import.meta.glob`; it cannot discover user-installed files.
- `src/types/widgets/index.ts` similarly builds the manifest list at compile time.
- `WidgetConfigMap` and `WidgetId` in `src/types/widgetConfigs.ts` and `src/types/widgetId.ts` describe a compile-time closed set. External IDs/configs need a runtime-validated path without weakening built-in type checking.
- `src/frontend/components/Settings/SettingsLoader.tsx` uses a static widget-to-settings-component map. v1 plugin settings therefore use host-rendered declarative fields.
- `src/frontend/widgetRuntime.tsx` currently provides static channel requirements and rate presets; external plugin declarations must flow through the same host-side admission and channel-rate limits.
- Electron packaging uses ASAR and a restrictive renderer policy. The loader must explicitly support user-data plugin assets; importing arbitrary files by path or relaxing CSP is not an acceptable shortcut.

## Not specified by v1

Package signing, a remote catalog, automatic updates, runtime hot reload, isolated iframe/process execution, custom settings pages, multi-widget packages, plugin-to-plugin dependencies, raw telemetry access, and main-process code. Each requires a separate security and compatibility design.
