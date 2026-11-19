import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarness } from '../test-support/webos-harness.js';

const plainUrl = 'ws://tv.test:3000';
const secureUrl = 'wss://tv.test:3001';

function register(h) {
  const connection = h.clients.at(-1).open();
  h.subject.lgtv.saveKey = (key, callback) => callback();
  connection.reply({ 'client-key': 'accepted-key' });
  assert.equal(h.subject.connected, true);
  assert.deepEqual(h.pendingDelays(), []);
  return connection;
}

test('automatic selection returns to plain after the TLS fallback is refused', async () => {
  const h = await createHarness('controller');
  h.subject.setupTvConnection = () => {};
  h.subject.connect();
  h.advance(0);
  h.clients[0].fail('ECONNRESET');
  assert.deepEqual(h.attempts, [plainUrl, secureUrl]);
  h.clients[1].emit('connectFailed', Object.assign(new Error('connect ECONNREFUSED'), {
    code: 'ECONNREFUSED'
  }));
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.advance(5000);
  assert.deepEqual(h.attempts, [plainUrl, secureUrl, plainUrl]);
  register(h);
  h.subject.disconnect();
});

test('a stalled automatic TLS fallback retries TLS after the watchdog expires', async () => {
  const h = await createHarness('controller');
  h.subject.setupTvConnection = () => {};
  h.subject.connect();
  h.advance(0);
  h.clients[0].fail('ECONNRESET');
  assert.deepEqual(h.attempts, [plainUrl, secureUrl]);

  const stalledClient = h.clients[1];
  h.advance(14999);
  assert.equal(stalledClient.aborted, 0);
  h.advance(1);
  assert.equal(stalledClient.aborted, 1);
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.advance(4999);
  assert.equal(h.attempts.length, 2);
  h.advance(1);
  assert.deepEqual(h.attempts, [plainUrl, secureUrl, secureUrl]);
  register(h);
  h.subject.disconnect();
});

test('unsupported PIN pairing is visible and keeps the selected TLS endpoint', async () => {
  const h = await createHarness('controller');
  const messages = [];
  const errors = [];
  h.subject.log.info = message => messages.push(message);
  h.subject.setupTvConnection = () => {};
  h.subject.connect();
  h.advance(0);
  h.clients[0].fail('ECONNRESET');
  assert.deepEqual(h.attempts, [plainUrl, secureUrl]);

  h.subject.lgtv.on('error', error => errors.push(error));
  const connection = h.clients[1].open();
  connection.reply({ pairingType: 'PIN' });
  assert.equal(errors.at(-1).code, 'EREGISTRATION');
  assert.equal(messages.length, 1);
  assert.match(messages[0], /PIN pairing/);
  assert.equal(connection.drops, 1);
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.advance(5000);
  assert.deepEqual(h.attempts, [plainUrl, secureUrl, secureUrl]);
  register(h);
  h.subject.disconnect();
});

test('identical reset errors on plain and TLS still allow recovery on plain', async () => {
  const h = await createHarness('controller');
  h.subject.setupTvConnection = () => {};
  h.subject.connect();
  h.advance(0);
  // The same message and code must reach the controller once for each URL.
  h.clients[0].fail('ECONNRESET');
  assert.deepEqual(h.attempts, [plainUrl, secureUrl]);
  h.clients[1].fail('ECONNRESET');
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.advance(5000);
  assert.deepEqual(h.attempts, [plainUrl, secureUrl, plainUrl]);
  register(h);
  h.subject.disconnect();
});

test('forced SSL never selects plain after repeated reset and refusal errors', async () => {
  const h = await createHarness('controller');
  h.subject.setupTvConnection = () => {};
  h.subject.setForceSsl(true);
  h.subject.connect();
  h.advance(0);
  for (const code of ['ECONNRESET', 'ECONNRESET', 'ECONNREFUSED']) {
    h.clients.at(-1).fail(code);
    h.advance(5000);
    assert.ok(h.attempts.every(url => url === secureUrl));
  }
  assert.equal(h.attempts.length, 4);
  register(h);
  h.subject.disconnect();
});

test('a successful automatic TLS fallback stays on TLS after a remote close', async () => {
  const h = await createHarness('controller');
  h.subject.setupTvConnection = () => {};
  h.subject.connect();
  h.advance(0);
  h.clients[0].fail('ECONNRESET');
  const connection = register(h);
  connection.close();
  assert.equal(h.subject.connected, false);
  assert.deepEqual(h.pendingDelays(), [5000]);
  h.advance(5000);
  assert.deepEqual(h.attempts, [plainUrl, secureUrl, secureUrl]);
  register(h);
  h.subject.disconnect();
});
