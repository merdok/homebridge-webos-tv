import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarness } from '../test-support/webos-harness.js';

test('a silent transport is aborted and retried on the selected SSL endpoint', async () => {
  const h = await createHarness();
  h.advance(0);
  h.advance(14999);
  assert.equal(h.clients[0].aborted, 0);
  h.advance(1);
  assert.equal(h.clients[0].aborted, 1);
  assert.equal(h.errors.at(-1).code, 'ETIMEDOUT');
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.advance(5000);
  assert.deepEqual(h.attempts, ['wss://tv.test:3001', 'wss://tv.test:3001']);
  h.subject.disconnect();
});

test('a silent registration is dropped and retried', async () => {
  const h = await createHarness();
  h.advance(0);
  const connection = h.clients[0].open();
  assert.equal(connection.sent[0].type, 'register');
  h.advance(15000);
  assert.equal(connection.drops, 1);
  assert.equal(h.errors.at(-1).code, 'ETIMEDOUT');
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.advance(5000);
  assert.equal(h.attempts.length, 2);
  h.subject.disconnect();
});

test('duplicate connect calls do not create parallel attempts or registrations', async () => {
  const h = await createHarness();
  h.advance(0);
  h.subject.connect('wss://tv.test:3001');
  h.subject.connect('wss://tv.test:3001');
  assert.equal(h.attempts.length, 1);
  const connection = h.clients[0].open();
  h.subject.connect('wss://tv.test:3001');
  assert.equal(connection.sent.length, 1);
  h.subject.disconnect();
});

test('a pairing prompt allows time for confirmation before retrying', async () => {
  const h = await createHarness();
  h.advance(0);
  const connection = h.clients[0].open();
  let prompts = 0;
  h.subject.on('prompt', () => prompts++);
  connection.reply({ pairingType: 'PROMPT' });
  assert.equal(prompts, 1);
  h.advance(119999);
  assert.equal(connection.drops, 0);
  assert.equal(h.attempts.length, 1);
  h.advance(1);
  assert.equal(connection.drops, 1);
  h.advance(5000);
  assert.equal(h.attempts.length, 2);
  h.subject.disconnect();
});

test('successful registration cancels the deadline and reports connected state', async () => {
  const h = await createHarness();
  h.advance(0);
  const connection = h.clients[0].open();
  let connected = 0;
  h.subject.on('connect', () => {
    connected++;
    assert.equal(h.subject.connection, true);
  });
  connection.reply({ 'client-key': 'accepted-key' });
  assert.equal(connected, 1);
  assert.deepEqual(h.savedKeys, ['accepted-key']);
  assert.deepEqual(h.pendingDelays(), []);
  h.advance(180000);
  assert.equal(connection.connected, true);
  assert.equal(h.attempts.length, 1);
  h.subject.disconnect();
});

test('disconnect cancels an unfinished attempt and ignores late transport events', async () => {
  const h = await createHarness();
  h.advance(0);
  const client = h.clients[0];
  h.subject.disconnect();
  assert.equal(client.aborted, 1);
  assert.deepEqual(h.pendingDelays(), []);
  client.fail();
  const lateConnection = client.open();
  assert.equal(lateConnection.connected, false);
  assert.equal(lateConnection.sent.length, 0);
  h.advance(180000);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.errors.length, 0);
});

test('late events from an expired attempt cannot replace the current attempt', async () => {
  const h = await createHarness();
  h.advance(0);
  const expired = h.clients[0];
  h.advance(20000);
  assert.equal(h.attempts.length, 2);
  const lateConnection = expired.open();
  expired.fail();
  assert.equal(lateConnection.connected, false);
  assert.equal(lateConnection.sent.length, 0);
  const currentConnection = h.clients[1].open();
  currentConnection.reply({ 'client-key': 'accepted-key' });
  assert.equal(h.subject.connection, true);
  assert.deepEqual(h.pendingDelays(), []);
  h.subject.disconnect();
});

test('an explicit reconnect consumes the pending automatic retry', async () => {
  const h = await createHarness();
  h.advance(0);
  h.clients[0].fail();
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.subject.connect('wss://tv.test:3001');
  assert.equal(h.attempts.length, 2);
  h.advance(5000);
  assert.equal(h.attempts.length, 2);
  h.subject.disconnect();
});

test('configured attempt and pairing deadlines are respected', async () => {
  const h = await createHarness('socket', { connectTimeout: 1000, pairingTimeout: 3000 });
  h.advance(0);
  const connection = h.clients[0].open();
  h.advance(500);
  connection.reply({ pairingType: 'PROMPT' });
  h.advance(2999);
  assert.equal(connection.drops, 0);
  h.advance(1);
  assert.equal(connection.drops, 1);
  h.subject.disconnect();
});

test('synchronous abort errors cannot create a second retry', async () => {
  const h = await createHarness();
  h.advance(0);
  const client = h.clients[0];
  client.abort = function() {
    this.aborted++;
    this.fail();
  };
  h.advance(15000);
  assert.equal(client.aborted, 1);
  assert.equal(h.errors.length, 1);
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.advance(5000);
  assert.equal(h.attempts.length, 2);
  h.subject.disconnect();
});

test('a protocol fallback from the error handler retains SSL for later retries', async () => {
  const h = await createHarness('socket', { url: 'ws://tv.test:3000' });
  h.subject.on('error', error => {
    if (error.code === 'ECONNRESET') h.subject.connect('wss://tv.test:3001');
  });
  h.advance(0);
  h.clients[0].fail('ECONNRESET');
  assert.deepEqual(h.attempts, ['ws://tv.test:3000', 'wss://tv.test:3001']);
  assert.deepEqual(h.pendingDelays(), [15000]);
  h.clients[1].fail();
  h.advance(5000);
  assert.deepEqual(h.attempts, [
    'ws://tv.test:3000', 'wss://tv.test:3001', 'wss://tv.test:3001'
  ]);
  h.subject.disconnect();
});

test('controller and transport share one reconnect after a registered socket closes', async () => {
  const h = await createHarness('controller');
  h.subject.setupTvConnection = () => {};
  h.subject.setForceSsl(true);
  h.subject.connect();
  h.advance(0);
  const connection = h.clients[0].open();
  // Controller registration uses the mocked pairing file; keep key persistence
  // in memory as well, just as the standalone transport harness does.
  h.subject.lgtv.saveKey = (key, callback) => callback();
  connection.reply({ 'client-key': 'accepted-key' });
  assert.equal(h.subject.connected, true);
  connection.close();
  assert.equal(h.subject.connected, false);
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.advance(5000);
  assert.deepEqual(h.attempts, ['wss://tv.test:3001', 'wss://tv.test:3001']);
  h.subject.disconnect();
});

test('disconnect before the initial timer prevents a connection from starting', async () => {
  const h = await createHarness();
  h.subject.disconnect();
  h.advance(180000);
  assert.deepEqual(h.attempts, []);
});
