import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.match(js, /function renderFocusedGrowthSummary\(\)/, 'Phase 7 needs a focused Growth summary renderer');
const renderer=js.match(/function renderFocusedGrowthSummary\(\)\{([\s\S]*?)\n\}\nfunction renderTraining\([^)]*\)/)?.[1]||'';
assert.ok(renderer, 'focused Growth renderer body is required');
for (const source of ['focusedCharacterPresentation()', 'getInst(presentation.id)', 'instTrainingUsed(inst)', 'BALANCE_CONFIG.training', 'TRAINING_LINES', 'balanceFormulas.diminishingMultiplier']) {
  assert.ok(renderer.includes(source), `Growth summary must reuse ${source}`);
}
for (const label of ['Capacity', 'Aptitude', 'Gene HP', 'Hunger', 'Discipline']) {
  assert.match(renderer, new RegExp(label), `Growth summary must expose ${label}`);
}
assert.doesNotMatch(renderer, /(?:state\.ui\.training|inst\.training\s*=)/, 'Growth summary must not duplicate or overwrite training data');
assert.match(js, /\$\{renderFocusedGrowthSummary\(\)\}/, 'renderTraining must render the focused Growth summary');

console.log('V8.2 Character UI Phase 7 focused Growth/Training: PASS');
