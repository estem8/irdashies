import type { Meta, StoryObj } from '@storybook/react-vite';
import { IbtInspectorView } from './IbtInspector';
const files = [
  {
    name: 'ferrari296gt3_nurburgring nordschleife 2026-11-14 21-57-21.ibt',
    sizeBytes: 64_560_000,
    modifiedAt: '2026-11-14T19:13:00Z',
  },
  {
    name: 'porsche992gt3r_spa 2026-11-13 18-30-00.ibt',
    sizeBytes: 48_200_000,
    modifiedAt: '2026-11-13T15:30:00Z',
  },
];
const meta = {
  component: IbtInspectorView,
  parameters: { layout: 'fullscreen' },
  args: {
    directory: 'C:\\Users\\user\\Documents\\iRacing\\telemetry',
    files,
    selected: files[0].name,
    speed: '1',
    busy: false,
    error: null,
    status: {
      file: files[0].name,
      playback: {
        position: 142,
        duration: 969.25,
        speed: 1,
        paused: false,
        ended: false,
        framesConsumed: 8521,
        framesDelivered: 8521,
      },
      warnings: [
        'No CarIdxLapDistPct: traffic-dependent widgets cannot be fully exercised.',
      ],
      capture: { active: true, samples: 12, reportPath: null, error: null },
    },
    onSelect: () => undefined,
    onSpeed: () => undefined,
    onAction: () => undefined,
  },
} satisfies Meta<typeof IbtInspectorView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Recording: Story = {};
export const Empty: Story = {
  args: {
    files: [],
    selected: '',
    status: {
      file: null,
      playback: null,
      warnings: [],
      capture: { active: false, samples: 0, reportPath: null, error: null },
    },
  },
};
export const Completed: Story = {
  args: {
    status: {
      ...meta.args.status,
      playback: { ...meta.args.status.playback, position: 969.25, ended: true },
      capture: {
        active: false,
        samples: 36,
        reportPath:
          'C:\\Users\\user\\AppData\\Roaming\\irdashies\\ibt-inspector\\runs\\1794680000000\\report.json',
        error: null,
      },
    },
  },
};
