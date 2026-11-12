import { open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { CDP } from './cdp-client.mjs';

const traceConfig = {
  recordMode: 'recordAsMuchAsPossible',
  traceBufferSizeInKb: 256 * 1024,
  enableSampling: false,
  includedCategories: ['disabled-by-default-memory-infra'],
  excludedCategories: ['*'],
  memoryDumpConfig: { triggers: [] },
};
const levelOfDetail = 'light';

/** One manual dump per named trace avoids relying on returned/trace GUID equality. */
export async function startMemoryDumpTrace(out) {
  const version = await (
    await fetch('http://127.0.0.1:9222/json/version')
  ).json();
  const browser = await CDP.connect(version.webSocketDebuggerUrl);
  let active = false;
  let stopped = false;
  const dumps = [];
  const finish = async (label) => {
    const completion = browser.event('Tracing.tracingComplete');
    await browser.call('Tracing.end');
    active = false;
    const completed = await completion;
    assert.ok(completed.stream, 'Missing memory trace stream');
    const file = await open(
      resolve(out, label + '.memory-infra.trace.json'),
      'wx'
    );
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await browser.call('IO.read', {
          handle: completed.stream,
          size: 1024 * 1024,
        });
        const data = Buffer.from(
          chunk.data,
          chunk.base64Encoded ? 'base64' : 'utf8'
        );
        await file.write(data);
        bytes += data.length;
        if (chunk.eof) break;
      }
    } finally {
      await file.close();
      await browser.call('IO.close', { handle: completed.stream });
    }
    await writeFile(
      resolve(out, label + '.memory-trace-completion.json'),
      JSON.stringify({ completed, bytes }, null, 2) + '\n'
    );
    assert.notEqual(completed.dataLossOccurred, true, 'Memory trace lost data');
    return { completed, bytes };
  };
  return {
    async dump(label) {
      assert.match(label, /^[a-z0-9-]+$/);
      assert.ok(!stopped && !active, 'Memory trace unavailable');
      let result, primaryError;
      await browser.call('Tracing.start', {
        traceConfig,
        transferMode: 'ReturnAsStream',
      });
      active = true;
      try {
        result = await browser.call('Tracing.requestMemoryDump', {
          levelOfDetail,
        });
        assert.equal(result.success, true, 'Chromium memory dump failed');
      } catch (error) {
        primaryError = error;
      }
      try {
        const exported = await finish(label);
        dumps.push({
          label,
          levelOfDetail,
          traceConfig,
          at: new Date().toISOString(),
          ...result,
          ...exported,
        });
        await writeFile(
          resolve(out, 'memory-dump-requests.json'),
          JSON.stringify(dumps, null, 2) + '\n'
        );
      } catch (error) {
        if (primaryError)
          throw new AggregateError(
            [primaryError, error],
            'Dump request and export failed',
            { cause: error }
          );
        throw error;
      }
      if (primaryError) throw primaryError;
      return result;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        if (active) await finish('aborted');
      } finally {
        browser.ws.close();
      }
    },
  };
}
