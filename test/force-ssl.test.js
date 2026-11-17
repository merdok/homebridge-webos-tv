import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inherits } from 'node:util';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

async function createController() {
  const timers = [];
  const attempts = [];
  let socket;

  class WebSocketClient extends EventEmitter {
    constructor() {
      super();
      socket = this;
    }

    connect(url) {
      attempts.push(url);
    }
  }

  // Exercise the controller and its real reconnect logic without network or
  // pairing-file access. Timers advance explicitly rather than waiting.
  const context = createContext({
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      const index = timers.indexOf(timer);
      if (index !== -1) timers.splice(index, 1);
    }
  });
  const stubs = {
    'node:events': { EventEmitter },
    'util': { default: { inherits } },
    'fs': { readFileSync: () => 'test-pairing-key' },
    'websocket': { default: { client: WebSocketClient } },
    'persist-path': { default: () => '/test/pairing' },
    'mkdirp': { default: () => {} },
    'wake_on_lan': {},
    'tcp-ping': {}
  };
  const modules = new Map();

  async function load(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    const stub = stubs[identifier];
    const module = stub
      ? new SyntheticModule(Object.keys(stub), function() {
          for (const [name, value] of Object.entries(stub)) {
            this.setExport(name, value);
          }
        }, { context, identifier })
      : new SourceTextModule(await readFile(new URL(identifier), 'utf8'), {
          context, identifier
        });
    modules.set(identifier, module);
    await module.link((specifier, parent) => load(
      specifier.startsWith('.') ? new URL(specifier, parent.identifier).href : specifier
    ));
    return module;
  }

  const module = await load(new URL('../lib/LgTvController.js', import.meta.url).href);
  await module.evaluate();
  const Controller = module.namespace.default;
  const controller = new Controller('tv.test', '00:11:22:33:44:55', 'Test TV',
    '/test/pairing', undefined, 5000, { debug() {} });

  return {
    controller,
    attempts,
    runTimer(expectedDelay) {
      const timer = timers.shift();
      assert.ok(timer, 'a connection timer should be scheduled');
      assert.equal(timer.delay, expectedDelay);
      timer.callback();
    },
    failConnection() {
      socket.emit('connectFailed', Object.assign(new Error('Connection timed out'), {
        code: 'ETIMEDOUT'
      }));
    }
  };
}

for (const forceSsl of [false, true]) {
  test(`initial connection and retries honor forceSsl=${forceSsl}`, async () => {
    const { controller, attempts, runTimer, failConnection } = await createController();
    if (forceSsl) controller.setForceSsl(true);
    controller.connect();
    runTimer(0);

    const expectedUrl = forceSsl ? 'wss://tv.test:3001' : 'ws://tv.test:3000';
    assert.deepEqual(attempts, [expectedUrl]);

    for (let retry = 0; retry < 3; retry++) {
      failConnection();
      runTimer(5000);
      assert.equal(attempts.length, retry + 2);
      assert.equal(attempts.at(-1), expectedUrl);
    }
    controller.disconnect();
  });
}
