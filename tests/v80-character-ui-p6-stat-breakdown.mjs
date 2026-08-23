import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.match(js, /function renderFullCharacterStatBreakdown\(\)/, 'Status/Overview needs a Stat Breakdown renderer');
assert.match(js, /\['hp','atk','def','spAtk','spDef','spd'\]\.map\(stat=>\[labels\[stat\],inst\.statBreakdown\?\.\[stat\]\]\)/,
  'breakdown must read all six canonical live-stat details');
for (const source of ['Workbook Base', 'Level', 'Potential', 'Training', 'Nutrition', 'Equipment', 'Condition', 'Passive']) {
  assert.match(js, new RegExp(source), `breakdown must label the ${source} contribution`);
}
assert.match(js, /character-stat-breakdown/, 'breakdown must have a dedicated DOM region');
assert.doesNotMatch(js, /state\.ui\.(?:statBreakdown|hp|atk|def|spAtk|spDef|spd)\s*=/, 'breakdown data must never be stored in state.ui');

console.log('V8.2 Character UI Phase 6 Stat Breakdown: PASS');
