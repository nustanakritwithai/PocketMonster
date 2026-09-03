import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PIRATE_HUD_INIT_MESSAGE, PIRATE_HUD_MAX_PAYLOAD_BYTES, PIRATE_HUD_MAX_UPDATES_PER_SECOND,
  PIRATE_HUD_SNAPSHOT_MESSAGE, createPirateHudTelemetryCollector, readPirateHudDom,
  sanitizePirateHudMessage, startPirateHudTelemetryPublisher,
} from '../pirate-hud-telemetry-v900.mjs';

const inventory = JSON.parse(fs.readFileSync(new URL('./fixtures/pirate-hud-source-inventory.json', import.meta.url), 'utf8'));
const child = fs.readFileSync(new URL('../pirate-fruit-offline/unified-input-bridge-v900.mjs', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const parent = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
assert.equal(inventory.captureMode, 'local-headless-runtime-dom');
assert.deepEqual(inventory.player.selectors, { level: '.progression-hud-level', hp: '.progression-hp-text', resource: '.progression-mp-text', mode: '.progression-energy-text' });
assert.equal(inventory.target.available, false, 'fraction-only target HP must not be guessed');
assert.ok(inventory.player.unavailableFields.includes('buffs'));
assert.deepEqual(inventory.actions.map(({ id }) => id), ['capture', 'summon', 'recall', 'skill1', 'skill2', 'skill3', 'skill4', 'block', 'weapon', 'potion1', 'potion2', 'zoomIn', 'zoomOut']);
assert.ok(inventory.actions.every(action => action.cooldownTextSelector === '.tc-cd-text' && action.cooldownMaskSelector === '.tc-ring'));
assert.equal(inventory.cooldownTelemetry.available, false, 'cooldown total is not guessed from a remaining fraction');
assert.equal(PIRATE_HUD_SNAPSHOT_MESSAGE, 'pocketmonster:pirate-hud-snapshot-v1');
assert.equal(PIRATE_HUD_INIT_MESSAGE, 'pocketmonster:pirate-hud-init-v1');
assert.equal(PIRATE_HUD_MAX_UPDATES_PER_SECOND, 10);

function element(text = '', { display = 'block', disabled = false, classes = [], dataset = {} } = {}) {
  return { textContent: text, disabled, classList: { contains: value => classes.includes(value) },
    getAttribute: name => ['aria-label', 'title'].includes(name) ? text : null,
    querySelector: () => null, dataset, __style: { display, visibility: 'visible' } };
}
function documentWith(entries) {
  return { defaultView: { getComputedStyle: node => node.__style }, querySelector: selector => entries[selector] || null };
}
const potion = element('Potion 12');
potion.querySelector = selector => selector === '.tc-potion-count' ? element('12') : null;
const dom = readPirateHudDom(documentWith({
  '.progression-hud': element(), '.progression-hud-level': element('Lv.27'),
  '.progression-hp-text': element('75 / 120'), '.progression-mp-text': element('40/80'),
  '.progression-energy-text': element('30/60'), '.quest-tracker': element('', { display: 'none' }),
  '.tc-attack': element('Attack'), '.tc-skill1': element('Fire', { classes: ['tc-skill-locked'] }),
  '.tc-block': element('Block', { classes: ['tc-on'] }),
  '.tc-potion1': potion, '.stats-open-button': element('Stats'),
  '.onboarding-root': element('Guide'),
  '[data-testid="server-status"]': element('', { dataset: { mode: 'presence-online' } }),
}));
assert.deepEqual({ level: dom.player.level, hp: dom.player.hp, hpMax: dom.player.hpMax }, { level: 27, hp: 75, hpMax: 120 });
assert.deepEqual({ resource: dom.player.resource, resourceMax: dom.player.resourceMax, modePercent: dom.player.modePercent }, { resource: 40, resourceMax: 80, modePercent: 50 });
assert.deepEqual(dom.player.buffs, []);
assert.equal(dom.target.available, false);
assert.equal(dom.quest.available, false);
assert.equal(dom.actions.items.find(({ id }) => id === 'capture').enabled, true);
assert.equal(dom.actions.items.find(({ id }) => id === 'capture').state, 'availability-observed');
assert.equal(dom.actions.items.find(({ id }) => id === 'capture').reason, 'cooldown-values-unavailable');
assert.equal(dom.actions.items.find(({ id }) => id === 'skill1').enabled, false);
assert.equal(dom.actions.items.find(({ id }) => id === 'potion1').count, 12);
assert.equal(dom.actions.items.find(({ id }) => id === 'block').pressed, true);
assert.equal(dom.context.connected, true, 'connection state comes from the real status banner mode');
assert.equal(dom.context.onboardingActive, true, 'onboarding state comes from the visible child overlay');
assert.deepEqual(dom.party, {
  revision: 1, available: false, selectedSlot: null, activeInstanceId: '', canSwitch: false, slots: [],
});
const missingPotionCount = readPirateHudDom(documentWith({
  '.progression-hud': element(), '.progression-hp-text': element('10/10'), '.tc-potion1': element('Potion'),
})).actions.items.find(({ id }) => id === 'potion1');
assert.equal(missingPotionCount.enabled, false, 'missing authoritative potion count is unavailable, not guessed as zero');
assert.equal(missingPotionCount.reason, 'count-unavailable');

function messageAt(revision, { frameGeneration = 4, snapshot = dom } = {}) {
  const revised = structuredClone(snapshot);
  revised.context.revision = revision;
  for (const feature of ['player', 'chat', 'quest', 'party', 'target', 'map', 'actions', 'utilities', 'banner']) {
    revised[feature].revision = revision;
  }
  return { type: PIRATE_HUD_SNAPSHOT_MESSAGE, schemaVersion: 1, frameGeneration, revision, snapshot: revised };
}
const message = messageAt(1);
const clean = sanitizePirateHudMessage(message);
assert.equal(clean.snapshot.context.worldId, 'pirate-fruit');
assert.equal(clean.snapshot.player.hp, 75);
for (const value of [clean, clean.snapshot, clean.snapshot.actions.items]) assert.equal(Object.isFrozen(value), true);
for (const bad of [null, { ...message, schemaVersion: 2 }, { ...message, frameGeneration: -1 },
  { ...message, revision: NaN }, { ...message, snapshot: { ...dom, player: { ...dom.player, hp: Infinity } } },
  { ...message, padding: 'x'.repeat(PIRATE_HUD_MAX_PAYLOAD_BYTES) }, new Proxy({}, { get() { throw Error('trap'); } }),
  new Proxy(message, {})]) {
  assert.equal(sanitizePirateHudMessage(bad), null, 'malformed telemetry fails closed');
}
assert.equal(sanitizePirateHudMessage({ ...message, unexpected: true }), null, 'unknown envelope fields fail closed');
assert.equal(sanitizePirateHudMessage({
  ...message,
  snapshot: { ...dom, actions: { ...dom.actions, items: [{ ...dom.actions.items[0], count: 1_000_000_001 }] } },
}), null, 'out-of-range nested numbers fail closed instead of being clamped');
assert.equal(sanitizePirateHudMessage({
  ...message,
  snapshot: { ...dom, actions: { ...dom.actions, items: [{ ...dom.actions.items[0], id: '../bad' }] } },
}), null, 'invalid stable IDs fail closed instead of being normalized away');
assert.equal(sanitizePirateHudMessage({
  ...message,
  snapshot: { ...dom, actions: { ...dom.actions, items: [dom.actions.items[0], dom.actions.items[0]] } },
}), null, 'duplicate collection IDs fail closed instead of being deduplicated');
assert.equal(sanitizePirateHudMessage({ ...message, revision: 2 }), null, 'envelope and nested revisions must agree');
const extraMapKey = messageAt(2);
extraMapKey.snapshot.map.bounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1, extra: 1 };
assert.equal(sanitizePirateHudMessage(extraMapKey), null, 'unknown nested map keys fail closed');
const duplicatePartySlots = messageAt(2);
duplicatePartySlots.snapshot.party.slots = [
  { id: 'slot-1', slot: 0, available: false, instanceId: '', portraitKey: '', name: '', level: 0, hp: 0, hpMax: 0, condition: '', fainted: false, selected: false, active: false },
  { id: 'slot-1', slot: 0, available: false, instanceId: '', portraitKey: '', name: '', level: 0, hp: 0, hpMax: 0, condition: '', fainted: false, selected: false, active: false },
];
assert.equal(sanitizePirateHudMessage(duplicatePartySlots), null, 'duplicate Party slot IDs/indices fail closed');
const invalidChatChannel = messageAt(2);
invalidChatChannel.snapshot.chat.channel = 'ADMIN';
invalidChatChannel.snapshot.chat.channels = ['ADMIN'];
assert.equal(sanitizePirateHudMessage(invalidChatChannel), null, 'unsupported chat channels fail closed');
const inventedUnavailableData = messageAt(2);
inventedUnavailableData.snapshot.target.available = true;
inventedUnavailableData.snapshot.target.id = 'invented-target';
assert.equal(sanitizePirateHudMessage(inventedUnavailableData), null, 'features absent from the source inventory stay unavailable');
const hiddenInventedData = messageAt(2);
hiddenInventedData.snapshot.target.name = 'Hidden target';
assert.equal(sanitizePirateHudMessage(hiddenInventedData), null, 'unavailable target cannot carry hidden invented values');
const inventedMapLabel = messageAt(2);
inventedMapLabel.snapshot.map.zoneLabel = 'Invented zone';
assert.equal(sanitizePirateHudMessage(inventedMapLabel), null, 'unavailable map cannot carry an invented zone label');
const unsupportedAction = messageAt(2);
unsupportedAction.snapshot.actions.items[0].id = 'admin';
assert.equal(sanitizePirateHudMessage(unsupportedAction), null, 'actions outside the source inventory fail closed');
for (const [feature, field, limit] of [
  ['player', 'buffs', 16], ['quest', 'steps', 32], ['party', 'slots', 3],
  ['target', 'states', 16], ['map', 'markers', 100],
]) {
  const snapshot = structuredClone(dom);
  snapshot[feature][field] = Array.from({ length: limit + 1 }, (_, index) => ({ id: `item-${index}` }));
  assert.equal(sanitizePirateHudMessage({ ...message, snapshot }), null, `${feature}.${field} limit fails closed`);
}
assert.equal(sanitizePirateHudMessage({ ...message, snapshot: { ...dom, player: { ...dom.player, revision: -1 } } }), null, 'nested revisions fail closed');
assert.equal(sanitizePirateHudMessage({ ...message, snapshot: { ...dom, player: { ...dom.player, available: 'yes' } } }), null, 'nested types fail closed');
assert.equal(sanitizePirateHudMessage({ ...message, snapshot: { ...dom, player: { ...dom.player, hp: '75' } } }), null, 'numeric strings fail closed');
assert.equal(sanitizePirateHudMessage({ ...message, snapshot: { ...dom, actions: { ...dom.actions, items: [{ ...dom.actions.items[0], count: '1' }] } } }), null, 'malformed action fields fail closed');
assert.equal(sanitizePirateHudMessage({ ...message, snapshot: { ...dom, quest: { ...dom.quest, steps: [{ id: 7, label: 'bad' }] } } }), null, 'malformed nested item fields fail closed');
for (const [feature, replacement] of [
  ['player', { ...dom.player, buffs: [{ id: 7 }] }],
  ['chat', { ...dom.chat, rows: [{ id: 'row-1', channel: 'WORLD', author: '', text: 7, timestamp: 0, kind: 'message' }] }],
  ['party', { ...dom.party, slots: [{ slot: '0' }] }],
  ['target', { ...dom.target, hp: '0' }],
  ['map', { ...dom.map, bounds: { minX: '0', maxX: 0, minZ: 0, maxZ: 0 } }],
]) assert.equal(sanitizePirateHudMessage({ ...message, snapshot: { ...dom, [feature]: replacement } }), null, `${feature} nested fields fail closed`);

const frameWindow = {};
const updates = [];
let collectorNow = 0;
const collector = createPirateHudTelemetryCollector({
  frameWindow,
  frameGeneration: 4,
  now: () => collectorNow,
  onSnapshot: (snapshot, metadata) => updates.push({ snapshot, metadata }),
});
assert.equal(collector.accept({ source: {}, origin: 'null', data: message }), null);
assert.equal(collector.accept({ source: frameWindow, origin: 'https://evil.test', data: message }), null);
assert.ok(collector.accept({ source: frameWindow, origin: 'null', data: message }));
assert.equal(collector.accept({ source: frameWindow, origin: 'null', data: message }), null, 'equal revision is stale');
assert.equal(collector.accept({ source: frameWindow, origin: 'null', data: messageAt(0) }), null);
collectorNow = 100;
const regressedMessage = messageAt(2);
regressedMessage.snapshot.player.revision = 1;
assert.equal(collector.accept({
  source: frameWindow,
  origin: 'null',
  data: regressedMessage,
}), null, 'a newer envelope cannot carry a regressed nested revision');
collector.reset({ frameWindow, frameGeneration: 5, reason: 'reload' });
assert.equal(collector.current(), null);
assert.equal(collector.accept({ source: frameWindow, origin: 'null', data: message }), null, 'old generation rejected');
assert.ok(collector.accept({ source: frameWindow, origin: 'null', data: messageAt(1, { frameGeneration: 5 }) }));
collector.invalidate('teardown');
assert.equal(collector.current(), null);
assert.equal(collector.accept({ source: frameWindow, origin: 'null', data: messageAt(2, { frameGeneration: 5 }) }), null);
assert.equal(updates.at(-1).snapshot, null);
assert.equal(updates.at(-1).metadata.reason, 'teardown');

let receiverNow = 0;
const rateUpdates = [];
const rateCollector = createPirateHudTelemetryCollector({
  frameWindow,
  frameGeneration: 4,
  now: () => receiverNow,
  onSnapshot: snapshot => rateUpdates.push(snapshot),
});
assert.ok(rateCollector.accept({ source: frameWindow, origin: 'null', data: message }));
receiverNow = 50;
assert.equal(rateCollector.accept({ source: frameWindow, origin: 'null', data: messageAt(2) }), null, 'parent rejects updates above 10Hz');
receiverNow = 100;
assert.ok(rateCollector.accept({ source: frameWindow, origin: 'null', data: messageAt(3) }));
assert.equal(rateUpdates.length, 2, 'parent dispatches no more than 10 telemetry updates per second');

const realNow = Date.now;
let now = 0;
let mutationCallback = null;
let pendingTimer = null;
const sent = [];
Date.now = () => now;
try {
  const publisher = startPirateHudTelemetryPublisher({
    document: { ...documentWith({
      '.progression-hud': element(), '.progression-hud-level': element('Lv.1'),
      '.progression-hp-text': element('10/10'),
    }), documentElement: {} },
    frameGeneration: 7,
    parentOrigin: 'https://parent.test',
    postMessage: (payload, origin) => sent.push({ payload, origin, at: now }),
    MutationObserver: class { constructor(callback) { mutationCallback = callback; } observe() {} disconnect() {} },
    setTimeout: (callback, delay) => { pendingTimer = { callback, delay }; return 1; },
    clearTimeout: () => { pendingTimer = null; },
  });
  assert.equal(sent.length, 1, 'initial state publishes immediately after generation handshake');
  mutationCallback();
  assert.ok(pendingTimer.delay >= 100, 'dirty updates are bounded to at most 10Hz');
  now = 99;
  pendingTimer.callback();
  assert.equal(sent.length, 1, 'update cannot publish before the 100ms boundary');
  now = 100;
  pendingTimer.callback();
  assert.equal(sent.length, 1, 'unchanged semantic state is deduplicated');
  publisher.stop();
} finally {
  Date.now = realNow;
}

assert.match(entry, /unified-input-bridge-v900\.mjs\?v=5/);
assert.match(child, /startPirateHudTelemetryPublisher/);
assert.match(parent, /createPirateHudTelemetryCollector/);
assert.match(parent, /createPocketPlayerHudStore/, 'Pirate boot owns a player HUD store for the parent Dock');
assert.match(parent, /POCKETMONSTER_POCKET_HUD/, 'Pirate boot exposes the Pocket HUD adapter the Dock already binds');
assert.match(parent, /pocketPlayerHud.publish\(snapshot\.player\)/, 'telemetry snapshots fill the top-left player HP panel');
assert.match(parent, /event\.source !== frame\.contentWindow \|\| event\.origin !== 'null'/);
assert.match(parent, /frameGeneration/);
assert.match(parent, /pagehide/);
assert.match(parent, /pocketmonster:world-warp-v1/);
assert.match(parent, /frame\.addEventListener\('load',[\s\S]*if \(!pirateRuntimeActive\)[\s\S]*return;[\s\S]*activateHudTelemetry\('reload'\)/,
  'a delayed iframe load cannot reactivate telemetry after scene teardown');
assert.match(parent, /mount:\(\)=>\{[\s\S]*pirateHudTelemetry\.activate\('mount'\)/, 'scene remount starts a fresh telemetry generation');
assert.doesNotMatch(parent, /allow-same-origin/);
assert.ok(PIRATE_HUD_MAX_PAYLOAD_BYTES > 0);
console.log('V9 sanitized Pirate HUD telemetry: PASS');
