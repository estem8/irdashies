import { defineWidgetManifest } from './types';

export default defineWidgetManifest({
  id: 'piemenu',
  name: 'Pie Menu',
  enabled: false,
  layout: {
    x: 760,
    y: 340,
    width: 300,
    height: 300,
  },
  config: {
    menu: {
      up: { action: 'tearoff' },
      right: { action: 'repair' },
      left: {
        action: 'submenu',
        label: 'Tires',
        icon: 'tires',
        sub: {
          left: { action: 'tiresAll' },
          up: { action: 'compoundDry' },
          down: { action: 'compoundWet' },
          right: { action: 'back' },
        },
      },
      down: {
        action: 'submenu',
        label: 'Fuel',
        icon: 'fuel',
        sub: {
          down: { action: 'fuelAuto' },
          right: { action: 'fuelAdd' },
          left: { action: 'fuelSub' },
          up: { action: 'back' },
        },
      },
    },
    timeoutSeconds: 5,
    fuelStep: 10,
  },
  properties: {
    timeoutSeconds: {
      type: 'number',
      control: 'input',
      label: 'Auto-close',
      description: 'Close the menu after this many seconds without input',
      min: 1,
      max: 30,
      step: 1,
      units: 's',
    },
    fuelStep: {
      type: 'number',
      control: 'input',
      label: 'Fuel Step',
      description:
        'Litres added by Add fuel. Add double fuel adds twice as much',
      min: 1,
      max: 100,
      step: 1,
      units: 'L',
    },
  },
});
