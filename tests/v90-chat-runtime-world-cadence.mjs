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
window.POCKETMONSTER_SELF_PRESENCE_ID = 'self-player';
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
const receivedSnapshots = [];
window.POCKETMONSTER_WORLD_PRESENCE = snapshot => { receivedSnapshots.push(snapshot); return true; };

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
  const playerAuthority = { schemaVersion: 1, serverTimeUtc: '2026-09-08T16:00:00.000Z', players: [
    { playerId: 'self-player', generation: 2, stateSequence: 7, hp: { current: 87.5, max: 100, revision: 3 }, resultRevision: 2, lifeState: 'alive' },
    { playerId: 'observer-player', generation: 2, stateSequence: 8, hp: { current: 0, max: 120, revision: 4 }, resultRevision: 5, lifeState: 'dead' },
  ], results: [
    { attackerId: 'monster:east-forest', targetId: 'self-player', attackId: 'hit-1', generation: 2, resultRevision: 1, authoritativeFinalHp: 87.5, serverTimeUtc: '2026-09-08T16:00:00.000Z' },
    { attackerId: 'monster:east-forest', targetId: 'observer-player', attackId: 'hit-1', generation: 2, resultRevision: 1, authoritativeFinalHp: 0, serverTimeUtc: '2026-09-08T16:00:00.000Z' },
  ] };
  socket.emit('message', { data: JSON.stringify({ type: 'world-snapshot', payload: { zone: 'pirate-fruit', generation: 1, players: [{ id: 'self-player', x: 9, z: 9 }, { id: 'observer-player', x: 3, z: 4 }], playerAuthority } }) });
  const authoritySnapshot = receivedSnapshots.at(-1);
  assert.equal(authoritySnapshot.players.some(player => player.id === 'self-player'), false, 'self is filtered from visual players at parent ingress');
  assert.equal(authoritySnapshot.players.some(player => player.id === 'observer-player'), true, 'observer remains in visual players at parent ingress');
  assert.equal(authoritySnapshot.playerAuthority.players[0].playerId, 'self-player', 'self authority survives visual self filtering');
  assert.equal(authoritySnapshot.playerAuthority.players[0].hp.current, 87.5, 'bridge preserves authoritative self HP');
  assert.equal(authoritySnapshot.playerAuthority.players[1].lifeState, 'dead', 'bridge preserves observer death state');
  assert.equal(authoritySnapshot.playerAuthority.results.length, 2, 'bridge preserves bounded multi-target results');
  assert.equal(authoritySnapshot.playerAuthority.results[1].targetId, 'observer-player', 'bridge preserves result target identity');
  const route = window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().worldPresence;
  assert.equal(route.acceptedSnapshots, 4, 'inbound world snapshots reach local route diagnostics');
  assert.equal(route.staleActors, 1, 'duplicate actor sequence is observable at the parent ingress');
  assert.equal(route.staleHpRevisions, 1, 'duplicate HP revisions are observable at the parent ingress');
  assert.equal(route.staleResultRevisions, 1, 'duplicate combat result revisions are observable at the parent ingress');
  assert.equal(route.actorsOmitted, 1, 'omitted actors are observable separately from actors[]');
  assert.equal(route.sampleCount, 3, 'snapshot receive intervals are retained for p95/p99 capture');
  console.log('V9 chat WORLD_STATE 20Hz and visual-envelope guard: PASS');
} finally {
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
}

