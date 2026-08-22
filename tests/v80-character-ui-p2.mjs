import assert from 'node:assert/strict';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';
import { ASSET_REVISION, SAVE_SCHEMA_VERSION } from '../save-schema.mjs';
import {
  ACTIVE_SUMMON_READONLY_REASON,
  attachCharacterUi,
  createCharacterUIController,
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

function makeGame({ zone = 'hub', summonId = null, selectedSlot = 0 } = {}) {
  const state = {
    collection: [{ instanceId: 'alpha', hp: 40, maxHp: 40 }],
    party: ['alpha', 'beta', null],
    selectedSlot,
    currentZone: zone,
  };
  attachCharacterUi(state);
  const controller = createCharacterUIController({
    getState: () => state,
    getActiveSummonId: () => summonId,
    getZone: () => state.currentZone,
  });
  return { state, controller };
}

assert.equal(ASSET_REVISION, '810', 'Phase 2 must not bump the live asset revision');
assert.equal(SAVE_SCHEMA_VERSION, 9, 'Phase 2 remains compatible with the current save schema');

assert.match(html, /id="globalCharacterBtn"/, 'global character button missing from HUD');
assert.match(html, /id="characterAccessEntry"/, 'character access entry missing');
const entryHtml = html.slice(html.indexOf('id="characterAccessEntry"'), html.indexOf('controls-left'));
assert.doesNotMatch(entryHtml, /monster-main|feed-actions|training-pool/, 'entry must not embed monsterCard');
assert.doesNotMatch(entryHtml, /id="monsterManager"/, 'quick entry is not the full manager');

const buttonCss = css.match(/\.global-character-btn\{[^}]+\}/)?.[0] || '';
assert.match(buttonCss, /left:var\(--safe-left\)/, 'global button is left-safe, not in the combat cluster');
assert.match(buttonCss, /min-width:var\(--touch-min\)/, 'global button meets the 48px touch minimum');
assert.doesNotMatch(buttonCss, /right:/, 'global button must not sit on the skill/capture/summon cluster');
assert.match(css, /\.global-character-btn\.open/, 'open visual state exists');
assert.match(css, /\.global-character-btn\.readonly/, 'read-only visual state exists');
assert.doesNotMatch(css, /\.controls-right[^{]*\{[^}]*global-character/, 'global button is not a combat control');
const compactCharacterCss = css.slice(css.lastIndexOf('@media(max-width:760px),(max-height:500px){'));
assert.match(compactCharacterCss, /top:calc\(var\(--safe-top\) \+ 292px\)/, 'short/mobile Character controls must sit below the expanded zone dropdown');

assert.match(js, /function toggleCharacterAccess\(/, 'global access toggle missing');
assert.match(js, /function openCharacterAccess\(/, 'global access opener missing');
assert.match(js, /requestGlobalAccess/, 'live runtime must use the shared controller');
assert.match(extractFn('toggleCharacterAccess'), /requestGlobalAccess|openCharacterAccess/, 'button path goes through Character UI entry');
assert.doesNotMatch(extractFn('toggleCharacterAccess'), /switchPartySlot|summonThrow|openManager/, 'global access must not start combat or the full manager');
assert.doesNotMatch(extractFn('openCharacterAccess'), /switchPartySlot|summonThrow|openManager/, 'opening entry must not mutate combat');
assert.match(extractFn('openCharacterAccess'), /zoneDropdown\?\.classList\.add\('hidden'\)/, 'opening Character access closes the zone dropdown');
assert.doesNotMatch(extractFn('renderCharacterAccess'), /monsterCard|feedMonster|toggleStarterEquip|setTraining/, 'access HUD must not dump the ranch card');
assert.match(extractFn('bindCharacterAccessControl'), /addEventListener\('click'/, 'global access must accept click as well as pointerdown');

for (const zone of ['hub', 'grassland', 'cave']) {
  const game = makeGame({ zone, selectedSlot: 1 });
  const opened = game.controller.requestGlobalAccess({ source: 'global-button' });
  assert.equal(opened.ok, true, `${zone}: global access must open`);
  assert.equal(opened.openedManager, true, `${zone}: HUD entry must open the Full Manager`);
  assert.equal(opened.panel, 'full', `${zone}: entry bypasses the quick state`);
  assert.equal(opened.characterTab, 'info', `${zone}: entry opens the Info tab`);
  assert.equal(opened.zone, zone, `${zone}: context zone is preserved`);
  assert.equal(game.state.selectedSlot, 1, `${zone}: selectedSlot stays put`);
  assert.equal(game.state.ui.focusedMonsterId, 'beta', `${zone}: focuses the selected party monster`);
}

const summoned = makeGame({ zone: 'grassland', summonId: 'alpha', selectedSlot: 0 });
const summonedAccess = summoned.controller.requestGlobalAccess({ source: 'global-button' });
assert.equal(summonedAccess.ok, true, 'global access remains available during summon');
assert.equal(summonedAccess.readOnly, true, 'global access is read-only during summon');
assert.equal(summoned.controller.canMutate(), false);
assert.equal(summoned.controller.requestSwitchParty(1).ok, false);
assert.equal(summoned.state.selectedSlot, 0, 'summoned global access does not move selectedSlot');
assert.equal(summoned.controller.peekPartySlot(1).readOnly, true, 'peek stays read-only during summon');
assert.equal(summoned.state.selectedSlot, 0, 'peek during summon still does not switch');
assert.equal(summoned.controller.requestMutate().reasonText, ACTIVE_SUMMON_READONLY_REASON);

const npcDenied = makeGame({ zone: 'grassland' }).controller.requestOpenFull({ isNearNpc: false });
assert.equal(npcDenied.ok, false, 'field global access must not unlock the full manager');

const peek = makeGame({ selectedSlot: 0 });
assert.equal(peek.controller.peekPartySlot(1).switched, false);
assert.equal(peek.state.selectedSlot, 0);
assert.equal(peek.controller.snapshot().characterPanel, 'quick');

assert.match(extractFn('renderParty'), /peekPartySlot\(index\)/, 'party tap still peeks');
assert.match(extractFn('renderParty'), /switchPartySlot\(index\)/, 'party Switch still calls switchPartySlot');

console.log('V8.2 Character UI Phase 2 global access: PASS');
