import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

/** Monotonic deadlines; wall-clock discontinuities invalidate the capture. */
export function createCaptureClock({
  wallNow = Date.now,
  monotonicNow = () => performance.now(),
  maxWallDriftMs = 2000,
} = {}) {
  const wallStart = wallNow(),
    monotonicStart = monotonicNow();
  assert.ok(Number.isFinite(wallStart) && Number.isFinite(monotonicStart));
  const read = () => {
    const monotonicMs = monotonicNow(),
      wallMs = wallNow();
    const elapsedMs = monotonicMs - monotonicStart;
    assert.ok(
      Number.isFinite(elapsedMs) && elapsedMs >= 0,
      'Invalid monotonic capture clock'
    );
    const wallDriftMs = wallMs - wallStart - elapsedMs;
    assert.ok(
      Number.isFinite(wallDriftMs) && Math.abs(wallDriftMs) <= maxWallDriftMs,
      `Capture clock discontinuity: wall/monotonic drift ${wallDriftMs} ms; capture invalid`
    );
    return { monotonicMs, wallMs, wallDriftMs };
  };
  return {
    read,
    fromWallTimestamp(wallMs) {
      assert.ok(Number.isFinite(wallMs), 'Invalid capture origin timestamp');
      const now = read();
      return now.monotonicMs - (now.wallMs - wallMs);
    },
  };
}
