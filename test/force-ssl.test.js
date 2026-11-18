import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarness } from '../test-support/webos-harness.js';

for (const forceSsl of [false, true]) {
  test(`initial connection and retries honor forceSsl=${forceSsl}`, async () => {
    const { subject: controller, attempts, clients, advance } = await createHarness('controller');
    if (forceSsl) controller.setForceSsl(true);
    controller.connect();
    advance(0);

    const expectedUrl = forceSsl ? 'wss://tv.test:3001' : 'ws://tv.test:3000';
    assert.deepEqual(attempts, [expectedUrl]);

    for (let retry = 0; retry < 3; retry++) {
      clients.at(-1).fail();
      advance(5000);
      assert.equal(attempts.length, retry + 2);
      assert.equal(attempts.at(-1), expectedUrl);
    }
    controller.disconnect();
  });
}
