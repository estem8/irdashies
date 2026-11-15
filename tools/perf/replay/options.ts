import path from 'node:path';

export interface ReplayOptions {
  check?: 'smoke' | 'complete';
  expectChannels?: string[];
  requireCoverage?: boolean;
  input: string;
  repeat?: number;
  memory?: 'checkpoints' | 'allocations';
  collection?: 'on' | 'off';
  settings?: 'closed' | 'standings';
  speed: number | 'max';
  widgets: string;
  profile?: string;
  output: string;
  warmupSeconds: number;
  limitSeconds?: number;
  startupTimeoutSeconds: number;
}

export const REPLAY_USAGE = `Usage: npm run perf -- replay <session.ibt|capture.irdt> [options]
  --check smoke|complete  Fail on unhealthy source, missing mounts or skipped frames; complete also requires EOF
  --expect-channels a.snapshot,b.snapshot  Require positive channel deliveries
  --require-coverage on|off  Require audited baseline fields for every selected widget
  --repeat N           Repeat in the same app process (1–20)
  --memory checkpoints|allocations  Forced-GC checkpoints; optional live allocation sampling
  --settings closed|standings  Optional visible Settings preview workload
  --collection on|off   Existing periodic metrics (default on)
  --speed 1|4|max       Playback multiplier (0.25–100), or lossless maximum SDK throughput
  --widgets all|saved|standings,input,...  All profile widgets by default
  --profile config.json|defaults  Configuration copied into an isolated temporary profile
  --output directory   New directory for logs, report.json and report.md
  --warmup-seconds 2   Paused startup settling time; not a rolling replay warmup
  --limit-seconds N    Stop each cycle after N wall seconds; mark run incomplete
  --startup-timeout 120  Fail if the isolated overlay is not ready
`;

export function parseReplayOptions(args: string[]): ReplayOptions {
  if (args[0] !== 'replay' || !args[1] || args[1].startsWith('--'))
    throw new Error(REPLAY_USAGE);
  const values = new Map<string, string>();
  const allowed = new Set([
    '--check',
    '--expect-channels',
    '--require-coverage',
    '--repeat',
    '--memory',
    '--collection',
    '--settings',
    '--speed',
    '--widgets',
    '--profile',
    '--output',
    '--warmup-seconds',
    '--limit-seconds',
    '--startup-timeout',
  ]);
  for (let i = 2; i < args.length; i += 2) {
    const key = args[i],
      value = args[i + 1];
    if (
      !allowed.has(key) ||
      !value ||
      value.startsWith('--') ||
      values.has(key)
    )
      throw new Error(`Invalid option: ${key}\n${REPLAY_USAGE}`);
    values.set(key, value);
  }
  const speedText = values.get('--speed') ?? '1';
  const speed = speedText === 'max' ? 'max' : Number(speedText);
  if (
    speed !== 'max' &&
    (!Number.isFinite(speed) || speed < 0.25 || speed > 100)
  )
    throw new Error('--speed must be max or between 0.25 and 100');
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error(`Invalid ${key}`);
    return value;
  };
  const widgets = values.get('--widgets') ?? 'all';
  if (!/^[a-z0-9-]+(?:,[a-z0-9-]+)*$/.test(widgets))
    throw new Error('Invalid --widgets list');
  const repeat = number('--repeat', 1, 1, 20);
  if (!Number.isInteger(repeat)) throw new Error('--repeat must be an integer');
  const memory = values.get('--memory');
  if (
    memory !== undefined &&
    memory !== 'checkpoints' &&
    memory !== 'allocations'
  )
    throw new Error('Invalid --memory mode');
  if (memory && repeat < 2)
    throw new Error('--memory requires at least two replay cycles');
  const settings = values.get('--settings') ?? 'closed';
  if (settings !== 'closed' && settings !== 'standings')
    throw new Error('Invalid --settings mode');
  const collection = values.get('--collection') ?? 'on';
  if (collection !== 'on' && collection !== 'off')
    throw new Error('Invalid --collection mode');
  const check = values.get('--check');
  if (check !== undefined && check !== 'smoke' && check !== 'complete')
    throw new Error('Invalid --check mode');
  const expectChannels = values.get('--expect-channels')?.split(',');
  if (expectChannels?.some((name) => !/^[a-z][a-z0-9.-]{0,100}$/.test(name)))
    throw new Error('Invalid --expect-channels list');
  const coverage = values.get('--require-coverage') ?? 'off';
  if (coverage !== 'on' && coverage !== 'off')
    throw new Error('Invalid --require-coverage mode');
  return {
    check,
    expectChannels,
    requireCoverage: coverage === 'on',
    input: path.resolve(args[1]),
    repeat,
    memory,
    collection,
    settings,
    speed,
    widgets,
    profile: values.get('--profile'),
    output: path.resolve(
      values.get('--output') ?? `perf-results/replay-${Date.now()}`
    ),
    warmupSeconds: number('--warmup-seconds', 2, 0, 60),
    limitSeconds: values.has('--limit-seconds')
      ? number('--limit-seconds', 1, 0.01, 86400)
      : undefined,
    startupTimeoutSeconds: number('--startup-timeout', 120, 5, 600),
  };
}
