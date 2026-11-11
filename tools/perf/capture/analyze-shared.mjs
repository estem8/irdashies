import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const folder = resolve(process.argv[2]);
const phases = JSON.parse(
  await readFile(resolve(folder, 'phases.json'), 'utf8')
);
const lines = (await readFile(resolve(folder, 'metrics.log'), 'utf8')).split(
  '\n'
);
const parse = (marker) =>
  lines.flatMap((line) => {
    const pos = line.indexOf(marker);
    if (pos < 0) return [];
    try {
      return [JSON.parse(line.slice(pos + marker.length))];
    } catch {
      return [];
    }
  });
const mains = parse('[PerfMetrics:JSON] ');
const renders = parse('[PerfRenderer:JSON] ');
const result = [];
for (const phase of phases) {
  const contains = (sample) => {
    const end = Date.parse(sample.timestamp);
    return (
      end - sample.intervalMs >= phase.startedAt &&
      end <= phase.startedAt + 15000
    );
  };
  const main = mains.filter(contains);
  const render = renders.filter((s) => contains(s) && s.route === '/');
  const seconds = main.reduce((n, s) => n + s.intervalMs / 1000, 0);
  const renderSeconds = render.reduce((n, s) => n + s.intervalMs / 1000, 0);
  const cpu = {};
  for (const sample of main)
    for (const process of sample.processes) {
      const name =
        process.type === 'Tab'
          ? process.pid === phase.pid
            ? 'overlay'
            : 'other-renderer'
          : process.type;
      cpu[name] =
        (cpu[name] ?? 0) +
        ((process.cpuTimeMsPerSecond ?? 0) * sample.intervalMs) / 1000;
    }
  for (const name of Object.keys(cpu)) cpu[name] /= seconds;
  const frameCount = render.reduce((n, s) => n + s.frameTimeMs.count, 0);
  const metricNames = [
    'trackMapAnimationFrameMs',
    'trackMapCommitDrawMs',
    'trackMapRafDrawMs',
    'inputTraceFrameMs',
    'radarFrameMs',
  ];
  const draws = Object.fromEntries(
    metricNames.map((name) => [
      name,
      {
        perSecond:
          render.reduce((n, s) => n + (s[name]?.count ?? 0), 0) / renderSeconds,
        timedMsPerSecond:
          render.reduce(
            (n, s) => n + (s[name]?.count ?? 0) * (s[name]?.avg ?? 0),
            0
          ) / renderSeconds,
      },
    ])
  );
  const publications = {};
  for (const sample of main)
    for (const [channel, count] of Object.entries(
      sample.channelMetrics?.publications ?? {}
    ))
      publications[channel] = (publications[channel] ?? 0) + count;
  for (const key of Object.keys(publications)) publications[key] /= seconds;
  result.push({
    phase: phase.name,
    retainedMainIntervals: main.length,
    retainedRendererIntervals: render.length,
    seconds,
    renderSeconds,
    cpuMsPerSecond: cpu,
    totalCpuMsPerSecond: Object.values(cpu).reduce((n, v) => n + v, 0),
    tickHz: main.reduce((n, s) => n + s.tickCount, 0) / seconds,
    rafPerSecond: frameCount / renderSeconds,
    rafP99IntervalMeanMs:
      render.reduce((n, s) => n + s.frameTimeMs.p99, 0) / render.length,
    rafOver25Percent:
      (render.reduce((n, s) => n + s.framesOver25Ms, 0) / frameCount) * 100,
    draws,
    publications,
    sessionPublishSamples: main.reduce(
      (n, s) => n + (s.sections?.sessionPublish?.count ?? 0),
      0
    ),
  });
}
await writeFile(
  resolve(folder, 'phase-metrics.json'),
  JSON.stringify(result, null, 2)
);
process.stdout.write(
  JSON.stringify(
    result.map(
      ({
        phase,
        seconds,
        cpuMsPerSecond,
        totalCpuMsPerSecond,
        rafPerSecond,
        rafP99IntervalMeanMs,
        sessionPublishSamples,
      }) => ({
        phase,
        seconds,
        cpuMsPerSecond,
        totalCpuMsPerSecond,
        rafPerSecond,
        rafP99IntervalMeanMs,
        sessionPublishSamples,
      })
    ),
    null,
    2
  ) + '\n'
);
