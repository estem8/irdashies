import type { Meta, StoryObj } from '@storybook/react-vite';
import { getWidgetDefaultConfig } from '@irdashies/types';
import { PieMenuView } from './PieMenuView';
import { DEMO_PIT_SERVICE, type PitServiceView } from './pieMenuModel';

const QUIET: PitServiceView = {
  ...DEMO_PIT_SERVICE,
  tires: { lf: {}, rf: {}, lr: {}, rr: {} },
  anyTireChange: false,
  fuelAdd: undefined,
  fuelOn: false,
  repair: false,
};

const meta: Meta<typeof PieMenuView> = {
  title: 'Widgets/PieMenu',
  component: PieMenuView,
  parameters: { layout: 'centered' },
  args: {
    state: { level: 'root' },
    config: getWidgetDefaultConfig('piemenu'),
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

export const Root: Story = {};
export const PitStopPlanned: Story = { args: { service: DEMO_PIT_SERVICE } };
export const TiresMenu: Story = {
  args: { state: { level: 'sub', entry: 'left' }, service: DEMO_PIT_SERVICE },
};
export const FuelMenu: Story = {
  args: { state: { level: 'sub', entry: 'down' }, service: DEMO_PIT_SERVICE },
};
/** After picking a compound: the tires change colour in place of the menu. */
export const TiresResult: Story = {
  args: {
    state: { level: 'result', feedback: 'tires' },
    service: DEMO_PIT_SERVICE,
  },
};
export const FuelResult: Story = {
  args: {
    state: { level: 'result', feedback: 'fuel' },
    service: DEMO_PIT_SERVICE,
  },
};
export const RepairResult: Story = {
  args: {
    state: { level: 'result', feedback: 'repair' },
    service: DEMO_PIT_SERVICE,
  },
};
