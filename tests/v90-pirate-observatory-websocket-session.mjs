import assert from 'node:assert/strict';
import {
  PirateObservatoryWebSocketSession,
  STREAM_CHANNELS,
  SYNC_STATES,
  createStreamEnvelope,
  deriveObservatoryWebSocketUrl,
} from '../pirate-observatory/index.mjs';

class FakeWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }
  emit(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }
  open() { this.readyState = 1; this.emit('open'); }
  message(value) { this.emit('message', { data: typeof value === 'string' ? value : JSON.stringify(value) }); }
  send(value) { this.sent.push(value); }
  close(code = 1000, reason = '') {
    this.readyState = 3;
    this.emit('close', { code, reason });
  }
}

assert.equal(deriveObservatoryWebSocketUrl('https://server.example/game/'), 'wss://server.example/ws/observatory');
assert.equal(deriveObservatoryWebSocketUrl('http://localhost:5000/'), 'ws://localhost:5000/ws/observatory');
assert.throws(() => deriveObservatoryWebSocketUrl('ftp://server.example/'));

const states = [];
const deltas = [];
const health = [];
const resync = [];
const session = new PirateObservatoryWebSocketSession({
  baseUrl: 'https://server.example/game/',
  token: 'super-secret-session',
  partition: 'pirate-fruit',
  afterSequence: 3,
  WebSocketImpl: FakeWebSocket,
  onState: (state, detail) => states.push({ state, detail }),
  onDelta: packet => { deltas.push(packet); return { ok: true }; },
  onServerHealth: payload => health.push(payload),
  onResyncRequired: payload => resync.push(payload),
});

const connecting = session.connect();
const socket = FakeWebSocket.instances.at(-1);
assert.equal(socket.url, 'wss://server.example/ws/observatory');
assert.equal(socket.url.includes('super-secret-session'), false, 'token leaked into WebSocket URL');
socket.open();
const connected = await connecting;
assert.equal(connected.ok, true);
assert.equal(socket.sent.length, 1);
assert.deepEqual(JSON.parse(socket.sent[0]), {
  token: 'super-secret-session',
  partition: 'pirate-fruit',
  afterSequence: 3,
});

socket.message(createStreamEnvelope({
  channel: STREAM_CHANNELS.SERVER_HEALTH,
  partition: 'pirate-fruit',
  tick: 0,
  sequence: 3,
  serverTime: 10,
  payload: { ready: false, code: 'OBSERVATORY_NOT_READY', mode: 'waiting-authority' },
}));
assert.equal(health.length, 1);
assert.equal(states.at(-1).state, SYNC_STATES.SYNCING);

const delta = {
  schemaVersion: 1,
  partition: 'pirate-fruit',
  baseSequence: 3,
  sequence: 4,
  tick: 20,
  changes: [],
};
socket.message(createStreamEnvelope({
  channel: STREAM_CHANNELS.WORLD_DELTA,
  partition: 'pirate-fruit',
  tick: 20,
  sequence: 4,
  serverTime: 11,
  payload: delta,
}));
assert.equal(deltas.length, 1);
assert.equal(session.sequence, 4);
assert.equal(states.at(-1).state, SYNC_STATES.LIVE);

socket.message(createStreamEnvelope({
  channel: STREAM_CHANNELS.SYSTEM_ALERT,
  partition: 'pirate-fruit',
  tick: 20,
  sequence: 4,
  serverTime: 12,
  payload: { code: 'RESYNC_REQUIRED', partition: 'pirate-fruit' },
}));
assert.equal(resync.length, 1);
assert.equal(states.at(-1).state, SYNC_STATES.DESYNC);

session.close();
assert.equal(states.at(-1).state, SYNC_STATES.OFFLINE);

console.log('v90 Pirate World Observatory WebSocket session: PASS');
