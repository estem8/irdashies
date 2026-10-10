import { defineWidgetManifest } from './types';

export default defineWidgetManifest({
  id: 'telemetryinspector',
  name: 'Telemetry Inspector',
  showInMenu: false,
  enabled: false,
  layout: {
    x: 50,
    y: 50,
    width: 250,
    height: 200,
  },
  config: {
    background: {
      opacity: 80,
    },
    properties: [
      { source: 'telemetry', path: 'Speed', label: 'Speed' },
      { source: 'telemetry', path: 'SessionTime', label: 'Session Time' },
    ],
  },
});
