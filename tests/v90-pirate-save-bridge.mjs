import assert from 'node:assert/strict';
import {
  PIRATE_SAVE_MAX_KEYS,
  PIRATE_SAVE_MAX_TOTAL_BYTES,
  PIRATE_SAVE_MAX_VALUE_BYTES,
  PIRATE_SAVE_PREFIX,
  PIRATE_SAVE_REQUEST_MESSAGE,
  PIRATE_SAVE_SNAPSHOT_MESSAGE,
  applyPirateSaveMutation,
  bindPirateSaveHost,
  createPirateSaveMemoryStorage,
  derivePirateSaveOperation,
  installPirateSaveSandbox,
  isPirateSaveKey,
  readPirateSaveSnapshot,
} from '../pirate-save-bridge-v900.mjs';

class MemoryStorage {
  constructor(entries = []) { this.map = new Map(entries); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  clear() { this.map.clear(); }
}

function dispatchMessage(target, { source, origin, data }) {
  const event = new Event('message');
  Object.defineProperties(event, {
    source: { value: source },
    origin: { value: origin },
    data: { value: data },
  });
  target.dispatchEvent(event);
}

assert.equal(PIRATE_SAVE_PREFIX, 'pirate-fruit:');
assert.equal(isPirateSaveKey('pirate-fruit:save-v1'), true);
assert.equal(isPirateSaveKey('pirate-fruit:items-v1'), true);
assert.equal(isPirateSaveKey('monsterlife.launch.session'), false, 'launch/session storage is never exposed');
assert.equal(isPirateSaveKey('pirate-fruit:'), false, 'empty names are rejected');
assert.equal(isPirateSaveKey(`pirate-fruit:${'x'.repeat(129)}`), false, 'unbounded keys are rejected');

const parentStorage = new MemoryStorage([
  ['pirate-fruit:save-v1', '{"x":4,"z":7}'],
  ['pirate-fruit:items-v1', '{"coins":800}'],
  ['monsterlife.launch.session', 'TOP-SECRET'],
]);
assert.deepEqual(readPirateSaveSnapshot(parentStorage), {
  'pirate-fruit:save-v1': '{"x":4,"z":7}',
  'pirate-fruit:items-v1': '{"coins":800}',
});

assert.equal(applyPirateSaveMutation(parentStorage, {
  op: 'set', key: 'pirate-fruit:cargo-v1', value: '{"cargo":[]}',
}), true);
assert.equal(parentStorage.getItem('pirate-fruit:cargo-v1'), '{"cargo":[]}');
assert.equal(applyPirateSaveMutation(parentStorage, {
  op: 'set', key: 'monsterlife.launch.session', value: 'STOLEN',
}), false);
assert.equal(parentStorage.getItem('monsterlife.launch.session'), 'TOP-SECRET');
assert.equal(applyPirateSaveMutation(parentStorage, {
  op: 'set', key: 'pirate-fruit:oversized-v1', value: 'x'.repeat(PIRATE_SAVE_MAX_VALUE_BYTES + 1),
}), false);

const fullParentStorage = new MemoryStorage(Array.from({ length: 4 }, (_, index) => [
  `pirate-fruit:full-${index}`,
  'x'.repeat(PIRATE_SAVE_MAX_TOTAL_BYTES / 4),
]));
assert.equal(applyPirateSaveMutation(fullParentStorage, {
  op: 'set', key: 'pirate-fruit:over-total', value: 'x',
}), false, 'parent rejects mutations beyond the aggregate byte limit');
const maxKeyParentStorage = new MemoryStorage(Array.from({ length: PIRATE_SAVE_MAX_KEYS }, (_, index) => [
  `pirate-fruit:key-${index}`,
  'x',
]));
assert.equal(applyPirateSaveMutation(maxKeyParentStorage, {
  op: 'set', key: 'pirate-fruit:key-overflow', value: 'x',
}), false, 'parent rejects mutations beyond the key-count limit');
assert.equal(applyPirateSaveMutation(parentStorage, { op: 'remove', key: 'pirate-fruit:cargo-v1' }), true);
assert.equal(parentStorage.getItem('pirate-fruit:cargo-v1'), null);
assert.equal(applyPirateSaveMutation(parentStorage, { op: 'clear' }), true);
assert.equal(parentStorage.getItem('pirate-fruit:save-v1'), null);
assert.equal(parentStorage.getItem('monsterlife.launch.session'), 'TOP-SECRET', 'clear only removes Pirate namespace');

const mutations = [];
const memory = createPirateSaveMemoryStorage({
  'pirate-fruit:save-v1': '{"x":1}',
  'monsterlife.launch.session': 'SHOULD-NOT-HYDRATE',
}, mutation => mutations.push(mutation));
assert.equal(memory.length, 1);
assert.equal(memory.key(0), 'pirate-fruit:save-v1');
assert.equal(memory.getItem('pirate-fruit:save-v1'), '{"x":1}');
assert.equal(memory.getItem('monsterlife.launch.session'), null);
memory.setItem('pirate-fruit:boats-v1', '{"boats":[]}');
memory.removeItem('pirate-fruit:save-v1');
memory.clear();
assert.deepEqual(mutations.map(entry => entry.op), ['set', 'remove', 'clear']);
const producerMutations = [];
const producerStorage = createPirateSaveMemoryStorage({
  'pirate-fruit:save-v1': '{"islandId":"starter"}',
  'pirate-fruit:progression-v1': JSON.stringify({ progression: { player: { statPoints: 3, stats: { combat: 1, vitality: 2, blade: 0, ranged: 0, fruitPower: 0, mana: 0 } } } }),
  'pirate-fruit:loadout-v1': JSON.stringify({ slots: { style: 'style-1', utility: 'utility-1' }, activeCategory: 'utility' }),
}, mutation => producerMutations.push(mutation));
producerStorage.setItem('pirate-fruit:save-v1', '{"islandId":"starter","spawnId":"dock"}');
assert.equal(producerMutations.at(-1).operation.type, 'checkpoint', 'checkpoint writes produce typed metadata');
producerStorage.setItem('pirate-fruit:progression-v1', JSON.stringify({ progression: { player: { statPoints: 1, stats: { combat: 1, vitality: 4, blade: 0, ranged: 0, fruitPower: 0, mana: 0 } } } }));
assert.deepEqual(producerMutations.at(-1).operation, { type: 'statAllocation', allocations: { vitality: 2 } });
producerStorage.setItem('pirate-fruit:items-v1', JSON.stringify({ loadout: { activeSet: 'primary', equippedWeaponKind: 'sword', equippedSwordId: 'sword-1', fruitAwakened: false }, quickslots: ['skill-1'] }));
assert.equal(producerMutations.at(-1).operation.type, 'loadout', 'inventory writes produce canonical loadout metadata');
assert.equal(producerMutations.at(-1).operation.loadout.slots.utility, 'utility-1', 'legacy utility slot is preserved');
assert.equal(producerMutations.at(-1).operation.loadout.activeCategory, 'utility', 'legacy utility category is preserved');
assert.equal(derivePirateSaveOperation(producerStorage, 'pirate-fruit:progression-v1', '{}', '{}'), null, 'invalid progression does not fabricate stat operations');
assert.throws(() => memory.setItem('monsterlife.launch.session', 'NO'), /Pirate save key/);
assert.throws(() => memory.setItem('pirate-fruit:oversized-v1', 'x'.repeat(PIRATE_SAVE_MAX_VALUE_BYTES + 1)), /too large/);

{
  const hostWindow = new EventTarget();
  const replies = [];
  const frameWindow = { postMessage(message, origin) { replies.push({ message, origin }); } };
  const frame = { contentWindow: frameWindow };
  const storage = new MemoryStorage([
    ['pirate-fruit:save-v1', '{"x":9}'],
    ['monsterlife.launch.session', 'HIDDEN'],
  ]);
  const dispose = bindPirateSaveHost(frame, { windowLike: hostWindow, storage });
  dispatchMessage(hostWindow, {
    source: frameWindow,
    origin: 'null',
    data: { type: PIRATE_SAVE_REQUEST_MESSAGE, requestId: 'request-12345678' },
  });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].origin, '*');
  assert.equal(replies[0].message.type, PIRATE_SAVE_SNAPSHOT_MESSAGE);
  assert.deepEqual(replies[0].message.entries, { 'pirate-fruit:save-v1': '{"x":9}' });
  dispatchMessage(hostWindow, {
    source: {},
    origin: 'null',
    data: { type: PIRATE_SAVE_REQUEST_MESSAGE, requestId: 'request-spoofed' },
  });
  dispatchMessage(hostWindow, {
    source: frameWindow,
    origin: 'https://game.example',
    data: { type: PIRATE_SAVE_REQUEST_MESSAGE, requestId: 'request-spoofed' },
  });
  assert.equal(replies.length, 1, 'host rejects wrong source and non-opaque origins');
  dispatchMessage(hostWindow, {
    source: frameWindow,
    origin: 'null',
    data: { type: 'pocketmonster:pirate-save-mutation-v1', op: 'set', key: 'pirate-fruit:loadout-v1', value: '{"weapon":"sword"}' },
  });
  assert.equal(storage.getItem('pirate-fruit:loadout-v1'), '{"weapon":"sword"}');
  dispose();
}

