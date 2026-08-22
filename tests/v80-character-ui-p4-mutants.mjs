import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCharacterUIController } from '../character-ui-controller.mjs';

const source = fs.readFileSync(new URL('../character-ui-controller.mjs', import.meta.url), 'utf8');
let serial = 0;
const mutate = (needle, replacement, label) => {
  assert.ok(source.includes(needle), `${label}: target drifted`);
  return source.replace(needle, replacement);
};
async function load(mutant, label) {
  return import(`data:text/javascript;base64,${Buffer.from(`${mutant}\n//# sourceURL=${label}-${++serial}.mjs`).toString('base64')}`);
}
function probe(module) {
  const state = { collection: [{ instanceId: 'alpha' }, { instanceId: 'beta' }], party: ['alpha', 'beta', null], storage: [], ranchActive: [], selectedSlot: 1, currentZone: 'cave' };
  module.attachCharacterUi(state);
  const controller = module.createCharacterUIController({ getState: () => state, getActiveSummonId: () => 'alpha', getZone: () => state.currentZone });
  assert.equal(controller.requestOpenFull({ isNearNpc: false }).ok, false, 'NPC entry remains gated');
  const opened = controller.requestGlobalAccess({ source: 'global-button' });
  assert.equal(opened.ok, true);
  assert.equal(opened.openedManager, true, 'global entry opens Full Manager');
  assert.equal(opened.panel, 'full');
  assert.equal(opened.characterTab, 'info');
  assert.equal(state.ui.focusedMonsterId, 'beta');
  assert.equal(opened.readOnly, true);
  assert.equal(controller.canMutate(), false);
  controller.back();
  assert.equal(state.ui.characterPanel, 'closed', 'direct manager Back returns World');
}
probe(await import('../character-ui-controller.mjs'));
async function expectKilled(label, mutant) {
  let killed = false;
  try { probe(await load(mutant, label)); } catch { killed = true; }
  assert.equal(killed, true, `${label}: direct Full Manager regression survived`);
}
await expectKilled('npc-unlocks-in-field', mutate('return Boolean(isNearNpc);', 'return true;', 'npc-unlocks-in-field'));
await expectKilled('global-reopens-quick', mutate("requestOpenFull({\n      source: 'character',\n      monsterId: id ?? null,\n      tab: 'info',\n    })", "(openPanel('quick', { source, monsterId: id ?? null, partySlot: slot }), { ok: true, openedManager: false, panel: 'quick', characterTab: 'collection' })", 'global-reopens-quick'));
await expectKilled('global-wrong-default-tab', mutate("tab: 'info',", "tab: 'training',", 'global-wrong-default-tab'));
console.log('V8.2 Character UI Phase 4 direct entry mutants: PASS');
