import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
// Reachable from main: all six baseline files match the historical campaign
// snapshots, without depending on commits retained only in local backup refs.
const baselineCommit = '94f0264170c61b34bac61a57c296484e8f4d8c03';
const entries = [
  'src/frontend/components/Standings/Relative.tsx',
  'src/frontend/components/Standings/components/TitleBar/TitleBar.tsx',
  'src/frontend/components/TrackMap/hooks/useDriverProgress.tsx',
  'src/frontend/context/SessionStore/arrayShallowCompare.ts',
  'src/frontend/components/BlindSpotMonitor/components/BlindSpotMonitorIndicator.tsx',
  'src/frontend/components/shared/CarManufacturer/CarManufacturer.tsx',
];
const base = resolve(process.argv[2] ?? 'perf-results/long-matrix-sources');
const manifest = [];
for (const file of entries) {
  const before = execFileSync('git', ['show', `${baselineCommit}:${file}`]);
  const after = await readFile(file);
  for (const [version, data] of [
    ['baseline', before],
    ['candidate', after],
  ]) {
    const target = resolve(base, version, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }
  const hash = (data) => createHash('sha256').update(data).digest('hex');
  manifest.push({
    file,
    baselineCommit,
    beforeSha256: hash(before),
    afterSha256: hash(after),
  });
}
await writeFile(
  resolve(base, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);
process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
