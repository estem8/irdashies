import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  defaultDashboard,
  type DashboardLayout,
  type RadarConfig,
} from '@irdashies/types';
import { mountFixture } from '../../../testing/renderWithFixture';
import type { ReplayFixture } from '../../../testing/replayFixture';
import roadAmerica from '../../../../test-data/fixtures/multiclass-road-america.json';
import type { RadarDisplayProps } from './components/RadarDisplay';

/**
 * The disc is a canvas, which jsdom cannot rasterise, so the display is
 * replaced by a recorder: the props handed to it ARE the widget's output, and
 * the canvas itself is verified in Storybook against a real browser.
 */
const rendered: RadarDisplayProps[] = [];
vi.mock('./components/RadarDisplay', () => ({
  RadarDisplay: (props: RadarDisplayProps) => {
    rendered.push(props);
    return <canvas data-testid="radar-canvas" />;
  },
}));

import { Radar } from './Radar';

const fixture = roadAmerica as unknown as ReplayFixture;
const TRACK_LENGTH_M = 6413.5;

const radarDashboard = (config: Partial<RadarConfig>): DashboardLayout => {
  const dashboard = defaultDashboard as unknown as DashboardLayout;
  const defaults = dashboard.widgets.find((widget) => widget.id === 'radar');
  if (!defaults) throw new Error('default dashboard has no radar widget');
  return {
    ...dashboard,
    widgets: [
      {
        ...defaults,
        enabled: true,
        // This capture was recorded for standings and carries no IsOnTrack, so
        // the on-track gate would hide the disc before any blip is placed. The
        // gate itself is covered by its own test below.
        config: {
          ...defaults.config,
          showOnlyWhenOnTrack: false,
          ...config,
        },
      },
    ],
  } as DashboardLayout;
};

const latest = () => {
  const props = rendered.at(-1);
  if (!props) throw new Error('radar rendered no display');
  return props;
};

const finalFrame = () => {
  const frame = fixture.frames.at(-1);
  if (!frame) throw new Error('fixture has no frames');
  return frame;
};

describe('Radar widget over a recorded multiclass session', () => {
  beforeEach(() => {
    rendered.length = 0;
  });

  it('places blips at the distances the recorded positions describe', () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({ radarRange: 25 }),
    });
    render(<Radar />, { wrapper: harness.wrapper });

    const props = latest();
    expect(props.blips.length).toBeGreaterThan(0);

    const positions = finalFrame().CarIdxLapDistPct as number[];
    const playerPct = positions[harness.focusCarIdx];
    if (playerPct === undefined) throw new Error('player has no position');

    // Independent expectation: the same signed lap-distance delta the widget
    // claims to use, computed straight from the recorded frame.
    for (const blip of props.blips) {
      let delta = positions[blip.carIdx] - playerPct;
      if (delta > 0.5) delta -= 1;
      else if (delta < -0.5) delta += 1;
      expect(blip.alongM).toBeCloseTo(delta * TRACK_LENGTH_M, 3);
      expect(Math.abs(blip.alongM)).toBeLessThanOrEqual(25);
    }
  });

  it('colours blips by the lapped state in the recording', () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({ radarRange: 25 }),
    });
    render(<Radar />, { wrapper: harness.wrapper });

    const laps = finalFrame().CarIdxLap as number[];
    const playerLap = laps[harness.focusCarIdx];

    for (const blip of latest().blips) {
      const lapDiff = laps[blip.carIdx] - playerLap;
      expect(blip.color).toBe(
        lapDiff > 0 ? 'lapsAhead' : lapDiff < 0 ? 'lapsBehind' : 'sameLap'
      );
    }
  });

  it('renders nothing when the session type is switched off', () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({
        radarRange: 25,
        sessionVisibility: {
          race: false,
          loneQualify: false,
          openQualify: false,
          practice: false,
          offlineTesting: false,
        },
      }),
    });
    render(<Radar />, { wrapper: harness.wrapper });

    expect(screen.queryByTestId('radar-canvas')).toBeNull();
    expect(rendered).toHaveLength(0);
  });

  it('passes the configured range and colours through to the disc', () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({ radarRange: 12, colorSameLap: '#ff00ff' }),
    });
    render(<Radar />, { wrapper: harness.wrapper });

    expect(latest()).toMatchObject({ radarRange: 12, colorSameLap: '#ff00ff' });
    for (const blip of latest().blips) {
      expect(Math.abs(blip.alongM)).toBeLessThanOrEqual(12);
    }
  });

  it('hides the disc while the session reports the car off track', () => {
    // The capture has no IsOnTrack, so the sim state reads as off track and the
    // on-track gate — left at its default of on — must suppress the disc.
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({
        radarRange: 25,
        showOnlyWhenOnTrack: true,
      }),
    });
    render(<Radar />, { wrapper: harness.wrapper });

    expect(rendered).toHaveLength(0);
    expect(screen.queryByTestId('radar-canvas')).toBeNull();
  });
});
