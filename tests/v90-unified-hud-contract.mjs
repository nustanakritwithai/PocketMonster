import assert from 'node:assert/strict';
import {
  HUD_COMMANDS,
  HUD_CONTRACT_VERSION,
  HUD_LIMITS,
  createHudCommandResult,
  normalizeUnifiedHudSnapshot,
  validateUnifiedHudSnapshot,
} from '../unified-hud-contract-v900.mjs';

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function canonicalInput(overrides = {}) {
  return {
    context: {
      worldId: 'pocket-monster', controlMode: 'capture', onboardingActive: false,
      connected: true, loading: false, revision: 7,
    },
    player: {
      revision: 2, available: true, portraitKey: 'normalooze', displayName: 'Mochi', level: 12,
      title: 'Ranch Partner', hp: 75, hpMax: 100, resourceKind: 'uses', resource: 3,
      resourceMax: 5, modeLabel: 'Capture', modePercent: 50,
      buffs: [{ id: 'swift', label: 'Swift', expiresAt: 1234 }],
    },
    chat: {
      revision: 3, channel: 'WORLD', channels: ['WORLD', 'ZONE'],
      rows: [{ id: 'chat-1', channel: 'WORLD', author: 'Ada', text: 'Hello', timestamp: 10, kind: 'message' }],
      unread: 4, status: 'connected', canSend: true,
    },
    quest: {
      revision: 4, available: true, title: 'First Steps', summary: 'Catch one monster',
      steps: [{ id: 'catch-one', label: 'Catch one monster', state: 'current', progress: 0, goal: 1 }],
      status: 'active',
    },
    party: {
      revision: 5, available: true, selectedSlot: 0, activeInstanceId: 'monster-1', canSwitch: true,
      slots: [{ id: 'slot-1', slot: 0, instanceId: 'monster-1', portraitKey: 'normalooze', name: 'Mochi', level: 12, hp: 75, hpMax: 100, condition: 'healthy', fainted: false, selected: true, active: true }],
    },
    target: {
      revision: 6, available: true, id: 'wild-1', portraitKey: 'flameling', name: 'Flameling',
      level: 8, hp: 30, hpMax: 40, states: ['burning'],
    },
    map: {
      revision: 7, available: true, bounds: { minX: -10, maxX: 10, minZ: -20, maxZ: 20 },
      local: { x: 1, z: 2, heading: 0.5 },
      markers: [{ id: 'portal-1', kind: 'portal', label: 'Ranch', x: 3, z: 4 }],
      zoneLabel: 'Wildlands',
    },
    actions: {
      revision: 8,
      items: [{ id: 'capture', visualKey: 'capture', label: 'Capture', enabled: true, pressed: false, cooldownRemaining: 0, cooldownTotal: 4, count: 2, state: 'ready', reason: '' }],
    },
    utilities: {
      revision: 9,
      items: [{ id: 'fullscreen', label: 'Fullscreen', visualKey: 'fullscreen', enabled: true, badge: '', reason: '' }],
    },
    banner: { revision: 10, kind: 'system', text: 'Ready', expiresAt: 5000 },
    ...overrides,
  };
}

assert.equal(HUD_CONTRACT_VERSION, 'pocketmonster:unified-hud-snapshot-v1');
assert.deepEqual(HUD_COMMANDS, [
  'setTab', 'setExpanded', 'setChatChannel', 'sendChat', 'selectPartySlot', 'switchPartySlot',
  'openCharacter', 'invokeAction', 'invokeUtility', 'toggleQuest', 'toggleParty', 'toggleMap',
]);
assert.equal(Object.isFrozen(HUD_COMMANDS), true);
assert.equal(HUD_LIMITS.partySlots, 3);
assert.ok(HUD_LIMITS.string > 0 && HUD_LIMITS.chatRows > 0 && HUD_LIMITS.actions > 0);

