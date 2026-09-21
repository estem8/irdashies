import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  CaptureChannelDecorator,
  TelemetryDecoratorWithConfig,
} from '@irdashies/storybook';
import { Radar } from './Radar';

/**
 * Recordings with cars inside the radar's range, so the story exercises the
 * real widget — session, channel snapshots and all — rather than props
 * assembled by hand.
 */
/** Interlagos: three cars around the player, one 2 m ahead and two 8 m back. */
const INTERLAGOS = '/test-data/1752616787256';
/** Virginia: four cars around the player, three of them on pit road. */
const VIRGINIA = '/test-data/1735296198162';

/** The disc sizes itself to its overlay window, so stories supply one. */
const frame = (children: React.ReactNode) => (
  <div style={{ width: 320, height: 320, background: '#1e293b' }}>
    {children}
  </div>
);

export default {
  component: Radar,
  title: 'widgets/Radar',
} as Meta<typeof Radar>;

type Story = StoryObj<typeof Radar>;

const story = (
  capture: string,
  config: Record<string, unknown> = {}
): Story => ({
  decorators: [
    CaptureChannelDecorator(capture),
    (Story, context) =>
      frame(
        TelemetryDecoratorWithConfig(capture, { radar: config })(Story, context)
      ),
  ],
});

export const Primary: Story = story(INTERLAGOS);

export const WideRange: Story = {
  ...story(INTERLAGOS, { radarRange: 25 }),
  name: 'Wide range',
};

/** Every car on pit road is on the racing line's centreline, so it would read
 * as a car directly in front; the toggle is what removes them. */
export const CarsInPitShown: Story = {
  ...story(VIRGINIA, { hideInPit: false }),
  name: 'Cars in pit shown',
};

export const CarsInPitHidden: Story = {
  ...story(VIRGINIA, { hideInPit: true }),
  name: 'Cars in pit hidden',
};
