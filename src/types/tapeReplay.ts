/** Transport time is seconds since the start of the tape, not SessionTime. */
export interface TapeReplayStatus {
  position: number;
  duration: number;
  speed: number;
  paused: boolean;
  ended: boolean;
  /** Optional for older native addons; counters exclude the indexing pass. */
  maximumSpeed?: boolean;
  frameByFrame?: boolean;
  failed?: boolean;
  error?: string;
  loop?: { start: number; end: number } | null;
  canStep?: boolean;
  framesConsumed?: number;
  framesDelivered?: number;
  /** Remaining frames in a bounded frame-by-frame advance; zero when idle. */
  framesRemaining?: number;
}

export const TAPE_REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 5, 10] as const;
export const MAX_REPLAY_ADVANCE_FRAMES = 1_000_000;

export type TapeReplayCommand =
  | { type: 'step' }
  | { type: 'advance'; frames: number }
  | { type: 'loop'; range: { start: number; end: number } | null }
  | { type: 'seek'; seconds: number }
  | { type: 'speed'; speed: number }
  | { type: 'pause'; paused: boolean };

/** Available only for the in-process iRacing tape transport. */
export interface TapeReplayBridge {
  getStatus: () => Promise<TapeReplayStatus | null>;
  command: (command: TapeReplayCommand) => Promise<TapeReplayStatus>;
}
