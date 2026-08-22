// V8.0 assets — unique Flame Wolf / Magma Bear meshes + visual growth.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

assert.match(js, /function makeFlameWolfMesh/, 'Flame Wolf must have a dedicated mesh builder');
assert.match(js, /function makeMagmaBearMesh/, 'Magma Bear must have a dedicated mesh builder');
assert.match(js, /function applyVisualGrowth/, 'training must change silhouette (G5 visual growth)');
assert.match(js, /case 'flame_wolf':/, 'makeSpeciesMesh must route flame_wolf');
assert.match(js, /case 'magma_bear':/, 'makeSpeciesMesh must route magma_bear');
assert.match(js, /g=makeFlameWolfMesh\(color,scale\)/, 'flame_wolf case must call the unique builder');
assert.match(js, /g=makeMagmaBearMesh\(color,scale\)/, 'magma_bear case must call the unique builder');
assert.doesNotMatch(
  js,
  /case 'flame_wolf': \{\s*g=makeAnimalBase/,
  'Flame Wolf must not reuse the generic animal base as its only body',
);
assert.match(js, /userData\.assetForm='flame_wolf'/, 'Flame Wolf mesh is tagged');
assert.match(js, /userData\.assetForm='magma_bear'/, 'Magma Bear mesh is tagged');
assert.match(js, /evolutionPath:'flame_wolf'/, 'cave showcase must spawn a Flame Wolf form');
assert.match(js, /evolutionPath:'magma_bear'/, 'cave showcase must spawn a Magma Bear form');
assert.match(js, /spiritAura/, 'spirit training must add a visible aura');
assert.match(js, /createWild\(spById\[id\],x,z,level,\{boss,elite,rare,evolutionPath\}\)/, 'respawn must keep the showcase evolution form and rarity');

console.log('V8.0 assets evo-form meshes: PASS');