const source = canonicalInput();
const snapshot = normalizeUnifiedHudSnapshot(source);
assert.equal(validateUnifiedHudSnapshot(snapshot).ok, true, 'canonical normalized snapshot validates');
assert.deepEqual(snapshot.context, {
  worldId: 'pocket-monster', controlMode: 'capture', onboardingActive: false,
  connected: true, loading: false, revision: 7,
});
assert.equal(snapshot.player.hp, 75);
assert.equal(snapshot.chat.rows[0].text, 'Hello');
assert.equal(snapshot.quest.steps[0].id, 'catch-one');
assert.equal(snapshot.party.slots.length, 3, 'Party contract always exposes three stable slots');
assert.deepEqual(snapshot.party.slots.map(slot => slot.slot), [0, 1, 2]);
assert.equal(snapshot.party.slots[1].available, false);
assert.equal(snapshot.actions.items[0].id, 'capture');
assert.equal(snapshot.utilities.items[0].id, 'fullscreen');
assert.equal(snapshot.schemaVersion, HUD_CONTRACT_VERSION);

source.player.displayName = 'mutated';
source.chat.rows[0].text = 'mutated';
assert.equal(snapshot.player.displayName, 'Mochi', 'snapshot copies source primitives');
assert.equal(snapshot.chat.rows[0].text, 'Hello', 'nested source mutations cannot change the snapshot');
for (const value of [
  snapshot, snapshot.context, snapshot.player, snapshot.player.buffs, snapshot.player.buffs[0],
  snapshot.chat.rows, snapshot.quest.steps, snapshot.party.slots, snapshot.target.states,
  snapshot.map.bounds, snapshot.map.markers, snapshot.actions.items, snapshot.utilities.items, snapshot.banner,
]) assert.equal(Object.isFrozen(value), true, 'every exposed snapshot layer is immutable');

const bounded = normalizeUnifiedHudSnapshot(canonicalInput({
  player: {
    ...canonicalInput().player,
    displayName: 'x'.repeat(HUD_LIMITS.string + 20), level: 999999, hp: -50, hpMax: Infinity,
    resource: 100, resourceMax: 5, modePercent: 250,
    buffs: Array.from({ length: HUD_LIMITS.buffs + 5 }, (_, index) => ({ id: `buff-${index}`, label: `Buff ${index}` })),
  },
  chat: {
    ...canonicalInput().chat,
    unread: -10,
    rows: Array.from({ length: HUD_LIMITS.chatRows + 5 }, (_, index) => ({ id: `row-${index}`, text: `Row ${index}` })),
  },
  actions: {
    revision: 8,
    items: [
      { id: 'valid-action', label: 'Valid' },
      { id: 'valid-action', label: 'Duplicate' },
      { id: '../invalid', label: 'Invalid' },
      ...Array.from({ length: HUD_LIMITS.actions + 5 }, (_, index) => ({ id: `action-${index}`, label: `Action ${index}` })),
    ],
  },
}));
assert.equal(bounded.player.displayName.length, HUD_LIMITS.string, 'display strings are bounded');
assert.equal(bounded.player.level, HUD_LIMITS.levelMax);
assert.equal(bounded.player.hp, 0);
assert.equal(bounded.player.hpMax, 0, 'non-finite numeric source fails closed');
assert.equal(bounded.player.resource, 5, 'current resource clamps to its maximum');
assert.equal(bounded.player.modePercent, 100);
assert.equal(bounded.player.buffs.length, HUD_LIMITS.buffs);
assert.equal(bounded.chat.rows.length, HUD_LIMITS.chatRows);
assert.equal(bounded.chat.unread, 0);
assert.equal(bounded.actions.items.length <= HUD_LIMITS.actions, true);
assert.equal(new Set(bounded.actions.items.map(item => item.id)).size, bounded.actions.items.length, 'action IDs stay unique');
assert.equal(bounded.actions.items.some(item => item.id === '../invalid'), false, 'unstable action IDs fail closed');

const hugeNumbers = normalizeUnifiedHudSnapshot(canonicalInput({
  chat: { ...canonicalInput().chat, rows: [{ id: 'huge-time', timestamp: Number.MAX_VALUE }] },
  map: {
    ...canonicalInput().map,
    bounds: { minX: -Number.MAX_VALUE, maxX: Number.MAX_VALUE, minZ: -Number.MAX_VALUE, maxZ: Number.MAX_VALUE },
    local: { x: Number.MAX_VALUE, z: -Number.MAX_VALUE, heading: Number.MAX_VALUE },
    markers: [{ id: 'huge-marker', x: Number.MAX_VALUE, z: -Number.MAX_VALUE }],
  },
  banner: { revision: 10, kind: 'system', text: 'bounded', expiresAt: Number.MAX_VALUE },
}));
assert.deepEqual(hugeNumbers.map.bounds, { minX: -HUD_LIMITS.numericMax, maxX: HUD_LIMITS.numericMax, minZ: -HUD_LIMITS.numericMax, maxZ: HUD_LIMITS.numericMax });
assert.equal(hugeNumbers.map.local.x, HUD_LIMITS.numericMax);
assert.equal(hugeNumbers.map.local.z, -HUD_LIMITS.numericMax);
assert.equal(hugeNumbers.map.markers[0].x, HUD_LIMITS.numericMax);
assert.equal(hugeNumbers.chat.rows[0].timestamp, HUD_LIMITS.timestampMax);
assert.equal(hugeNumbers.banner.expiresAt, HUD_LIMITS.timestampMax);

