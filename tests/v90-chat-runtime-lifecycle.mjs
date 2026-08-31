import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scenario = process.argv[2] || '';
if (!scenario) {
  for (const name of [
    'stop-during-config',
    'stale-pull-after-logout',
    'abort-send-after-logout',
    'channel-switch-pull',
    'websocket-pull-queue',
    'generic-rejections',
    'rest-401-rejection',
    'structured-auth-rejection',
    'websocket-auth-rejection',
    'suspend-pull-resume',
    'suspend-send-resume',
    'closing-resume',
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${name} failed\n${result.stdout}\n${result.stderr}`);
  }
  console.log('V9 chat runtime pull/auth lifecycle: PASS');
  process.exit(0);
}

const windowEvents = new EventTarget();
globalThis.window = globalThis;
window.addEventListener = windowEvents.addEventListener.bind(windowEvents);
window.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
window.dispatchEvent = windowEvents.dispatchEvent.bind(windowEvents);
globalThis.CustomEvent = class extends Event {
  constructor(type, options) { super(type); this.detail = options?.detail; }
};

function fakeElement(id = '') {
  const listeners = new Map();
  const values = new Set();
  return {
    id,
    dataset: {},
    value: '',
    textContent: '',
    children: [],
    scrollHeight: 0,
    scrollTop: 0,
    classList: {
      add(value) { values.add(value); },
      remove(value) { values.delete(value); },
      contains(value) { return values.has(value); },
      toggle(value) { if (values.has(value)) values.delete(value); else values.add(value); },
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    emit(type, event = {}) { listeners.get(type)?.(event); },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    querySelector() { return null; },
    focus() {},
  };
}

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

const storedSession = {
  sessionToken: 'lifecycle-session',
  expiresAtUtc: '2099-01-01T00:00:00Z',
};
globalThis.sessionStorage = {
  getItem(key) { return key === 'monsterlife.session.v1' ? JSON.stringify(storedSession) : null; },
  removeItem() {},
};

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];
  constructor() {
    this.readyState = FakeWebSocket.CONNECTING;
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
  send() {}
  close() {
    if (scenario === 'closing-resume') {
      this.readyState = FakeWebSocket.CLOSING;
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }
}
globalThis.WebSocket = FakeWebSocket;
window.POCKETMONSTER_WORLD_STATE = () => ({ zone: 'pirate-fruit', x: 0, z: 0, dir: 0 });
window.POCKETMONSTER_WORLD_PRESENCE = () => true;

const wait = () => new Promise(resolve => setTimeout(resolve, 20));
const reply = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function renderedText(node) {
  if (!node) return '';
  return [node.textContent || '', ...(node.children || []).map(renderedText)].join(' ');
}

if (scenario === 'stop-during-config') {
  let resolveConfig;
  let configFetches = 0;
  globalThis.fetch = async input => {
    assert.match(String(input), /runtime-config\.json/);
    configFetches += 1;
    return new Promise(resolve => { resolveConfig = resolve; });
  };
  await import(`../chat-runtime.mjs?stop-during-config=${Date.now()}`);
  assert.equal(configFetches, 1);
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
  resolveConfig({
    json: async () => ({ apiBaseUrl: 'https://server.example', webSocketUrl: 'wss://server.example/ws/chat' }),
  });
  await wait();
  const diagnostics = window.POCKETMONSTER_CHAT_RUNTIME.diagnostics();
  assert.equal(diagnostics.stopped, true);
  assert.equal(diagnostics.hasToken, false);
  assert.equal(diagnostics.pollingActive, false);
  assert.equal(FakeWebSocket.instances.length, 0, 'terminal stop during config fetch cannot be reversed by the late response');
} else if (scenario === 'stale-pull-after-logout') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  let resolvePull;
  let fetchCalls = 0;
  let pullSignal = null;
  globalThis.fetch = async (_input, options = {}) => {
    fetchCalls += 1;
    pullSignal = options.signal || null;
    return new Promise(resolve => { resolvePull = resolve; });
  };
  await import(`../chat-runtime.mjs?stale-pull=${Date.now()}`);
  await wait();
  assert.equal(fetchCalls, 1);
  assert.ok(pullSignal instanceof AbortSignal, 'chat GET receives the terminal lifecycle AbortSignal');
  assert.equal(pullSignal.aborted, false);
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
  assert.equal(pullSignal.aborted, true, 'logout physically aborts an in-flight chat GET');
  resolvePull({ ok: true, json: async () => ({ messages: [{ id: 1, username: 'late', message: 'late response' }] }) });
  await wait();
  assert.equal(elements.get('chatMessages').children.length, 0, 'a response arriving after logout cannot mutate Chat DOM');
  elements.get('chatInput').value = 'must not send';
  elements.get('chatForm').emit('submit', { preventDefault() {} });
  await wait();
  assert.equal(fetchCalls, 1, 'chat submit after logout cannot reuse the stale bearer');
  assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().hasToken, false);
} else if (scenario === 'abort-send-after-logout') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  let getCalls = 0;
  let postCalls = 0;
  let postSignal = null;
  let resolvePost;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/chat/send') {
      postCalls += 1;
      postSignal = options.signal || null;
      return new Promise(resolve => { resolvePost = resolve; });
    }
    getCalls += 1;
    return reply({ messages: [] });
  };
  await import(`../chat-runtime.mjs?abort-send=${Date.now()}`);
  await wait();
  assert.equal(getCalls, 1);
  const input = elements.get('chatInput');
  input.value = 'must survive late POST';
  elements.get('chatForm').emit('submit', { preventDefault() {} });
  await wait();
  assert.equal(postCalls, 1);
  assert.ok(postSignal instanceof AbortSignal, 'chat POST receives the terminal lifecycle AbortSignal');
  assert.equal(postSignal.aborted, false);
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
  assert.equal(postSignal.aborted, true, 'logout physically aborts an in-flight chat POST');
  resolvePost(reply({ success: true }));
  await wait();
  assert.equal(input.value, 'must survive late POST', 'late POST completion cannot clear the logged-out input');
  assert.equal(getCalls, 1, 'late POST completion cannot schedule another authenticated pull');
  assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().hasToken, false);
} else if (scenario === 'channel-switch-pull') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  const calls = [];
  const pending = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  globalThis.fetch = input => {
    calls.push(String(input));
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    const gate = deferred();
    pending.push({ resolve(value) { concurrent -= 1; gate.resolve(value); } });
    return gate.promise;
  };
  await import(`../chat-runtime.mjs?channel-switch=${Date.now()}`);
  await wait();
  assert.equal(calls.length, 1);
  assert.match(calls[0], /after=0&channel=WORLD/);
  const channel = elements.get('chatChannel');
  channel.value = 'ZONE';
  channel.emit('change');
  await wait();
  assert.equal(calls.length, 1, 'a channel switch queues one rerun instead of overlapping the WORLD pull');
  pending.shift().resolve(reply({ messages: [{ id: 41, username: 'world-user', message: 'WORLD stale' }] }));
  await wait();
  assert.equal(calls.length, 2, 'the queued ZONE pull starts after the WORLD response settles');
  assert.match(calls[1], /after=0&channel=ZONE/, 'the stale WORLD cursor cannot leak into the new ZONE view');
  assert.equal(elements.get('chatMessages').children.length, 0, 'the stale WORLD response cannot mutate the ZONE DOM');
  pending.shift().resolve(reply({ messages: [{ id: 7, username: 'zone-user', message: 'ZONE current' }] }));
  await wait();
  const text = renderedText(elements.get('chatMessages'));
  assert.match(text, /ZONE current/);
  assert.doesNotMatch(text, /WORLD stale/);
  assert.equal(maxConcurrent, 1, 'GET chat pulls are serialized');
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else if (scenario === 'websocket-pull-queue') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  const calls = [];
  const pending = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  globalThis.fetch = input => {
    calls.push(String(input));
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    const gate = deferred();
    pending.push({ resolve(value) { concurrent -= 1; gate.resolve(value); } });
    return gate.promise;
  };
  await import(`../chat-runtime.mjs?websocket-pull-queue=${Date.now()}`);
  await wait();
  const socket = FakeWebSocket.instances[0];
  socket.readyState = FakeWebSocket.OPEN;
  socket.emit('message', { data: JSON.stringify({ type: 'chat' }) });
  socket.emit('message', { data: JSON.stringify({ type: 'chat' }) });
  await wait();
  assert.equal(calls.length, 1, 'WebSocket notifications cannot overlap an in-flight GET pull');
  pending.shift().resolve(reply({ messages: [] }));
  await wait();
  assert.equal(calls.length, 2, 'multiple WebSocket notifications coalesce into one queued rerun');
  pending.shift().resolve(reply({ messages: [] }));
  await wait();
  assert.equal(calls.length, 2);
  assert.equal(maxConcurrent, 1, 'WebSocket-triggered GET pulls remain serialized');
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else if (scenario === 'generic-rejections') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  globalThis.fetch = async () => reply({ success: false, errorCode: 'FEATURE_DISABLED', reason: 'policy' }, 403);
  await import(`../chat-runtime.mjs?generic-rejections=${Date.now()}`);
  await wait();
  let diagnostics = window.POCKETMONSTER_CHAT_RUNTIME.diagnostics();
  assert.equal(diagnostics.stopped, false, 'a generic REST 403 must not terminate the game session');
  assert.equal(diagnostics.hasToken, true);
  const socket = FakeWebSocket.instances[0];
  socket.readyState = FakeWebSocket.CLOSED;
  socket.emit('close', { code: 1008, reason: 'Origin policy denied' });
  diagnostics = window.POCKETMONSTER_CHAT_RUNTIME.diagnostics();
  assert.equal(diagnostics.stopped, false, 'a generic WebSocket 1008 policy close must not terminate the game session');
  assert.equal(diagnostics.hasToken, true);
  assert.equal(diagnostics.reconnectPending, true, 'a non-auth policy close may reconnect with the same active session');
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else if (scenario === 'rest-401-rejection') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  globalThis.fetch = async () => reply({ success: false }, 401);
  await import(`../chat-runtime.mjs?rest-401-rejection=${Date.now()}`);
  await wait();
  const diagnostics = window.POCKETMONSTER_CHAT_RUNTIME.diagnostics();
  assert.equal(diagnostics.stopped, true, 'REST 401 is an explicit session rejection');
  assert.equal(diagnostics.hasToken, false);
  assert.equal(diagnostics.reconnectPending, false);
} else if (scenario === 'structured-auth-rejection') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  globalThis.fetch = async () => reply({ success: false, errorCode: 'SESSION_REVOKED' }, 403);
  await import(`../chat-runtime.mjs?structured-auth-rejection=${Date.now()}`);
  await wait();
  const diagnostics = window.POCKETMONSTER_CHAT_RUNTIME.diagnostics();
  assert.equal(diagnostics.stopped, true, 'an explicit structured session rejection is terminal even when the status is 403');
  assert.equal(diagnostics.hasToken, false);
} else if (scenario === 'websocket-auth-rejection') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ messages: [] }) });
  await import(`../chat-runtime.mjs?websocket-auth-rejection=${Date.now()}`);
  await wait();
  assert.equal(FakeWebSocket.instances.length, 1);
  const socket = FakeWebSocket.instances[0];
  socket.readyState = FakeWebSocket.CLOSED;
  socket.emit('close', { code: 1008, reason: 'Invalid session' });
  const diagnostics = window.POCKETMONSTER_CHAT_RUNTIME.diagnostics();
  assert.equal(diagnostics.stopped, true, 'an explicit WebSocket session rejection is terminal');
  assert.equal(diagnostics.hasToken, false);
  assert.equal(diagnostics.reconnectPending, false, 'policy rejection cannot enter a reconnect loop');
} else if (scenario === 'suspend-pull-resume') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  const pullSignals = [];
  let pullCalls = 0;
  globalThis.fetch = async (_input, options = {}) => {
    pullCalls += 1;
    pullSignals.push(options.signal || null);
    if (pullCalls > 1) return reply({ messages: [] });
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        const error = new Error('chat pull aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  };
  await import(`../chat-runtime.mjs?suspend-pull-resume=${Date.now()}`);
  await wait();
  assert.equal(pullCalls, 1);
  assert.ok(pullSignals[0] instanceof AbortSignal);
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(pullSignals[0].aborted, true, 'pagehide physically aborts the pending chat pull');
  window.dispatchEvent(new Event('pageshow'));
  await wait();
  assert.equal(pullCalls, 2, 'pageshow starts a fresh pull after the suspended request aborts');
  assert.ok(pullSignals[1] instanceof AbortSignal);
  assert.notEqual(pullSignals[1], pullSignals[0], 'the resumed request uses a fresh lifecycle controller');
  assert.equal(pullSignals[1].aborted, false);
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else if (scenario === 'suspend-send-resume') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  let getCalls = 0;
  let postCalls = 0;
  let postSignal = null;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname !== '/api/chat/send') {
      getCalls += 1;
      return reply({ messages: [] });
    }
    postCalls += 1;
    postSignal = options.signal || null;
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        const error = new Error('chat send aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  };
  await import(`../chat-runtime.mjs?suspend-send-resume=${Date.now()}`);
  await wait();
  const input = elements.get('chatInput');
  input.value = 'must not commit after pagehide';
  elements.get('chatForm').emit('submit', { preventDefault() {} });
  await wait();
  assert.equal(postCalls, 1);
  assert.ok(postSignal instanceof AbortSignal);
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(postSignal.aborted, true, 'pagehide physically aborts the pending chat send');
  window.dispatchEvent(new Event('pageshow'));
  await wait();
  assert.equal(input.value, 'must not commit after pagehide', 'a suspended send cannot commit after resume');
  assert.ok(getCalls >= 2, 'resume refreshes chat with the renewed request lifecycle');
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else if (scenario === 'closing-resume') {
  window.POCKETMONSTER_RUNTIME_CONFIG = {
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
  };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ messages: [] }) });
  const nativeSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay === 5000 ? 0 : delay, ...args);
  await import(`../chat-runtime.mjs?closing-resume=${Date.now()}`);
  await wait();
  const firstSocket = FakeWebSocket.instances[0];
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(firstSocket.readyState, FakeWebSocket.CLOSING);
  window.dispatchEvent(new Event('pageshow'));
  window.dispatchEvent(new Event('pageshow'));
  await wait();
  assert.equal(FakeWebSocket.instances.length, 1, 'restore cannot overlap a replacement with a closing socket');
  firstSocket.readyState = FakeWebSocket.CLOSED;
  firstSocket.emit('close');
  await wait();
  assert.equal(FakeWebSocket.instances.length, 2, 'one replacement starts only after the prior socket is fully closed');
  assert.ok(FakeWebSocket.instances.filter(socket => socket.readyState !== FakeWebSocket.CLOSED).length <= 1);
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else {
  assert.fail(`Unknown lifecycle scenario: ${scenario}`);
}
