import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CDP } from './cdp-client.mjs';

test('calls on a closed socket reject immediately without sending', async () => {
  const ws = new EventTarget();
  ws.readyState = WebSocket.CLOSED;
  ws.send = () => assert.fail('must not send to a closed socket');
  const cdp = new CDP(ws);
  await assert.rejects(cdp.call('Runtime.evaluate'), /CDP unavailable/);
  assert.equal(cdp.pending.size, 0);
});

test('socket close rejects pending requests and clears their timers', async () => {
  const ws = new EventTarget();
  ws.readyState = WebSocket.OPEN;
  const sent = [];
  ws.send = (message) => sent.push(JSON.parse(message));
  const cdp = new CDP(ws);
  const result = cdp.call('Runtime.evaluate', { expression: '1' });
  const rejection = assert.rejects(result, /CDP closed/);
  ws.dispatchEvent(new Event('close'));
  await rejection;
  assert.equal(sent[0].method, 'Runtime.evaluate');
  assert.equal(cdp.pending.size, 0);
});
