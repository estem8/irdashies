import type { Meta, StoryObj } from '@storybook/react-vite';
import { PieMenuView } from './PieMenu';
import {
  DEMO_PIT_SERVICE,
  INITIAL_PIE_STATE,
  type PitServiceView,
} from './pieMenuModel';

const QUIET: PitServiceView = {
  tires: { lf: {}, rf: {}, lr: {}, rr: {} },
  current: { letter: 'W', color: '#2f9bff' },
  anyTireChange: false,
  fuelLevel: 8.4,
  fuelPct: 0.14,
  repair: false,
  tearoff: false,
};

const meta: Meta<typeof PieMenuView> = {
  title: 'Widgets/PieMenu',
  component: PieMenuView,
  parameters: { layout: 'centered' },
  args: {
    level: 'root',
    state: INITIAL_PIE_STATE,
    config: {
      fuelStep: 10,
      sides: { up: 'tearoff', right: 'repair', down: 'fuel', left: 'tires' },
    },
    service: QUIET,
  },
  decorators: [
    (Story) => (
      <div className="w-[300px] h-[300px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Wet tires on the car, low fuel, nothing requested. */
export const Root: Story = {};
/** W to S on the front left and right, 20 L and a fast repair requested. */
export const PitStopPlanned: Story = { args: { service: DEMO_PIT_SERVICE } };
export const Tires: Story = {
  args: {
    level: 'tires',
    state: { ...INITIAL_PIE_STATE, level: 'tires', entry: 'left' },
    service: DEMO_PIT_SERVICE,
  },
};
export const Fuel: Story = {
  args: {
    level: 'fuel',
    state: { ...INITIAL_PIE_STATE, level: 'fuel', entry: 'down' },
    service: DEMO_PIT_SERVICE,
  },
};
