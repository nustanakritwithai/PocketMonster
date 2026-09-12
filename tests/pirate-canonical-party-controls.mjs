import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMonsterControlController } from '../monster-control-controller-v900.mjs';
import { bindMonsterControlScene } from '../monster-control-scene-binding-v900.mjs';
import { createPirateMonsterInventorySync } from '../pirate-monster-inventory-sync.mjs';

const shellSource = fs.readFileSync(new URL('../online-world-shell-v900.mjs', import.meta.url), 'utf8');
const getPartyMatch = shellSource.match(/getParty: \(\) => \{[\s\S]*?\n  \},\n  getCapabilities/);
assert.ok(getPartyMatch, 'extracts the production shell getParty callback');
const getParty = new Function('activeWorld', 'sceneFrame', 'monsterStateProvider',
  `return (${getPartyMatch[0].replace(/^getParty: /, '').replace(/,\n  getCapabilities$/, '')});`)(
  'pirate-fruit',
  { contentWindow: { POCKETMONSTER_MONSTER_BAG: { snapshot: () => canonicalBag } } },
  { snapshot: () => ({ party: null }) },
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
console.log('Pirate canonical party controls: PASS');
