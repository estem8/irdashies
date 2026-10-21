import type { Meta, StoryObj } from '@storybook/react-vite';
import { PieMenuView } from './PieMenu';
import { INITIAL_PIE_STATE } from './pieMenuModel';

const meta: Meta<typeof PieMenuView> = {
  title: 'Widgets/PieMenu',
  component: PieMenuView,
  parameters: { layout: 'centered' },
  args: {
    level: 'root',
    state: INITIAL_PIE_STATE,
    fuelStep: 10,
    timeoutSeconds: 5,
    activity: 0,
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

export const Root: Story = {};
export const Tires: Story = { args: { level: 'tires' } };
export const Fuel: Story = { args: { level: 'fuel' } };
