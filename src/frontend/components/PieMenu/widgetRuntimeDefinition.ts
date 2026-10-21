import type { WidgetRuntimeDefinition } from '../../widgetRuntime';

// Driven by keybinding events from the main process; needs no telemetry.
export default {
  id: 'piemenu',
} satisfies WidgetRuntimeDefinition;
