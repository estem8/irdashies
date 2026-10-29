import { build } from 'esbuild';
import path from 'path';
const stubs = { tyreLog: path.resolve('stubs/tyreLog.ts'), logger: path.resolve('stubs/logger.ts') };
await build({
  entryPoints: ['replay.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'replay.cjs',
  logLevel: 'error',
  plugins: [{ name: 'stub', setup: (b) => { b.onResolve({ filter: /\/tyreLog$/ }, () => ({ path: stubs.tyreLog })); b.onResolve({ filter: /\/logger$/ }, () => ({ path: stubs.logger })); } }],
});
