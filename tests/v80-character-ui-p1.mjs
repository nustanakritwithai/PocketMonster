import assert from 'node:assert/strict';
import { activeCss as css, activeJs as js } from './active-assets.mjs';
import { SAVE_SCHEMA_VERSION } from '../save-schema.mjs';
import {
  ACTIVE_SUMMON_READONLY_REASON,
  ACTIVE_SUMMON_SWITCH_REASON,
  FULL_MANAGER_NPC_REASON,
  PARTY_SLOT_COUNT,
  attachCharacterUi,
  createCharacterUIController,
  createCharacterUiState,
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

function makeGame({ party = ['alpha', 'beta', null], selectedSlot = 1, zone = 'hub', summonId = null } = {}) {
  const state = {
    collection: [
      { instanceId: 'alpha', hp: 40, maxHp: 40, growthExp: 12 },
      { instanceId: 'beta', hp: 22, maxHp: 30, growthExp: 8 },
    ],
    party,
    selectedSlot,
    currentZone: zone,
    trainingSelectedId: null,
    skillsSelectedId: null,
    equipSelectedId: null,
    saveVersion: SAVE_SCHEMA_VERSION,
  };
  attachCharacterUi(state);
  const legacy = [];
  const controller = createCharacterUIController({
    getState: () => state,
    getActiveSummonId: () => summonId,
    getZone: () => state.currentZone,
    syncLegacySelection(id) { legacy.push(id); state.trainingSelectedId = id; state.skillsSelectedId = id; state.equipSelectedId = id; },
  });
  return { state, controller, legacy };
}

assert.equal(PARTY_SLOT_COUNT, 3, 'party stays 3 slots');
assert.equal(SAVE_SCHEMA_VERSION, 12, 'Character UI uses the current monster-instance save schema');

const uiKeys = Object.keys(createCharacterUiState());
assert.deepEqual(uiKeys.sort(), [
  'characterPanel',
  'characterStack',
  'characterTab',
  'focusedMonsterId',
  'partyTapMode',
  'pendingEquipItemId',
  'ranchPanel',
  'ranchStack',
  'readOnly',
  'selectedPartySlot',
  'source',
].sort());
for (const forbidden of ['hp', 'exp', 'growthExp', 'equipment', 'skills', 'stats', 'party']) {
  assert.equal(uiKeys.includes(forbidden), false, `UI state must not duplicate ${forbidden}`);
}

const persistSource = makeGame();
persistSource.state.ui.focusedMonsterId = 'alpha';
persistSource.state.ui.hp = 999;
const persisted = persistableState(persistSource.state);
assert.equal('ui' in persisted, false, 'session UI is stripped before save');
assert.equal(persisted.collection[0].hp, 40, 'HP remains on the instance, not the UI blob');
assert.equal(JSON.parse(JSON.stringify(persistSource.state)).ui, undefined, 'non-enumerable ui is omitted from JSON');

const peekWorld = makeGame({ selectedSlot: 1 });
const peek = peekWorld.controller.peekPartySlot(0);
assert.equal(peek.ok, true);
assert.equal(peek.switched, false, 'peek must never request a combat switch');
assert.equal(peek.monsterId, 'alpha');
assert.equal(peekWorld.state.selectedSlot, 1, 'peek must not change selectedSlot');
assert.equal(peekWorld.state.ui.characterPanel, 'quick');
assert.equal(peekWorld.state.ui.partyTapMode, 'peek');
assert.equal(peekWorld.state.ui.focusedMonsterId, 'alpha');
assert.equal(peekWorld.state.trainingSelectedId, 'alpha');
assert.equal(peekWorld.legacy[0], 'alpha');
assert.equal(peekWorld.controller.isPeekedSlot(0), true);
assert.equal(peekWorld.controller.isPeekedSlot(1), false);

const peekedAgain = peekWorld.controller.peekPartySlot(1);
assert.equal(peekedAgain.monsterId, 'beta');
assert.equal(peekWorld.controller.snapshot().characterStack.length, 1, 'repeat peek does not stack another frame');

const previous = peekWorld.controller.back();
assert.equal(previous.kind, 'world');
assert.equal(peekWorld.state.ui.characterPanel, 'closed');
assert.equal(peekWorld.state.selectedSlot, 1, 'back from peek still leaves combat slot unchanged');

const blocked = makeGame({ summonId: 'alpha', selectedSlot: 0 });
const blockedPeek = blocked.controller.peekPartySlot(1);
assert.equal(blockedPeek.ok, true, 'peek remains available while summoned');
assert.equal(blockedPeek.readOnly, true);
assert.equal(blockedPeek.switched, false);
assert.equal(blocked.state.selectedSlot, 0);
assert.equal(blocked.controller.canMutate(), false);
assert.equal(blocked.controller.requestMutate().reasonText, ACTIVE_SUMMON_READONLY_REASON);
const blockedSwitch = blocked.controller.requestSwitchParty(1);
assert.equal(blockedSwitch.ok, false);
assert.equal(blockedSwitch.reason, 'active-summon');
assert.equal(blockedSwitch.reasonText, ACTIVE_SUMMON_SWITCH_REASON);
assert.equal(blocked.state.selectedSlot, 0, 'blocked switch must not move selectedSlot');

const allowedSwitch = makeGame({ selectedSlot: 0, summonId: null });
const switchGate = allowedSwitch.controller.requestSwitchParty(2);
assert.equal(switchGate.ok, true);
assert.equal(allowedSwitch.state.ui.partyTapMode, 'switch');
assert.equal(allowedSwitch.state.selectedSlot, 0, 'controller does not mutate selectedSlot; game code does after the gate');

const npcDenied = makeGame().controller.requestOpenFull({ isNearNpc: false });
assert.equal(npcDenied.ok, false);
assert.equal(npcDenied.reasonText, FULL_MANAGER_NPC_REASON);

const npcOk = makeGame();
const opened = npcOk.controller.requestOpenFull({ isNearNpc: true, monsterId: 'beta', tab: 'skills' });
assert.equal(opened.ok, true);
assert.equal(npcOk.state.ui.characterPanel, 'full');
assert.equal(npcOk.state.ui.characterTab, 'skills');
assert.equal(npcOk.state.ui.focusedMonsterId, 'beta');
npcOk.controller.closeAll();
assert.equal(npcOk.state.ui.characterPanel, 'closed');
assert.equal(npcOk.state.ui.characterStack.length, 0);

const stack = makeGame();
stack.controller.peekPartySlot(0);
stack.controller.openPanel('full', { source: 'npc', tab: 'equipment' });
assert.equal(stack.state.ui.characterPanel, 'full');
const afterFull = stack.controller.back();
assert.equal(afterFull.resumePanel, 'quick');
assert.equal(stack.state.ui.characterPanel, 'quick');
const afterQuick = stack.controller.back();
assert.equal(afterQuick.kind, 'world');
assert.equal(stack.state.ui.characterPanel, 'closed');

assert.match(js, /from '\.\/character-ui-controller\.mjs'/, 'live runtime must import the shared controller');
assert.match(js, /attachCharacterUi\(state\)/, 'session UI is attached to the live state object');
assert.match(js, /function currentSaveEnvelope\(\)\{\s*return \{state:sanitizeStateForPersistence\(persistableState\(state\)\),playerHp:playerData\.hp,saveSchemaVersion:SAVE_SCHEMA_VERSION\};/, 'save envelope must strip session UI and use the canonical local\/Firebase persistence adapter');
assert.match(extractFn('saveGame'), /currentSaveEnvelope\(\)/, 'saveGame must write the sanitized envelope');
assert.equal(extractFn('saveGame').includes('writeStoredSave(localStorage,{state,playerHp'), false, 'raw state with ui must not be written');
assert.match(extractFn('openManager'), /isNearNpc/, 'full manager stays NPC-gated');
assert.match(extractFn('openManager'), /requestOpenFull/, 'full manager opens through the controller');
assert.match(extractFn('closeManager'), /closeAll\(\)/, 'closing the manager clears the overlay stack');
assert.match(extractFn('switchPartySlot'), /requestSwitchParty/, 'combat switch is gated');
assert.match(extractFn('switchPartySlot'), /summonThrow\(\)/, 'allowed switch still uses the original summon path');
assert.doesNotMatch(extractFn('renderParty'), /peekPartySlot\(index\)/, 'party tap must not open character peek');
assert.match(extractFn('renderParty'), /sw\.addEventListener\('click',event=>\{if\(event\.detail!==0\)return;/, 'Switch chip supports keyboard click without duplicating pointer input');
assert.match(extractFn('renderParty'), /button\.addEventListener\('click',event=>\{if\(event\.detail!==0\)return;/, 'Party slot supports keyboard click without duplicating pointer input');
assert.match(extractFn('renderParty'), /button\.addEventListener\('keydown',event=>\{if\(event\.key!=='Enter'&&event\.key!==' '\)return;/, 'role=button Party slot handles Enter and Space explicitly');
assert.match(extractFn('renderParty'), /dataset.partySwitch/, 'party HUD exposes an explicit Switch control');
assert.match(extractFn('renderParty'), /switchPartySlot\(index\)/, 'Switch control still calls switchPartySlot');
assert.match(
  extractFn('renderParty')
    .replace(/sw\.addEventListener\('pointerdown',[\s\S]*?\},\{passive:false\}\);/, '')
    .replace(/sw\.addEventListener\('click',[\s\S]*?\}\);/, ''),
  /switchPartySlot\(index\)/,
  'the party slot tap handler must call switchPartySlot',
);
assert.match(extractFn('feedMonster'), /assertCharacterMutable/, 'feed stays read-only during summon');
assert.match(extractFn('toggleStarterEquip'), /assertCharacterMutable/, 'equipment stays read-only during summon');
assert.match(extractFn('learnCandidateSkill'), /assertCharacterMutable/, 'skills stay read-only during summon');
assert.match(extractFn('setTraining'), /assertCharacterMutable/, 'training stays read-only during summon');
assert.match(css, /\.party-slot\.peeked/, 'peek highlight is distinct from selected/active');
assert.match(css, /\.party-switch/, 'Switch chip styles exist');
assert.doesNotMatch(js, /party:\[null,null,null,null,null,null\]/, 'must not expand party to 6 slots');

console.log('V8.2 Character UI Phase 1 foundation: PASS');