const stableSlots = normalizeUnifiedHudSnapshot(canonicalInput({
  party: {
    revision: 5, available: true, selectedSlot: 0, canSwitch: true,
    slots: [{ slot: 0, id: 'adapter-owned-id' }, { slot: 1, id: 'adapter-owned-id' }],
  },
}));
assert.deepEqual(stableSlots.party.slots.map(slot => slot.id), ['slot-1', 'slot-2', 'slot-3'], 'Party slot IDs are contract-owned and stable');

const newer = normalizeUnifiedHudSnapshot(canonicalInput());
const mutablePrevious = structuredClone(newer);
const mutablePreviousResult = normalizeUnifiedHudSnapshot(canonicalInput({
  context: { ...canonicalInput().context, revision: 6 },
}), mutablePrevious);
assert.notEqual(mutablePreviousResult, mutablePrevious, 'mutable caller data is never trusted as a previous contract snapshot');
assert.equal(Object.isFrozen(mutablePreviousResult), true);
assert.equal(Object.isFrozen(mutablePreviousResult.player), true);
const throwingPrevious = new Proxy({}, { get() { throw new Error('untrusted getter'); } });
assert.doesNotThrow(() => normalizeUnifiedHudSnapshot(canonicalInput(), throwingPrevious), 'untrusted previous snapshots fail closed');
const incompleteFrozenPrevious = Object.freeze({
  schemaVersion: HUD_CONTRACT_VERSION,
  context: Object.freeze({ worldId: 'pocket-monster', revision: 99 }),
});
const incompletePreviousResult = normalizeUnifiedHudSnapshot(canonicalInput(), incompleteFrozenPrevious);
assert.notEqual(incompletePreviousResult, incompleteFrozenPrevious, 'frozen but structurally invalid previous data is not trusted');
assert.equal(validateUnifiedHudSnapshot(incompletePreviousResult).ok, true);
const stale = normalizeUnifiedHudSnapshot(canonicalInput({
  player: { ...canonicalInput().player, revision: 1, displayName: 'stale player' },
  quest: { ...canonicalInput().quest, revision: 5, title: 'new quest' },
  actions: { revision: 7, items: [{ id: 'stale-action', label: 'Stale' }] },
}), newer);
assert.equal(stale.player, newer.player, 'older feature revision preserves the previous immutable feature');
assert.equal(stale.actions, newer.actions, 'older collection revision preserves the previous immutable collection');
assert.equal(stale.quest.title, 'new quest', 'newer feature revision is accepted');
assert.equal(stale.quest.revision, 5);
const same = normalizeUnifiedHudSnapshot(canonicalInput(), newer);
assert.equal(same.player, newer.player, 'equal revisions preserve identity and avoid redundant feature renders');
assert.equal(same.chat, newer.chat);

const staleUnknown = normalizeUnifiedHudSnapshot(canonicalInput({
  context: { worldId: 'retired-world', revision: 6 },
}), newer);
assert.equal(staleUnknown, newer, 'an older unknown-world payload cannot erase a newer world snapshot');

const switchedWorld = normalizeUnifiedHudSnapshot({
  context: { worldId: 'pirate-fruit', controlMode: 'human', connected: true, loading: false, revision: 8 },
}, newer);
assert.equal(switchedWorld.context.worldId, 'pirate-fruit');
assert.equal(switchedWorld.player.available, false, 'world transitions clear prior player data unless the new adapter publishes it');
assert.equal(switchedWorld.quest.available, false);
assert.equal(switchedWorld.party.available, false);
assert.equal(switchedWorld.target.available, false);
assert.deepEqual(switchedWorld.actions.items, []);
assert.deepEqual(switchedWorld.utilities.items, []);
assert.equal(switchedWorld.banner.text, '');

