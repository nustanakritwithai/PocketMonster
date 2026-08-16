import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROPORTION_SHEET, allProportionEvidence, proportionEvidence } from '../asset-lab/proportions.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /legacy-capsule\.v1/, 'BH0 must not switch the live player to Bighead yet');
assert.equal(PROPORTION_SHEET.locked, false);
assert.equal(PROPORTION_SHEET.recommended, 'B');
assert.equal(PROPORTION_SHEET.options.B.headY, 1.44);
assert.equal(PROPORTION_SHEET.options.B.head[1], 0.72);

for (const id of ['A', 'B', 'C']) {
  const ev = proportionEvidence(id);
  assert.equal(ev.metrics.headTopY, 1.8);
  assert.equal(ev.camera.lookY, 1.1);
  assert.ok(ev.views.includes('front') && ev.views.includes('top'));
}

const all = allProportionEvidence();
assert.equal(all.length, 6);
assert.notEqual(all[0].seed, all[1].seed);
assert.equal(proportionEvidence('B').seed, proportionEvidence('B').seed);

const evidence = JSON.parse(fs.readFileSync(new URL('../asset-lab/bh0-evidence.json', import.meta.url), 'utf8'));
assert.equal(evidence.locked, false);

console.log('V8.0 BH0 proportion lab: PASS');
