import assert from 'node:assert/strict';
import { activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.match(html, /id="characterInfoBody"/, 'Full Character Information body is required');
for (const tab of ['info','skills','equipment','training','evolution']) {
  assert.match(html, new RegExp(`data-character-tab="${tab}"`), `Full Character tab ${tab} must exist`);
}
const target=js.match(/function characterSystemPanel\(tab,fallbackId\)\{([\s\S]*?)\n\}/)?.[1]||'';
assert.match(target, /liveFullCharacterTabPanel\(tab\)/, 'system renderers must target Full Character tab body before legacy panel');
assert.match(js, /function liveFullCharacterTabPanel\(tab\)/, 'Full Character tab target resolver is required');
assert.match(js, /function setFullCharacterInfoTab\(tab\)/, 'Full Character tab switcher is required');
assert.match(js, /querySelectorAll\('\.character-info-tab'\)/, 'Full Character tabs must be bound');
assert.match(js, /setFullCharacterInfoTab\(btn\.dataset\.characterTab\)/, 'tab click must select its own content');
assert.match(js, /if\(tab==='skills'\)renderSkills\(\)/, 'Skills must render through existing renderer');
assert.match(js, /if\(tab==='equipment'\)renderEquipment\(\)/, 'Equipment must render through existing renderer');
assert.doesNotMatch(target, /state\.ui\.(?:skills|equipment|training)/, 'tab routing must not duplicate gameplay state');
console.log('V8.2 Character UI Full Information tab routing: PASS');
