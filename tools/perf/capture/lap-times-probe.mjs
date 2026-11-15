import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { CDP } from './cdp-client.mjs';
const runId = process.argv[2];
assert.match(runId ?? '', /^[a-z0-9-]+$/);
const out = resolve('perf-results', runId, 'probe');
const controller = spawn(
  process.execPath,
  ['tools/perf/capture/long-matrix.mjs', runId, 'probe'],
  { stdio: 'inherit', env: { ...process.env, PERF_LAP_TIMES_DIAGNOSTIC: '1' } }
);
let exited = false;
const exit = new Promise((resolve, reject) => {
  controller.once('error', reject);
  controller.once('close', (code) => {
    exited = true;
    resolve(code);
  });
});
let main, overlay;
const records = [];
try {
  let ready = false;
  for (let i = 0; i < 180; i++) {
    assert.equal(exited, false, 'Capture ended before readiness');
    try {
      await readFile(resolve(out, 'preflight.json'));
      ready = true;
      break;
    } catch {
      /* Not ready. */
    }
    await sleep(1000);
  }
  assert.ok(ready, 'Missing preflight');
  const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  main = await CDP.connect(targets[0].webSocketDebuggerUrl);
  assert.equal(
    await main.evaluate('process.env.PERF_RUN_ID'),
    runId + '-probe'
  );
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = pages.find((p) => /:\d+\/$/.test(p.url));
  assert.ok(page);
  overlay = await CDP.connect(page.webSocketDebuggerUrl);
  for (let i = 0; i < 40; i++) {
    assert.equal(exited, false, 'Capture ended before lap-time exercise');
    const value = await overlay.evaluate(
      `(async()=>{const {getChannelSnapshotStore}=await import('/src/frontend/context/ChannelStore/ChannelSnapshotStore.ts');const {useLapTimesStore}=await import('/src/frontend/context/LapTimesStore/LapTimesStore.tsx');const c=getChannelSnapshotStore('lap-times.snapshot',window.channelBridge);const s=c.snapshot;const p=useLapTimesStore.getState();return {replay:await window.tapeReplayBridge.getStatus(),activeSelections:c.selections.size,subscribed:typeof c.unsubscribeBridge==='function',channelVersion:s?.version,presentationVersion:p.lapTimeBuffer?.version,positiveTimes:p.lapTimes.filter(t=>t>0).length,totalSamples:p.lapTimeBuffer?.lapTimeHistory.reduce((n,a)=>n+a.length,0)??0,matchesChannel:!!s&&JSON.stringify(s.lapTimes)===JSON.stringify(p.lapTimes)&&JSON.stringify(s.lapTimeHistory)===JSON.stringify(p.lapTimeBuffer?.lapTimeHistory)}})()`
    );
    records.push(value);
    assert.equal(value.activeSelections, 2);
    assert.equal(value.subscribed, true);
    // React effects can mirror a new snapshot on the following task; allow
    // another observation rather than treating a transient version gap as loss.
    if (
      value.positiveTimes > 0 &&
      value.totalSamples > 0 &&
      value.matchesChannel
    )
      break;
    await sleep(5000);
  }
  const last = records.at(-1);
  assert.ok(
    last.totalSamples > 0 && last.positiveTimes > 0 && last.matchesChannel,
    'Lap-time history not exercised/mirrored'
  );
  await writeFile(
    resolve(out, 'lap-times.json'),
    JSON.stringify(
      {
        passed: true,
        scope:
          'Linux feature-enabled tape channel/presentation diagnostic; not CPU acceptance',
        records,
      },
      null,
      2
    ) + '\n'
  );
  process.stdout.write(
    JSON.stringify({
      stage: 'lap-times-passed',
      runId,
      position: last.replay.position,
      totalSamples: last.totalSamples,
    }) + '\n'
  );
  overlay.ws.close();
  overlay = undefined;
  main.ws.close();
  main = undefined;
  assert.equal(await exit, 0, 'Controller failed');
} catch (error) {
  await writeFile(
    resolve(out, 'lap-times-failed.json'),
    JSON.stringify({ error: String(error), records }, null, 2) + '\n'
  );
  throw error;
} finally {
  overlay?.ws.close();
  main?.ws.close();
  if (!exited) {
    controller.kill('SIGTERM');
    await exit;
  }
}
