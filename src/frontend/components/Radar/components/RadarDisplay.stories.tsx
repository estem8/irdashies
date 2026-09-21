import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadarDisplay } from './RadarDisplay';
import type { RadarBlip } from '../radarBlips';

/**
 * The views drawn from hand-built blips. The widget stories drive the same
 * component from a recording, but no capture has a car on each side or a car a
 * lap down, so the proximity grades and the overlap bars are only reachable
 * here.
 */

const blip = (
  carIdx: number,
  alongM: number,
  lateralM: number,
  carNumber: string,
  extra: Partial<RadarBlip> = {}
): RadarBlip => ({
  carIdx,
  alongM,
  lateralM,
  relYaw: 0,
  gapM: Math.abs(alongM),
  level:
    Math.abs(alongM) <= 1.5
      ? 'critical'
      : Math.abs(alongM) <= 7
        ? 'nearby'
        : 'far',
  side: null,
  carNumber,
  isPaceCar: false,
  inPit: false,
  fade: 1,
  ...extra,
});

const AHEAD = blip(1, 11, 0.2, '24');
const CLOSING = blip(2, -4, 2.4, '7');
const ALONGSIDE = blip(4, -0.6, -2.1, '51', {
  level: 'critical',
  side: -1,
});
const LAPPED = blip(3, -13, -2.4, '88');
const IN_PIT = blip(5, 6, 4.5, '9', { inPit: true });
const PACE = blip(6, 5.5, 0.4, '0', { isPaceCar: true });

const meta = {
  component: RadarDisplay,
  title: 'widgets/Radar/Views',
  decorators: [
    (Story: React.ComponentType) => (
      <div className="bg-slate-800 p-5">
        <div className="h-[300px] w-[300px]">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    mode: 'disc' as const,
    blips: [AHEAD, CLOSING, LAPPED, IN_PIT],
    overlap: { left: 0, right: 0 },
    radarRange: 15,
    nearbyRange: 7,
    vehicleWidth: 1.9,
    vehicleLength: 4.5,
    showCarNumbers: true,
    pulseWhenCritical: false,
    showOverlapIndicator: true,
    colorFar: '#3b82f6',
    colorNearby: '#f59e0b',
    colorCritical: '#ef4444',
    colorPlayer: '#2fd16a',
    colorInPit: '#6b7280',
    bgOpacity: 30,
  },
  argTypes: {
    mode: {
      control: { type: 'select' },
      options: ['disc', 'portrait', 'bars'],
    },
    radarRange: { control: { type: 'range', min: 10, max: 25, step: 1 } },
    nearbyRange: { control: { type: 'range', min: 2, max: 15, step: 0.5 } },
    bgOpacity: { control: { type: 'range', min: 0, max: 100, step: 5 } },
    showCarNumbers: { control: 'boolean' },
    pulseWhenCritical: { control: 'boolean' },
    showOverlapIndicator: { control: 'boolean' },
    colorFar: { control: 'color' },
    colorNearby: { control: 'color' },
    colorCritical: { control: 'color' },
    colorPlayer: { control: 'color' },
    colorInPit: { control: 'color' },
  },
} satisfies Meta<typeof RadarDisplay>;

export default meta;

type Story = StoryObj<typeof RadarDisplay>;

export const Disc: Story = {};

export const PortraitRadar: Story = {
  name: 'Portrait radar',
  args: { mode: 'portrait' },
};

export const SideBars: Story = {
  name: 'Side bars',
  args: { mode: 'bars', blips: [ALONGSIDE] },
};

export const CarAlongside: Story = {
  name: 'Car alongside (critical)',
  args: {
    blips: [...meta.args.blips, ALONGSIDE],
    overlap: { left: 1, right: 0 },
  },
};

export const TwoCarsOnTheLeft: Story = {
  name: 'Two cars on the left',
  args: {
    blips: [
      ...meta.args.blips,
      ALONGSIDE,
      blip(6, -1.2, -2, '77', { side: -1 }),
    ],
    overlap: { left: 2, right: 0 },
  },
};

export const WithoutCarNumbers: Story = {
  name: 'Without car numbers',
  args: { showCarNumbers: false },
};

export const NoCarsInRange: Story = {
  name: 'No cars in range',
  args: { blips: [] },
};

export const PaceCar: Story = {
  name: 'Pace car',
  args: { blips: [AHEAD, PACE] },
};
