import { sessionVisibilityProperties } from './properties';
import { defineWidgetManifest } from './types';

export default defineWidgetManifest({
  id: 'tires',
  name: 'Tires',
  enabled: false,
  layout: {
    x: 1334,
    y: 700,
    width: 280,
    height: 400,
  },
  config: {
    background: { opacity: 80 },
    units: 'auto',
    pressureUnits: 'auto',
    tempOptimal: 79,
    tempRange: 25,
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
    pressureUnits: {
      type: 'enum',
      label: 'Pressure Units',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'kPa', label: 'kPa' },
        { value: 'psi', label: 'psi' },
      ],
    },
    tempOptimal: {
      type: 'number',
      label: 'Optimal Temperature',
      description: 'Temperature shown green; colder turns blue, hotter red',
      min: 20,
      max: 150,
      step: 1,
      units: '\u00b0C',
    },
    tempRange: {
      type: 'number',
      label: 'Colour Range',
      description:
        'Degrees from the optimum at which the colour is fully blue or red',
      min: 5,
      max: 60,
      step: 1,
      units: '\u00b0C',
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
