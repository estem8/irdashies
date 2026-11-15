import { readFile } from 'node:fs/promises';
import { summarizeTrace, type TraceEvent } from './traceSummary.ts';

const [file, pidText] = process.argv.slice(2);
const pid = Number(pidText);
if (!file || !pidText || !Number.isInteger(pid) || pid <= 0) {
  throw new Error(
    'Usage: node tools/perf/summarize-trace.mts <trace.json> <renderer-pid>'
  );
}
const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
const events = Array.isArray(parsed)
  ? parsed
  : parsed !== null && typeof parsed === 'object' && 'traceEvents' in parsed
    ? parsed.traceEvents
    : undefined;
if (
  !Array.isArray(events) ||
  !events.every(
    (event: unknown) =>
      event !== null &&
      typeof event === 'object' &&
      'ph' in event &&
      typeof event.ph === 'string' &&
      'pid' in event &&
      typeof event.pid === 'number' &&
      'tid' in event &&
      typeof event.tid === 'number'
  )
) {
  throw new Error('Expected Chromium traceEvents with ph, pid and tid');
}
process.stdout.write(
  JSON.stringify(summarizeTrace(events as TraceEvent[], pid), null, 2) + '\n'
);
