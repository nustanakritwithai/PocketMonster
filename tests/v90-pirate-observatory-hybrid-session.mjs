import assert from 'node:assert/strict';
import { PirateObservatoryHybridSession } from '../pirate-observatory/index.mjs';

class AutoOpenWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
    AutoOpenWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit('open');
    });
  }
  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }
  emit(type, event = {}) { for (const handler of this.listeners.get(type) ?? []) handler(event); }
  send(value) { this.sent.push(value); }
  close(code = 1000, reason = '') {
    this.readyState = 3;
    this.emit('close', { code, reason });
  }
}

const requests = [];
const transports = [];
const snapshots = [];
const hybrid = new PirateObservatoryHybridSession({
  baseUrl: 'https://server.example/',
  token: 'runtime-secret',
  headers: () => ({ Authorization: 'Bearer runtime-secret' }),
  partition: 'pirate-fruit',
  WebSocketImpl: AutoOpenWebSocket,
  fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { schemaVersion: 1, snapshotId: 'pirate-fruit:12:7', partition: 'pirate-fruit', tick: 12, sequence: 7, entities: [] };
      },
    };
  },
  onSnapshot: snapshot => { snapshots.push(snapshot); return { ok: true }; },
  onTransport: (mode, detail) => transports.push({ mode, detail }),
});

const result = await hybrid.start();
assert.equal(result.ok, true);
assert.equal(result.mode, 'websocket');
assert.equal(snapshots.length, 1);
assert.equal(requests.length, 1, 'hybrid bootstrap should use one canonical REST snapshot');
assert.equal(new URL(requests[0].url).pathname, '/api/observatory/regions/pirate-fruit/snapshot');
assert.equal(AutoOpenWebSocket.instances.length, 1);
const socket = AutoOpenWebSocket.instances[0];
assert.equal(socket.url, 'wss://server.example/ws/observatory');
assert.equal(socket.url.includes('runtime-secret'), false);
assert.deepEqual(JSON.parse(socket.sent[0]), {
  token: 'runtime-secret',
  partition: 'pirate-fruit',
  afterSequence: 7,
});
assert.equal(transports.at(-1).mode, 'websocket');

hybrid.stop();
assert.equal(transports.at(-1).mode, 'stopped');

console.log('v90 Pirate World Observatory hybrid session: PASS');
