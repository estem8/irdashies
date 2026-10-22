import type { WidgetRuntimeDefinition } from '../../widgetRuntime';

export default {
  id: 'piemenu',
  // Compound names come from the session's DriverTires.
  sessionData: true,
  channels: ['pit-service.snapshot', 'fuel.projection', 'track-state.snapshot'],
  channelRates: {
    'pit-service.snapshot': 5,
    'fuel.projection': 1,
    // Only read for being in the car and replay.
    'track-state.snapshot': 1,
  },
} satisfies WidgetRuntimeDefinition;
