import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Two-client E2E for the central world state lifecycle:
// join -> mutual visibility -> warp round trip (Pirate Fruit <-> Pocket Monster) ->
// server-side disconnect -> automatic reconnect/replay -> session end (no ghost players).
// Each client child runs the real chat-runtime.mjs transport; the parent emulates the
// production relay contract (authenticated join, zone-scoped snapshots, deterministic
// removal on socket close, replay on rejoin).

const mode = process.argv[2] || 'parent';
const ZONE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function fakeElement(id = '') {
  const listeners = new Map();
  const classes = new Set();
  return {
    id,
    dataset: {},
    value: '',
    textContent: '',
    children: [],
    scrollHeight: 0,
    scrollTop: 0,
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); },
      toggle(value) { classes.has(value) ? classes.delete(value) : classes.add(value); },
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    querySelector() { return null; },
    focus() {},
  };
}

async function runClient() {
  const clientId = process.argv[3];
  const token = process.argv[4];
  const zone = process.argv[5];
  const x = Number(process.argv[6]);
  const z = Number(process.argv[7]);
  const windowEvents = new EventTarget();
  globalThis.window = globalThis;
  window.addEventListener = windowEvents.addEventListener.bind(windowEvents);
  window.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
  window.dispatchEvent = windowEvents.dispatchEvent.bind(windowEvents);
  globalThis.CustomEvent = class extends Event {
    constructor(type, options) { super(type); this.detail = options?.detail; }
  };

  const elements = new Map();
  const panel = fakeElement('gameChat');
  const headerNote = { after(node) { elements.set(node.id, node); } };
  panel.querySelector = selector => selector === 'header span' ? headerNote : null;
  for (const id of ['gameChat', 'chatToggleBtn', 'chatCloseBtn', 'chatForm', 'chatMessages', 'chatError', 'chatInput']) {
    elements.set(id, id === 'gameChat' ? panel : fakeElement(id));
  }
  globalThis.document = {
    head: { append(node) { if (node.id) elements.set(node.id, node); } },
    body: { append() {} },
    querySelector(selector) { return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null; },
    createElement(tag) {
      const node = fakeElement();
      if (tag === 'select') node.value = 'WORLD';
      return node;
    },
  };
  const session = Object.freeze({ sessionToken: token, expiresAtUtc: '2099-01-01T00:00:00Z' });
  window.POCKETMONSTER_LAUNCH_SESSION = session;
  window.POCKETMONSTER_RUNTIME_CONFIG = Object.freeze({
    apiBaseUrl: 'https://isolated.example',
    webSocketUrl: 'wss://isolated.example/ws/chat',
  });
  globalThis.sessionStorage = {
    getItem(key) { return key === 'monsterlife.session.v1' ? JSON.stringify(session) : null; },
    removeItem() {},
  };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ messages: [] }) });

  // Mutable world pose: the parent drives scene transitions (warp) by swapping it,
  // mirroring worlds-v900.mjs applying the next runtime's presence bindings.
  const worldState = { zone, x, z, dir: 0 };
  window.POCKETMONSTER_WORLD_STATE = () => ({ ...worldState });
  window.POCKETMONSTER_WORLD_PRESENCE = snapshot => {
    process.send?.({ type: 'presence', clientId, snapshot });
    return true;
  };

  let activeSocket = null;
  class IpcWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = IpcWebSocket.CONNECTING;
      this.listeners = new Map();
      activeSocket = this;
      process.send?.({ type: 'socket-created', clientId });
    }
    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) || [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    }
    emit(type, event = {}) { for (const handler of [...(this.listeners.get(type) || [])]) handler(event); }
    send(payload) {
      if (this.readyState !== IpcWebSocket.OPEN) throw new Error('socket not open');
      process.send?.({ type: 'socket-send', clientId, payload });
    }
    close(code = 1000) {
      if (this.readyState === IpcWebSocket.CLOSED) return;
      this.readyState = IpcWebSocket.CLOSED;
      process.send?.({ type: 'socket-close', clientId, code });
      this.emit('close', { code, reason: 'client closed' });
    }
    serverClose() {
      if (this.readyState === IpcWebSocket.CLOSED) return;
      this.readyState = IpcWebSocket.CLOSED;
      this.emit('close', { code: 1006, reason: 'server disconnect' });
    }
  }
  globalThis.WebSocket = IpcWebSocket;

  process.on('message', message => {
    if (message?.type === 'open') {
      if (activeSocket?.readyState === IpcWebSocket.CONNECTING) {
        activeSocket.readyState = IpcWebSocket.OPEN;
      }
      activeSocket?.emit('open');
    } else if (message?.type === 'server-message') {
      activeSocket?.emit('message', { data: message.data });
    } else if (message?.type === 'server-close') {
      activeSocket?.serverClose();
    } else if (message?.type === 'set-world-state') {
      Object.assign(worldState, message.state);
    } else if (message?.type === 'session-end') {
      window.dispatchEvent(new Event('pocketmonster:session-ended'));
    } else if (message?.type === 'shutdown') {
      process.exit(0);
    }
  });

  await import(`../chat-runtime.mjs?two-client-lifecycle=${clientId}-${Date.now()}`);
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`child exited ${code}/${signal}`)));
    child.once('error', reject);
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runScenario() {
  const script = fileURLToPath(import.meta.url);
  const definitions = [
    { clientId: 'a', token: 'token-a', zone: 'pirate-fruit', x: 1, z: 2 },
    { clientId: 'b', token: 'token-b', zone: 'pirate-fruit', x: 4, z: 5 },
  ];
  const usernames = { a: 'player-a', b: 'player-b' };
  const children = new Map();
  // Relay contract state (production Server emulation).
  const members = new Map(definitions.map(definition => [definition.clientId, {
    username: usernames[definition.clientId],
    connected: false,
    zone: null,
    x: 0,
    z: 0,
    dir: 0,
  }]));
  const observations = new Map(definitions.map(definition => [definition.clientId, []]));
  const socketCreates = new Map(definitions.map(definition => [definition.clientId, 0]));
  const worldPosAfterSessionEnd = { a: 0 };
  let aSessionEnded = false;
  // Captured inside the ordered IPC handler the moment A's replacement socket appears,
  // so every observation at/after this index belongs to the reconnected session.
  let aReconnectIndex = -1;
  const errors = [];

  function broadcast() {
    for (const [receiverId, receiver] of members) {
      if (!receiver.connected || !receiver.zone) continue;
      const unique = new Map();
      for (const member of members.values()) {
        if (!member.connected || member.zone !== receiver.zone) continue;
        unique.set(member.username.toLowerCase(), {
          id: member.username,
          name: `Player ${member.username}`,
          x: member.x,
          z: member.z,
          dir: member.dir,
        });
      }
      const players = [...unique.values()]
        .filter(player => player.id.toLowerCase() !== receiver.username.toLowerCase());
      children.get(receiverId)?.send({
        type: 'server-message',
        data: JSON.stringify({ type: 'world-snapshot', payload: { zone: receiver.zone, players } }),
      });
    }
  }

  function handleFrame(clientId, frame) {
    const member = members.get(clientId);
    if (!member) return;
    if (typeof frame.token === 'string') {
      member.connected = true;
      broadcast();
      return;
    }
    if (frame.type !== 'world-pos') return;
    if (aSessionEnded && clientId === 'a') worldPosAfterSessionEnd.a += 1;
    if (!member.connected) return;
    // Mirror the production sanitize contract: reject malformed heartbeat frames.
    const zone = typeof frame.zone === 'string' && ZONE_PATTERN.test(frame.zone) ? frame.zone : null;
    const x = Number(frame.x); const z = Number(frame.z); const dir = Number(frame.dir);
    if (!zone || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(dir)) return;
    if (member.zone === zone && member.x === x && member.z === z && member.dir === dir) return;
    member.zone = zone; member.x = x; member.z = z; member.dir = dir;
    broadcast();
  }

  for (const definition of definitions) {
    const child = fork(script, [
      'client', definition.clientId, definition.token, definition.zone,
      String(definition.x), String(definition.z),
    ], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    children.set(definition.clientId, child);
    child.stderr.on('data', chunk => errors.push(`${definition.clientId}: ${chunk}`));
    child.on('message', message => {
      if (message?.type === 'socket-created') {
        const next = socketCreates.get(definition.clientId) + 1;
        socketCreates.set(definition.clientId, next);
        if (definition.clientId === 'a' && next === 2) {
          aReconnectIndex = observations.get('a').length;
        }
        child.send({ type: 'open' });
        return;
      }
      if (message?.type === 'socket-send') {
        handleFrame(definition.clientId, JSON.parse(message.payload));
        return;
      }
      if (message?.type === 'socket-close') {
        const member = members.get(definition.clientId);
        if (member) {
          member.connected = false;
          broadcast();
        }
        return;
      }
      if (message?.type === 'presence') {
        observations.get(definition.clientId)?.push({
          t: Date.now(),
          zone: message.snapshot?.zone ?? null,
          ids: (message.snapshot?.players || []).map(player => player.id).sort(),
          players: message.snapshot?.players || [],
        });
      }
    });
  }

  const lastOf = clientId => observations.get(clientId).at(-1) || null;
  const dump = () => JSON.stringify({
    observations: Object.fromEntries(observations),
    socketCreates: Object.fromEntries(socketCreates),
    members: [...members.entries()].map(([id, member]) => [id, { connected: member.connected, zone: member.zone }]),
    errors,
  }, null, 1);

  async function waitFor(predicate, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) await sleep(20);
    assert.ok(predicate(), `${label}\n${dump()}`);
  }
  const sees = (clientId, zone, ids) => {
    const latest = lastOf(clientId);
    return Boolean(latest) && latest.zone === zone
      && JSON.stringify(latest.ids) === JSON.stringify([...ids].sort());
  };
  // First observation index at/after which every snapshot must exclude the given player.
  const absentFrom = (clientId, playerId, fromIndex) => {
    const list = observations.get(clientId);
    for (let index = Math.max(0, fromIndex); index < list.length; index += 1) {
      if (list[index].ids.includes(playerId)) return false;
    }
    return true;
  };

  try {
    // Phase 1 — join: both clients authenticate and publish their initial pose.
    await waitFor(() => sees('a', 'pirate-fruit', ['player-b']), 5_000, 'client A must see client B after join');
    await waitFor(() => sees('b', 'pirate-fruit', ['player-a']), 5_000, 'client B must see client A after join');

    // Phase 2 — warp out: A leaves for Pocket Monster; B must lose A deterministically
    // and A must only receive Pocket Monster snapshots (no cross-world leakage).
    const bCountBeforeWarpOut = observations.get('b').length;
    const aCountBeforeWarpOut = observations.get('a').length;
    children.get('a').send({ type: 'set-world-state', state: { zone: 'pocket-monster', x: 9, z: 9, dir: 1 } });
    await waitFor(() => sees('b', 'pirate-fruit', []), 5_000, 'warp out must remove A from B zone snapshot');
    await waitFor(() => sees('a', 'pocket-monster', []), 5_000, 'A must receive the Pocket Monster zone snapshot');
    const bFirstEmpty = observations.get('b').findIndex((observation, index) => index >= bCountBeforeWarpOut - 1 && observation.zone === 'pirate-fruit' && observation.ids.length === 0);
    assert.ok(bFirstEmpty >= 0, `B must observe an empty Pirate Fruit snapshot after A warps out\n${dump()}`);
    assert.ok(absentFrom('b', 'player-a', bFirstEmpty), `A must not reappear for B before warping back\n${dump()}`);
    const aFirstPocket = observations.get('a').findIndex((observation, index) => index >= aCountBeforeWarpOut - 1 && observation.zone === 'pocket-monster');
    assert.ok(aFirstPocket >= 0, `A must observe a Pocket Monster snapshot\n${dump()}`);
    for (const observation of observations.get('a').slice(aFirstPocket)) {
      assert.equal(observation.zone, 'pocket-monster', `snapshots must stay zone-scoped during the stay\n${dump()}`);
      assert.ok(!observation.ids.includes('player-b'), `B must never leak into the Pocket Monster world\n${dump()}`);
    }

    // Phase 3 — warp back: A returns to Pirate Fruit at a new pose; both see each other again.
    const bCountBeforeWarpBack = observations.get('b').length;
    children.get('a').send({ type: 'set-world-state', state: { zone: 'pirate-fruit', x: 7, z: 8, dir: 0 } });
    await waitFor(() => sees('b', 'pirate-fruit', ['player-a']), 5_000, 'warp back must restore A for B');
    await waitFor(() => sees('a', 'pirate-fruit', ['player-b']), 5_000, 'warp back must restore B for A');
    const bReturnIndex = observations.get('b').findIndex((observation, index) => index >= bCountBeforeWarpBack - 1 && observation.ids.includes('player-a'));
    assert.ok(bReturnIndex >= 0, `B must observe A returning\n${dump()}`);
    const returned = observations.get('b')[bReturnIndex].players.find(player => player.id === 'player-a');
    assert.equal(returned.x, 7, 'returned pose must carry the relayed x position');
    assert.equal(returned.z, 8, 'returned pose must carry the relayed z position');

    // Phase 4 — reconnect/replay: the Server drops A (network close 1006). A disappears
    // immediately, reconnects on the transport retry, re-authenticates, replays its pose,
    // and receives the latest snapshot right away.
    const bCountBeforeDrop = observations.get('b').length;
    members.get('a').connected = false;
    broadcast();
    children.get('a').send({ type: 'server-close' });
    await waitFor(() => sees('b', 'pirate-fruit', []), 5_000, 'A must disappear for B as soon as the Server drops it');
    await waitFor(() => socketCreates.get('a') === 2, 12_000, 'transport must reconnect after the Server drop');
    await waitFor(() => sees('a', 'pirate-fruit', ['player-b']), 5_000, 'reconnected A must receive the latest snapshot (replay)');
    await waitFor(() => sees('b', 'pirate-fruit', ['player-a']), 5_000, 'reconnected A must reappear for B');
    assert.ok(aReconnectIndex >= 0, `the replacement socket must be observable\n${dump()}`);
    const firstReplay = observations.get('a')[aReconnectIndex];
    assert.deepEqual(firstReplay?.ids, ['player-b'], `the first post-reconnect snapshot must already be current\n${dump()}`);
    const bFirstEmptyDrop = observations.get('b').findIndex((observation, index) => index >= bCountBeforeDrop - 1 && observation.ids.length === 0);
    assert.ok(bFirstEmptyDrop >= 0, `B must observe the disconnect removal\n${dump()}`);
    const bReappear = observations.get('b').findIndex((observation, index) => index >= bFirstEmptyDrop && observation.ids.includes('player-a'));
    assert.ok(bReappear >= 0, `B must observe the reconnect reappearance\n${dump()}`);
    for (const observation of observations.get('b').slice(bFirstEmptyDrop, bReappear)) {
      assert.ok(!observation.ids.includes('player-a'), `no ghost A between drop and reconnect\n${dump()}`);
    }
    assert.equal(socketCreates.get('a'), 2, 'exactly one replacement socket after the drop');

    // Phase 5 — leave: A ends its session; the clean close removes A deterministically
    // and the stopped transport can no longer publish heartbeats.
    aSessionEnded = true;
    children.get('a').send({ type: 'session-end' });
    await waitFor(() => sees('b', 'pirate-fruit', []), 5_000, 'session end must remove A from B zone snapshot');
    await sleep(600);
    assert.equal(worldPosAfterSessionEnd.a, 0, `a stopped transport must not publish further world-pos frames\n${dump()}`);
    const bFinal = lastOf('b');
    assert.deepEqual(bFinal?.ids, [], `B must end with an empty zone snapshot\n${dump()}`);
  } finally {
    for (const child of children.values()) {
      try { child.send({ type: 'shutdown' }); } catch {}
    }
    await Promise.all([...children.values()].map(child => child.exitCode === null
      ? new Promise(resolve => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2_000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      })
      : Promise.resolve()));
  }
}

if (mode === 'client') {
  await runClient();
} else {
  await runScenario();
  console.log('V9 two-client world lifecycle (warp round trip + reconnect/replay + leave): PASS');
}
