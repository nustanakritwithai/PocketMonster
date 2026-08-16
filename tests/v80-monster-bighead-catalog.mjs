import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { SPECIES_PROGRESSION } from '../content-catalog.mjs';
import {
  MONSTER_ANIMAL_BUNDLE,
  MONSTER_FALLBACKS,
  MONSTER_ROLES,
  MONSTER_SLIME_BUNDLE,
  applyMonsterAnchor,
  getAssetDef,
  getCatalog,
  listBundle,
  loadCatalog,
  normalizeAssetRequest,
  parseMonsterAssetId,
  resetCatalog,
  resolveMonsterAssetId,
  resolvePublicRef,
  validateBundle,
} from '../asset-presentation/index.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /function makeSpeciesMesh\(/, 'legacy makeSpeciesMesh stays as the conversion fallback');
assert.match(js, /function monsterMesh\(/, 'live monsters still go through monsterMesh');
assert.match(js, /monster-slimes\.json/, 'Phase 3 preloads the slime catalog');
assert.match(js, /monster-animals\.json/, 'Phase 3 preloads the animal catalog');

const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/monster-ids.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'monster-ids syntax failed');

const slimes = JSON.parse(fs.readFileSync(new URL('../assets/catalog/monster-slimes.json', import.meta.url), 'utf8'));
const animals = JSON.parse(fs.readFileSync(new URL('../assets/catalog/monster-animals.json', import.meta.url), 'utf8'));
assert.deepEqual(validateBundle(slimes), []);
assert.deepEqual(validateBundle(animals), []);
assert.equal(slimes.name, MONSTER_SLIME_BUNDLE);
assert.equal(animals.name, MONSTER_ANIMAL_BUNDLE);
assert.equal(slimes.assets.length, 18, 'one bighead slime per live species');
assert.equal(animals.assets.length, 20, '18 evolution forms + Flame Wolf + Magma Bear');
assert.equal(slimes.assets.length + animals.assets.length, 38);
assert.deepEqual(slimes.appearances, []);
assert.deepEqual(animals.appearances, []);