{
  const hostWindow = new EventTarget();
  const replies = [];
  const frameWindow = { postMessage(message, origin) { replies.push({ message, origin }); } };
  const storage = new MemoryStorage([['pirate-fruit:save-v1', 'local']]);
  let resolveSnapshot;
  const pendingSnapshot = new Promise(resolve => { resolveSnapshot = resolve; });
  const dispose = bindPirateSaveHost(frameWindow && { contentWindow: frameWindow }, {
    windowLike: hostWindow,
    storage,
    loadSnapshot: () => pendingSnapshot,
  });
  dispatchMessage(hostWindow, {
    source: frameWindow,
    origin: 'null',
    data: { type: PIRATE_SAVE_REQUEST_MESSAGE, requestId: 'request-async-1234' },
  });
  assert.equal(replies.length, 0, 'async bootstrap keeps the child snapshot pending');
  resolveSnapshot({ 'pirate-fruit:save-v1': 'server' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(replies.length, 1);
  assert.equal(replies[0].message.entries['pirate-fruit:save-v1'], 'server');
  dispose();
}

{
  const childWindow = new EventTarget();
  const parentWindow = {
    postMessage(message, origin) {
      assert.equal(origin, 'https://game.example');
      assert.equal(message.type, PIRATE_SAVE_REQUEST_MESSAGE);
      queueMicrotask(() => dispatchMessage(childWindow, {
        source: parentWindow,
        origin: 'https://game.example',
        data: {
          type: PIRATE_SAVE_SNAPSHOT_MESSAGE,
          requestId: message.requestId,
          entries: {
            'pirate-fruit:progression-v1': '{"level":12}',
            'monsterlife.launch.session': 'HIDDEN',
          },
        },
      }));
    },
  };
  Object.assign(childWindow, {
    parent: parentWindow,
    crypto: { randomUUID: () => 'sandbox-request-12345678' },
  });
  const installed = await installPirateSaveSandbox({
    windowLike: childWindow,
    parentOrigin: 'https://game.example',
    timeoutMs: 100,
  });
  assert.equal(installed, true);
  assert.equal(childWindow.localStorage.getItem('pirate-fruit:progression-v1'), '{"level":12}');
  assert.equal(childWindow.localStorage.getItem('monsterlife.launch.session'), null);
}

{
  const host = new EventTarget();
  const replies = [];
  const source = { postMessage: message => replies.push(message) };
  const commands = [];
  const stop = bindPirateSaveHost({ contentWindow: source }, { windowLike: host, storage: new MemoryStorage(),
    executeOperation: async operation => { commands.push(operation); return { revision: 12, persisted: {}, outcome: { ok: true } }; } });
  const data = { type: 'pocketmonster:pirate-operation-request-v1', requestId: 'operation-test-001', operation: { type: 'questState' } };
  dispatchMessage(host, { source: {}, origin: 'null', data });
  dispatchMessage(host, { source, origin: 'https://wrong.example', data });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(commands.length, 0, 'รับเฉพาะ iframe ที่ผูกกับ host นี้');
  dispatchMessage(host, { source, origin: 'null', data });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(commands, [{ type: 'questState' }]);
  assert.equal(replies[0].type, 'pocketmonster:pirate-operation-reply-v1');
  assert.equal(replies[0].requestId, data.requestId);
  assert.equal(replies[0].revision, 12);
  assert.deepEqual(replies[0].outcome, { ok: true });
  stop();
}
console.log('V9 Pirate opaque sandbox save bridge: PASS');
