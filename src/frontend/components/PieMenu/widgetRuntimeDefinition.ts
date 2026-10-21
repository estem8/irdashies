import type { WidgetRuntimeDefinition } from '../../widgetRuntime';

export default {
  id: 'piemenu',
  // Compound names come from the session's DriverTires.
  sessionData: true,
  channels: ['pit-service.snapshot'],
  channelRates: { 'pit-service.snapshot': 5 },
} satisfies WidgetRuntimeDefinition;
