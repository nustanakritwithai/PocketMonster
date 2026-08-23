import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../monster-stat-formula.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function assertFormula(module) {
  assert.equal(module.MONSTER_STAT_FORMULA_ACTIVATION, 'formula_ready');
  const defaults = module.calculateMonsterStats({ formId: 'MON_002', level: 15 });
  assert.equal(defaults.ok, true);
  assert.deepEqual(defaults.stats, { hp: 41, atk: 18, def: 17, spAtk: 23, spDef: 18, spd: 21 });
  const max = module.calculateMonsterStats({
    formId: 'MON_020',
    level: 60,
    potential: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
    training: { hp: 200, atk: 200, def: 0, spAtk: 200, spDef: 0, spd: 0 },
  });
  assert.equal(max.ok, true);
  assert.deepEqual(max.stats, { hp: 221, atk: 136, def: 99, spAtk: 167, spDef: 106, spd: 122 });
  assert.equal(module.calculateMonsterStats({ formId: 'MON_001', level: 61 }).ok, false);
  assert.equal(module.calculateMonsterStatValue({ stat: 'atk', baseStat: 42, level: 61, potential: 15, training: 0 }).ok, false);
  assert.equal(module.calculateMonsterStats({ formId: 'MON_001', level: 1, potential: { hp: 15 } }).ok, false);
  assert.equal(module.calculateMonsterStats({ formId: 'MON_001', level: 1, potential: { hp: 32, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 } }).ok, false);
  assert.equal(module.calculateMonsterStatValue({ stat: 'atk', baseStat: 42, level: 1, potential: 32, training: 0 }).ok, false);
  assert.equal(module.calculateMonsterStats({ formId: 'MON_001', level: 1, training: { hp: 201, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 } }).ok, false);
  assert.equal(module.calculateMonsterStatValue({ stat: 'atk', baseStat: 42, level: 1, potential: 15, training: 201 }).ok, false);
  assert.equal(module.calculateMonsterStats({
    formId: 'MON_001',
    level: 1,
    training: { hp: 200, atk: 200, def: 200, spAtk: 1, spDef: 0, spd: 0 },
  }).ok, false);
  assert.equal(module.calculateMonsterStat({ formId: 'MON_001', level: 1, stat: 'spDef' }).value, 5);
}

assertFormula(await loadSource(originalSource, 'monster-stat-formula-current'));

const mutations = [
  ['claim live activation', "'formula_ready'", "'runtime_live'"],
  ['drop default spAtk', 'MONSTER_STAT_KEYS.map(stat => [stat, MONSTER_STAT_SOURCE_LIMITS.potential.default])', "MONSTER_STAT_KEYS.filter(stat => stat !== 'spAtk').map(stat => [stat, MONSTER_STAT_SOURCE_LIMITS.potential.default])"],
  ['increase level cap', 'max: MONSTER_STAT_SOURCE_LIMITS.level.max', 'max: 99'],
  ['increase potential cap', 'max: MONSTER_STAT_SOURCE_LIMITS.potential.max', 'max: 99'],
  ['increase training cap', 'max: MONSTER_STAT_SOURCE_LIMITS.training.perStatMax', 'max: 999'],
  ['remove total cap', 'trainingTotal > MONSTER_STAT_SOURCE_LIMITS.training.totalMax', 'false'],
  ['wrong base multiplier', '(2 * baseStat)', '(3 * baseStat)'],
  ['remove training divisor', '(training / MONSTER_STAT_SOURCE_LIMITS.training.divisor)', 'training'],
  ['round instead of floor', 'Math.floor((subtotal * level) / 100)', 'Math.round((subtotal * level) / 100)'],
  ['wrong HP bonus', "stat === 'hp' ? level + 10 : 5", "stat === 'hp' ? 10 : 5"],
  ['make all stats HP', "stat === 'hp' ? level + 10 : 5", 'level + 10'],
  ['use Stage 1 form always', 'monsterStatCatalogEntry(formId)', "monsterStatCatalogEntry('MON_002')"],
];

let killed = 0;
for (const [name, from, to] of mutations) {
  const mutant = originalSource.replace(from, to);
  assert.notEqual(mutant, originalSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertFormula(await loadSource(mutant, `monster-stat-formula-mutant-${name}`)), undefined, `${name} must be killed`);
  killed += 1;
}

assert.equal(killed, mutations.length);
console.log(`V8.3 monster stat formula mutants: PASS (${killed}/${mutations.length} killed)`);
