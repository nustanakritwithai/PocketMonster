import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addBigheadMonsterMarks, applyBigheadVisualGrowth } from '../asset-presentation/monster-mark.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const markSrc = fs.readFileSync(new URL('../asset-presentation/monster-mark.mjs', import.meta.url), 'utf8');
const providerSrc = fs.readFileSync(new URL('../asset-presentation/providers/procedural-bighead-monster.mjs', import.meta.url), 'utf8');

assert.match(js, /function addMonsterRing\(/, 'mutant 1: ring/crest must go through addMonsterRing');
assert.match(js, /applyBigheadVisualGrowth/, 'mutant 2: Bighead growth must not scale the whole root Group');
assert.match(markSrc, /baseScale/, 'mutant 3: growth has to land on the visual pivot baseScale');
assert.match(js, /catch\(err\)\{\s*g=makeSpeciesMesh\(sp,inst\);/, 'mutant 4: spawn failure still falls back to legacy');
assert.match(js, /octahedronGeometry/, 'mutant 5: legacy crest stays an octahedron');
assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 6: Phase 6 does not import the three package');
assert.match(js, /function makeSpeciesMesh\(/, 'mutant 7: do not delete makeSpeciesMesh');
assert.match(markSrc, /userData\.part = 'groundRing'/, 'mutant 8: Bighead ring is tagged box bars, not a sphere');
assert.doesNotMatch(markSrc, /SphereGeometry|OctahedronGeometry/, 'mutant 9: Bighead marks stay boxes');
assert.match(providerSrc, /decoType: type/, 'mutant 10: 18-type review still stamps slime decorations');

assert.throws(
  () => addBigheadMonsterMarks({ add() {} }, {}),
  /box\(\), and basicMaterial/,
  'mutant 11: marks cannot spawn without injected geometry helpers',
);

const node = { children: [], userData: {}, scale: { x: 1, y: 1, z: 1 } };
assert.equal(
  applyBigheadVisualGrowth(node, null),
  node,
  'mutant 12: missing training is a no-op',
);
assert.equal(node.userData.visualGrowth, undefined);
assert.equal(node.scale.x, 1);

console.log('V8.0 monster bighead polish mutants: PASS');
