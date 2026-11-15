import { describe, expect, it } from 'vitest';
import { parseReplayOptions } from './options';
import {
  configureReplayProfile,
  hasCompleteTopology,
  runOverlayReplay,
} from './runner';
import { createReplayReport } from './report';
import { checkReplayReport } from './assertions';

it('accepts maximum/numeric speeds and rejects ambiguous arguments', () => {
  expect(
    parseReplayOptions(['replay', 'race.ibt', '--speed', 'max']).speed
  ).toBe('max');
  expect(parseReplayOptions(['replay', 'race.ibt', '--speed', '4']).speed).toBe(
    4
  );
  for (const extra of [
    ['--speed', '0'],
    ['--speed', 'NaN'],
    ['--unknown', '1'],
    ['--speed'],
  ]) {
    expect(() =>
      parseReplayOptions(['replay', 'race.ibt', ...extra])
    ).toThrow();
  }
});

it('selects all profile widgets without mutating the source or user configuration', () => {
  const config = {
    currentProfile: 'default',
    dashboards: {
      default: {
        widgets: [
          { id: 'input', enabled: true },
          { id: 'relative', enabled: false },
        ],
      },
    },
  };
  const all = configureReplayProfile(config, 'all');
  expect(all.widgetTypes).toEqual(['input', 'relative']);
  expect(config.dashboards.default.widgets[1].enabled).toBe(false);
  expect(configureReplayProfile(config, 'saved').widgetTypes).toEqual([
    'input',
  ]);
  expect(() => configureReplayProfile(config, 'missing')).toThrow('absent');
});

describe('replay report', () => {
  it('separates source skipping, observed draws and unproven widget activity', () => {
    const status = {
      position: 0,
      duration: 1,
      speed: 1,
      paused: false,
      ended: false,
      framesConsumed: 1,
      framesDelivered: 1,
    };
    const report = createReplayReport({
      input: {
        format: 'ibt',
        frames: 10,
        durationSeconds: 1,
        tickRate: 60,
        variables: [],
        warnings: [],
      },
      requestedSpeed: 'max',
      elapsedSeconds: 0.5,
      before: status,
      after: { ...status, ended: true, framesConsumed: 10, framesDelivered: 5 },
      resourcesBefore: [],
      resourcesAfter: [],
      log:
        '[PerfMetrics:JSON] ' +
        JSON.stringify({
          sections: { sdkWaitForData: { count: 2, avgMs: 4, maxMs: 6 } },
          channelMetrics: { processorExecutions: { trackState: 2 } },
        }),
      selectedWidgets: ['map', 'radio'],
      selectedWidgetTypes: ['map', 'radio'],
      mountedWidgets: ['map'],
      finished: true,
    });
    expect(report.playback).toMatchObject({
      sourceFramesConsumed: 9,
      sdkFramesReturned: 4,
      sourceFramesSuperseded: 5,
    });
    expect(report.observations.drawCalls).toBeNull();
    expect(report.observations.processingSections.sdkWaitForData).toEqual({
      count: 2,
      totalWallMs: 8,
      maxWallMs: 6,
    });
    expect(report.observations.processorExecutions.trackState).toBe(2);
    expect(report.widgets[0].coverage).toContain('activity not proven');
    expect(report.widgets[1].coverage).toBe('not observed');
    expect(report.resources.totalCpuMsPerSecond).toBeNull();
  });
});

it('requires a complete topology for this run rather than a partial or timed-out marker', () => {
  expect(hasCompleteTopology('[PerfRunTopology:JSON] {')).toBe(false);
  expect(
    hasCompleteTopology(
      '[PerfRunTopology:JSON] {"complete":false,"timedOut":true}'
    )
  ).toBe(false);
  const marker =
    '[PerfRunTopology:JSON] {"complete":true,"timedOut":false,"runId":"owned"}';
  expect(hasCompleteTopology(marker, 'other')).toBe(false);
  expect(hasCompleteTopology(marker, 'owned')).toBe(true);
});

it('honors cancellation before preparing input or spawning Electron', async () => {
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await expect(
    runOverlayReplay(
      parseReplayOptions(['replay', 'missing.ibt']),
      controller.signal
    )
  ).rejects.toThrow('cancelled');
});

it('validates opt-in CLI acceptance modes and channel expectations', () => {
  expect(
    parseReplayOptions([
      'replay',
      'race.ibt',
      '--profile',
      'defaults',
      '--check',
      'smoke',
      '--expect-channels',
      'driver-controls.snapshot,track-state.snapshot',
      '--require-coverage',
      'on',
    ])
  ).toMatchObject({
    profile: 'defaults',
    check: 'smoke',
    expectChannels: ['driver-controls.snapshot', 'track-state.snapshot'],
    requireCoverage: true,
  });
  for (const extra of [
    ['--check', 'yes'],
    ['--expect-channels', 'bad/name'],
    ['--require-coverage', 'true'],
  ])
    expect(() =>
      parseReplayOptions(['replay', 'race.ibt', ...extra])
    ).toThrow();
});

it.each([true, false])(
  'checks duplicated widget types while retaining instance mount checks (complete fields: %s)',
  (completeFields) => {
    const profile = configureReplayProfile(
      {
        currentProfile: 'default',
        dashboards: {
          default: {
            widgets: [
              { id: 'input-copy', type: 'input', enabled: true },
              { id: 'input-second', type: 'input', enabled: true },
            ],
          },
        },
      },
      'saved'
    );
    const status = {
      position: 0,
      duration: 1,
      speed: 1,
      paused: false,
      ended: false,
      failed: false,
      framesConsumed: 1,
      framesDelivered: 1,
    };
    const report = createReplayReport({
      input: {
        format: 'ibt',
        frames: 60,
        durationSeconds: 1,
        tickRate: 60,
        variables: completeFields
          ? ['Throttle', 'Brake', 'SteeringWheelAngle']
          : ['Throttle', 'SteeringWheelAngle'],
        warnings: [],
      },
      requestedSpeed: 1,
      elapsedSeconds: 1,
      before: status,
      after: { ...status, framesConsumed: 60, framesDelivered: 60 },
      resourcesBefore: [],
      resourcesAfter: [],
      log: '',
      selectedWidgets: profile.widgetIds,
      selectedWidgetTypes: profile.widgetTypes,
      mountedWidgets: ['input-copy'],
      finished: false,
    });
    expect(report.coverage).toEqual([
      {
        widget: 'input',
        status: completeFields ? 'fields-present' : 'missing-fields',
        missing: completeFields ? [] : ['Brake'],
      },
    ]);
    expect(checkReplayReport(report, { requireCoverage: true })).toEqual([
      {
        name: 'Fields for input',
        passed: completeFields,
        detail: completeFields ? 'fields-present' : 'Missing Brake',
      },
    ]);
    expect(
      checkReplayReport(report, { check: 'smoke' })
        .filter((check) => !check.passed)
        .map((check) => check.name)
    ).toEqual(['Mounted input-second']);
  }
);
