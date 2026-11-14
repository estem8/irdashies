import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { IbtInspector } from './IbtInspector';
import type { IbtInspectorBridge, IbtInspectorStatus } from '@irdashies/types';
it('lists recordings, loads selected source paused, and starts capture with playback', async () => {
  const status: IbtInspectorStatus = {
    file: null,
    playback: null,
    warnings: [],
    capture: { active: false, samples: 0, reportPath: null, error: null },
  };
  const bridge: IbtInspectorBridge = {
    open: vi.fn(),
    list: vi.fn(async () => ({
      directory: 'C:\\Users\\user\\Documents\\iRacing\\telemetry',
      files: [
        {
          name: 'race.ibt',
          sizeBytes: 1024,
          modifiedAt: '2026-11-14T19:00:00Z',
        },
      ],
      truncated: false,
    })),
    status: vi.fn(async () => structuredClone(status)),
    load: vi.fn(async () => {
      status.file = 'race.ibt';
      status.playback = {
        position: 0,
        duration: 10,
        speed: 1,
        paused: true,
        ended: false,
      };
    }),
    command: vi.fn(async () => undefined),
    stop: vi.fn(),
    startCapture: vi.fn(),
    stopCapture: vi.fn(),
    showReport: vi.fn(),
  };
  render(<IbtInspector bridge={bridge} />);
  await screen.findByRole('option', { name: /race.ibt/ });
  fireEvent.click(screen.getByRole('button', { name: 'Load recording' }));
  await waitFor(() => expect(bridge.load).toHaveBeenCalledWith('race.ibt', 1));
  await screen.findByRole('button', { name: 'Play' });
  fireEvent.click(screen.getByRole('button', { name: 'Start capture' }));
  await waitFor(() => expect(bridge.startCapture).toHaveBeenCalled());
  await waitFor(() =>
    expect(bridge.command).toHaveBeenCalledWith({
      type: 'pause',
      paused: false,
    })
  );
});
it('shows file access errors without presenting an empty successful list', async () => {
  const bridge = {
    list: vi.fn(async () => {
      throw new Error('Access denied');
    }),
    status: vi.fn(async () => ({
      file: null,
      playback: null,
      warnings: [],
      capture: { active: false, samples: 0, reportPath: null, error: null },
    })),
  } as unknown as IbtInspectorBridge;
  render(<IbtInspector bridge={bridge} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
});
