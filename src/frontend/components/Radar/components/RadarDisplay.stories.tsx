import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadarDisplay } from './RadarDisplay';
import type { RadarBlip } from '../radarBlips';

/**
 * The disc drawn from hand-built blips. The widget stories drive the same
 * component from a recording, so the rim signals are only reachable here.
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
  side: null,
  rimSignal: null,
  carNumber,
  isPaceCar: false,
  fade: 1,
  ...extra,
});

const AHEAD = blip(1, 11, 0.2, '24');
const CLOSING = blip(2, -4, 2.4, '7');
const PACE = blip(6, 5.5, 0.4, '0', { isPaceCar: true });

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
    blips: [AHEAD, CLOSING],
    radarRange: 15,
    vehicleWidth: 1.9,
    vehicleLength: 4.5,
    showCarNumbers: true,
    colorRival: '#cbd5e1',
    colorAlongside: '#ef4444',
    colorPlayer: '#2fd16a',
    bgOpacity: 30,
    // Any positive length works: the disc places blips by metre offset, and
    // without it the motion targets are NaN and no car is drawn at all.
    trackLengthM: 5000,
  },
  argTypes: {
    radarRange: { control: { type: 'range', min: 10, max: 25, step: 1 } },
    bgOpacity: { control: { type: 'range', min: 0, max: 100, step: 5 } },
    showCarNumbers: { control: { type: 'boolean' } },
    colorRival: { control: { type: 'color' } },
    colorAlongside: { control: { type: 'color' } },
    colorPlayer: { control: { type: 'color' } },
  },
} satisfies Meta<typeof RadarDisplay>;

export default meta;

type Story = StoryObj<typeof RadarDisplay>;

export const Disc: Story = {};

export const AlongsideLeft: Story = {
  name: 'Alongside, left',
  args: { blips: [AHEAD, blip(7, 0.3, -2, '51', { rimSignal: 'left' })] },
};

export const AlongsideRight: Story = {
  name: 'Alongside, right',
  args: { blips: [AHEAD, blip(7, 0.3, 2, '51', { rimSignal: 'right' })] },
};

export const AlongsideBoth: Story = {
  name: 'Alongside, both',
  args: { blips: [AHEAD, blip(7, 0.3, 0, '31', { rimSignal: 'both' })] },
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
