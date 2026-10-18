import { defineWidgetManifest } from './types';

export default defineWidgetManifest({
  id: 'weather',
  name: 'Weather',
  enabled: true,
  layout: {
    x: 1334,
    y: 271,
    width: 380,
    height: 280,
  },
  config: {
    background: {
      opacity: 25,
    },
    units: 'auto',
    forecast: {
      enabled: true,
    },
    showOnlyWhenOnTrack: false,
    sessionVisibility: {
      race: true,
      loneQualify: true,
      openQualify: true,
      practice: true,
      offlineTesting: true,
    },
  },
  properties: {
    'background.opacity': {
      type: 'number',
      label: 'Background Opacity',
      min: 0,
      max: 100,
      step: 1,
      units: '%',
    },
    'forecast.enabled': {
      type: 'boolean',
      label: 'Show forecast',
      description:
        'Hourly estimate extrapolated from this session\u2019s weather trend',
    },
    units: {
      type: 'enum',
      label: 'Temperature Units',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'Metric', label: '\u00b0C' },
        { value: 'Imperial', label: '\u00b0F' },
      ],
    },
    showOnlyWhenOnTrack: {
      type: 'boolean',
      label: 'Show only when on track',
      description: 'If enabled, weather will only be shown when driving',
    },
  },
});
