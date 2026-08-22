import assert from 'node:assert/strict';
import { attachCharacterUi, createCharacterUIController } from '../character-ui-controller.mjs';
import { activeJs as js } from './active-assets.mjs';

const state = {
  collection: [{ instanceId: 'alpha', hp: 40, maxHp: 40 }],
  party: ['alpha', null, null],
  selectedSlot: 0,
  currentZone: 'grassland',
};
attachCharacterUi(state);
const controller = createCharacterUIController({
  getState: () => state,
  getActiveSummonId: () => null,
  getZone: () => state.currentZone,
});
const opened = controller.requestGlobalAccess({ source: 'global-button', monsterId: 'alpha', partySlot: 0 });
assert.equal(opened.ok, true);
assert.equal(opened.openedManager, true, 'HUD Character entry opens Full Manager directly');
assert.equal(opened.panel, 'full', 'HUD Character entry must not enter quick panel');
assert.equal(opened.characterTab, 'info', 'Full Manager opens the right-side Info tab by default');
assert.equal(state.ui.characterPanel, 'full');
assert.equal(state.ui.characterTab, 'info');
assert.equal(state.selectedSlot, 0, 'direct entry must not switch the combat party slot');
const opener = js.slice(js.indexOf('function openCharacterAccess('), js.indexOf('function openCharacterQuickTab('));
assert.match(opener, /revealMonsterManager\('collection'\)/, 'HUD entry must reveal the Full Manager');
assert.doesNotMatch(opener, /characterAccessEntry/, 'HUD entry must not render the intermediate small panel');
console.log('V8.2 Character UI direct Full Manager entry: PASS');