const liveSpecies = [...js.matchAll(/mkSpecies\(\{id:'([^']+)',name:'[^']+',color:(0x[0-9a-fA-F]+),types:\['([^']+)'\][\s\S]*?evo:\{id:'[^']+',name:'[^']+',form:'([^']+)',color:(0x[0-9a-fA-F]+),scale:([0-9.]+)/g)];
assert.equal(liveSpecies.length, 18);
const catalogIds = new Set();
for (const [, id, color, type, form, evoColor, scale] of liveSpecies) {
  const slime = slimes.assets.find(a => a.speciesId === id);
  assert.ok(slime, `missing slime catalog row for ${id}`);
  assert.equal(slime.id, resolveMonsterAssetId(id, 'slime'));
  assert.equal(slime.form, 'slime');
  assert.equal(slime.type, type);
  assert.equal(slime.color, Number(color));
  assert.equal(slime.metrics.scale, 1);
  assert.equal(slime.metrics.silhouette, 'slime');
  assert.equal(slime.style, 'blocky-bighead-v1');
  assert.equal(slime.surfaceStyle, 'four-side-block-v1');
  assert.equal(slime.provider, 'procedural');
  assert.equal(slime.rig, 'slime-rig-v1');
  assert.deepEqual(Object.keys(slime.roles), [...MONSTER_ROLES]);
  assert.equal(catalogIds.has(slime.id), false, `duplicate catalog id ${slime.id}`);
  catalogIds.add(slime.id);

  const animal = animals.assets.find(a => a.form === form && a.speciesId === id);
  assert.ok(animal, `missing animal catalog row for ${form}`);
  assert.equal(animal.id, resolveMonsterAssetId(id, form));
  assert.equal(animal.type, type);
  assert.equal(animal.color, Number(evoColor));
  assert.equal(animal.metrics.scale, Number(scale));
  assert.equal(animal.style, 'blocky-bighead-v1');
  assert.equal(animal.surfaceStyle, 'four-side-block-v1');
  assert.equal(animal.provider, 'procedural');
  assert.equal(animal.rig, 'animal-rig-v1');
  assert.deepEqual(Object.keys(animal.roles), [...MONSTER_ROLES]);
  assert.equal(catalogIds.has(animal.id), false, `duplicate catalog id ${animal.id}`);
  catalogIds.add(animal.id);
}

const speciesFn = js.slice(js.indexOf('function makeSpeciesMesh('), js.indexOf('function monsterMesh('));
const meshForms = [...new Set([...speciesFn.matchAll(/case '([a-z0-9_]+)':/g)].map(m => m[1]))];
assert.equal(meshForms.length, 20);
for (const form of meshForms) {
  const animal = animals.assets.find(a => a.form === form);
  assert.ok(animal, `animal catalog missing makeSpeciesMesh form ${form}`);
}

for (const extra of SPECIES_PROGRESSION.flameling.extraEvolutionPaths) {
  const animal = animals.assets.find(a => a.form === extra.form);
  assert.ok(animal, `missing extra-path catalog row for ${extra.form}`);
  assert.equal(animal.speciesId, 'flameling');
  assert.equal(animal.color, extra.color);
  assert.equal(animal.metrics.scale, extra.scale);
  assert.equal(animal.id, resolveMonsterAssetId('flameling', extra.form));
}

assert.equal(resolveMonsterAssetId('flameling'), 'monster.slime.flameling.bighead.v1');
assert.equal(resolveMonsterAssetId('flameling', 'flame_wolf'), 'monster.flame_wolf.flameling.bighead.v1');
assert.deepEqual(parseMonsterAssetId('monster.magma_bear.flameling.bighead.v1'), {
  form: 'magma_bear',
  speciesId: 'flameling',
});
assert.equal(parseMonsterAssetId('monster.flameling.base.v1'), null);

resetCatalog();
loadCatalog(JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8')));
loadCatalog(slimes);
loadCatalog(animals);
assert.equal(getCatalog(MONSTER_SLIME_BUNDLE).assets.size, 18);
assert.equal(getCatalog(MONSTER_ANIMAL_BUNDLE).assets.size, 20);
assert.equal(getAssetDef('character.human.blocky-bighead.v1').kind, 'character');
assert.equal(getAssetDef('monster.slime.flameling.bighead.v1').kind, 'monster');
assert.equal(getAssetDef('monster.flame_wolf.flameling.bighead.v1').metrics.silhouette, 'wolf');
assert.equal(getAssetDef('monster.magma_bear.flameling.bighead.v1').metrics.silhouette, 'bear');
assert.equal(getAssetDef('monster.frostowl.frostowl.bighead.v1').metrics.silhouette, 'bird');
assert.equal(getAssetDef('monster.galebird.galebird.bighead.v1').metrics.silhouette, 'bird');
assert.equal(getAssetDef('monster.ghostpurr.ghostpurr.bighead.v1').metrics.silhouette, 'serpent');
assert.deepEqual(Object.keys(getAssetDef('monster.slime.fairimp.bighead.v1').roles), [...MONSTER_ROLES]);
assert.equal(resolvePublicRef('monster.slime.flameling.bighead.v1').provider, 'procedural');
assert.ok(listBundle(MONSTER_ANIMAL_BUNDLE).assets.includes('monster.plainpup.normalooze.bighead.v1'));

const req = normalizeAssetRequest({
  assetId: 'monster.slime.flameling.bighead.v1',
  role: 'wild',
  lifeStage: 'Juvenile',
  marks: { elite: true },
});
assert.equal(req.role, 'wild');
assert.equal(req.lifeStage, 'Juvenile');
assert.equal(req.marks.elite, true);
assert.equal(normalizeAssetRequest({
  assetId: 'monster.slime.emberdrake.bighead.v1',
  role: 'boss',
}).role, 'boss');

const label = applyMonsterAnchor('label', { x: 4, y: 0, z: -2 });
assert.equal(label.y, MONSTER_FALLBACKS.labelY);
assert.equal(applyMonsterAnchor('label', { x: 0, y: 0, z: 0 }, undefined, { boss: true }).y, MONSTER_FALLBACKS.bossLabelY);
assert.equal(applyMonsterAnchor('hitText', { x: 1, y: 0, z: 0 }).y, MONSTER_FALLBACKS.hitTextY);

console.log('V8.0 monster bighead catalog: PASS');
