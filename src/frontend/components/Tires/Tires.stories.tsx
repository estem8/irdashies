import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ChannelSnapshotDecorator,
  sessionBarStorySnapshot,
  TelemetryDecorator,
  trackStateStorySnapshot,
} from '@irdashies/storybook';
import type { TireSnapshot } from '@irdashies/types';
import { Tires } from './Tires';

export default {
  component: Tires,
  title: 'widgets/Tires',
} as Meta;

type Story = StoryObj<typeof Tires>;

const snapshot: TireSnapshot = {
  version: 1,
  slip: { abs: false, tc: 0, spin: 0.7, lock: 0, under: 0.5, over: 0 },
  corners: {
    lf: {
      camber: -4.0,
      toe: '-2.8 mm',
      temp: [92, 98, 95],
      wear: [88.4, 91.2, 89.9],
      estimated: true,
      tempEstimated: true,
      wearPerLap: [0.4, 0.4, 0.4],
    },
    rf: {
      camber: -4.0,
      toe: '-2.8 mm',
      temp: [60, 64, 66],
      wear: [42.1, 45.5, 40.3],
      estimated: true,
      tempEstimated: true,
      wearPerLap: [0.5, 0.5, 0.5],
    },
    lr: {
      camber: -3.2,
      toe: '+0.1 mm',
      temp: [88, 90, 89],
      wear: [20.7, 22.0, 21.1],
      estimated: true,
      tempEstimated: true,
      wearPerLap: [0.5, 0.5, 0.5],
    },
    rr: {
      camber: -3.2,
      toe: '+0.1 mm',
      temp: [101, 118, 123],
      wear: [85.2, 87.8, 84.6],
      estimated: true,
      tempEstimated: true,
      wearPerLap: [0.5, 0.5, 0.5],
    },
  },
};

export const Primary: Story = {
  decorators: [
    ChannelSnapshotDecorator({
      'tires.snapshot': snapshot,
      'session-bar.snapshot': sessionBarStorySnapshot,
      'track-state.snapshot': trackStateStorySnapshot,
    }),
    (Story, context) => (
      <div style={{ width: '280px', height: '400px' }}>
        {TelemetryDecorator('/test-data/1731637331038')(Story, context)}
      </div>
    ),
  ],
};
