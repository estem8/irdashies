import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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

/**
 * The radar fades in, so a display does not exist on the first render: the
 * appearance has to be waited for rather than read straight after `render`.
 */
const waitForDisplay = async () =>
  waitFor(() => expect(rendered.length).toBeGreaterThan(0));

const waitForHidden = async () =>
  waitFor(() => expect(screen.queryByTestId('radar-canvas')).toBeNull());

const finalFrame = () => {
  const frame = fixture.frames.at(-1);
  if (!frame) throw new Error('fixture has no frames');
  return frame;
};

describe('Radar widget over a recorded multiclass session', () => {
  beforeEach(() => {
    rendered.length = 0;
  });

  it('places blips at the distances the recorded positions describe', async () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({ radarRange: 25 }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForDisplay();

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

  it('grades blips by proximity to the player', async () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({ radarRange: 25 }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForDisplay();

    // The one car inside 15 m in this capture is recorded 2.6 m back, so it is
    // inside the engage range and must come through as at least nearby.
    expect(latest().blips.length).toBeGreaterThan(0);
    for (const blip of latest().blips) {
      const expected =
        blip.gapM <= 1.5 ? 'critical' : blip.gapM <= 7 ? 'nearby' : 'far';
      expect(blip.level).toBe(expected);
    }
  });

  it('labels blips with the car number from the session', async () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({ radarRange: 25 }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForDisplay();

    const numbered = latest().blips.filter((blip) => blip.carNumber !== null);
    expect(numbered.length).toBeGreaterThan(0);
    expect(numbered[0].carNumber).toMatch(/\d/);
  });

  it('renders nothing when the session type is switched off', async () => {
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
    await waitForHidden();

    expect(rendered).toHaveLength(0);
  });

  it('passes the configured range and colours through to the disc', async () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({ radarRange: 12, colorNearby: '#ff00ff' }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForDisplay();

    expect(latest()).toMatchObject({
      radarRange: 12,
      colorNearby: '#ff00ff',
      mode: 'disc',
    });
    for (const blip of latest().blips) {
      expect(Math.abs(blip.alongM)).toBeLessThanOrEqual(12);
    }
  });

  it('draws the view the settings ask for', async () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({ radarRange: 25, displayMode: 'portrait' }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForDisplay();

    expect(latest().mode).toBe('portrait');
  });

  it('hides the disc while the session reports the car off track', async () => {
    // The capture has no IsOnTrack, so the sim state reads as off track and the
    // on-track gate — left at its default of on — must suppress the disc.
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({
        radarRange: 25,
        showOnlyWhenOnTrack: true,
      }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForHidden();

    expect(rendered).toHaveLength(0);
  });

  it('keeps the radar off screen while every car is beyond the near range', async () => {
    // The capture's only car in range sits 2.6 m back, so a 1 m near range
    // must leave the radar hidden.
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({
        radarRange: 25,
        showWhenNearby: true,
        showRange: 1,
        fadeSeconds: 0,
      }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForHidden();

    expect(rendered).toHaveLength(0);
  });

  it('brings the radar on screen once a car is inside the near range', async () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({
        radarRange: 25,
        showWhenNearby: true,
        showRange: 5,
        fadeSeconds: 0,
      }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForDisplay();

    expect(latest().blips.length).toBeGreaterThan(0);
  });

  it('fades a car out towards the range edge, unless the band is off', async () => {
    // Range 3 with a 3 m band puts the 2.6 m car inside the fade, so it must
    // come through part-faded rather than at full strength.
    const faded = mountFixture(fixture, {
      dashboard: radarDashboard({
        radarRange: 3,
        fadeInCars: true,
        fadeBandM: 3,
        fadeSeconds: 0,
      }),
    });
    render(<Radar />, { wrapper: faded.wrapper });
    await waitForDisplay();
    const fadedBlip = latest().blips[0].fade;
    expect(fadedBlip).toBeGreaterThan(0);
    expect(fadedBlip).toBeLessThan(1);

    rendered.length = 0;
    const solid = mountFixture(fixture, {
      dashboard: radarDashboard({
        radarRange: 3,
        fadeInCars: false,
        fadeBandM: 3,
        fadeSeconds: 0,
      }),
    });
    render(<Radar />, { wrapper: solid.wrapper });
    await waitForDisplay();

    expect(latest().blips[0].fade).toBe(1);
  });

  it('does not re-render the display when a snapshot repeats the same input', async () => {
    const harness = mountFixture(fixture, {
      dashboard: radarDashboard({ radarRange: 25 }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForDisplay();

    const renders = rendered.length;
    act(() => {
      harness.seekTo(fixture.frames.length - 1);
      harness.seekTo(fixture.frames.length - 1);
    });

    // The delivery carries the same selected input as the settled frame, so
    // radarInputEqual must keep the display from rendering again.
    expect(rendered.length).toBe(renders);
  });
});
