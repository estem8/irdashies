import { sessionVisibilityProperties } from './properties';
import { defineWidgetManifest } from './types';

export default defineWidgetManifest({
  id: 'tires',
  name: 'Tires',
  enabled: false,
  layout: {
    x: 1334,
    y: 700,
    width: 340,
    height: 400,
  },
  config: {
    background: { opacity: 80 },
    units: 'auto',
    tempCold: 70,
    tempHot: 110,
    wearLimit: 30,
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
    units: {
      type: 'enum',
      label: 'Temperature Units',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'Metric', label: 'Celsius' },
        { value: 'Imperial', label: 'Fahrenheit' },
      ],
    },
    tempCold: {
      type: 'number',
      label: 'Cold Below',
      description: 'Carcass temperature below which a zone is shown as cold',
      min: 0,
      max: 150,
      step: 1,
      units: '°C',
    },
    tempHot: {
      type: 'number',
      label: 'Hot Above',
      description: 'Carcass temperature above which a zone is shown as hot',
      min: 0,
      max: 200,
      step: 1,
      units: '°C',
    },
    wearLimit: {
      type: 'number',
      label: 'Wear Limit',
      description: 'Laps left counts down to this much tread remaining',
      min: 0,
      max: 90,
      step: 1,
      units: '%',
    },
    showOnlyWhenOnTrack: {
      type: 'boolean',
      label: 'Show only when on track',
      description: 'If enabled, tires will only be shown when driving',
    },
    ...sessionVisibilityProperties(),
  },
});
