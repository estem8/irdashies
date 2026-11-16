import type { TapeReplayCommand, TapeReplayStatus } from './tapeReplay';

export interface IbtInspectorProcessSample {
  key: string;
  pid: number;
  creationTime?: number;
  type: string;
  name?: string;
  cpuPercent: number | null;
  cpuTimeMsPerSecond: number | null;
  memoryMB: number | null;
  privateMemoryMB: number | null;
}
export interface IbtInspectorRendererHeapSample {
  key: string;
  pid: number;
  route: string;
  usedHeapMB: number | null;
  totalHeapMB: number | null;
}
export interface IbtInspectorTelemetrySample {
  elapsedSeconds: number;
  mainV8HeapUsedMB: number;
  mainExternalMemoryMB: number;
  rendererHeaps: IbtInspectorRendererHeapSample[];
}
export interface IbtInspectorMemoryCheckpoint {
  scope: 'application';
  elapsedSeconds: number;
  appWorkingSetMB: number | null;
  appPrivateMemoryMB: number | null;
  mainV8HeapUsedMB: number;
  mainExternalMemoryMB: number;
  processes: IbtInspectorProcessSample[];
  rendererHeaps: IbtInspectorRendererHeapSample[];
}
export interface IbtInspectorStatus {
  file: string | null;
  playback: TapeReplayStatus | null;
  capture: {
    active: boolean;
    samples: number;
    error: string | null;
    reportPath: string | null;
    /** Latest sample only; full reports stream to disk. */
    telemetry: IbtInspectorTelemetrySample[];
    memoryCheckpoints: IbtInspectorMemoryCheckpoint[];
  };
}
/** Exposed only in the hidden CLI controller, never a product renderer. */
export interface IbtInspectorBridge {
  version: () => Promise<string>;
  playback: () => Promise<TapeReplayStatus | null>;
  status: () => Promise<IbtInspectorStatus>;
  load: (name: string, speed: number | 'max') => Promise<void>;
  command: (command: TapeReplayCommand) => Promise<void>;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  checkpointMemory: () => Promise<void>;
  stop: () => Promise<void>;
}
