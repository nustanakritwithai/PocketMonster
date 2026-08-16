// V8.0 UX Phase 1 — monster card display contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');

assert.match(js, /function needsHTML\(inst\)/, 'needsHTML must stay on the live card');
assert.match(js, /cond-\$\{cond\}/, 'condition chip must use a colored cond-* class');
assert.match(js, /function trainingPoolHTML\(inst\)/, 'training pool breakdown helper missing');
assert.match(js, /function skillsMiniHTML\(inst\)/, 'skill mastery mini helper missing');
assert.match(js, /function equipMiniHTML\(inst\)/, 'equipment mini helper missing');
assert.match(js, /trainingPoolHTML\(inst\)/, 'monster card must render the training pool');
assert.match(js, /skillsMiniHTML\(inst\)/, 'monster card must render skill chips');
assert.match(js, /equipMiniHTML\(inst\)/, 'monster card must render equipment slots');
assert.match(js, /💤 พักผ่อน/, 'care rest label must match the UX plan');
assert.match(js, /🎾 เล่นด้วย/, 'care play label must match the UX plan');
assert.doesNotMatch(js, /training-badge">Training /, 'legacy training badge must be replaced');

for (const cls of [
  '.need-chip.cond-excellent',
  '.need-chip.cond-bad',
  '.training-pool',
  '.pool-line.focus',
  '.line-fill.line-power',
  '.skill-chip.master',
  '.equip-slot.filled',
]) {
  assert.ok(css.includes(cls), `phase 1 CSS missing ${cls}`);
}

console.log('V8.0 UX phase 1 monster-card display: PASS');
