import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadarDisplay } from './RadarDisplay';
import type { RadarBlip } from '../radarBlips';
import type { RadarOverlap } from '../overlapSides';

/**
 * The disc drawn from hand-built blips. The widget story drives the same
 * component from a recording, but no capture has a car alongside or a car a
 * lap down, so the overlap bars and the lapped-state colours are only
 * reachable here.
 */

const AHEAD: RadarBlip = {
  carIdx: 1,
  alongM: 11,
  lateralM: 0.2,
  relYaw: 0,
  color: 'sameLap',
};
const LAPPING: RadarBlip = {
  carIdx: 2,
  alongM: -8,
  lateralM: 3,
  relYaw: -0.12,
  color: 'lapsAhead',
};
const LAPPED: RadarBlip = {
  carIdx: 3,
  alongM: -13,
  lateralM: -2.4,
  relYaw: 0.1,
  color: 'lapsBehind',
};
const IN_PIT: RadarBlip = {
  carIdx: 5,
  alongM: 6,
  lateralM: 4.5,
  relYaw: 0.4,
  color: 'inPit',
};
const ALONGSIDE: RadarBlip = {
  carIdx: 4,
  alongM: -0.8,
  lateralM: -2.1,
  relYaw: 0,
  color: 'sameLap',
};

const meta = {
  component: RadarDisplay,
  title: 'widgets/Radar/Disc',
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
    blips: [AHEAD, LAPPING, LAPPED, IN_PIT],
    overlap: { left: 0, right: 0 } satisfies RadarOverlap,
    radarRange: 15,
    vehicleWidth: 1.9,
    vehicleLength: 4.5,
    showOverlapIndicator: true,
    colorPlayer: '#2fd16a',
    colorSameLap: '#3b82f6',
    colorLapsAhead: '#a855f7',
    colorLapsBehind: '#6b7280',
    colorInPit: '#eab308',
    colorNearby: '#f59e0b',
    colorCritical: '#ef4444',
    bgOpacity: 30,
  },
  argTypes: {
    radarRange: { control: { type: 'range', min: 10, max: 25, step: 1 } },
    bgOpacity: { control: { type: 'range', min: 0, max: 100, step: 5 } },
    colorPlayer: { control: 'color' },
    colorSameLap: { control: 'color' },
    colorLapsAhead: { control: 'color' },
    colorLapsBehind: { control: 'color' },
    colorInPit: { control: 'color' },
    colorNearby: { control: 'color' },
    colorCritical: { control: 'color' },
  },
} satisfies Meta<typeof RadarDisplay>;

export default meta;

type Story = StoryObj<typeof RadarDisplay>;

export const CarsAround: Story = {};

export const CarAlongside: Story = {
  name: 'Car alongside',
  args: {
    blips: [...meta.args.blips, ALONGSIDE],
    overlap: { left: 1, right: 0 },
  },
};

export const TwoCarsLeft: Story = {
  name: 'Two cars on the left',
  args: {
    blips: [...meta.args.blips, ALONGSIDE],
    overlap: { left: 2, right: 0 },
  },
};

export const OverlapIndicatorOff: Story = {
  name: 'Overlap indicator off',
  args: {
    blips: [...meta.args.blips, ALONGSIDE],
    overlap: { left: 1, right: 1 },
    showOverlapIndicator: false,
  },
};

export const NoCarsInRange: Story = {
  name: 'No cars in range',
  args: { blips: [] },
};
