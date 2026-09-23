import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  defaultDashboard,
  type ChannelBridge,
  type ChannelName,
  type ChannelPayloads,
  type DashboardLayout,
  type RadarConfig,
  type RadarSnapshot,
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

/**
 * Makes the harness bridge hand the widget a fresh radar payload on every
 * delivery, the way the IPC boundary does. The processor fills one snapshot
 * object in place, so without this every seek republishes the very arrays the
 * hook already holds and the selector equality — correctly — sees no change.
 */
const cloneRadarDeliveriesPerFrame = () => {
  const bridge: ChannelBridge = window.channelBridge;
  window.channelBridge = {
    subscribe: <K extends ChannelName>(
      channel: K,
      callback: (payload: ChannelPayloads[K]) => void,
      requestedRateHz?: number
    ) =>
      bridge.subscribe(
        channel,
        (delivered) => {
          if (channel !== 'radar.snapshot') {
            callback(delivered);
            return;
          }
          const snapshot = delivered as RadarSnapshot;
          callback({
            ...snapshot,
            carIdxLapDistPct: [...snapshot.carIdxLapDistPct],
            carIdxOnPitRoad: [...snapshot.carIdxOnPitRoad],
          } as unknown as ChannelPayloads[K]);
        },
        requestedRateHz
      ),
  };
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
      dashboard: radarDashboard({
        radarRange: 12,
        colorRival: '#ff00ff',
        colorAlongside: '#aa0000',
      }),
    });
    render(<Radar />, { wrapper: harness.wrapper });
    await waitForDisplay();

    expect(latest()).toMatchObject({
      radarRange: 12,
      colorRival: '#ff00ff',
      colorAlongside: '#aa0000',
    });
    for (const blip of latest().blips) {
      expect(Math.abs(blip.alongM)).toBeLessThanOrEqual(12);
    }
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

  it('brings the panel on screen once at a jittering show-range boundary', async () => {
    // A rival holding the show range itself, with the ±0.3 m the measured
    // gap jitters by: `nearestGapM` crosses the boundary on every other
    // frame, so a plain `<= showRange` gate flips the whole panel on and off
    // for as long as the car sits there. The hysteresis must bring it on
    // screen once and keep it there until the car is past the range plus its
    // margin. Asserted on what Radar renders, frame by frame, not on the
    // internal gap.
    const SHOW_RANGE_M = 10;
    // Metres from the player: beyond the release margin, then the boundary
    // with jitter, then clear of the margin again. Consecutive frames differ
    // so every delivery re-renders.
    const GAPS_M = [12, 9.7, 10.3, 9.7, 10.4, 10.3, 9.7, 10.9, 10.2, 9.8, 12];

    // The recorded capture with one rival re-placed per frame: everything
    // else about the session stays real. The player index comes from a probe
    // mount of the unmodified capture — the harness resolves it from the
    // session exactly as the app does, and guessing it gets the player wrong.
    const probe = mountFixture(fixture);
    const playerCarIdx = probe.focusCarIdx;
    const base = finalFrame();
    const positions = base.CarIdxLapDistPct as number[];
    const playerPct = positions[playerCarIdx];
    if (typeof playerPct !== 'number' || playerPct < 0) {
      throw new Error('fixture player has no position');
    }
    let rivalCarIdx = -1;
    let bestDelta = Infinity;
    for (let carIdx = 0; carIdx < positions.length; carIdx += 1) {
      if (carIdx === playerCarIdx) continue;
      const pct = positions[carIdx];
      if (typeof pct !== 'number' || pct < 0) continue;
      let delta = Math.abs(pct - playerPct);
      if (delta > 0.5) delta = 1 - delta;
      if (delta < bestDelta) {
        bestDelta = delta;
        rivalCarIdx = carIdx;
      }
    }
    if (rivalCarIdx < 0)
      throw new Error('fixture has no rival near the player');

    const jittered: ReplayFixture = {
      ...fixture,
      frames: GAPS_M.map((gapM) => ({
        ...base,
        CarIdxLapDistPct: positions.map((pct, carIdx) =>
          carIdx === rivalCarIdx ? playerPct + gapM / TRACK_LENGTH_M : pct
        ),
      })),
    };

    const harness = mountFixture(jittered, {
      dashboard: radarDashboard({
        radarRange: 25,
        showWhenNearby: true,
        showRange: SHOW_RANGE_M,
        fadeSeconds: 0,
      }),
    });
    // The processors fill their snapshot in place, so the harness republishes
    // one object per channel for the whole run. Over IPC every frame arrives
    // as a fresh payload, which is what the widget's selector equality is
    // written against; without that, a seek hands the hook the very array it
    // already holds and no frame is ever seen as a change.
    cloneRadarDeliveriesPerFrame();
    render(<Radar />, { wrapper: harness.wrapper });
    // The mount plays every frame and ends on the last one, which sits beyond
    // the release margin: the panel starts hidden.
    await waitForHidden();
    expect(rendered).toHaveLength(0);

    const onScreen: boolean[] = [];
    for (let index = 0; index < GAPS_M.length; index += 1) {
      act(() => {
        harness.seekTo(index);
      });
      onScreen.push(screen.queryByTestId('radar-canvas') !== null);
    }

    // On at the first jitter frame inside the range, and still on for every
    // frame that only jittered past the boundary: one appearance, no flip.
    const appearances = onScreen.filter(
      (shown, index) => shown && index > 0 && !onScreen[index - 1]
    ).length;
    const disappearances = onScreen.filter(
      (shown, index) => !shown && index > 0 && onScreen[index - 1]
    ).length;
    expect(appearances).toBe(1);
    expect(onScreen.slice(1, -1).every((shown) => shown)).toBe(true);
    // The final frame is clear of the margin, so the gate does release —
    // exactly once, at the end, not through the jitter.
    expect(disappearances).toBe(1);
    expect(onScreen.at(-1)).toBe(false);
  });
});
