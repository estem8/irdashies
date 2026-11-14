import type { TapeReplayCommand, TapeReplayStatus } from './tapeReplay';

export interface IbtFile {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface IbtInspectorStatus {
  file: string | null;
  playback: TapeReplayStatus | null;
  warnings: string[];
  capture: {
    active: boolean;
    samples: number;
    reportPath: string | null;
    error: string | null;
  };
}

export interface IbtInspectorBridge {
  open: () => Promise<void>;
  list: () => Promise<{
    directory: string;
    files: IbtFile[];
    truncated: boolean;
  }>;
  status: () => Promise<IbtInspectorStatus>;
  load: (name: string, speed: number | 'max') => Promise<void>;
  command: (command: TapeReplayCommand) => Promise<void>;
  stop: () => Promise<void>;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  showReport: () => Promise<void>;
}
