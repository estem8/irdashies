import type { WidgetRuntimeDefinition } from '../../widgetRuntime';

export default {
  id: 'tires',
  sessionData: true,
  channels: ['tires.snapshot', 'session-bar.snapshot', 'track-state.snapshot'],
  ratePreset: 'informational',
  channelRates: { 'tires.snapshot': 10 },
} satisfies WidgetRuntimeDefinition;
