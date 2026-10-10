import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  assert,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type {
  ActiveSimulator,
  DashboardLayout,
  SimWidgetSupportConfig,
} from '@irdashies/types';
import { SettingsMenu } from './SettingsMenu';

const state = vi.hoisted(() => ({
  dashboard: undefined as DashboardLayout | undefined,
  simulator: 'lmu' as ActiveSimulator | null,
  onDashboardUpdated: vi.fn(),
  support: {
    message: 'Unavailable in this simulator',
    disabledWidgets: { iracing: [], lmu: ['wind'] },
  } as SimWidgetSupportConfig,
}));

vi.mock('@irdashies/context', () => ({
  useDashboard: () => ({
    currentDashboard: state.dashboard,
    onDashboardUpdated: state.onDashboardUpdated,
  }),
  useActiveSimulator: () => state.simulator,
  useSimWidgetSupport: () => state.support,
}));

// Keep component behavior independent of the full catalog. The registry spec
// checks real manifests, labels and menu entries together.
vi.mock('./menuItems', () => ({
  generalItems: [
    { to: '/settings/general', path: '/general', label: 'General' },
  ],
  bottomItems: [{ to: '/settings/about', path: '/about', label: 'About' }],
  WIDGET_CATEGORIES: [
    { id: 'race', label: 'Timing & Race' },
    { id: 'track', label: 'Track & Conditions' },
    { id: 'extras', label: 'Extras' },
  ],
  widgetItems: [
    {
      to: '/settings/standings',
      path: '/standings',
      label: 'Standings',
      widgetType: 'standings',
      category: 'race',
      description: 'Live race order',
    },
    {
      to: '/settings/wind',
      path: '/wind',
      label: 'Wind',
      widgetType: 'wind',
      category: 'track',
      description: 'Wind direction and speed',
    },
    {
      to: '/settings/twitchchat',
      path: '/twitchchat',
      label: 'Twitch Chat',
      widgetType: 'twitchchat',
    },
  ],
}));

function CurrentPath() {
  return <output data-testid="current-path">{useLocation().pathname}</output>;
}

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={['/settings/general']}>
      <SettingsMenu />
      <CurrentPath />
    </MemoryRouter>
  );
}

const showAllButton = () =>
  screen.getByRole('button', {
    name: /Showing (only the widgets|every widget)/,
  });

