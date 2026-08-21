import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.match(js, /function renderFullCharacterStatBreakdown\(\)/, 'Status/Overview needs a Stat Breakdown renderer');
for (const stat of ['hp', 'atk', 'def', 'spd']) {
  assert.match(js, new RegExp(`explainStat\\([^)]*'${stat}'\\)`), `breakdown must ask the authoritative formula for ${stat}`);
}
for (const source of ['Species Base', 'Level Growth', 'Training', 'Nutrition', 'Equipment', 'Gene', 'Evolution', 'Condition']) {
  assert.match(js, new RegExp(source), `breakdown must label the ${source} contribution`);
}
assert.match(js, /character-stat-breakdown/, 'breakdown must have a dedicated DOM region');
assert.doesNotMatch(js, /state\.ui\.(?:statBreakdown|hp|atk|def|spd)\s*=/, 'breakdown data must never be stored in state.ui');

console.log('V8.2 Character UI Phase 6 Stat Breakdown: PASS');
