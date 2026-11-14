import { describe, expect, it } from 'vitest';
import { parseReplayOptions } from './options';
import {
  configureReplayProfile,
  hasCompleteTopology,
  runOverlayReplay,
} from './runner';
import { createReplayReport } from './report';

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
