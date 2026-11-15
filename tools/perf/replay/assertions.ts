import type { createReplayReport } from './report';
import type { ReplayOptions } from './options';

export interface ReplayAssertion {
  name: string;
  passed: boolean;
  detail: string;
}

export function checkReplayReport(
  report: ReturnType<typeof createReplayReport>,
  options: Pick<ReplayOptions, 'check' | 'expectChannels' | 'requireCoverage'>
): ReplayAssertion[] {
  const checks: ReplayAssertion[] = [];
  const add = (name: string, passed: boolean, detail: string) =>
    checks.push({ name, passed, detail });
  if (options.check) {
    add(
      'SDK frames returned',
      (report.playback.sdkFramesReturned ?? 0) > 0,
      String(report.playback.sdkFramesReturned ?? 'unavailable')
    );
    add(
      'Source healthy',
      report.playback.sourceFailed === false,
      String(report.playback.sourceFailed ?? 'unavailable')
    );
    add(
      'No source supersession',
      report.playback.sourceFramesSuperseded === 0,
      String(report.playback.sourceFramesSuperseded ?? 'unavailable')
    );
    for (const widget of report.widgets)
      add(`Mounted ${widget.id}`, widget.wrapperObserved, widget.coverage);
    if (options.check === 'complete')
      add('Playback completed', report.finished, String(report.finished));
  }
  for (const name of options.expectChannels ?? []) {
    const count = report.observations.channelCounts[name]?.deliveries;
    add(
      `Channel ${name} delivered`,
      typeof count === 'number' && count > 0,
      String(count ?? 'unavailable')
    );
  }
  if (options.requireCoverage) {
    for (const coverage of report.coverage)
      add(
        `Fields for ${coverage.widget}`,
        coverage.status === 'fields-present',
        coverage.missing.length
          ? `Missing ${coverage.missing.join(', ')}`
          : coverage.status
      );
  }
  return checks;
}
