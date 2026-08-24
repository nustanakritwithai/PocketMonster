import assert from 'node:assert/strict';
import fs from 'node:fs';

const sources = Object.freeze({
  monster: ['monster-instance.mjs', fs.readFileSync(new URL('../monster-instance.mjs', import.meta.url), 'utf8')],
  save: ['save-schema.mjs', fs.readFileSync(new URL('../save-schema.mjs', import.meta.url), 'utf8')],
});

async function loadSource(source, filename, label) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, fileUrl).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function assertMonster(module) {
  assert.equal(module.INSTANCE_SAVE_VERSION, 15);
  assert.equal(module.INSTANCE_STAT_SCHEMA_VERSION, 'monster-instance-stats/v1');
  const base = module.normalizeInstance({
    instanceId: 'mut-base', speciesId: 'flameling', formId: 'flameling',
    training: { power: 120, defense: 80, speed: 60, technique: 40, spirit: 20 },
  }, { now: 1000 });
  assert.equal(base.canonicalFormId, 'MON_002');
  assert.deepEqual(base.statTraining, { hp: 0, atk: 120, def: 80, spAtk: 40, spDef: 20, spd: 60 });
  const evolved = module.normalizeInstance({
    instanceId: 'mut-evo', speciesId: 'flameling', formId: 'flameling_lv2', evolutionPath: 'flameling_lv2',
  }, { now: 1000 });
  assert.equal(evolved.canonicalFormId, 'MON_020');
  assert.deepEqual(module.normalizeInstanceStatTraining({ hp: 500, atk: 500, def: 500, spAtk: 500, spDef: 500, spd: 500 }), {
    hp: 200, atk: 200, def: 200, spAtk: 0, spDef: 0, spd: 0,
  });
  assert.deepEqual(module.normalizeInstanceStatTraining({ hp: 1.9 }), { hp: 1, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 });
  const saved = module.sanitizeMonsterInstanceForPersistence(base);
  assert.equal(saved.statTraining.spatk, 40);
  assert.equal(saved.statTraining.spdef, 20);
  assert.equal(saved.statSchemaVersion, 'monster-instance-stats/v1');
  const sync = module.normalizeInstance({ instanceId: 'mut-sync', speciesId: 'flameling', training: { power: 10 } }, { now: 1000 });
  module.addTrainingExp(sync, 'power', 5);
  assert.equal(sync.statTraining.atk, 15);
}

function assertSave(module) {
  assert.equal(module.SAVE_SCHEMA_VERSION, 15);
  assert.deepEqual(module.SAVE_MIGRATION_REGISTRY.map(entry => [entry.id, entry.targetVersion]), [
    ['monster-instance-v9-skill-runtime', 9],
    ['breeding-egg-v10', 10],
    ['passive-instance-v11', 11],
    ['canonical-monster-stats-v12', 12],
    ['canonical-monster-exp-v13', 13],
    ['skill-item-acquisition-v14', 14],
    ['merchant-wallet-purchase-v15', 15],
  ]);
}

assertMonster(await loadSource(sources.monster[1], sources.monster[0], 'monster-stat-save-current'));
assertSave(await loadSource(sources.save[1], sources.save[0], 'monster-stat-schema-current'));

const mutations = [
  ['monster', 'retain v13 instance schema', 'export const INSTANCE_SAVE_VERSION = 15;', 'export const INSTANCE_SAVE_VERSION = 13;', assertMonster],
  ['monster', 'change stat schema identity', "'monster-instance-stats/v1'", "'monster-instance-stats/legacy'", assertMonster],
  ['monster', 'map ATK from defense', "atk: 'power'", "atk: 'defense'", assertMonster],
  ['monster', 'map HP from power', 'hp: null', "hp: 'power'", assertMonster],
  ['monster', 'raise total training cap', 'let remaining = MONSTER_STAT_SOURCE_LIMITS.training.totalMax;', 'let remaining = 999;', assertMonster],
  ['monster', 'raise per-stat training cap', 'MONSTER_STAT_SOURCE_LIMITS.training.perStatMax,', '999,', assertMonster],
  ['monster', 'retain fractional training', 'Math.floor(Number.isFinite(candidate) ? candidate : 0)', '(Number.isFinite(candidate) ? candidate : 0)', assertMonster],
  ['monster', 'force base form to Stage 2', '? mapping.workbookStage2MonsterId\n    : mapping.workbookBaseMonsterId;', '? mapping.workbookStage2MonsterId\n    : mapping.workbookStage2MonsterId;', assertMonster],
  ['monster', 'ignore legacy evolution path', "typeof source.evolutionPath === 'string' && source.evolutionPath.length > 0", 'false', assertMonster],
  ['monster', 'persist camel-case special attack', 'spatk: training.spAtk,', 'spAtk: training.spAtk,', assertMonster],
  ['monster', 'drop canonical stat normalization', 'statTraining: normalizeInstanceStatTraining(source.statTraining, source.training),', 'statTraining: {},', assertMonster],
  ['monster', 'do not synchronize Ranch training', 'if (canonicalStat) addStatTraining(instance, canonicalStat, applied);', 'if (false) addStatTraining(instance, canonicalStat, applied);', assertMonster],
  ['save', 'retain v13 save schema', 'export const SAVE_SCHEMA_VERSION = 15;', 'export const SAVE_SCHEMA_VERSION = 13;', assertSave],
  ['save', 'drop v12 migration registry', "  Object.freeze({\n    id: 'canonical-monster-stats-v12',\n    targetVersion: 12,\n    migrate: migrateState,\n  }),\n", '', assertSave],
];

let killed = 0;
for (const [sourceKey, name, from, to, contract] of mutations) {
  const [filename, source] = sources[sourceKey];
  const mutant = source.replace(from, to);
  assert.notEqual(mutant, source, `${name} mutation must apply`);
  await assert.rejects(async () => contract(await loadSource(mutant, filename, `monster-stat-save-mutant-${name}`)), undefined, `${name} must be killed`);
  killed += 1;
}

assert.equal(killed, mutations.length);
console.log(`V8.3 monster stat save migration mutants: PASS (${killed}/${mutations.length} killed)`);
