import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBigheadMonsterProvider } from '../asset-presentation/providers/procedural-bighead-monster.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const providerSrc = fs.readFileSync(new URL('../asset-presentation/providers/procedural-bighead-monster.mjs', import.meta.url), 'utf8');

assert.match(js, /createBigheadMonsterProvider/, 'mutant 1: gameplay must register the monster provider in Phase 3');
assert.doesNotMatch(providerSrc, /SphereGeometry/, 'mutant 2: provider must not build spheres');
assert.doesNotMatch(providerSrc, /CapsuleGeometry/, 'mutant 3: provider must not build capsules');
assert.doesNotMatch(providerSrc, /CylinderGeometry/, 'mutant 4: legs and body stay boxes, not cylinders');
assert.match(providerSrc, /makeCone\(r, h, 4\)|cone\(r, h, 4\)|makeCone\(r \* scale, h \* scale, 4\)/, 'mutant 5: cones are 4-sided');

assert.throws(
  () => createBigheadMonsterProvider({}),
  /THREE, box\(\), and material\(\)/,
  'mutant 6: provider cannot spawn without injected geometry helpers',
);

assert.match(js, /assets\.spawn\(resolveMonsterAssetId/, 'mutant 7: live monsters spawn through the engine');

console.log('V8.0 monster bighead provider mutants: PASS');
