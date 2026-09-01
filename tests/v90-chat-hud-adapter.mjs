import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeUnifiedHudSnapshot, validateUnifiedHudSnapshot } from '../unified-hud-contract-v900.mjs';

const scenario = process.argv[2] || '';
if (!scenario) {
  for (const name of [
    'subscribe-initial-snapshot',
    'store-updates-without-legacy-dom',
    'send-chat-command',
    'channel-command-resets-store',
    'error-row-sanitized',
    'session-stop-resets-store',
    'suspend-resume-preserves-store',
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${name} failed\n${result.stdout}\n${result.stderr}`);
  }
  console.log('V9 chat HUD adapter (store/subscribe/commands): PASS');
  process.exit(0);
}

// The adapter must drive the chat store without any legacy #gameChat DOM:
// every querySelector below returns null, so only the store path can pass.
const windowEvents = new EventTarget();
globalThis.window = globalThis;
window.addEventListener = windowEvents.addEventListener.bind(windowEvents);
window.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
window.dispatchEvent = windowEvents.dispatchEvent.bind(windowEvents);
globalThis.CustomEvent = class extends Event {
  constructor(type, options) { super(type); this.detail = options?.detail; }
};

function fakeElement() {
  return {
    id: '',
    dataset: {},
    value: '',
    textContent: '',
    children: [],
    classList: {
      store: new Set(),
      add(value) { this.store.add(value); },
      remove(value) { this.store.delete(value); },
      contains(value) { return this.store.has(value); },
      toggle(value) { if (this.store.has(value)) this.store.delete(value); else this.store.add(value); },
    },
    addEventListener() {},
    append() {},
    replaceChildren() {},
    querySelector() { return null; },
    focus() {},
  };
}

globalThis.document = {
  head: { append() {} },
  body: { append() {} },
  querySelector() { return null; },
  createElement() { return fakeElement(); },
};

const storedSession = {
  sessionToken: 'adapter-session',
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
  close() { this.readyState = FakeWebSocket.CLOSED; this.emit('close'); }
}
globalThis.WebSocket = FakeWebSocket;
window.POCKETMONSTER_WORLD_STATE = () => ({ zone: 'pirate-fruit', x: 0, z: 0, dir: 0 });
window.POCKETMONSTER_WORLD_PRESENCE = () => true;
window.POCKETMONSTER_RUNTIME_CONFIG = {
  apiBaseUrl: 'https://server.example',
  webSocketUrl: 'wss://server.example/ws/chat',
};

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

function assertContractCompatible(snapshot) {
  const full = normalizeUnifiedHudSnapshot({
    context: { worldId: 'pocket-monster', controlMode: 'human', revision: 1 },
    chat: snapshot,
  });
  assert.deepEqual(full.chat, snapshot, 'adapter snapshot must slot into the unified HUD contract unchanged');
  assert.equal(validateUnifiedHudSnapshot(full).ok, true, 'adapter snapshot must validate inside the full contract');
}

if (scenario === 'subscribe-initial-snapshot') {
  globalThis.fetch = async () => reply({ messages: [] });
  await import(`../chat-runtime.mjs?subscribe-initial=${Date.now()}`);
  await wait();
  const chat = window.POCKETMONSTER_CHAT_RUNTIME.chat;
  assert.ok(chat, 'chat adapter API exists on the shared runtime singleton');
  const seen = [];
  const unsubscribe = chat.subscribe(snapshot => seen.push(snapshot));
  assert.equal(typeof unsubscribe, 'function', 'subscribe returns an unsubscribe function');
  assert.ok(seen.length >= 1, 'subscribe delivers the current snapshot immediately');
  const snapshot = chat.snapshot();
  assert.equal(Object.isFrozen(snapshot), true, 'chat snapshot is frozen');
  assert.equal(Object.isFrozen(snapshot.rows), true, 'chat rows array is frozen');
  assert.equal(snapshot.channel, 'WORLD');
  assert.deepEqual(snapshot.channels, ['WORLD', 'ZONE']);
  assert.deepEqual(snapshot.rows, []);
  assert.equal(snapshot.unread, 0);
  assert.equal(snapshot.canSend, true, 'an active session can send');
  assert.equal(snapshot.status, 'connected');
  assert.equal(typeof snapshot.revision, 'number');
  assertContractCompatible(snapshot);
  unsubscribe();
  assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().chatSubscribers, 0);
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else if (scenario === 'store-updates-without-legacy-dom') {
  const pulls = [];
  globalThis.fetch = async input => {
    pulls.push(String(input));
    if (pulls.length === 1) {
      return reply({
        messages: [
          { id: 1, username: 'alice', displayName: 'Alice', message: 'สวัสดีชาวโลก', timestamp: 1756700000000 },
          { id: 2, username: 'bob', message: 'ยินดีต้อนรับ' },
        ],
      });
    }
    return reply({ messages: [{ id: 3, username: 'carol', message: 'ตามมา' }] });
  };
  await import(`../chat-runtime.mjs?store-updates=${Date.now()}`);
  await wait();
  const chat = window.POCKETMONSTER_CHAT_RUNTIME.chat;
  const seen = [];
  const unsubscribe = chat.subscribe(snapshot => seen.push(snapshot));
  const snapshot = chat.snapshot();
  assert.equal(snapshot.rows.length, 2, 'pulled messages land in the store without legacy chat DOM');
  assert.deepEqual(snapshot.rows[0], {
    id: 'msg-1',
    channel: 'WORLD',
    author: 'Alice',
    text: 'สวัสดีชาวโลก',
    timestamp: 1756700000000,
    kind: 'message',
  });
  assert.equal(snapshot.rows[1].author, 'bob', 'rows fall back to username when no display name exists');
  assert.equal(snapshot.unread, 2, 'incoming messages increment unread');
  assert.equal(snapshot.status, 'connected');
  assert.equal(Object.isFrozen(snapshot.rows[0]), true, 'rows are frozen');
  assert.ok(seen.length >= 1, 'subscribers were notified about the pulled rows');
  assert.equal(seen[seen.length - 1].rows.length, 2);
  assertContractCompatible(snapshot);

  const revisionBefore = snapshot.revision;
  chat.markRead();
  const cleared = chat.snapshot();
  assert.equal(cleared.unread, 0, 'markRead clears unread');
  assert.ok(cleared.revision > revisionBefore, 'markRead publishes a fresh revision');
  chat.markRead();
  assert.equal(chat.snapshot().revision, cleared.revision, 'markRead is a no-op when unread is already zero');

  unsubscribe();
  const delivered = seen.length;
  const socket = FakeWebSocket.instances[0];
  socket.readyState = FakeWebSocket.OPEN;
  socket.emit('message', { data: JSON.stringify({ type: 'chat' }) });
  await wait();
  assert.equal(chat.snapshot().rows.length, 3, 'the store keeps receiving after unsubscribe');
  assert.equal(seen.length, delivered, 'an unsubscribed listener receives no further snapshots');
  assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().chatSubscribers, 0);
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else if (scenario === 'send-chat-command') {
  const posts = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/chat/send') {
      posts.push({ headers: options.headers, body: JSON.parse(options.body) });
      return reply({ success: true });
    }
    return reply({ messages: [] });
  };
  await import(`../chat-runtime.mjs?send-chat=${Date.now()}`);
  await wait();
  const chat = window.POCKETMONSTER_CHAT_RUNTIME.chat;
  const result = await chat.sendChat('  ทักทายทุกคน  ');
  assert.equal(Object.isFrozen(result), true, 'command results are frozen');
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'sent');
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { message: 'ทักทายทุกคน', channel: 'WORLD' }, 'sendChat trims text and uses the store channel');
  assert.equal(posts[0].headers.Authorization, 'Bearer adapter-session');
  await wait();

  const empty = await chat.sendChat('   ');
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'empty-message');
  const nonText = await chat.sendChat(123);
  assert.equal(nonText.ok, false);
  assert.equal(nonText.reason, 'empty-message');
  assert.equal(posts.length, 1, 'empty sends never reach the transport');

  window.dispatchEvent(new Event('pocketmonster:session-ended'));
  await wait();
  const afterStop = await chat.sendChat('ยังอยู่ไหม');
  assert.equal(afterStop.ok, false);
  assert.equal(afterStop.reason, 'session-unavailable', 'send commands fail closed after the session ends');
  assert.equal(posts.length, 1);
} else if (scenario === 'channel-command-resets-store') {
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
  await import(`../chat-runtime.mjs?channel-command=${Date.now()}`);
  await wait();
  const chat = window.POCKETMONSTER_CHAT_RUNTIME.chat;
  assert.equal(calls.length, 1);
  assert.match(calls[0], /after=0&channel=WORLD/);

  const zoned = chat.setChatChannel('zone');
  assert.equal(Object.isFrozen(zoned), true);
  assert.equal(zoned.ok, true);
  assert.equal(zoned.reason, 'channel-changed');
  const afterSwitch = chat.snapshot();
  assert.equal(afterSwitch.channel, 'ZONE');
  assert.deepEqual(afterSwitch.rows, [], 'channel switch clears the store immediately');
  assert.equal(afterSwitch.unread, 0);
  await wait();
  assert.equal(calls.length, 1, 'a channel switch queues one rerun instead of overlapping the WORLD pull');

  pending.shift().resolve(reply({ messages: [{ id: 41, username: 'world-user', message: 'WORLD stale' }] }));
  await wait();
  assert.equal(calls.length, 2, 'the queued ZONE pull starts after the WORLD response settles');
  assert.match(calls[1], /after=0&channel=ZONE/, 'the stale WORLD cursor cannot leak into the ZONE view');
  assert.deepEqual(chat.snapshot().rows, [], 'a stale WORLD response cannot leak into the ZONE store');
  assert.equal(chat.snapshot().unread, 0);

  pending.shift().resolve(reply({ messages: [{ id: 7, username: 'zone-user', message: 'ZONE current' }] }));
  await wait();
  const current = chat.snapshot();
  assert.equal(current.rows.length, 1);
  assert.equal(current.rows[0].text, 'ZONE current');
  assert.equal(current.rows[0].channel, 'ZONE');
  assert.equal(maxConcurrent, 1, 'channel-switch pulls stay serialized');

  const repeat = chat.setChatChannel('ZONE');
  assert.equal(repeat.ok, true);
  assert.equal(repeat.reason, 'already-active');
  await wait();
  assert.equal(calls.length, 2, 'an unchanged channel does not re-pull');

  const invalid = chat.setChatChannel('PARTY');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, 'unsupported-channel', 'social party channels are not invented client-side');
  const nonText = chat.setChatChannel(null);
  assert.equal(nonText.ok, false);
  assert.equal(nonText.reason, 'unsupported-channel');
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else if (scenario === 'error-row-sanitized') {
  let pullCount = 0;
  globalThis.fetch = async () => {
    pullCount += 1;
    if (pullCount === 1) {
      return reply({ messages: [{ id: 9, username: 'evil', message: '<script>alert(1)</script>' }] }, 500);
    }
    return reply({ messages: [{ id: 1, username: 'ann', message: 'มาแลว' }] });
  };
  await import(`../chat-runtime.mjs?error-row=${Date.now()}`);
  await wait();
  const chat = window.POCKETMONSTER_CHAT_RUNTIME.chat;
  const failed = chat.snapshot();
  assert.equal(failed.status, 'error');
  assert.equal(failed.rows.length, 1, 'a failed pull publishes exactly one system error row');
  const errorRow = failed.rows[0];
  assert.equal(errorRow.kind, 'error');
  assert.equal(errorRow.id, 'system-error');
  assert.equal(errorRow.text, 'เชื่อมต่อแชทไม่สำเร็จ', 'error rows carry the fixed Thai copy, never server payload');
  assert.equal(failed.unread, 0, 'error rows do not count as unread chat');
  assert.ok(!JSON.stringify(failed).includes('script'), 'server payloads never reach the store on failure');

  const socket = FakeWebSocket.instances[0];
  socket.readyState = FakeWebSocket.OPEN;
  socket.emit('message', { data: JSON.stringify({ type: 'chat' }) });
  await wait();
  const recovered = chat.snapshot();
  assert.equal(recovered.status, 'connected');
  assert.equal(recovered.rows.length, 1, 'a recovered pull clears the system error row');
  assert.equal(recovered.rows[0].kind, 'message');
  assert.equal(recovered.rows[0].text, 'มาแลว');
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else if (scenario === 'session-stop-resets-store') {
  globalThis.fetch = async () => reply({
    messages: [
      { id: 1, username: 'alice', message: 'หนึ่ง' },
      { id: 2, username: 'bob', message: 'สอง' },
    ],
  });
  await import(`../chat-runtime.mjs?session-stop=${Date.now()}`);
  await wait();
  const chat = window.POCKETMONSTER_CHAT_RUNTIME.chat;
  const seen = [];
  chat.subscribe(snapshot => seen.push(snapshot));
  const populated = chat.snapshot();
  assert.equal(populated.rows.length, 2);
  assert.equal(populated.canSend, true);
  const revisionBefore = populated.revision;

  window.dispatchEvent(new Event('pocketmonster:session-ended'));
  await wait();
  const cleared = chat.snapshot();
  assert.deepEqual(cleared.rows, [], 'stop clears chat rows');
  assert.equal(cleared.unread, 0);
  assert.equal(cleared.status, 'unavailable');
  assert.equal(cleared.canSend, false);
  assert.ok(cleared.revision > revisionBefore, 'stop publishes a fresh revision');
  assert.equal(seen[seen.length - 1].status, 'unavailable', 'subscribers hear the terminal reset');

  const denied = chat.setChatChannel('ZONE');
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'session-unavailable', 'channel commands fail closed after the session ends');
  const sendDenied = await chat.sendChat('ยังอยู่ไหม');
  assert.equal(sendDenied.ok, false);
} else if (scenario === 'suspend-resume-preserves-store') {
  let pullCalls = 0;
  globalThis.fetch = async () => {
    pullCalls += 1;
    if (pullCalls === 1) return reply({ messages: [{ id: 1, username: 'alice', message: 'ค้างไว้' }] });
    return reply({ messages: [] });
  };
  await import(`../chat-runtime.mjs?suspend-resume=${Date.now()}`);
  await wait();
  const chat = window.POCKETMONSTER_CHAT_RUNTIME.chat;
  assert.equal(chat.snapshot().rows.length, 1);

  window.dispatchEvent(new Event('pagehide'));
  await wait();
  const suspended = chat.snapshot();
  assert.equal(suspended.canSend, false, 'suspend disables sending');
  assert.equal(suspended.rows.length, 1, 'suspend preserves chat history');

  window.dispatchEvent(new Event('pageshow'));
  await wait();
  const resumed = chat.snapshot();
  assert.equal(resumed.canSend, true, 'resume restores sending');
  assert.equal(resumed.status, 'connected');
  assert.equal(resumed.rows.length, 1);
  assert.ok(pullCalls >= 2, 'resume refreshes chat through a fresh pull');
  window.dispatchEvent(new Event('pocketmonster:session-ended'));
} else {
  assert.fail(`Unknown chat HUD adapter scenario: ${scenario}`);
}
