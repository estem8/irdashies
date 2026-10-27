import { build } from 'esbuild';
import path from 'path';
const stub = path.resolve('stubs/tyreLog.ts');
await build({
  entryPoints: ['replay.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'replay.cjs',
  logLevel: 'error',
  plugins: [{ name: 'stub', setup: (b) => b.onResolve({ filter: /\/tyreLog$/ }, () => ({ path: stub })) }],
});
