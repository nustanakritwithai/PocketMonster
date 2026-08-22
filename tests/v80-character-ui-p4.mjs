import assert from 'node:assert/strict';
import { activeHtml as html, activeJs as js } from './active-assets.mjs';
import {
  ACTIVE_SUMMON_RECALL_REASON,
  FULL_MANAGER_NPC_REASON,
  attachCharacterUi,
  createCharacterUIController,
  persistableState,
} from '../character-ui-controller.mjs';

function makeGame({ zone = 'hub', summonId = null, selectedSlot = 0 } = {}) {
  const state = {
    collection: [{ instanceId: 'alpha', hp: 40, maxHp: 40 }, { instanceId: 'beta', hp: 22, maxHp: 30 }],
    party: ['alpha', 'beta', null], storage: [], ranchActive: [], selectedSlot, currentZone: zone,
    trainingSelectedId: null, skillsSelectedId: null, equipSelectedId: null,
  };
  attachCharacterUi(state);
  const controller = createCharacterUIController({
    getState: () => state, getActiveSummonId: () => summonId, getZone: () => state.currentZone,
    syncLegacySelection(id) { state.trainingSelectedId = id; state.skillsSelectedId = id; state.equipSelectedId = id; },
  });
  return { state, controller };
}

assert.match(html, /id="monsterManager"/, 'reuse the existing manager overlay');
assert.doesNotMatch(js, /fullCharacterSelectedId|new CharacterStore/, 'do not add a second character store');
for (const tab of ['info', 'skills', 'equipment', 'training', 'evolution']) assert.match(js, new RegExp(`'${tab}'`), `${tab} stays a Character detail tab`);

const field = makeGame({ zone: 'grassland', selectedSlot: 1 });
const opened = field.controller.requestGlobalAccess({ source: 'global-button' });
assert.equal(opened.ok, true);
assert.equal(opened.openedManager, true, 'HUD entry opens Full Manager directly');
assert.equal(opened.panel, 'full');
assert.equal(opened.characterTab, 'info');
assert.equal(field.state.ui.focusedMonsterId, 'beta');
assert.equal(field.state.selectedSlot, 1, 'direct entry must not switch combat selection');
for (const tab of ['skills', 'equipment', 'training', 'evolution', 'info']) {
  field.controller.setTab(tab);
  assert.equal(field.state.ui.characterPanel, 'full', `${tab} stays in Full Manager`);
  assert.equal(field.state.ui.characterTab, tab, `${tab} updates the right-side detail state`);
}
field.controller.back();
assert.equal(field.state.ui.characterPanel, 'closed', 'Back from direct Full Manager returns to World');
assert.equal(field.state.currentZone, 'grassland');
assert.equal(field.state.selectedSlot, 1);

const npcDenied = makeGame({ zone: 'grassland' }).controller.requestOpenFull({ isNearNpc: false });
assert.equal(npcDenied.ok, false, 'NPC manager remains gated');
assert.equal(npcDenied.reasonText, FULL_MANAGER_NPC_REASON);

const summoned = makeGame({ summonId: 'alpha' });
const readonly = summoned.controller.requestGlobalAccess({ source: 'global-button' });
assert.equal(readonly.panel, 'full');
assert.equal(readonly.readOnly, true);
assert.equal(summoned.controller.requestOpenTab('skills').reasonText, ACTIVE_SUMMON_RECALL_REASON);
assert.equal(summoned.controller.canMutate(), false);
assert.equal(summoned.state.selectedSlot, 0);

const persisted = persistableState(field.state);
assert.equal('ui' in persisted, false, 'navigation state is excluded from saves');
console.log('V8.2 Character UI Phase 4 direct Full Manager: PASS');
