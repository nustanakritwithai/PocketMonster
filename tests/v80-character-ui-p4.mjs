import assert from 'node:assert/strict';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';
import { ASSET_REVISION, SAVE_SCHEMA_VERSION } from '../save-schema.mjs';
import {
  ACTIVE_SUMMON_RECALL_REASON,
  FULL_MANAGER_NPC_REASON,
  attachCharacterUi,
  createCharacterUIController,
  persistableState,
} from '../character-ui-controller.mjs';

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const headerEnd = js.indexOf('){', start) >= 0 ? js.indexOf('){', start) : js.indexOf(') {', start);
  const brace = js.indexOf('{', headerEnd);
  let depth = 0;
  for (let i = brace; i < js.length; i++) {
    if (js[i] === '{') depth += 1;
    else if (js[i] === '}') {
      depth -= 1;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  assert.fail(`unclosed ${name}`);
}

function makeGame({
  zone = 'hub',
  summonId = null,
  selectedSlot = 0,
  party = ['alpha', 'beta', null],
} = {}) {
  const state = {
    collection: [
      { instanceId: 'alpha', hp: 40, maxHp: 40, level: 12, equipment: { gear: { id: 'wood-band' } } },
      { instanceId: 'beta', hp: 22, maxHp: 30, level: 7, equipment: {} },
    ],
    party,
    storage: [],
    ranchActive: [],
    selectedSlot,
    currentZone: zone,
    trainingSelectedId: null,
    skillsSelectedId: null,
    equipSelectedId: null,
  };
  attachCharacterUi(state);
  const controller = createCharacterUIController({
    getState: () => state,
    getActiveSummonId: () => summonId,
    getZone: () => state.currentZone,
    syncLegacySelection(id) {
      state.trainingSelectedId = id;
      state.skillsSelectedId = id;
      state.equipSelectedId = id;
    },
  });
  return { state, controller };
}

assert.equal(ASSET_REVISION, '810', 'Phase 4 must not bump the live asset revision');
assert.equal(SAVE_SCHEMA_VERSION, 8, 'Phase 4 must not bump the save schema');
assert.doesNotMatch(js, /fullCharacterSelectedId/, 'must not add a duplicate focused-monster id');
assert.doesNotMatch(js, /function FullCharacterManager|new CharacterStore/, 'must not invent a second manager');
assert.match(html, /id="monsterManager"/, 'existing manager overlay stays');
assert.match(html, /data-manager-tab="collection"/, 'collection tab stays');
assert.match(html, /data-manager-tab="skills"/, 'skills tab stays');
assert.match(html, /data-manager-tab="equipment"/, 'equipment tab stays');
assert.match(html, /data-manager-tab="training"/, 'training tab stays');
assert.match(html, /data-manager-tab="evolution"/, 'evolution tab stays');
assert.match(html, /data-manager-tab="breeding"/, 'breeding tab stays');
assert.match(js, /function monsterCard\(inst,where\)/, 'monsterCard is reused');
assert.match(css, /\.manager-item\.focused-monster/, 'focused monster is highlighted in the existing card list');

assert.match(extractFn('openManager'), /options=\{\}/, 'openManager stays backward-compatible');
assert.match(extractFn('openManager'), /source==='character'/, 'character source opens from Quick Panel');
assert.match(extractFn('openManager'), /isNearNpc/, 'NPC source still requires the ranch NPC');
assert.match(extractFn('openManager'), /requestOpenFull/, 'manager opens through the controller');
assert.match(extractFn('closeManager'), /closeAll\(\)/, 'NPC close still returns to the world');
assert.match(extractFn('closeManager'), /characterUI\.back\(\)/, 'character close pops back to Quick');
assert.match(extractFn('openCharacterQuickTab'), /requestOpenFromQuick/, 'Quick actions go through the controller');
assert.match(extractFn('openCharacterQuickTab'), /revealMonsterManager/, 'Quick actions show #monsterManager');
assert.match(extractFn('revealMonsterManager'), /setManagerTab/, 'manager tabs still drive the existing renderers');
assert.match(extractFn('setManagerTab'), /renderSkills\(\)/, 'skills tab still uses renderSkills');
assert.match(extractFn('setManagerTab'), /renderEquipment\(\)/, 'equipment tab still uses renderEquipment');
assert.match(extractFn('setManagerTab'), /renderTraining\(\)/, 'training tab still uses renderTraining');
assert.match(extractFn('setManagerTab'), /FULL_MANAGER_NPC_REASON/, 'breeding stays ranch/NPC gated');
assert.match(extractFn('depositMonster'), /assertRanchOperation/, 'ranch moves stay NPC gated');
assert.match(extractFn('healAll'), /assertRanchOperation/, 'NPC heal stays NPC gated');
assert.match(extractFn('createEgg'), /assertRanchOperation/, 'breeding stays NPC gated');
assert.match(extractFn('feedMonster'), /assertCharacterMutable/, 'feed cannot bypass summon safety');
assert.match(extractFn('evolveMonster'), /assertCharacterMutable/, 'evolution cannot bypass summon safety');
assert.match(extractFn('renderManager'), /renderParty\(\)/, 'manager mutations refresh party from getInst()');
assert.match(extractFn('renderManager'), /renderHUD\(\)/, 'manager mutations refresh Quick / combat HUD from getInst()');
assert.match(extractFn('handleCharacterUiHardwareBack'), /closeManager\(\)/, 'Android Back closes the manager first');
assert.doesNotMatch(extractFn('handleCharacterUiHardwareBack'), /switchPartySlot\(|summonThrow\(/, 'hardware back must not mutate combat');
assert.doesNotMatch(js, /party:\[null,null,null,null,null,null\]/, 'party stays 3 slots');

const npcDenied = makeGame({ zone: 'grassland' }).controller.requestOpenFull({ isNearNpc: false });
assert.equal(npcDenied.ok, false, 'NPC manager stays gated in the field');
assert.equal(npcDenied.reasonText, FULL_MANAGER_NPC_REASON);
assert.equal(npcDenied.openedManager, false);

const npcOk = makeGame();
const npcOpened = npcOk.controller.requestOpenFull({ isNearNpc: true, monsterId: 'beta', tab: 'collection' });
assert.equal(npcOpened.ok, true);
assert.equal(npcOpened.source, 'npc');
assert.equal(npcOk.state.ui.characterPanel, 'full');
assert.equal(npcOk.state.ui.focusedMonsterId, 'beta');
npcOk.controller.closeAll();
assert.equal(npcOk.state.ui.characterPanel, 'closed', 'Flow D: NPC manager close returns to the world');
assert.equal(npcOk.state.ui.characterStack.length, 0);

const flowA = makeGame({ zone: 'grassland', selectedSlot: 1 });
const quick = flowA.controller.requestGlobalAccess({ source: 'global-button' });
assert.equal(quick.ok, true);
assert.equal(quick.openedManager, false);
assert.equal(flowA.state.ui.focusedMonsterId, 'beta');
assert.equal(flowA.state.currentZone, 'grassland');
const details = flowA.controller.requestOpenFromQuick({ tab: 'collection', monsterId: 'beta' });
assert.equal(details.ok, true, 'Quick → Details opens the existing manager');
assert.equal(details.openedManager, true);
assert.equal(details.kind, 'full-manager');
assert.equal(details.source, 'character');
assert.equal(details.returnTo, 'quick');
assert.equal(flowA.state.ui.characterPanel, 'full');
assert.equal(flowA.state.ui.focusedMonsterId, 'beta', 'manager keeps the Quick focused monster');
assert.equal(flowA.state.skillsSelectedId, 'beta');
assert.equal(flowA.state.equipSelectedId, 'beta');
assert.equal(flowA.state.trainingSelectedId, 'beta');
const afterManager = flowA.controller.back();
assert.equal(afterManager.resumePanel, 'quick', 'Manager → Back → Quick');
assert.equal(afterManager.returnTo, 'quick');
assert.equal(flowA.state.ui.characterPanel, 'quick');
assert.equal(flowA.state.ui.focusedMonsterId, 'beta');
flowA.controller.back();
assert.equal(flowA.state.ui.characterPanel, 'closed', 'Quick → Back → World');
assert.equal(flowA.state.currentZone, 'grassland', 'world zone is unchanged');
assert.equal(flowA.state.selectedSlot, 1, 'combat slot is unchanged');

const flowB = makeGame({ selectedSlot: 0 });
flowB.controller.peekPartySlot(1);
assert.equal(flowB.state.ui.focusedMonsterId, 'beta');
const peekSkills = flowB.controller.requestOpenFromQuick({ tab: 'skills' });
assert.equal(peekSkills.ok, true);
assert.equal(peekSkills.characterTab, 'skills');
assert.equal(flowB.state.ui.focusedMonsterId, 'beta', 'peeked monster stays focused in Skills');
flowB.controller.back();
assert.equal(flowB.state.ui.characterPanel, 'quick');
flowB.controller.back();
assert.equal(flowB.state.ui.characterPanel, 'closed');
assert.equal(flowB.state.selectedSlot, 0);

const flowC = makeGame();
flowC.controller.requestGlobalAccess();
const equip = flowC.controller.requestOpenFromQuick({ tab: 'equipment' });
assert.equal(equip.ok, true);
assert.equal(flowC.state.ui.characterTab, 'equipment');
assert.equal(flowC.state.ui.focusedMonsterId, 'alpha');
flowC.controller.back();
assert.equal(flowC.state.ui.characterPanel, 'quick');
flowC.controller.back();
assert.equal(flowC.state.ui.characterPanel, 'closed');

const train = makeGame();
train.controller.requestGlobalAccess();
assert.equal(train.controller.requestOpenFromQuick({ tab: 'training' }).characterTab, 'training');
assert.equal(train.state.trainingSelectedId, 'alpha');

const breeding = makeGame({ zone: 'cave' });
breeding.controller.requestGlobalAccess();
const blockedBreed = breeding.controller.requestOpenFromQuick({ tab: 'breeding' });
assert.equal(blockedBreed.ok, false, 'Quick must not force breeding as a customization screen');
assert.equal(blockedBreed.reasonText, FULL_MANAGER_NPC_REASON);
assert.equal(breeding.state.ui.characterPanel, 'quick');

const summoned = makeGame({ zone: 'cave', summonId: 'alpha' });
summoned.controller.requestGlobalAccess();
assert.equal(summoned.controller.requestOpenFromQuick({ tab: 'equipment' }).ok, false);
assert.equal(summoned.controller.requestOpenFromQuick({ tab: 'equipment' }).reasonText, ACTIVE_SUMMON_RECALL_REASON);
const viewOnly = summoned.controller.requestOpenFromQuick({ tab: 'collection' });
assert.equal(viewOnly.ok, true, 'summoned view/details may open the manager');
assert.equal(summoned.controller.canMutate(), false, 'opening the manager does not bypass summon safety');
assert.equal(summoned.controller.requestMutate().ok, false);
assert.equal(summoned.controller.requestSwitchParty(1).ok, false);
assert.equal(summoned.state.selectedSlot, 0);

const sync = makeGame();
sync.controller.requestGlobalAccess();
sync.controller.requestOpenFromQuick({ tab: 'equipment' });
sync.state.collection[0].hp = 9;
assert.equal(sync.state.ui.hp, undefined, 'no duplicated HP on ui');
assert.equal(sync.state.collection.find(m => m.instanceId === 'alpha').hp, 9, 'manager/quick/party all read getInst()');
const persisted = persistableState(sync.state);
assert.equal('ui' in persisted, false, 'characterStack and focusedMonsterId stay session-only');
assert.equal(persisted.collection[0].hp, 9, 'manager mutations still persist on the instance');

console.log('V8.2 Character UI Phase 4 full manager: PASS');
