import type { WidgetRuntimeDefinition } from '../../widgetRuntime';

export default {
  id: 'battle',
  sessionData: true,
  channels: [
    'car-speeds.snapshot',
    'lap-history.snapshot',
    'relative-gaps.snapshot',
    'standings.snapshot',
    'track-state.snapshot',
  ],
  ratePreset: 'driverFocused',
  channelRates: {
    'car-speeds.snapshot': 10,
    'lap-history.snapshot': 2,
    // RelativeGapProcessor ticks at 5 Hz, which is what the widget is built
    // around; the driverFocused preset would ask for 25 and never get it.
    'relative-gaps.snapshot': 5,
    'standings.snapshot': 5,
  },
} satisfies WidgetRuntimeDefinition;
