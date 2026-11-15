import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const folder = resolve(process.argv[2]);
for (const phase of JSON.parse(
  await readFile(resolve(folder, 'phases.json'), 'utf8')
)) {
  const output = execFileSync(
    process.execPath,
    [
      '--max-old-space-size=3072',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      'tools/perf/summarize-trace.mts',
      resolve(folder, phase.name + '.trace.json'),
      String(phase.pid),
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  await writeFile(resolve(folder, phase.name + '.summary.json'), output);
  const summary = JSON.parse(output);
  const main = summary.threads.find((t) => t.name === 'CrRendererMain');
  process.stdout.write(
    JSON.stringify({
      phase: phase.name,
      durationMs: summary.durationMs,
      coveredMsPerSecond: (main.coveredMs / summary.durationMs) * 1000,
      rows: Object.fromEntries(
        [
          'FunctionCall',
          'PaintArtifactCompositor::Update',
          'Document::recalcStyle',
          'Layout',
          'Paint',
        ].map((name) => [
          name,
          main.events.find((e) => e.name === name)?.wallMsPerSecond ?? 0,
        ])
      ),
    }) + '\n'
  );
}
