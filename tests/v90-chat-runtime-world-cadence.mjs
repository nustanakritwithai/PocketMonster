import assert from 'node:assert/strict';

const listeners = new EventTarget();
globalThis.window = globalThis;
window.addEventListener = listeners.addEventListener.bind(listeners);
window.removeEventListener = listeners.removeEventListener.bind(listeners);
window.dispatchEvent = listeners.dispatchEvent.bind(listeners);
globalThis.CustomEvent = class extends Event { constructor(type, options) { super(type); this.detail = options?.detail; } };

const panel = { dataset: {}, classList: { toggle() {}, contains() { return true; } }, querySelector(selector) {
  return selector === 'header span' ? { after() {} } : null;
} };
globalThis.document = {
  head: { append() {} },
  body: { append() {} },
  querySelector(selector) { return selector === '#gameChat' ? panel : null; },
  createElement() { return { dataset: {}, classList: { add() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, append() {}, after() {}, querySelector() { return null; } }; },
};
globalThis.sessionStorage = { getItem() { return JSON.stringify({ sessionToken: 'cadence-session', expiresAtUtc: '2099-01-01T00:00:00Z' }); }, removeItem() {} };
window.POCKETMONSTER_RUNTIME_CONFIG = { apiBaseUrl: 'https://server.example', webSocketUrl: 'wss://server.example/ws' };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ messages: [] }) });

const intervals = [];
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
globalThis.setInterval = (callback, delay) => { const handle = { callback, delay, cleared: false }; intervals.push(handle); return handle; };
globalThis.clearInterval = handle => { if (handle) handle.cleared = true; };

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances = [];
  constructor() { this.readyState = FakeWebSocket.CONNECTING; this.listeners = new Map(); this.sent = []; FakeWebSocket.instances.push(this); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
  send(serialized) { if (this.throwNext) { this.throwNext = false; throw new Error('send failed'); } this.sent.push(JSON.parse(serialized)); }
  close() { this.readyState = FakeWebSocket.CLOSED; this.emit('close', { code: 1000 }); }
}
globalThis.WebSocket = FakeWebSocket;
window.POCKETMONSTER_WORLD_STATE = () => ({ zone: 'pirate-fruit', x: 1, z: 2, dir: 0.25 });
window.POCKETMONSTER_WORLD_PRESENCE = () => true;

