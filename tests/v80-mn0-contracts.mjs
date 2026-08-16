import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  MONSTER_BUNDLE,
  MONSTER_FALLBACKS,
  MONSTER_ROLES,
  applyMonsterAnchor,
  createAssetEngine,
  createProceduralMonsterProvider,
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
assert.match(js, /function makeSpeciesMesh\(/, 'procedural monster builder stays as the MN1 fallback');
assert.match(js, /function monsterMesh\(/, 'live monsters still go through monsterMesh in MN0');
assert.doesNotMatch(js, /assets\.spawn\('monster\./, 'MN0 must not spawn monsters through the engine yet');
assert.doesNotMatch(js, /monster-core\.json/, 'gameplay must not preload the monster catalog in MN0');

for (const file of [
  'asset-presentation/monster-ids.mjs',
  'asset-presentation/providers/procedural-monster.mjs',
]) {
  const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr || `${file} syntax failed`);
}

const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/monster-core.json', import.meta.url), 'utf8'));
assert.deepEqual(validateBundle(bundle), []);
assert.equal(bundle.name, MONSTER_BUNDLE);
assert.equal(bundle.assets.length, 38, '18 species × 2 forms + Flame Wolf + Magma Bear');
assert.equal(bundle.appearances.length, 0, 'MN0 has no monster appearance packs yet');

const speciesIds = [...js.matchAll(/mkSpecies\(\{id:'([^']+)'/g)].map(m => m[1]);
assert.equal(speciesIds.length, 18);
for (const id of speciesIds) {
  assert.ok(bundle.assets.some(a => a.id === resolveMonsterAssetId(id)), `missing base asset for ${id}`);
}

const speciesFn = js.slice(js.indexOf('function makeSpeciesMesh('), js.indexOf('function monsterMesh('));
const meshForms = [...new Set([...speciesFn.matchAll(/case '([a-z0-9_]+)':/g)].map(m => m[1]))];
assert.equal(meshForms.length, 20, 'makeSpeciesMesh form cases must stay in the catalog');
for (const form of meshForms) {
  assert.ok(bundle.assets.some(a => a.id.endsWith(`.${form}.v1`)), `catalog missing makeSpeciesMesh form ${form}`);
}

assert.equal(resolveMonsterAssetId('flameling'), 'monster.flameling.base.v1');
assert.equal(resolveMonsterAssetId('flameling', 'flame_wolf'), 'monster.flameling.flame_wolf.v1');
assert.deepEqual(parseMonsterAssetId('monster.flameling.magma_bear.v1'), { speciesId: 'flameling', formKey: 'magma_bear' });
assert.equal(parseMonsterAssetId('character.human.blocky-bighead.v1'), null);

resetCatalog();
const humanoid = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));
loadCatalog(humanoid);
loadCatalog(bundle);
assert.equal(getCatalog(MONSTER_BUNDLE).assets.size, 38);
assert.equal(getAssetDef('character.human.blocky-bighead.v1').kind, 'character');
assert.equal(getAssetDef('monster.flameling.base.v1').kind, 'monster');
assert.equal(getAssetDef('monster.flameling.flame_wolf.v1').style, 'unique-primitive-v1');
assert.equal(getAssetDef('monster.frostowl.frostowl.v1').metrics.silhouette, 'bird');
assert.deepEqual(Object.keys(getAssetDef('monster.fairimp.base.v1').roles), [...MONSTER_ROLES]);
assert.equal(resolvePublicRef('monster.flameling.base.v1').provider, 'monster');
assert.ok(!JSON.stringify(resolvePublicRef('monster.flameling.base.v1')).includes('#'));
assert.ok(listBundle(MONSTER_BUNDLE).assets.includes('monster.normalooze.plainpup.v1'));

const req = normalizeAssetRequest({
  assetId: 'monster.flameling.base.v1',
  role: 'wild',
  lifeStage: 'Juvenile',
  marks: { elite: true },
});
assert.equal(req.role, 'wild');
assert.equal(req.lifeStage, 'Juvenile');
assert.equal(req.marks.elite, true);
assert.equal(req.marks.boss, false);

const label = applyMonsterAnchor('label', { x: 4, y: 0, z: -2 });
assert.equal(label.y, MONSTER_FALLBACKS.labelY);
assert.equal(applyMonsterAnchor('label', { x: 0, y: 0, z: 0 }, undefined, { boss: true }).y, MONSTER_FALLBACKS.bossLabelY);
assert.equal(applyMonsterAnchor('hitText', { x: 1, y: 0, z: 1 }).y, MONSTER_FALLBACKS.hitTextY);
assert.equal(applyMonsterAnchor('impact', { x: 0, y: 0, z: 0 }).y, MONSTER_FALLBACKS.impactY);
assert.ok(MONSTER_FALLBACKS.labelY !== 2.00, 'monster labels stay at the wild-nameplate height, not the keeper talk button');

const plays = [];
const engine = createAssetEngine();
engine.registerProvider('monster', createProceduralMonsterProvider({
  buildMesh: (def, request) => ({
    id: def.id,
    role: request.role,
    position: { x: 3, y: 0, z: -4 },
    userData: {},
  }),
  animate: (root, dt, moving) => { root.moved = { dt, moving }; },
  setAction: (root, action, duration) => { plays.push({ action, duration }); },
}));
const wild = engine.spawn('monster.flameling.flame_wolf.v1', { role: 'wild', marks: { elite: true } });
assert.equal(wild.root.id, 'monster.flameling.flame_wolf.v1');
assert.equal(wild.anchor('hitText').y, MONSTER_FALLBACKS.hitTextY);
assert.equal(wild.anchor('label').x, 3);
wild.play('hurt', { duration: 0.22 });
wild.update(0.016, { moving: true });
assert.equal(plays[0].action, 'hurt');
assert.equal(wild.root.moved.moving, true);
wild.dispose();
wild.dispose();
assert.ok(engine.diagnostics().providers.includes('monster'));

console.log('V8.0 MN0 monster contracts: PASS');
