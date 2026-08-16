import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeAssetRequest,
  resolveMonsterAssetId,
  validateAssetDefinition,
  validateBundle,
} from '../asset-presentation/index.mjs';

const withHp = {
  id: 'monster.slime.flameling.bighead.v1',
  kind: 'monster',
  provider: 'procedural',
  style: 'blocky-bighead-v1',
  surfaceStyle: 'four-side-block-v1',
  rig: 'slime-rig-v1',
  metrics: { scale: 1 },
  roles: { wild: {} },
  speciesId: 'flameling',
  type: 'Fire',
  form: 'slime',
  color: 0xef6c32,
  hp: 74,
};
assert.ok(validateAssetDefinition(withHp).some(e => e.includes('hp')), 'mutant 1: gameplay hp must be rejected');

const playerRole = {
  id: 'monster.slime.flameling.bighead.v1',
  kind: 'monster',
  provider: 'procedural',
  style: 'blocky-bighead-v1',
  surfaceStyle: 'four-side-block-v1',
  rig: 'slime-rig-v1',
  metrics: { scale: 1 },
  roles: { player: {} },
  speciesId: 'flameling',
  type: 'Fire',
  form: 'slime',
  color: 0xef6c32,
};
assert.ok(
  validateAssetDefinition(playerRole).some(e => e.includes('unsupported role player')),
  'mutant 2: monsters cannot use humanoid roles',
);

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
assert.ok(
  validateAssetDefinition(wildHuman).some(e => e.includes('unsupported role wild')),
  'mutant 3: humanoids cannot use monster roles',
);

assert.throws(
  () => normalizeAssetRequest({ assetId: 'monster.slime.flameling.bighead.v1', role: 'wild', hp: 10 }),
  /hp/,
  'mutant 4: AssetRequest must not carry combat stats',
);

const badId = {
  id: 'monster.flameling.base.v1',
  kind: 'monster',
  provider: 'procedural',
  style: 'blocky-bighead-v1',
  surfaceStyle: 'four-side-block-v1',
  rig: 'slime-rig-v1',
  metrics: { scale: 1 },
  roles: { wild: {} },
  speciesId: 'flameling',
  type: 'Fire',
  form: 'slime',
  color: 0xef6c32,
};
assert.ok(
  validateAssetDefinition(badId).some(e => e.includes('monster.{form}.{species}.bighead.v1')),
  'mutant 5: ids must follow the conversion-plan pattern',
);

const dup = {
  assets: [
    {
      id: 'monster.slime.flameling.bighead.v1',
      kind: 'monster',
      provider: 'procedural',
      style: 'blocky-bighead-v1',
      surfaceStyle: 'four-side-block-v1',
      rig: 'slime-rig-v1',
      metrics: { scale: 1 },
      roles: { wild: {} },
      speciesId: 'flameling',
      type: 'Fire',
      form: 'slime',
      color: 0xef6c32,
    },
    {
      id: 'monster.slime.flameling.bighead.v1',
      kind: 'monster',
      provider: 'procedural',
      style: 'blocky-bighead-v1',
      surfaceStyle: 'four-side-block-v1',
      rig: 'slime-rig-v1',
      metrics: { scale: 1 },
      roles: { owned: {} },
      speciesId: 'flameling',
      type: 'Fire',
      form: 'slime',
      color: 0xef6c32,
    },
  ],
  appearances: [],
};
assert.ok(validateBundle(dup).some(e => e.includes('duplicate id')), 'mutant 6: duplicate monster ids must be rejected');

assert.throws(
  () => resolveMonsterAssetId('Flame Wolf'),
  /invalid monster id/,
  'mutant 7: display names are not asset ids',
);

const stringColor = { ...playerRole, color: '#ef6c32' };
assert.ok(
  validateAssetDefinition(stringColor).some(e => e.includes('color must be a number')),
  'mutant 10: catalog color must be a decimal number, not a hex string',
);

const mismatchedId = {
  ...playerRole,
  id: 'monster.slime.normalooze.bighead.v1',
  speciesId: 'flameling',
  form: 'slime',
};
assert.ok(
  validateAssetDefinition(mismatchedId).some(e => e.includes('monster.{form}.{species}.bighead.v1')),
  'mutant 11: catalog id must match form and speciesId',
);

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /const g=makeSpeciesMesh\(sp,inst\)/, 'mutant 8: live mesh path must stay legacy until Phase 3');
assert.doesNotMatch(js, /createBigheadMonsterProvider/, 'mutant 9: game must not register the bighead monster provider yet');

console.log('V8.0 monster bighead catalog mutants: PASS');
