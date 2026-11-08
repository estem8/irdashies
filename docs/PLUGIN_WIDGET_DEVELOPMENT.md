# Widget plugin development guide

This guide describes the v1 package format accepted by irDashies. Plugins are
trusted JavaScript that runs in the app's shared renderer. A valid manifest,
channel declaration, and ZIP check do not sandbox plugin code. Install only
plugins whose source you trust.

## Current SDK status

The API package source is in `packages/plugin-api`. It builds standalone
JavaScript helpers and TypeScript declarations, but is not published to npm
yet. Build it from a checkout of the repository before using it:

```sh
npm --prefix packages/plugin-api run build
```

In a plugin project, install the local package after building it:

```sh
npm install /path/to/irdashies/packages/plugin-api
```

The snapshot payload types currently expose stable named fields for the sample
channels and keep other fields structural/unknown for forward compatibility.
More per-channel field guarantees require versioned API review before release.

## Package shape

One ZIP installs one widget. It must contain exactly one top-level directory:

```text
weather-widget.zip
└── weather-widget/
    ├── plugin.json
    └── dist/
        ├── index.js
        ├── index.css       # optional; list it in plugin.json
        └── assets/         # optional images/fonts referenced by CSS
```

The entry is a classic IIFE/UMD JavaScript bundle. It is not native ESM and
must not import files outside its package. Do not include `node_modules`,
native binaries, or install scripts. Put only runtime assets required by the
widget in `dist/`.

## Manifest

```json
{
  "manifestVersion": 1,
  "id": "author.weather-widget",
  "name": "Weather Widget package",
  "version": "1.0.0",
  "apiVersion": 1,
  "entry": "dist/index.js",
  "styles": ["dist/index.css"],
  "widget": {
    "name": "Weather",
    "defaultLayout": { "width": 220, "height": 180 },
    "defaultConfig": { "units": "metric" },
    "settings": [
      {
        "key": "units",
        "type": "select",
        "label": "Units",
        "options": ["metric", "imperial"]
      }
    ]
  },
  "requires": { "channels": ["session-bar.snapshot"] }
}
```

`id` is stable across updates, lowercase, namespaced, and at most 128
characters. The package filename does not set identity. `defaultConfig` owns
all defaults; each setting key must exist there. Settings support `boolean`,
`number`, `select`, and `text`. Values and patches are validated by the host.
The host renders boolean settings as the standard irDashies switch. A number
with `min` and `max` is rendered as a range slider; use `step` for its
increment. A number without both bounds is rendered as a numeric field. Select
and text settings use the standard host fields. Plugin authors declare labels
and constraints only; custom settings components are not part of API v1. The
host chooses the widget's initial position and owns its size, placement,
enabled state through the core widget controls, and saved configuration.

Declare only channels exported in `PUBLIC_PLUGIN_CHANNELS` in
`src/types/plugins.ts`. v1 accepts snapshots, not lifecycle/event channels or
raw telemetry. The host caps each subscription at the channel's configured
maximum update rate. The declaration is an API contract, not a security
permission: shared-renderer plugin code can reach renderer globals exposed by
the host.

## Component contract

The plugin exports one React component. Props are read-only host inputs except
for the validated `onConfigChange` callback:

```tsx
import type {
  PluginWidgetProps,
  PublicChannelPayloads,
} from '@irdashies/plugin-api';

type WeatherConfig = { units: 'metric' | 'imperial' };
type WeatherSnapshots = {
  'session-bar.snapshot'?: PublicChannelPayloads['session-bar.snapshot'];
};

export default function WeatherWidget({
  config,
  snapshots,
  preview,
  onConfigChange,
}: PluginWidgetProps<WeatherConfig, WeatherSnapshots>) {
  const session = snapshots['session-bar.snapshot'];
  return (
    <section className="weather-widget">
      <button
        type="button"
        onClick={() =>
          onConfigChange({
            units: config.units === 'metric' ? 'imperial' : 'metric',
          })
        }
      >
        {session ? `Session ${session.sessionName}` : 'Waiting for session'}
        {preview ? ' (preview)' : ''}
      </button>
    </section>
  );
}
```

The exact snapshot fields come from the published plugin SDK. Keep the widget
usable when a declared snapshot is not yet available. `theme` is currently an
empty read-only object. `preview` is true in host settings preview. No host
callbacks are available for opening windows or arbitrary IPC.

## Bundle requirements

The host React instance must be used for hooks. Externalize both React entry
points to the host runtime and name the IIFE export using the ID-derived name:

```ts
// For id "author.weather-widget"
const exportName = 'IrdashiesPlugin_author$dot$weather$dash$widget';
```

The shared runtime is at
`window.__IRDASHIES_PLUGIN_HOST__.React` and
`window.__IRDASHIES_PLUGIN_HOST__.jsxRuntime`. Do not bundle another React
copy. Emit the entry as `dist/index.js`; if emitting CSS, emit `dist/index.css`
and list it under `styles`. Scope selectors beneath a package-unique root class
so styles do not alter irDashies UI or other widgets. The host loads the entry
and styles lazily when the widget first mounts.

## Install and update

1. Build the package and validate the ZIP layout and manifest locally.
2. Copy the ZIP into the user's irDashies `plugins/` directory.
3. Restart irDashies. Discovery and replacement happen at application startup.
4. Find the widget under **Plugins** in widget settings and add it to a layout.

Updating a ZIP with the same ID keeps the saved widget identity and config. A
replacement is staged and validated before activation; a failed replacement
keeps the last valid cached package. Deleting the source ZIP does not uninstall
the cached package. v1 has no in-app uninstall or hot reload.

## Troubleshooting and limitations

- If the widget is missing, check the app log for a rejected archive or
  manifest, confirm the ID does not collide with a built-in widget, and restart.
- If it appears but fails to render, check the IIFE global name, script path,
  and that React and `react/jsx-runtime` use the host runtime.
- If styles are absent, declare the CSS path in `styles` and scope selectors to
  the widget root.
- Browser/OBS/VR delivery uses the local component server and its configured
  bind address. Treat network exposure as access to trusted plugin assets.
- The iframe widget preview, Gantry and Dock do not host plugin widgets in the
  current implementation. Packaged Electron file-script loading still needs
  runtime proof.

See [the API v1 contract](./PLUGIN_API_V1.md) for validation rules and
[the architecture/status document](./PLUGIN_WIDGET_ARCHITECTURE.md) for
implementation boundaries and outstanding acceptance checks.
