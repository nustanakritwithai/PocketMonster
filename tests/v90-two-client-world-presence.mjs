import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'parent';

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
  window.POCKETMONSTER_WORLD_STATE = () => ({ zone, x, z, dir: 0 });
  window.POCKETMONSTER_WORLD_PRESENCE = snapshot => {
    process.send?.({ type: 'presence', clientId, snapshot });
    return true;
  };

  class IpcWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = IpcWebSocket.CONNECTING;
      this.listeners = new Map();
      process.on('message', message => {
        if (message?.type === 'open') {
          this.readyState = IpcWebSocket.OPEN;
          this.emit('open');
        } else if (message?.type === 'server-message') {
          this.emit('message', { data: message.data });
        } else if (message?.type === 'shutdown') {
          window.dispatchEvent(new Event('pocketmonster:session-ended'));
          process.exit(0);
        }
      });
      process.send?.({ type: 'socket-created', clientId });
    }
    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) || [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    }
    emit(type, event = {}) { for (const handler of this.listeners.get(type) || []) handler(event); }
    send(payload) { process.send?.({ type: 'socket-send', clientId, payload }); }
    close() { this.readyState = IpcWebSocket.CLOSED; this.emit('close', { code: 1000, reason: 'closed' }); }
  }
  globalThis.WebSocket = IpcWebSocket;
  await import(`../chat-runtime.mjs?two-client=${clientId}-${Date.now()}`);
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`child exited ${code}/${signal}`)));
    child.once('error', reject);
  });
}

async function runScenario({ usernames }) {
  const script = fileURLToPath(import.meta.url);
  const definitions = [
    { clientId: 'a', token: 'token-a', zone: 'pirate-fruit', x: 1, z: 2 },
    { clientId: 'b', token: 'token-b', zone: 'pirate-fruit', x: 4, z: 5 },
  ];
  const children = new Map(definitions.map(definition => {
    const child = fork(script, [
      'client', definition.clientId, definition.token, definition.zone,
      String(definition.x), String(definition.z),
    ], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    return [definition.clientId, child];
  }));
  const sockets = new Map();
  const joined = new Map();
  const observed = new Map();
  const errors = [];
  for (const [clientId, child] of children) {
    child.stderr.on('data', chunk => errors.push(`${clientId}: ${chunk}`));
    child.on('message', message => {
      if (message?.type === 'socket-created') {
        sockets.set(clientId, child);
        child.send({ type: 'open' });
        return;
      }
      if (message?.type === 'socket-send') {
        const frame = JSON.parse(message.payload);
        if (typeof frame.token === 'string') return;
        if (frame.type !== 'world-pos') return;
        joined.set(clientId, frame);
        if (joined.size !== definitions.length) return;
        for (const [receiverId, receiver] of children) {
          const receiverFrame = joined.get(receiverId);
          const receiverUsername = usernames[receiverId];
          const unique = new Map();
          for (const [senderId, senderFrame] of joined) {
            const username = usernames[senderId];
            unique.set(username.toLowerCase(), {
              id: username,
              name: `Player ${senderId.toUpperCase()}`,
              x: senderFrame.x,
              z: senderFrame.z,
              dir: senderFrame.dir,
            });
          }
          const players = [...unique.values()].filter(player => player.id.toLowerCase() !== receiverUsername.toLowerCase());
          receiver.send({
            type: 'server-message',
            data: JSON.stringify({ type: 'world-snapshot', payload: {
              zone: receiverFrame.zone,
              players,
              testEpoch: 2,
            } }),
          });
        }
        return;
      }
      if (message?.type === 'presence' && message.snapshot?.testEpoch === 2) {
        observed.set(clientId, message.snapshot);
      }
    });
  }

  const deadline = Date.now() + 5_000;
  while (observed.size < definitions.length && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  try {
    assert.equal(sockets.size, 2, `both clients must create a socket\n${errors.join('')}`);
    assert.equal(joined.size, 2, `both clients must publish world-pos\n${errors.join('')}`);
    assert.equal(observed.size, 2, `both clients must receive the same-zone snapshot\n${errors.join('')}`);
    return observed;
  } finally {
    for (const child of children.values()) child.send({ type: 'shutdown' });
    await Promise.all([...children.values()].map(waitForExit));
  }
}

if (mode === 'client') {
  await runClient();
} else {
  const distinct = await runScenario({ usernames: { a: 'player-a', b: 'player-b' } });
  assert.deepEqual(distinct.get('a').players.map(player => player.id), ['player-b']);
  assert.deepEqual(distinct.get('b').players.map(player => player.id), ['player-a']);
  const sameIdentity = await runScenario({ usernames: { a: 'same-player', b: 'same-player' } });
  assert.deepEqual(sameIdentity.get('a').players, [], 'a second session for the same account remains self, not a remote avatar');
  assert.deepEqual(sameIdentity.get('b').players, [], 'same-account filtering is symmetric');
  console.log('V9 two-client world presence transport: PASS');
}
