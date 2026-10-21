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
    sides: { up: 'tearoff', right: 'repair', down: 'fuel', left: 'tires' },
    timeoutSeconds: 5,
    fuelStep: 10,
  },
  properties: {
    'sides.up': {
      type: 'enum',
      control: 'select',
      label: 'Up',
      description: 'What this side of the main menu does',
      options: [
        { value: 'tearoff', label: 'Tear-off' },
        { value: 'tires', label: 'Tires' },
        { value: 'fuel', label: 'Fuel' },
        { value: 'repair', label: 'Fast repair' },
        { value: 'none', label: 'Nothing' },
      ],
    },
    'sides.right': {
      type: 'enum',
      control: 'select',
      label: 'Right',
      description: 'What this side of the main menu does',
      options: [
        { value: 'tearoff', label: 'Tear-off' },
        { value: 'tires', label: 'Tires' },
        { value: 'fuel', label: 'Fuel' },
        { value: 'repair', label: 'Fast repair' },
        { value: 'none', label: 'Nothing' },
      ],
    },
    'sides.down': {
      type: 'enum',
      control: 'select',
      label: 'Down',
      description: 'What this side of the main menu does',
      options: [
        { value: 'tearoff', label: 'Tear-off' },
        { value: 'tires', label: 'Tires' },
        { value: 'fuel', label: 'Fuel' },
        { value: 'repair', label: 'Fast repair' },
        { value: 'none', label: 'Nothing' },
      ],
    },
    'sides.left': {
      type: 'enum',
      control: 'select',
      label: 'Left',
      description: 'What this side of the main menu does',
      options: [
        { value: 'tearoff', label: 'Tear-off' },
        { value: 'tires', label: 'Tires' },
        { value: 'fuel', label: 'Fuel' },
        { value: 'repair', label: 'Fast repair' },
        { value: 'none', label: 'Nothing' },
      ],
    },
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
        'Litres added by the first fuel sector. The second sector adds twice as much',
      min: 1,
      max: 100,
      step: 1,
      units: 'L',
    },
  },
});
