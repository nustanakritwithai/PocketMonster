import assert from 'node:assert/strict';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';
import { ASSET_REVISION, SAVE_SCHEMA_VERSION } from '../save-schema.mjs';
import {
  ACTIVE_SUMMON_RECALL_REASON,
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
  storage = ['gamma'],
  ranchActive = ['gamma'],
} = {}) {
  const state = {
    collection: [
      { instanceId: 'alpha', hp: 40, maxHp: 40, level: 12, atk: 8, def: 6, spd: 5, speciesId: 'flameling' },
      { instanceId: 'beta', hp: 22, maxHp: 30, level: 7, atk: 4, def: 4, spd: 9, speciesId: 'aquapuff' },
      { instanceId: 'gamma', hp: 18, maxHp: 18, level: 3, atk: 3, def: 3, spd: 3, speciesId: 'mossbun' },
    ],
    party,
    storage,
    ranchActive,
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

assert.equal(ASSET_REVISION, '810', 'Phase 3 must not bump the live asset revision');
assert.equal(SAVE_SCHEMA_VERSION, 10, 'Phase 3 remains compatible with the current save schema');

const entryHtml = html.slice(html.indexOf('id="characterAccessEntry"'), html.indexOf('controls-left'));
assert.match(entryHtml, /id="characterAccessPortrait"/, 'quick panel needs a portrait');
assert.match(entryHtml, /id="characterAccessMeta"/, 'quick panel needs Lv/HP');
assert.match(entryHtml, /id="characterAccessType"/, 'quick panel needs type');
assert.match(entryHtml, /id="characterAccessCr"/, 'quick panel needs CR');
assert.match(entryHtml, /id="characterAccessPlace"/, 'quick panel needs party/location');
assert.match(entryHtml, /id="characterAccessStats"/, 'quick panel needs read-only stats');
assert.match(entryHtml, /id="characterAccessReason"/, 'summon reason lives on the sheet, not a disabled wall');
assert.match(entryHtml, /id="characterAccessActions"/, 'normal actions attach to this button sheet');
assert.match(entryHtml, /id="characterQuickTabBody"/, 'skills/equipment reuse a host on the same sheet');
assert.match(entryHtml, />รายละเอียด</, 'View action is on the sheet');
assert.match(entryHtml, />สกิล</, 'Skills action is on the sheet');
assert.match(entryHtml, />อุปกรณ์</, 'Equipment action is on the sheet');
assert.match(entryHtml, />ฝึก</, 'Training action is on the sheet');
assert.doesNotMatch(entryHtml, /monster-main|feed-actions|data-feed|data-care/, 'quick panel is not a second ranch card');
assert.doesNotMatch(entryHtml, /disabled/, 'do not ship a wall of disabled action buttons');
assert.match(html, /id="monsterManager"[\s\S]*data-tab-pane="skills"[\s\S]*data-tab-pane="equipment"/, 'original manager tabs stay in place');
assert.match(html, /id="skillsPanel"/, 'existing skills renderer host remains');
assert.match(html, /id="equipmentPanel"/, 'existing equipment renderer host remains');
assert.match(html, /id="trainingPanel"/, 'existing training renderer host remains');

const panelCss = css.match(/\.character-access-entry,\.character-quick-panel\{[^}]+\}/)?.[0] || '';
assert.match(panelCss, /left:calc\(var\(--safe-left\) \+ 134px\)/, 'sheet sits right of the joystick column, not a full left column');
assert.match(panelCss, /bottom:calc\(var\(--safe-bottom\) \+ 216px\)/, 'default sheet sits above the joystick');
assert.match(panelCss, /max-height:/, 'sheet height is capped so it cannot eat the movement stick');
assert.match(panelCss, /width:min\(/, 'sheet width is capped');
assert.doesNotMatch(panelCss, /left:\s*0/, 'sheet must not stretch from the left edge');
assert.doesNotMatch(panelCss, /width:\s*100%/, 'sheet must not become a left-side menu column');
assert.match(css, /left:calc\(var\(--safe-left\) \+ 134px\)/, 'narrow landscape also keeps the sheet past the joystick column');
assert.match(css, /max-height:calc\(100vh - var\(--safe-top\) - 206px\)/, 'narrow landscape keeps bottom combat/move chrome clear');
assert.doesNotMatch(css, /\.controls-right[^{]*\{[^}]*character-/, 'quick panel is not a combat control');

assert.match(extractFn('renderCharacterAccess'), /getInst\(snap\.focusedMonsterId\)/, 'identity is live from getInst');
assert.match(extractFn('renderCharacterAccess'), /describeRoster/, 'location/party position come from the shared controller');
assert.match(extractFn('renderCharacterAccess'), /ACTIVE_SUMMON_RECALL_REASON/, 'summon state shows a short recall reason');
assert.match(extractFn('renderCharacterAccess'), /characterAccessActions/, 'actions hide instead of disabling during summon');
assert.doesNotMatch(extractFn('renderCharacterAccess'), /monsterCard|feedMonster|innerHTML\s*=/, 'per-frame sheet does not rebuild a second character store');
assert.match(extractFn('openCharacterQuickTab'), /requestOpenFromQuick/, 'tab actions go through the controller');
assert.match(extractFn('openCharacterQuickTab'), /revealMonsterManager/, 'quick actions reuse the existing #monsterManager overlay');
assert.doesNotMatch(extractFn('openCharacterQuickTab'), /switchPartySlot\(|summonThrow\(/, 'quick tabs must not start combat');
assert.doesNotMatch(extractFn('toggleCharacterAccess'), /switchPartySlot\(|summonThrow\(/, 'the ตัว button still only toggles character UI');
assert.match(extractFn('handleCharacterUiHardwareBack'), /closeAll\(\)/, 'Android Back / Escape closes the sheet');
assert.doesNotMatch(extractFn('handleCharacterUiHardwareBack'), /switchPartySlot\(|summonThrow\(|openManager\(/, 'hardware back must not mutate combat');
assert.match(extractFn('renderSkills'), /characterSystemPanel\('skills'/, 'skills renderer can host inside the quick sheet');
assert.match(extractFn('renderEquipment'), /characterSystemPanel\('equipment'/, 'equipment renderer can host inside the quick sheet');
assert.match(extractFn('renderTraining'), /characterSystemPanel\('training'/, 'training renderer can host inside the quick sheet');
assert.match(extractFn('openManager'), /isNearNpc/, 'full manager stays NPC-gated');
assert.match(js, /addEventListener\('popstate'/, 'Android Back is wired through popstate');
assert.match(js, /history\.pushState\(\{characterAccess:true\}/, 'opening the sheet pushes a back-stack frame');

for (const zone of ['hub', 'grassland', 'cave']) {
  const game = makeGame({ zone, selectedSlot: 1 });
  const opened = game.controller.requestGlobalAccess({ source: 'global-button' });
  assert.equal(opened.ok, true, `${zone}: Full Character opens`);
  assert.equal(opened.openedManager, true, `${zone}: HUD opens the Full Manager`);
  assert.equal(opened.panel, 'full', `${zone}: Global Button bypasses Quick Panel`);
  assert.equal(opened.characterTab, 'info', `${zone}: Global Button opens Info`);
  assert.equal(opened.zone, zone, `${zone}: world context is preserved`);
  assert.equal(game.state.selectedSlot, 1, `${zone}: selectedSlot stays put`);
  assert.equal(game.state.ui.focusedMonsterId, 'beta', `${zone}: focuses the live party monster`);
  game.controller.setTab('equipment');
  assert.equal(game.state.ui.characterPanel, 'full', `${zone}: right detail selection keeps the Full Manager open`);
  assert.equal(game.state.ui.characterTab, 'equipment', `${zone}: right detail selection updates only the detail tab`);
  game.controller.closeAll();
  assert.equal(game.state.ui.characterPanel, 'closed', `${zone}: close returns to the world`);
  assert.equal(game.state.currentZone, zone, `${zone}: closing does not change the zone`);
  assert.equal(game.state.selectedSlot, 1, `${zone}: closing does not change combat slot`);
}

const peek = makeGame({ zone: 'cave', selectedSlot: 0 });
const peeked = peek.controller.peekPartySlot(1);
assert.equal(peeked.ok, true);
assert.equal(peeked.switched, false);
assert.equal(peek.state.ui.characterPanel, 'quick');
assert.equal(peek.state.ui.focusedMonsterId, 'beta');
assert.equal(peek.state.selectedSlot, 0, 'party peek still does not combat-switch');
const peekedSkills = peek.controller.requestOpenTab('skills');
assert.equal(peekedSkills.ok, true);
assert.equal(peek.state.ui.focusedMonsterId, 'beta', 'skills from peek keep the peeked monster');
assert.equal(peek.state.skillsSelectedId, 'beta');

const liveHp = makeGame();
liveHp.controller.requestGlobalAccess();
assert.equal(liveHp.state.collection[0].hp, 40);
liveHp.state.collection[0].hp = 12;
assert.equal(liveHp.state.ui.hp, undefined, 'quick panel has no duplicated HP field');
assert.equal(liveHp.state.collection.find(m => m.instanceId === 'alpha').hp, 12, 'HP stays on getInst()');
const persisted = persistableState(liveHp.state);
assert.equal('ui' in persisted, false, 'session UI is still stripped before save');

const rosterParty = makeGame().controller.describeRoster('alpha');
assert.equal(rosterParty.place, 'Party');
assert.equal(rosterParty.partyPosition, 1);
assert.match(rosterParty.label, /Party ช่อง 1/);
const rosterActive = makeGame({ summonId: 'alpha' }).controller.describeRoster('alpha');
assert.equal(rosterActive.place, 'Active');
assert.match(rosterActive.label, /Active/);
const rosterRanch = makeGame().controller.describeRoster('gamma');
assert.equal(rosterRanch.place, 'Ranch');

const summoned = makeGame({ zone: 'grassland', summonId: 'alpha', selectedSlot: 0 });
summoned.controller.requestGlobalAccess();
assert.equal(summoned.state.ui.readOnly, true);
assert.equal(summoned.controller.requestOpenTab('skills').ok, false, 'active summon skills stay read-only');
assert.equal(summoned.controller.requestOpenTab('equipment').reasonText, ACTIVE_SUMMON_RECALL_REASON);
assert.equal(summoned.controller.requestOpenTab('training').ok, false);
assert.equal(summoned.state.ui.characterPanel, 'full', 'failed mutate tabs keep the direct Full Character screen open');
assert.equal(summoned.controller.requestMutate().ok, false, 'summon read-only remains enforced');
assert.equal(summoned.state.selectedSlot, 0);
assert.equal(summoned.controller.requestOpenFull({ isNearNpc: false }).ok, false, 'summoned field access still cannot open the manager');

const stack = makeGame();
stack.controller.requestGlobalAccess();
stack.controller.setTab('skills');
assert.equal(stack.state.ui.characterPanel, 'full');
stack.controller.back();
assert.equal(stack.state.ui.characterPanel, 'closed', 'Back from direct Full Character returns to World');
assert.equal(stack.state.ui.focusedMonsterId, null, 'World return clears transient focus');
stack.controller.closeAll();
assert.equal(stack.state.ui.characterPanel, 'closed');
assert.equal(stack.state.currentZone, 'hub');

console.log('V8.2 Character UI Phase 3 quick panel: PASS');
