import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureClock } from './capture-clock.mjs';

test('convert capture origin once and use a monotonic elapsed clock', () => {
  let wall = 10000,
    mono = 100;
  const clock = createCaptureClock({
    wallNow: () => wall,
    monotonicNow: () => mono,
  });
  assert.equal(clock.fromWallTimestamp(9500), -400);
  wall += 1000;
  mono += 1000;
  assert.equal(clock.read().monotonicMs - -400, 1500);
});
test('reject a three-hour forward wall jump instead of reporting app shutdown failure', () => {
  let wall = 10000,
    mono = 100;
  const clock = createCaptureClock({
    wallNow: () => wall,
    monotonicNow: () => mono,
  });
  wall += 3 * 60 * 60 * 1000;
  mono += 10;
  assert.throws(() => clock.read(), /Capture clock discontinuity/);
});
test('reject a backwards wall adjustment', () => {
  let wall = 10000,
    mono = 100;
  const clock = createCaptureClock({
    wallNow: () => wall,
    monotonicNow: () => mono,
  });
  wall -= 5000;
  mono += 1000;
  assert.throws(() => clock.read(), /Capture clock discontinuity/);
});
test('allow small clock drift but preserve monotonic durations', () => {
  let wall = 10000,
    mono = 100;
  const clock = createCaptureClock({
    wallNow: () => wall,
    monotonicNow: () => mono,
  });
  wall += 1050;
  mono += 1000;
  assert.deepEqual(clock.read(), {
    wallMs: 11050,
    monotonicMs: 1100,
    wallDriftMs: 50,
  });
});
