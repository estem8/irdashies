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
  g: { lat: 0.8, lon: -0.9 },
  corners: {
    lf: {
      camber: -4.0,
      toe: '-2.8 mm',
      toeDeg: -0.134,
      temp: [92, 98, 95],
      wear: [88.4, 91.2, 89.9],
      pressure: 152.0,
      load: 0.9,
      estimated: true,
      tempEstimated: true,
      wearPerLap: [0.4, 0.4, 0.4],
    },
    rf: {
      camber: -4.0,
      toe: '-2.8 mm',
      toeDeg: -0.134,
      temp: [60, 64, 66],
      wear: [42.1, 45.5, 40.3],
      pressure: 153.0,
      load: 1.5,
      estimated: true,
      tempEstimated: true,
      wearPerLap: [0.5, 0.5, 0.5],
    },
    lr: {
      camber: -3.2,
      toe: '+0.1 mm',
      toeDeg: 0.25,
      temp: [88, 90, 89],
      wear: [20.7, 22.0, 21.1],
      pressure: 148.0,
      load: 0.8,
      estimated: true,
      tempEstimated: true,
      wearPerLap: [0.5, 0.5, 0.5],
    },
    rr: {
      camber: -3.2,
      toe: '+0.1 mm',
      toeDeg: 0.25,
      temp: [101, 118, 123],
      wear: [85.2, 87.8, 84.6],
      pressure: 149.0,
      load: 1.3,
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
