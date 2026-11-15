import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const entries = [
  ['src/frontend/components/Standings/Relative.tsx', '94f02641'],
  [
    'src/frontend/components/Standings/components/TitleBar/TitleBar.tsx',
    '94f02641',
  ],
  ['src/frontend/components/TrackMap/hooks/useDriverProgress.tsx', '94f02641'],
  ['src/frontend/context/SessionStore/arrayShallowCompare.ts', '02e8e07e'],
  [
    'src/frontend/components/BlindSpotMonitor/components/BlindSpotMonitorIndicator.tsx',
    '02e8e07e',
  ],
  [
    'src/frontend/components/shared/CarManufacturer/CarManufacturer.tsx',
    '02e8e07e',
  ],
];
const base = resolve('perf-results/long-matrix-sources');
const manifest = [];
for (const [file, commit] of entries) {
  const before = execFileSync('git', ['show', `${commit}:${file}`]);
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
    baselineCommit: commit,
    beforeSha256: hash(before),
    afterSha256: hash(after),
  });
}
await writeFile(
  resolve(base, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);
process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
