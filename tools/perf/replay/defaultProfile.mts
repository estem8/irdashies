import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { WidgetManifest } from '../../../src/types/widgets/types';

/** Load the pure manifest files with tsx, avoiding the Vite-only registry. */
export async function createDefaultReplayProfile() {
  const directory = new URL('../../../src/types/widgets/', import.meta.url);
  const files = (await readdir(directory))
    .filter(
      (name) =>
        name.endsWith('.ts') &&
        !name.endsWith('.spec.ts') &&
        !['index.ts', 'types.ts', 'properties.ts'].includes(name)
    )
    .sort();
  const manifests: WidgetManifest[] = [];
  for (const file of files) {
    const module = (await import(new URL(file, directory).href)) as {
      default?: WidgetManifest;
    };
    if (module.default?.id) manifests.push(module.default);
  }
  return {
    currentProfile: 'default',
    dashboards: {
      default: {
        widgets: manifests.map(
          ({ id, enabled, layout, config, alwaysEnabled }) => ({
            id,
            enabled,
            layout,
            config,
            ...(alwaysEnabled === undefined ? {} : { alwaysEnabled }),
          })
        ),
        generalSettings: { devTool: false, showOnlyWhenOnTrack: false },
      },
    },
  };
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  // Running under tsx is required for extensionless imports inside manifests.
  process.stdout.write(JSON.stringify(await createDefaultReplayProfile()));
}
