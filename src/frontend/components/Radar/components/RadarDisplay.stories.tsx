import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadarDisplay } from './RadarDisplay';
import type { RadarBlip } from '../radarBlips';

/**
 * The disc drawn from hand-built blips. The widget stories drive the same
 * component from a recording, but no capture has a car on each side or a car
 * whose side the sim never reported, so the side placement and the symmetric
 * rim marks are only reachable here.
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
  sideUnknown: false,
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
    colorPlayer: { control: { type: 'color' } },
  },
} satisfies Meta<typeof RadarDisplay>;

export default meta;

type Story = StoryObj<typeof RadarDisplay>;

export const Disc: Story = {};

export const AlongsideSideUnknown: Story = {
  name: 'Alongside, side unknown',
  args: {
    // The sim reports no verdict for about half of recorded overtakes, and for
    // every overtake of a player standing off the racing surface, so the disc
    // has to speak without one: both rims light rather than a side being
    // invented for a car that is level with us.
    blips: [AHEAD, blip(7, 0.3, 0, '31', { sideUnknown: true })],
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
