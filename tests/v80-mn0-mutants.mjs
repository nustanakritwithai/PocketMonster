import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createProceduralMonsterProvider,
  normalizeAssetRequest,
  resolveMonsterAssetId,
  validateAssetDefinition,
  validateBundle,
} from '../asset-presentation/index.mjs';

const withHp = {
  id: 'monster.flameling.base.v1',
  kind: 'monster',
  provider: 'monster',
  style: 'slime-primitive-v1',
  surfaceStyle: 'untextured-v1',
  rig: 'monster-rig-v1',
  metrics: { height: 1.16, hp: 74 },
  roles: { wild: {} },
};
assert.ok(validateAssetDefinition(withHp).some(e => e.includes('hp')), 'mutant 1: gameplay hp must be rejected');

const playerRole = {
  id: 'monster.flameling.base.v1',
  kind: 'monster',
  provider: 'monster',
  style: 'slime-primitive-v1',
  surfaceStyle: 'untextured-v1',
  rig: 'monster-rig-v1',
  metrics: { height: 1.16 },
  roles: { player: {} },
};
assert.ok(validateAssetDefinition(playerRole).some(e => e.includes('unsupported role player')), 'mutant 2: monsters cannot use humanoid roles');

const wildHuman = {
  id: 'character.human.blocky-bighead.v1',
  kind: 'character',
  provider: 'procedural',
  style: 'blocky-bighead-v1',
  surfaceStyle: 'four-side-block-v1',
  rig: 'humanoid-rig-v1',
  metrics: { height: 1.8 },
  roles: { wild: {} },
};
assert.ok(validateAssetDefinition(wildHuman).some(e => e.includes('unsupported role wild')), 'mutant 3: humanoids cannot use monster roles');

assert.throws(
  () => normalizeAssetRequest({ assetId: 'monster.flameling.base.v1', role: 'wild', hp: 10 }),
  /hp/,
  'mutant 4: AssetRequest must not carry combat stats',
);

const dup = {
  assets: [
    {
      id: 'monster.flameling.base.v1',
      kind: 'monster',
      provider: 'monster',
      style: 'slime-primitive-v1',
      surfaceStyle: 'untextured-v1',
      rig: 'monster-rig-v1',
      metrics: { height: 1.16 },
      roles: { wild: {} },
    },
    {
      id: 'monster.flameling.base.v1',
      kind: 'monster',
      provider: 'monster',
      style: 'slime-primitive-v1',
      surfaceStyle: 'untextured-v1',
      rig: 'monster-rig-v1',
      metrics: { height: 1.16 },
      roles: { owned: {} },
    },
  ],
  appearances: [],
};
assert.ok(validateBundle(dup).some(e => e.includes('duplicate id')), 'mutant 5: duplicate monster ids must be rejected');

assert.throws(
  () => resolveMonsterAssetId('Flame Wolf'),
  /invalid monster id/,
  'mutant 6: display names are not asset ids',
);

assert.throws(
  () => createProceduralMonsterProvider({}),
  /buildMesh/,
  'mutant 7: monster provider cannot spawn without a mesh builder',
);

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /const g=makeSpeciesMesh\(sp,inst\)/, 'mutant 8: live mesh path must stay procedural in MN0');
assert.doesNotMatch(js, /createProceduralMonsterProvider/, 'mutant 9: game must not register the monster provider in MN0');

console.log('V8.0 MN0 mutants: PASS');