describe('SettingsMenu', () => {
  const originalBridge = window.dashboardBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    state.simulator = 'lmu';
    state.dashboard = {
      widgets: [
        {
          id: 'standings',
          enabled: true,
          layout: { x: 0, y: 0, width: 100, height: 100 },
        },
        {
          id: 'standings-copy',
          type: 'standings',
          enabled: true,
          layout: { x: 100, y: 0, width: 100, height: 100 },
        },
        {
          id: 'wind',
          enabled: true,
          layout: { x: 0, y: 100, width: 100, height: 100 },
        },
      ],
      generalSettings: { appTheme: 'red' },
    };
    Object.defineProperty(window, 'dashboardBridge', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    window.dashboardBridge = originalBridge;
  });

  it('groups supported widgets, hides empty categories and reports counts', () => {
    renderMenu();
    expect(
      screen.getByRole('heading', { name: /Timing & Race/ })
    ).toHaveTextContent('1/1');
    expect(screen.getByRole('heading', { name: /Extras/ })).toHaveTextContent(
      '0/1'
    );
    expect(
      screen.queryByRole('heading', { name: /Track & Conditions/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('(1 hidden)')).toBeInTheDocument();
    expect(screen.getByText('2 on')).toBeInTheDocument();
    expect(screen.getByText('Live race order')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Wind/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument();
  });

  it('toggles only the canonical widget and preserves other instances and settings', () => {
    renderMenu();
    const original = structuredClone(state.dashboard);
    assert(original);
    fireEvent.click(screen.getByRole('switch', { name: 'Enable Standings' }));
    expect(state.onDashboardUpdated).toHaveBeenCalledExactlyOnceWith({
      ...original,
      widgets: original.widgets.map((widget) =>
        widget.id === 'standings' ? { ...widget, enabled: false } : widget
      ),
    });
    expect(state.dashboard).toEqual(original);
    expect(screen.getByTestId('current-path')).toHaveTextContent(
      '/settings/general'
    );
  });

  it('offers settings but no toggle for a widget absent from the dashboard', () => {
    renderMenu();
    expect(
      screen.getByRole('link', { name: 'Twitch Chat' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Enable Twitch Chat' })
    ).not.toBeInTheDocument();
  });

  it('shows unsupported widgets with disabled toggles while keeping settings reachable', () => {
    renderMenu();
    fireEvent.click(showAllButton());
    const toggle = screen.getByRole('switch', { name: 'Enable Wind' });
    expect(toggle).toBeDisabled();
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAttribute('title', state.support.message);
    fireEvent.click(toggle);
    expect(state.onDashboardUpdated).not.toHaveBeenCalled();
    const link = screen.getByRole('link', { name: /Wind direction and speed/ });
    expect(link).toHaveAttribute('title', state.support.message);
    const row = link.closest('li');
    assert(row);
    expect(within(row).queryByText('LIVE')).not.toBeInTheDocument();
    fireEvent.click(link);
    expect(screen.getByTestId('current-path')).toHaveTextContent(
      '/settings/wind'
    );
  });

  it('restores and saves the show-all preference', async () => {
    const setSettingsShowAllWidgets = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'dashboardBridge', {
      value: {
        getSettingsShowAllWidgets: vi.fn().mockResolvedValue(true),
        setSettingsShowAllWidgets,
      },
    });
    renderMenu();
    expect(
      await screen.findByRole('link', { name: /Wind direction and speed/ })
    ).toBeInTheDocument();
    expect(showAllButton()).toHaveAttribute('aria-pressed', 'true');
    expect(setSettingsShowAllWidgets).not.toHaveBeenCalled();
    fireEvent.click(showAllButton());
    expect(setSettingsShowAllWidgets).toHaveBeenLastCalledWith(false);
    expect(
      screen.queryByRole('link', { name: /Wind/ })
    ).not.toBeInTheDocument();
    fireEvent.click(showAllButton());
    expect(setSettingsShowAllWidgets).toHaveBeenLastCalledWith(true);
    expect(setSettingsShowAllWidgets).toHaveBeenCalledTimes(2);
  });

  it('updates compatibility after the active simulator changes', () => {
    const { rerender } = renderMenu();
    expect(
      screen.queryByRole('link', { name: /Wind/ })
    ).not.toBeInTheDocument();
    state.simulator = 'iracing';
    rerender(
      <MemoryRouter>
        <SettingsMenu />
        <CurrentPath />
      </MemoryRouter>
    );
    expect(screen.getByRole('switch', { name: 'Enable Wind' })).toBeEnabled();
    expect(screen.queryByText('(1 hidden)')).not.toBeInTheDocument();
    expect(state.onDashboardUpdated).not.toHaveBeenCalled();
  });

  it('handles a missing dashboard and unknown simulator without inventing widget toggles', () => {
    state.dashboard = undefined;
    state.simulator = null;
    renderMenu();
    expect(
      screen.getByRole('link', { name: /Wind direction and speed/ })
    ).toBeInTheDocument();
    expect(screen.getByText('0 on')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('toggles the primary widget when a disabled extra instance comes first', () => {
    assert(state.dashboard);
    const [primary, extra, wind] = state.dashboard.widgets;
    state.dashboard = {
      ...state.dashboard,
      widgets: [{ ...extra, enabled: false }, primary, wind],
    };
    renderMenu();

    fireEvent.click(screen.getByRole('switch', { name: 'Enable Standings' }));

    expect(state.onDashboardUpdated).toHaveBeenCalledExactlyOnceWith({
      ...state.dashboard,
      widgets: [
        { ...extra, enabled: false },
        { ...primary, enabled: false },
        wind,
      ],
    });
  });
});
