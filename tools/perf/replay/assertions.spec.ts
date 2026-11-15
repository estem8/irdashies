import { expect, it } from 'vitest';
import { checkReplayReport } from './assertions';
import { createReplayReport } from './report';

function report() {
  const before = {
    position: 0,
    duration: 10,
    speed: 1,
    paused: false,
    ended: false,
    failed: false,
    framesConsumed: 1,
    framesDelivered: 1,
  };
  return createReplayReport({
    input: {
      format: 'ibt',
      frames: 10,
      durationSeconds: 10,
      tickRate: 60,
      variables: ['Throttle', 'Brake', 'SteeringWheelAngle'],
      warnings: [],
    },
    requestedSpeed: 1,
    elapsedSeconds: 1,
    before,
    after: { ...before, framesConsumed: 10, framesDelivered: 10 },
    resourcesBefore: [],
    resourcesAfter: [],
    log: '',
    selectedWidgets: ['input'],
    mountedWidgets: ['input'],
    finished: false,
  });
}

it('allows bounded smoke runs but requires EOF for complete checks', () => {
  expect(
    checkReplayReport(report(), {
      check: 'smoke',
      requireCoverage: true,
    }).every((check) => check.passed)
  ).toBe(true);
  expect(
    checkReplayReport(report(), { check: 'complete' })
      .filter((check) => !check.passed)
      .map((check) => check.name)
  ).toEqual(['Playback completed']);
});

it('fails for missing/unknown evidence instead of treating absence as zero', () => {
  const value = report();
  value.playback.sourceFailed = null;
  value.playback.sourceFramesSuperseded = null;
  value.coverage = [{ widget: 'new-widget', status: 'unknown', missing: [] }];
  expect(
    checkReplayReport(value, {
      check: 'smoke',
      expectChannels: ['driver-controls.snapshot'],
      requireCoverage: true,
    })
      .filter((check) => !check.passed)
      .map((check) => check.name)
  ).toEqual([
    'Source healthy',
    'No source supersession',
    'Channel driver-controls.snapshot delivered',
    'Fields for new-widget',
  ]);
});

it('requires positive deliveries rather than publications or processor executions', () => {
  const value = report();
  value.observations.channelCounts['driver-controls.snapshot'] = {
    publications: 100,
    deliveries: 0,
  };
  expect(
    checkReplayReport(value, {
      expectChannels: ['driver-controls.snapshot'],
    })[0].passed
  ).toBe(false);
  value.observations.channelCounts['driver-controls.snapshot'].deliveries = 1;
  expect(
    checkReplayReport(value, {
      expectChannels: ['driver-controls.snapshot'],
    })[0].passed
  ).toBe(true);
});
