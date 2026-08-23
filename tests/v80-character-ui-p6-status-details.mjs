import assert from 'node:assert/strict';
import { activeJs as js, activeHtml as html } from './active-assets.mjs';

assert.match(html, /id="characterInfoBody"/, 'three-column Character UI needs a dedicated Status/Overview body');
assert.match(js, /function renderFullCharacterStatus\(\)/, 'Status/Overview needs a focused-instance renderer');
assert.match(js, /getFocusedCharacterPresentation\(/, 'Status/Overview must reuse the live focused presentation model');
for (const [label, className] of [['HP','hp'], ['ATK','atk'], ['DEF','def'], ['SP.ATK','spatk'], ['SP.DEF','spdef'], ['SPD','spd'], ['CR','cr'], ['Condition','condition']]) {
  assert.match(js, new RegExp(`character-status-${className}`), `Status/Overview must render ${label}`);
}
assert.match(js, /renderFullCharacterStatus\(\)/, 'manager must invoke Status/Overview rendering');
assert.doesNotMatch(js, /state\.ui\.(?:hp|maxHp|atk|def|spAtk|spDef|spd|cr|condition)\s*=/, 'Status/Overview must not duplicate gameplay data into state.ui');

console.log('V8.2 Character UI Phase 6 Status/Overview details: PASS');
