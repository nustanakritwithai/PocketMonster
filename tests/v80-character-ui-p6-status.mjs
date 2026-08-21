import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.match(js, /function renderFullCharacterPreview\(\)/, 'Status/Overview needs one focused-instance preview renderer');
assert.match(js, /getFocusedCharacterPresentation\(\{[\s\S]*getInst,[\s\S]*focusedMonsterId:state\.ui\?\.focusedMonsterId/, 'preview must resolve the live focused instance through getInst');
for (const id of [
  'characterPreviewPortrait',
  'characterPreviewName',
  'characterPreviewMeta',
  'characterPreviewTypes',
  'characterPreviewPlace',
  'characterPreviewGrowth',
]) {
  assert.match(js, new RegExp(String.raw`el\('${id}'\)`), `preview renderer must populate #${id}`);
}
assert.match(js, /renderManager\(\)[\s\S]*renderFullCharacterPreview\(\)/, 'manager refresh must also refresh the focused Status/Overview preview');
assert.doesNotMatch(js, /state\.ui\.(?:hp|maxHp|exp|cr|atk|def|spd|bond|growth)\s*=/, 'state.ui must remain navigation-only');

console.log('V8.2 Character UI Phase 6 Status/Overview preview wiring: PASS');
