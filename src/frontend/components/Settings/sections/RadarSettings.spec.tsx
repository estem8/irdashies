import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardLayout, RadarConfig } from '@irdashies/types';
import { getWidgetDefaultConfig } from '@irdashies/types';
import { RadarSettings } from './RadarSettings';

// The dashboard reaches this component through context, so back the mock with a
// real external store rather than a module variable — a plain rerender would not
// re-run the hook with a new value.
const mocks = vi.hoisted(() => {
  let dashboard: DashboardLayout | undefined;
  const listeners = new Set<() => void>();
  return {
    listeners,
    getDashboard: () => dashboard,
    setDashboard: (next: DashboardLayout | undefined) => {
      dashboard = next;
      listeners.forEach((listener) => listener());
    },
  };
});

vi.mock('@irdashies/context', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useDashboard: () => ({
      currentDashboard: useSyncExternalStore((onChange) => {
        mocks.listeners.add(onChange);
        return () => mocks.listeners.delete(onChange);
      }, mocks.getDashboard),
    }),
  };
});

const radarConfig = (overrides: Partial<RadarConfig> = {}): RadarConfig => ({
  ...getWidgetDefaultConfig('radar'),
  ...overrides,
});

const dashboardWith = (config: RadarConfig) =>
  ({
    widgets: [
      {
        id: 'radar',
        enabled: true,
        layout: { x: 0, y: 0, width: 300, height: 300 },
        config,
      },
    ],
  }) as unknown as DashboardLayout;

/**
 * The Options tab renders several sliders, so the right one is picked by the
 * label it belongs to rather than by position.
 */
const sliderFor = (label: string) => {
  const row = screen.getByText(label).closest('label');
  const input = row?.parentElement?.querySelector('input[type="range"]');
  if (!input) throw new Error(`no slider for ${label}`);
  return input as HTMLInputElement;
};
const sliderValue = (label: string) => sliderFor(label).value;
const rangeValue = () => sliderValue('Radar Range');

const openOptionsTab = () => {
  // "Options" also titles the panel it opens, so select the tab button itself.
  act(() => screen.getByRole('button', { name: 'Options' }).click());
};

describe('RadarSettings', () => {
  it('shows the saved config that arrives after the first render', () => {
    mocks.setDashboard(undefined);
    render(<RadarSettings />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    act(() =>
      mocks.setDashboard(dashboardWith(radarConfig({ radarRange: 22 })))
    );
    openOptionsTab();

    // Would fall back to the default range if the local state kept the value it
    // captured on the first render, and the next edit would persist that over
    // the saved config.
    expect(rangeValue()).toBe('22');
  });

  it('re-seeds when the dashboard is swapped for another profile', () => {
    mocks.setDashboard(dashboardWith(radarConfig({ radarRange: 22 })));
    render(<RadarSettings />);
    openOptionsTab();
    expect(rangeValue()).toBe('22');

    act(() =>
      mocks.setDashboard(dashboardWith(radarConfig({ radarRange: 11 })))
    );

    expect(rangeValue()).toBe('11');
  });

  it('falls back to the column defaults for a config the profile never had', () => {
    mocks.setDashboard({ widgets: [] } as unknown as DashboardLayout);
    render(<RadarSettings />);
    openOptionsTab();

    expect(screen.getByText('Radar Range')).toBeInTheDocument();
  });

  it('scales both range-dependent slider limits with the radar range', () => {
    mocks.setDashboard(
      dashboardWith(
        radarConfig({
          radarRange: 30,
          showWhenNearby: true,
          fadeInCars: true,
        })
      )
    );
    render(<RadarSettings />);
    act(() => screen.getByRole('button', { name: 'Display' }).click());

    expect(sliderFor('Near Range').max).toBe('29.5');
    expect(sliderFor('Fade Width').max).toBe('15');
  });

  it('shows the saved track map setting state', () => {
    mocks.setDashboard(dashboardWith(radarConfig({ showTrackMap: true })));
    render(<RadarSettings />);
    act(() => screen.getByRole('button', { name: 'Display' }).click());

    expect(screen.getByRole('switch', { name: 'Track map' })).toBeChecked();
  });

  it('offers a colour for every blip and state signal', () => {
    // Older profiles may not have the current rival and state-signal colours,
    // so every swatch has to come from the widget defaults rather than render
    // undefined.
    mocks.setDashboard(
      dashboardWith({ ...getWidgetDefaultConfig('radar') } as RadarConfig)
    );
    render(<RadarSettings />);
    // The chosen tab is remembered in localStorage, which another test in this
    // file has already moved to Options.
    act(() => screen.getByRole('button', { name: 'Display' }).click());

    const swatch = (label: string) => {
      const input = screen
        .getByText(label)
        .parentElement?.querySelector('input[type="color"]');
      if (!input) throw new Error(`no colour field for ${label}`);
      return (input as HTMLInputElement).value;
    };

    expect(swatch('Your car')).toBe('#2fd16a');
    expect(swatch('Opponents')).toBe('#cbd5e1');
    expect(swatch('Alongside')).toBe('#ef4444');
  });
});
