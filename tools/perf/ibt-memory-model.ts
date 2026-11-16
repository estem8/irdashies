import type { TapeReplayStatus } from '../../src/types/tapeReplay.ts';

export function requirePausedReplay(
  status: TapeReplayStatus | null
): asserts status is TapeReplayStatus {
  if (
    !status?.frameByFrame ||
    !status.maximumSpeed ||
    !status.paused ||
    status.framesRemaining !== 0 ||
    status.failed ||
    status.ended
  ) {
    throw new Error(
      'Memory measurement requires an idle, paused max frame-by-frame replay (not EOF)'
    );
  }
}

export function validateAdvance(
  before: TapeReplayStatus,
  after: TapeReplayStatus,
  expected: number
) {
  requirePausedReplay(before);
  requirePausedReplay(after);
  const consumed =
    (after.framesConsumed ?? NaN) - (before.framesConsumed ?? NaN);
  const delivered =
    (after.framesDelivered ?? NaN) - (before.framesDelivered ?? NaN);
  if (consumed !== expected || delivered !== expected) {
    throw new Error(
      `Unequal workload: expected ${expected} frames, consumed ${consumed}, delivered ${delivered}`
    );
  }
  return { consumed, delivered };
}

export function requireSameProcesses(before: string[], after: string[]) {
  if (
    JSON.stringify([...before].sort()) !== JSON.stringify([...after].sort())
  ) {
    throw new Error(
      'Process topology changed; memory floors are not comparable'
    );
  }
}