try {
  await import(`../chat-runtime.mjs?world-cadence=${Date.now()}`);
  const socket = FakeWebSocket.instances[0];
  assert.ok(socket, 'runtime creates one world socket');
  socket.readyState = FakeWebSocket.OPEN;
  socket.emit('open');
  const pulse = intervals.find(entry => entry.delay === 50);
  assert.ok(pulse, 'world publisher is scheduled at 20Hz');
  assert.equal(intervals.some(entry => entry.delay === 250), false, 'old 250ms world cadence is gone');

  const slash = { sequence: 1, kind: 'slash', ageMs: 0, position: { x: 1, y: 0, z: 2 }, heading: 0, color: 0xff0000, scale: 1 };
  window.POCKETMONSTER_WORLD_VISUAL_EVENTS([slash]);
  const before = socket.sent.length;
  pulse.callback();
  assert.equal(socket.sent.length, before + 1, 'pose still sends while visual envelope is unavailable');
  assert.equal(window.POCKETMONSTER_WORLD_VISUAL_QUEUE_DIAGNOSTICS().pending, 1, 'pending visual event is retained');
  assert.equal(socket.sent.at(-1).visual, undefined, 'pose frame does not invent incomplete visual metadata');

  window.POCKETMONSTER_WORLD_STATE = () => ({ zone: 'pirate-fruit', x: 1.5, z: 2.5, dir: 0.5, visual: { schemaVersion: 1, sessionId: 'session-a', stateSequence: 1, events: [], projectiles: [] } });
  pulse.callback();
  assert.equal(socket.sent.at(-1).visual.events[0].sequence, 1, 'queued event sends once envelope becomes valid');
  assert.equal(window.POCKETMONSTER_WORLD_VISUAL_QUEUE_DIAGNOSTICS().pending, 0, 'event commits after successful send');

  const beforeFailure = socket.sent.length;
  window.POCKETMONSTER_WORLD_VISUAL_EVENTS([{ ...slash, sequence: 2 }]);
  socket.throwNext = true;
  pulse.callback();
  assert.equal(socket.sent.length, beforeFailure, 'failed send does not publish a duplicate frame');
  assert.equal(window.POCKETMONSTER_WORLD_VISUAL_QUEUE_DIAGNOSTICS().pending, 1, 'failed send leaves the event queued');
  pulse.callback();
  assert.equal(socket.sent.at(-1).visual.events[0].sequence, 2, 'retry publishes the queued event exactly once');
  assert.equal(window.POCKETMONSTER_WORLD_VISUAL_QUEUE_DIAGNOSTICS().pending, 0, 'retry commits only after send succeeds');

  const poseFrames = [];
  let poseTick = 0;
  window.POCKETMONSTER_WORLD_STATE = () => ({ zone: 'pirate-fruit', x: poseTick, z: 2, dir: 0.5, visual: { schemaVersion: 1, sessionId: 'session-a', stateSequence: poseTick + 2, events: [], projectiles: [] } });
  for (poseTick = 1; poseTick <= 20; poseTick += 1) {
    pulse.callback();
    poseFrames.push(socket.sent.at(-1));
  }
  assert.equal(poseFrames.length, 20, 'fake one-second clock emits 20 deterministic 20Hz pose ticks');
  assert.deepEqual(poseFrames.map(frame => frame.x), Array.from({ length: 20 }, (_, index) => index + 1), 'each cadence tick carries the latest pose');
  assert.equal(new Set(poseFrames.map(frame => frame.x)).size, 20, 'pose cadence does not duplicate a prior sample');
  const actor = {
    actorId: 'monster-observer-a', kind: 'monster', monsterType: 'flameling', zone: 'pirate-fruit', generation: 1,
    spawnSequence: 1, stateSequence: 1, lifecycle: 'active',
    pose: { x: 1, y: 0, z: 2, dir: 0 }, locomotion: 'run',
    authority: { authorityVersion: 'monster-authority/1', serverTimeUtc: '2026-09-08T07:00:00.000Z', generation: 1,
      hp: { current: 9, max: 10, revision: 1 }, resultRevision: 1, actionSequence: 1, hit: true, damage: 1, death: false },
  };
  socket.emit('message', { data: JSON.stringify({ type: 'world-snapshot', payload: { zone: 'pirate-fruit', generation: 1, players: [], actors: [actor] } }) });
  socket.emit('message', { data: JSON.stringify({ type: 'world-snapshot', payload: { zone: 'pirate-fruit', generation: 1, players: [], actors: [actor] } }) });
  socket.emit('message', { data: JSON.stringify({ type: 'world-snapshot', payload: { zone: 'pirate-fruit', generation: 1, players: [] } }) });
  const route = window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().worldPresence;
  assert.equal(route.acceptedSnapshots, 3, 'inbound world snapshots reach local route diagnostics');
  assert.equal(route.staleActors, 1, 'duplicate actor sequence is observable at the parent ingress');
  assert.equal(route.staleHpRevisions, 1, 'duplicate HP revisions are observable at the parent ingress');
  assert.equal(route.staleResultRevisions, 1, 'duplicate combat result revisions are observable at the parent ingress');
  assert.equal(route.actorsOmitted, 1, 'omitted actors are observable separately from actors[]');
  assert.equal(route.sampleCount, 2, 'snapshot receive intervals are retained for p95/p99 capture');
  const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let flowClock = 1000;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => flowClock } });
  try {
    const receiveMetadata = worldFlow => socket.emit('message', { data: JSON.stringify({
      type: 'world-snapshot', payload: { zone: 'pirate-fruit', generation: 1, players: [], actors: [],
        worldFlow },
    }) });
    const receiveFlow = (snapshotSequence, inputReceived) => receiveMetadata({
      contract: 'world-flow/1', snapshotSequence, inputReceived, inputWindow: 16, snapshotWindow: 8,
    });
    const worldFrames = () => socket.sent.filter(frame => frame.type === 'world-pos');
    const validMetadata = { contract: 'world-flow/1', snapshotSequence: 1, inputReceived: 0, inputWindow: 16, snapshotWindow: 8 };
    for (const malformed of [null, {}, { ...validMetadata, contract: 'world-flow/2' },
      { ...validMetadata, snapshotSequence: 0 }, { ...validMetadata, inputReceived: 1 },
      { ...validMetadata, inputWindow: 32 }, { ...validMetadata, inputReceived: '0' }]) {
      receiveMetadata(malformed);
      assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().worldFlow.supported, false, 'malformed capability cannot enable credit');
    }
    receiveFlow(1, 0);
    assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().worldFlow.supported, true, 'valid capability negotiates credit');
    const flowStart = worldFrames().length;
    for (let tick = 0; tick < 16; tick += 1) { flowClock += 50; pulse.callback(); }
    assert.equal(worldFrames().length - flowStart, 16, 'input can send only sixteen unacknowledged frames');
    const heldIntent = { schemaVersion: 1, intentId: 'monster-intent:2:9', zone: 'pirate-fruit',
      kind: 'melee', category: 'style', forwardX: 0, forwardZ: 1, range: 3, sequence: 9,
      targetActorId: 'monster:server-crab-1', expectedGeneration: 1, expectedStateSequence: 12 };
    let heldProviderReads = 0;
    window.POCKETMONSTER_WORLD_STATE = () => { heldProviderReads += 1; return { zone: 'pirate-fruit', x: 30, z: 2, dir: .5,
      monsterIntents: [heldIntent],
      visual: { schemaVersion: 1, sessionId: 'session-a', stateSequence: 100, events: [], projectiles: [] } }; };
    window.POCKETMONSTER_WORLD_VISUAL_EVENTS([{ ...slash, sequence: 3 }]);
    receiveFlow(2, 0);
    flowClock += 50; pulse.callback();
    assert.equal(worldFrames().length - flowStart, 16, 'backpressure does not create a stale pose backlog');
    assert.equal(socket.sent.at(-1).type, 'world-flow-ack', 'snapshot acknowledgement still sends while input credit is full');
    assert.equal(heldProviderReads, 0, 'full credit window cannot consume the provider intent queue');
    assert.equal(socket.sent.at(-1).worldFlow.inputSequence, 0, 'ACK-only never claims another input');
    assert.equal(window.POCKETMONSTER_WORLD_VISUAL_QUEUE_DIAGNOSTICS().pending, 1, 'held visual is not committed before real send');
    receiveFlow(3, 0);
    const ackStart = socket.sent.length;
    flowClock += 50; pulse.callback();
    assert.equal(socket.sent.length, ackStart, 'ACK-only is bounded below the existing control quota');
    flowClock += 200; pulse.callback();
    assert.equal(socket.sent.at(-1).worldFlow.snapshotAcknowledged, 3, 'latest received snapshot is acknowledged');
    assert.equal(heldProviderReads, 0, 'ACK-only cannot read the gameplay provider');
    receiveFlow(4, 16);
    flowClock += 50; pulse.callback();
    assert.equal(worldFrames().length - flowStart, 17, 'receipt of prior input resumes existing publisher');
    assert.equal(socket.sent.at(-1).x, 30, 'resume uses latest pose rather than replaying old poses');
    assert.equal(heldProviderReads, 1, 'provider is read once only after input credit returns');
    assert.deepEqual(socket.sent.at(-1).monsterIntents[0], heldIntent, 'held attack intent remains unchanged');
    assert.equal(socket.sent.at(-1).visual.events[0].sequence, 3, 'held visual ships after credit returns');
    assert.equal(window.POCKETMONSTER_WORLD_VISUAL_QUEUE_DIAGNOSTICS().pending, 0, 'successful send commits visual once');
    receiveFlow(5, 99999);
    assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().worldFlow.inputReceived, 16, 'future receipt cannot release input credit');
    const healthyStart = worldFrames().length;
    for (let tick = 0; tick < 20; tick += 1) {
      receiveFlow(5 + tick, window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().worldFlow.inputSent);
      flowClock += 50; pulse.callback();
    }
    assert.equal(worldFrames().length - healthyStart, 20, 'healthy credit preserves the original 50ms cadence');
    assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().worldFlow.peakInputInFlight, 16, 'bounded window never exceeds sixteen inputs');
  } finally { Object.defineProperty(globalThis, 'performance', originalPerformance); }
  console.log('V9 chat WORLD_STATE 20Hz and visual-envelope guard: PASS');
} finally {
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
}
