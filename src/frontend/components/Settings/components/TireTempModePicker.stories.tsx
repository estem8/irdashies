import { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TireTempMode, TireTempModePicker } from './TireTempModePicker';

const meta: Meta<typeof TireTempModePicker> = {
  component: TireTempModePicker,
  title: 'components/TireTempModePicker',
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<TireTempMode>('average');
    return <TireTempModePicker value={value} onChange={setValue} />;
  },
};
