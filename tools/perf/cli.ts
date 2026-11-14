import { parseReplayOptions, REPLAY_USAGE } from './replay/options.ts';
import { runOverlayReplay } from './replay/runner.ts';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  process.stdout.write(REPLAY_USAGE);
} else {
  const controller = new AbortController();
  const stop = () => controller.abort(new Error('Replay interrupted'));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const options = parseReplayOptions(args);
    process.stdout.write(
      `Preparing ${options.input}\nReports: ${options.output}\n`
    );
    const report = await runOverlayReplay(options, controller.signal);
    process.stdout.write(
      `Completed: ${report.finished}. SDK frames: ${report.playback.sdkFramesReturned ?? 'unavailable'}. Source superseded: ${report.playback.sourceFramesSuperseded ?? 'unavailable'}.\nCPU: ${report.resources.totalCpuMsPerSecond?.toFixed(2) ?? 'unavailable'} ms/s.\nReport: ${options.output}/report.md\n`
    );
    if (!report.finished)
      process.stdout.write('Playback was limited; report is incomplete.\n');
  } catch (error) {
    process.stderr.write(
      `Replay failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