const unknown = normalizeUnifiedHudSnapshot(canonicalInput({
  context: { worldId: 'future-world', controlMode: 'god', connected: true, loading: false, revision: 12 },
}), newer);
assert.equal(unknown.context.worldId, 'unknown');
assert.equal(unknown.context.controlMode, 'unavailable');
assert.equal(unknown.player.available, false);
assert.equal(unknown.quest.available, false);
assert.equal(unknown.party.available, false);
assert.equal(unknown.target.available, false);
assert.equal(unknown.map.available, false);
assert.deepEqual(unknown.actions.items, []);
assert.deepEqual(unknown.utilities.items, []);
assert.equal(unknown.banner.text, '', 'unknown worlds cannot retain stale world display data');
assert.equal(validateUnifiedHudSnapshot(unknown).ok, true, 'the fail-closed unknown-world reset remains a valid contract snapshot');

const invalidValidation = validateUnifiedHudSnapshot({ schemaVersion: HUD_CONTRACT_VERSION, context: null });
assert.equal(invalidValidation.ok, false);
assert.ok(invalidValidation.issues.some(issue => issue.code === 'invalid_context'));
assert.equal(Object.isFrozen(invalidValidation), true);
assert.equal(Object.isFrozen(invalidValidation.issues), true);

const mutableCloneValidation = validateUnifiedHudSnapshot(structuredClone(snapshot));
assert.equal(mutableCloneValidation.ok, false, 'structurally valid but mutable snapshots are rejected');
assert.ok(mutableCloneValidation.issues.some(issue => issue.code === 'mutable_snapshot'));
const invalidTargetSnapshot = structuredClone(snapshot);
invalidTargetSnapshot.target.id = '../invalid';
deepFreeze(invalidTargetSnapshot);
const invalidTargetValidation = validateUnifiedHudSnapshot(invalidTargetSnapshot);
assert.equal(invalidTargetValidation.ok, false, 'frozen target IDs must still satisfy the stable-ID contract');
assert.ok(invalidTargetValidation.issues.some(issue => issue.code === 'invalid_item_id' && issue.field === 'target.id'));
const throwingValidationInput = new Proxy({}, { get() { throw new Error('validation getter'); } });
let throwingValidationResult = null;
assert.doesNotThrow(() => { throwingValidationResult = validateUnifiedHudSnapshot(throwingValidationInput); });
assert.equal(throwingValidationResult.ok, false);
assert.ok(throwingValidationResult.issues.some(issue => issue.code === 'invalid_snapshot'));

const malformedSnapshot = structuredClone(snapshot);
malformedSnapshot.player.revision = -1;
malformedSnapshot.player.displayName = 'x'.repeat(HUD_LIMITS.string + 1);
malformedSnapshot.chat.rows[0].timestamp = Number.NaN;
malformedSnapshot.actions.items = Array.from(
  { length: HUD_LIMITS.actions + 1 },
  (_, index) => ({ ...snapshot.actions.items[0], id: index === 0 ? '../bad' : `action-${index}` }),
);
malformedSnapshot.party.slots[0].id = 'adapter-slot';
const malformedValidation = validateUnifiedHudSnapshot(malformedSnapshot);
assert.equal(malformedValidation.ok, false, 'validator rejects malformed nested contract data without normalizing it first');
for (const code of ['invalid_feature_revision', 'string_limit_exceeded', 'invalid_timestamp', 'collection_limit_exceeded', 'invalid_item_id', 'invalid_party_slot']) {
  assert.ok(malformedValidation.issues.some(issue => issue.code === code), `validator reports ${code}`);
}

assert.deepEqual(createHudCommandResult({ ok: true, message: 'Done' }), { ok: true, reason: '', message: 'Done' });
assert.deepEqual(createHudCommandResult({ ok: false, reason: 'not-available', message: 'No target' }), { ok: false, reason: 'not-available', message: 'No target' });
assert.deepEqual(createHudCommandResult({ ok: false, reason: '   ' }), { ok: false, reason: 'command-failed', message: '' });
assert.deepEqual(createHudCommandResult(null), { ok: false, reason: 'invalid-command-result', message: '' });
assert.equal(Object.isFrozen(createHudCommandResult({ ok: true })), true);

console.log('V9 unified HUD immutable snapshot and command contract: PASS');
