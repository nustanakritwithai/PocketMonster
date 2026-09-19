import { mergeMonsterPartyControlState } from '../monster-command-http-provider-v900.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMonsterControlController } from '../monster-control-controller-v900.mjs';
import { bindMonsterControlScene } from '../monster-control-scene-binding-v900.mjs';
import { createPirateMonsterInventorySync } from '../pirate-monster-inventory-sync.mjs';
import { createMonsterHttpProvider } from '../monster-command-http-provider-v900.mjs';

const shellSource = fs.readFileSync(new URL('../online-world-shell-v900.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const getPartyMatch = shellSource.match(/getParty: \(\) => \{[\s\S]*?\n  \},\n  getCapabilities/);
assert.ok(getPartyMatch, 'extracts the production shell getParty callback');
const getParty = new Function('activeWorld', 'sceneFrame', 'monsterStateProvider', 'mergeMonsterPartyControlState',
  `return (${getPartyMatch[0].replace(/^getParty: /, '').replace(/,\n  getCapabilities$/, '')});`)(
  'pirate-fruit',
  { contentWindow: { POCKETMONSTER_MONSTER_BAG: { snapshot: () => canonicalBag } } },
  { snapshot: () => ({ available: false, party: { available: true, slots: [{ instanceId: 'owned:a', fainted: true, available: false }] } }) },
  mergeMonsterPartyControlState,
);

function button(id) {
  const listeners = new Map();
  const attrs = new Map();
  const classes = new Set();
  return {
    id, dataset: {}, title: '', hidden: false, disabled: false,
    classList: { toggle(name, value) { value ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    dispatch(type, event = {}) { listeners.get(type)?.({ preventDefault() {}, stopImmediatePropagation() {}, detail: 1, button: 0, ...event }); },
  };
}

const elements = new Map();
for (const id of ['monsterSlot1Btn', 'monsterSlot2Btn', 'monsterSlot3Btn', 'monsterThrowBtn']) elements.set(id, button(id));
const sceneWindow = {
  document: { body: { dataset: { combinedWorld: 'pirate-fruit' } }, getElementById: id => elements.get(id) || null },
  POCKETMONSTER_UNIFIED_MOBILE_CONTROLS: { setMonsterController() {} },
  CustomEvent: class extends Event { constructor(type, options) { super(type); this.detail = options?.detail; } },
  dispatchEvent() {},
};
let canonicalBag = { available: true, revision: 1, slots: [
  { available: true, instanceId: 'owned:a', name: 'Alpha', icon: '🦊' },
  { available: true, instanceId: 'owned:b', name: 'Beta', icon: '🐢' },
  { available: false, instanceId: '', name: 'ว่าง' },
] };
assert.equal(getParty().slots[0].fainted, undefined, 'stale unavailable control-state cannot reapply fainted after NPC recovery');
const bagListeners = new Set();
const bagProvider = { subscribe(listener) { bagListeners.add(listener); listener(canonicalBag); return () => bagListeners.delete(listener); } };
let refreshCount = 0;
let finishControlRead;
const pendingControlRead = new Promise(resolve => { finishControlRead = resolve; });
const commands = { summon: async () => ({ ok: true }), skill: async () => ({ ok: true }), clearScene() {} };
const controller = createMonsterControlController({
  commands,
  getParty: () => getParty(),
  getZone: () => 'pirate-fruit',
  getAim: () => ({ x: 1, y: 0, z: 2 }),
  getCapabilities: () => ({ switch: true }),
});
const binding = bindMonsterControlScene({ sceneWindow, controller });
const inventorySync = createPirateMonsterInventorySync({
  bagProvider,
  controlProvider: { refresh: () => { refreshCount += 1; return pendingControlRead; } },
  onSnapshot: () => controller.sync(),
});

assert.match(elements.get('monsterSlot1Btn').getAttribute('aria-label'), /Alpha/);
elements.get('monsterSlot1Btn').dispatch('pointerdown');
assert.equal(controller.snapshot().held?.instanceId, 'owned:a', 'pointerdown prepares the canonical server slot');
assert.equal(elements.get('monsterSlot1Btn').dataset.held, 'true', 'held state stays on the canonical slot');
assert.equal(elements.get('monsterSlot1Btn').getAttribute('aria-pressed'), 'true', 'held slot is exposed as pressed');
assert.equal(elements.get('monsterSlot1Btn').classList.contains('selected'), true, 'held slot gets the Pirate selected state');

canonicalBag = { available: true, revision: 2, slots: [
  { available: true, instanceId: 'owned:a', name: 'Alpha', icon: '🦊' },
  { available: true, instanceId: 'owned:c', name: 'Gamma', icon: '🐉' },
  { available: false, instanceId: '', name: 'ว่าง' },
] };
for (const listener of bagListeners) listener(canonicalBag);
assert.match(elements.get('monsterSlot2Btn').getAttribute('aria-label'), /Gamma/, 'revision refresh repaints changed slot immediately');
assert.equal(controller.snapshot().slots[1].instanceId, 'owned:c');
assert.ok(refreshCount >= 1, 'canonical bag revision triggered control refresh');
binding();
inventorySync.dispose();
finishControlRead({ ok: false, code: 'MONSTER_ZONE_MISMATCH' });

// NPC Recovery: provider อาจ unavailable ระหว่างเปลี่ยนฉาก แต่ bag ฟื้นแล้ว
let presenceReady = true;
let liveParty = [{ instanceId: 'owned:a', name: 'Alpha', fainted: true, hp: 0 }];
const recoveryProvider = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' },
  sessionToken: 'session-token', getZone: () => 'pirate-fruit',
  isPresenceReady: () => presenceReady,
  fetchImpl: async () => new Response(JSON.stringify({ ok: true,
    monsterControl: { party: liveParty, actors: [], capabilities: {}, revision: 4 } }), { status: 200 }),
});
await recoveryProvider.refresh();
assert.equal(recoveryProvider.snapshot().party.slots[0].fainted, true);
presenceReady = false;
await recoveryProvider.refresh();
assert.equal(recoveryProvider.snapshot().available, false, 'presence gate marks stale control unavailable');
const healedBag = { available: true, slots: [
  { slot: 0, instanceId: 'owned:a', occupied: true, available: true, fainted: false, name: 'Alpha' },
  { slot: 1, instanceId: '', occupied: false, available: false },
  { slot: 2, instanceId: '', occupied: false, available: false },
] };
const recoverySceneFrame = { contentWindow: { POCKETMONSTER_MONSTER_BAG: { snapshot: () => healedBag } } };
const recoveryGetParty = new Function('activeWorld', 'sceneFrame', 'monsterStateProvider', 'mergeMonsterPartyControlState',
  `return (${getPartyMatch[0].replace(/^getParty: /, '').replace(/,\n  getCapabilities$/, '')});`)(
  'pirate-fruit', recoverySceneFrame, recoveryProvider, mergeMonsterPartyControlState);
const transitionController = createMonsterControlController({
  commands, getParty: recoveryGetParty, getZone: () => 'pirate-fruit',
  getAim: () => ({ x: 1, y: 0, z: 2 }),
});
assert.equal((await transitionController.activateSlot(0)).reason, 'prepared', 'healed bag remains usable while control snapshot is unavailable');
liveParty = [{ instanceId: 'owned:a', name: 'Alpha', fainted: false, hp: 100 }];
presenceReady = true;
await recoveryProvider.refresh();
transitionController.sync();
assert.ok(['prepared', 'already-prepared'].includes((await transitionController.activateSlot(0)).reason), 'healed live control-state keeps the slot usable');
liveParty = [{ instanceId: 'owned:a', name: 'Alpha', fainted: true, hp: 0 }];
await recoveryProvider.refresh();
transitionController.sync();
assert.equal((await transitionController.activateSlot(0)).reason, 'unavailable', 'live dead control-state still overrides healed bag');
recoveryProvider.dispose();
console.log('Pirate canonical party controls: PASS');
