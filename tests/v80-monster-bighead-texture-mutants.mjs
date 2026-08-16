import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pixelDiffRatio } from '../asset-presentation/four-side/apply.mjs';
import { paintMonsterFace } from '../asset-presentation/monster-texture.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const textureSrc = fs.readFileSync(new URL('../asset-presentation/monster-texture.mjs', import.meta.url), 'utf8');
const providerSrc = fs.readFileSync(new URL('../asset-presentation/providers/procedural-bighead-monster.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');
assert.match(providerSrc, /detachSharedGeometry|applyMonsterFourSide/, 'mutant 2: UVs must be applied on a detached box');
assert.match(textureSrc, /applyBoxAtlasUVs/, 'mutant 3: monster atlas must use the shared box UV helper');
assert.match(textureSrc, /atlasLayout\(\)/, 'mutant 4: monster faces follow the humanoid 2x3 atlas, Front = -Z');
assert.doesNotMatch(textureSrc, /from ['"]three['"]/, 'mutant 5: texture painter stays three-free');

const front = paintMonsterFace('front', 'Fairy', 0xdc87b8);
const back = paintMonsterFace('back', 'Fairy', 0xdc87b8);
assert.ok(pixelDiffRatio(front, back) > 0.02, 'mutant 6: back must not be a copy of front');

const a = paintMonsterFace('front', 'Dragon', 0x6a45d3);
const b = paintMonsterFace('front', 'Bug', 0x9cab25);
assert.ok(pixelDiffRatio(a, b) > 0.002, 'mutant 7: type marks must not collapse to one drawing');

assert.doesNotMatch(
  fs.readFileSync(new URL('../asset-presentation/providers/procedural-bighead-monster.mjs', import.meta.url), 'utf8'),
  /SphereGeometry/,
  'mutant 8: texturing must not reintroduce spheres',
);

console.log('V8.0 monster bighead texture mutants: PASS');
