import { Meta, StoryObj } from '@storybook/react-vite';
import type { RatingPoint } from '@irdashies/types';
import { DriverRatings } from './DriverSettings';

const DAY = 24 * 60 * 60 * 1000;
const start = Date.UTC(2026, 8, 1);

const road: [number, number][] = [
  [1450, 2.81],
  [1488, 2.95],
  [1471, 3.02],
  [1512, 3.18],
  [1540, 3.11],
  [1525, 3.29],
  [1563, 3.42],
  [1601, 3.55],
  [1588, 3.49],
  [1634, 3.71],
];

const points: RatingPoint[] = [
  ...road.map(([iRating, safetyRating], i) => ({
    at: start + i * DAY,
    userId: 1,
    category: 'Road',
    iRating,
    safetyRating,
    licenseClass: safetyRating >= 3 ? 'B' : 'C',
  })),
  ...[1210, 1185, 1232].map((iRating, i) => ({
    at: start + i * 3 * DAY,
    userId: 1,
    category: 'Oval',
    iRating,
    safetyRating: 2.4 + i * 0.3,
    licenseClass: 'D',
  })),
].sort((a, b) => a.at - b.at);

const meta: Meta<typeof DriverRatings> = {
  component: DriverRatings,
  title: 'components/Settings/DriverSettings',
  decorators: [
    (Story) => (
      <div className="bg-slate-700 p-4 text-white">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DriverRatings>;

export const WithHistory: Story = { args: { points } };
export const Empty: Story = { args: { points: [] } };
