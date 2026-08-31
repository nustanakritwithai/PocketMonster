import assert from 'node:assert/strict';

const windowEvents = new EventTarget();
globalThis.window = globalThis;
window.addEventListener = windowEvents.addEventListener.bind(windowEvents);
window.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
window.dispatchEvent = windowEvents.dispatchEvent.bind(windowEvents);
globalThis.CustomEvent = class extends Event {
  constructor(type, options) { super(type); this.detail = options?.detail; }
};

function element(id = '') {
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

const elements = new Map();
const panel = element('gameChat');
const headerNote = { after(node) { elements.set(node.id, node); } };
panel.querySelector = selector => selector === 'header span' ? headerNote : null;
for (const id of ['gameChat', 'chatToggleBtn', 'chatCloseBtn', 'chatForm', 'chatMessages', 'chatError', 'chatInput']) {
  elements.set(id, id === 'gameChat' ? panel : element(id));
}
globalThis.document = {
  head: { append(node) { if (node.id) elements.set(node.id, node); } },
  body: { append() {} },
  querySelector(selector) { return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null; },
  createElement(tag) {
    const node = element();
    if (tag === 'select') node.value = 'WORLD';
    return node;
  },
};

const launchSession = { sessionToken: 'combat-session-token', expiresAtUtc: '2099-01-01T00:00:00Z' };
globalThis.sessionStorage = {
  getItem(key) { return key === 'monsterlife.session.v1' ? JSON.stringify(launchSession) : null; },
};
window.POCKETMONSTER_RUNTIME_CONFIG = {
  apiBaseUrl: 'https://server.example',
  webSocketUrl: 'wss://server.example/ws/chat',
};
window.POCKETMONSTER_WORLD_STATE = () => ({ zone: 'pirate-fruit', x: 0, z: 0, dir: 0 });
let worldSnapshots = 0;
window.POCKETMONSTER_WORLD_PRESENCE = () => { worldSnapshots += 1; return true; };
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ messages: [] }) });

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  emit(type, event = {}) { for (const handler of this.listeners.get(type) || []) handler(event); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = FakeWebSocket.CLOSED; this.emit('close', { code: 1000, reason: 'closed' }); }
}
globalThis.WebSocket = FakeWebSocket;

await import(`../chat-runtime.mjs?combat-shared-socket=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(FakeWebSocket.instances.length, 1);
const socket = FakeWebSocket.instances[0];
const statuses = [];
const responses = [];
window.POCKETMONSTER_CHAT_RUNTIME.combat.subscribeStatus(status => statuses.push(status));
window.POCKETMONSTER_CHAT_RUNTIME.combat.subscribeAuthority(response => responses.push(response));
socket.readyState = FakeWebSocket.OPEN;
socket.emit('open');
assert.equal(socket.sent[0].token, launchSession.sessionToken, 'authentication frame is always first');
assert.equal(statuses.at(-1).connected, true);

const prediction = {
  schemaVersion: 'combat-prediction-envelope/v9.1',
  intentId: 'intent:chat-runtime',
};
const sent = window.POCKETMONSTER_CHAT_RUNTIME.combat.sendPrediction(prediction);
assert.equal(sent.ok, true, sent.reason);
assert.equal(socket.sent.find(message => message.schemaVersion === prediction.schemaVersion)?.intentId,
  prediction.intentId);
assert.equal(FakeWebSocket.instances.length, 1, 'Combat reuses the Chat/World physical socket');

socket.emit('message', { data: JSON.stringify({
  schemaVersion: 'combat-authority-response/v9.1.2',
  intentId: prediction.intentId,
  combatId: 'combat:chat-runtime',
}) });
assert.equal(responses.length, 1, 'raw authority response reaches the private listener');
socket.emit('message', { data: JSON.stringify({ type: 'world-snapshot', payload: { players: [] } }) });
assert.equal(worldSnapshots, 1, 'Combat routing preserves World handling on the same socket');

window.dispatchEvent(new Event('pagehide'));
assert.equal(statuses.at(-1).connected, false);
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.combat.sendPrediction(prediction).reason,
  'combat_transport_disconnected');
window.dispatchEvent(new Event('pocketmonster:session-ended'));
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().stopped, true);

console.log('V9.1 Chat Combat transport: PASS (one authenticated socket, raw egress/ingress)');
