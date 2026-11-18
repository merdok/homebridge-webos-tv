import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { inherits } from 'node:util';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

// Run the real controller/transport with explicit time and no device or pairing
// file access. Connections deliberately stay silent until a test supplies events.
export async function createHarness(entry = 'socket', options = {}) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const clients = [];
  const attempts = [];
  const errors = [];
  const savedKeys = [];

  class Connection extends EventEmitter {
    connected = true;
    sent = [];
    drops = 0;

    send(json) {
      this.sent.push(JSON.parse(json));
    }

    close() {
      if (!this.connected) return;
      this.connected = false;
      this.emit('close', 1000);
    }

    drop() {
      this.drops++;
      this.close();
    }

    reply(payload) {
      const registration = this.sent.find(message => message.type === 'register');
      assert.ok(registration, 'registration must be sent before a TV reply');
      this.emit('message', {
        type: 'utf8',
        utf8Data: JSON.stringify({ id: registration.id, payload })
      });
    }
  }

  class Client extends EventEmitter {
    aborted = 0;

    constructor(config) {
      super();
      this.config = config;
      clients.push(this);
    }

    connect(url) {
      attempts.push(url);
    }

    abort() {
      this.aborted++;
    }

    open() {
      const connection = new Connection();
      this.emit('connect', connection);
      return connection;
    }

    fail(code = 'ETIMEDOUT') {
      this.emit('connectFailed', Object.assign(new Error('Connection failed'), { code }));
    }
  }

  const context = createContext({
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  });
  const stubs = {
    'node:events': { EventEmitter },
    'util': { default: { inherits } },
    'fs': { readFileSync: () => 'test-pairing-key' },
    'websocket': { default: { client: Client } },
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
          for (const [name, value] of Object.entries(stub)) this.setExport(name, value);
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

  const path = entry === 'controller' ? '../lib/LgTvController.js' : '../lib/ws/weboswebsocket.js';
  const module = await load(new URL(path, import.meta.url).href);
  await module.evaluate();
  const Subject = module.namespace.default;
  const subject = entry === 'controller'
    ? new Subject('tv.test', '00:11:22:33:44:55', 'Test TV', '/test/pairing',
      undefined, 5000, { debug() {}, info() {} })
    : new Subject({
        url: 'wss://tv.test:3001', clientKey: 'test-key', reconnect: 5000,
        saveKey(key, callback) { savedKeys.push(key); callback(); }, ...options
      });
  subject.on('error', error => errors.push(error));

  return {
    subject, clients, attempts, errors, savedKeys,
    advance(milliseconds) {
      const target = now + milliseconds;
      let count = 0;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > target) break;
        assert.ok(++count < 1000, 'timers must not create a synchronous retry loop');
        now = next[1].due;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = target;
    },
    pendingDelays() {
      return [...timers.values()].map(timer => timer.due - now).sort((a, b) => a - b);
    }
  };
}
