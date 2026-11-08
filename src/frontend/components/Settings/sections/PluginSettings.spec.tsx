import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InstalledWidgetPlugin } from '../../../../types/plugins';
import { PluginSettings } from './PluginSettings';

const state = vi.hoisted(() => ({
  dashboard: { widgets: [] as unknown[] },
  onDashboardUpdated: vi.fn(),
}));

vi.mock('@irdashies/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@irdashies/context')>()),
  useDashboard: () => ({
    currentDashboard: state.dashboard,
    onDashboardUpdated: state.onDashboardUpdated,
  }),
}));

vi.mock('../../PluginWidgetHost', () => ({
  PluginWidgetHost: ({
    config,
    preview,
  }: {
    config: Record<string, unknown>;
    preview: boolean;
  }) => (
    <div data-testid="plugin-preview" data-preview={String(preview)}>
      {String(config.units)}
    </div>
  ),
}));

const plugin: InstalledWidgetPlugin = {
  manifest: {
    manifestVersion: 1,
    id: 'author.settings-widget',
    name: 'Settings package',
    version: '1.0.0',
    apiVersion: 1,
    entry: 'dist/index.js',
    widget: {
      name: 'Settings widget',
      defaultLayout: { width: 240, height: 160 },
      defaultConfig: { units: 'metric', showWind: true },
      settings: [
        {
          key: 'units',
          type: 'select',
          label: 'Units',
          options: ['metric', 'imperial'],
        },
        { key: 'showWind', type: 'boolean', label: 'Show wind' },
      ],
    },
    requires: { channels: [] },
  },
  entryUrl: 'file:///plugins/author.settings-widget/dist/index.js',
  styleUrls: [],
};

describe('PluginSettings', () => {
  it('renders declarative settings, previews config, and adds a default-layout widget', () => {
    render(<PluginSettings plugin={plugin} widgetId={plugin.manifest.id} />);

    expect(screen.getByLabelText('Show wind')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Units'), {
      target: { value: 'imperial' },
    });
    expect(screen.getByTestId('plugin-preview')).toHaveTextContent('imperial');

    fireEvent.click(screen.getByRole('button', { name: 'Add to dashboard' }));
    expect(state.onDashboardUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        widgets: [
          expect.objectContaining({
            id: 'author.settings-widget',
            type: 'author.settings-widget',
            enabled: true,
            config: { units: 'imperial', showWind: true },
            layout: { x: 50, y: 50, width: 240, height: 160 },
          }),
        ],
      })
    );
  });
});
