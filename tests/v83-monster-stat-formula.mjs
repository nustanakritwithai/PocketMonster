import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MONSTER_STAT_CATALOG } from '../monster-stat-catalog.mjs';
import { MONSTER_STAT_KEYS, MONSTER_STAT_MILESTONE_LEVELS } from '../monster-stat-contract.mjs';
import {
  DEFAULT_MONSTER_POTENTIAL,
  EMPTY_MONSTER_TRAINING,
  MONSTER_STAT_FORMULA_ACTIVATION,
  MONSTER_STAT_FORMULA_VERSION,
  calculateMonsterStat,
  calculateMonsterStatValue,
  calculateMonsterStats,
} from '../monster-stat-formula.mjs';

assert.equal(MONSTER_STAT_FORMULA_VERSION, 'monster-stat-formula/v1');
assert.equal(MONSTER_STAT_FORMULA_ACTIVATION, 'formula_ready');
assert.deepEqual(DEFAULT_MONSTER_POTENTIAL, { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 });
assert.deepEqual(EMPTY_MONSTER_TRAINING, { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 });
assert.equal(Object.isFrozen(DEFAULT_MONSTER_POTENTIAL), true);
assert.equal(Object.isFrozen(EMPTY_MONSTER_TRAINING), true);

function reference(stat, baseStat, level, potential, training) {
  return Math.floor(((2 * baseStat + potential + training / 4) * level) / 100) + (stat === 'hp' ? level + 10 : 5);
}

const source = { formId: 'MON_002', level: 15, potential: { ...DEFAULT_MONSTER_POTENTIAL }, training: { ...EMPTY_MONSTER_TRAINING } };
const sourceSnapshot = structuredClone(source);
const flame = calculateMonsterStats(source);
assert.equal(flame.ok, true);
assert.deepEqual(source, sourceSnapshot, 'formula engine never mutates caller input');
assert.deepEqual(flame.stats, { hp: 41, atk: 18, def: 17, spAtk: 23, spDef: 18, spd: 21 });
assert.equal(flame.trainingTotal, 0);
assert.equal(flame.activation, 'formula_ready');
assert.equal(Object.isFrozen(flame), true);
assert.equal(Object.isFrozen(flame.stats), true);
assert.equal(Object.isFrozen(flame.breakdown), true);
assert.equal(Object.isFrozen(flame.breakdown.spAtk), true);

const maxBuild = calculateMonsterStats({
  formId: 'MON_020',
  level: 60,
  potential: Object.fromEntries(MONSTER_STAT_KEYS.map(stat => [stat, 31])),
  training: { hp: 200, atk: 200, def: 0, spAtk: 200, spDef: 0, spd: 0 },
});
assert.equal(maxBuild.ok, true);
assert.equal(maxBuild.trainingTotal, 600);
assert.equal(maxBuild.stats.hp, 221);
assert.equal(maxBuild.stats.spAtk, 167);
assert.equal(maxBuild.stats.spDef, 106);
assert.equal(calculateMonsterStat({ ...source, stat: 'spAtk' }).value, 23, 'special stats are first-class in M2');

const matrix = [];
for (const form of MONSTER_STAT_CATALOG) {
  let previous = null;
  for (const level of MONSTER_STAT_MILESTONE_LEVELS) {
    const result = calculateMonsterStats({ formId: form.formId, level });
    assert.equal(result.ok, true, `${form.formId} Lv.${level} resolves`);
    assert.deepEqual(Object.keys(result.stats), MONSTER_STAT_KEYS);
    for (const stat of MONSTER_STAT_KEYS) {
      assert.equal(result.stats[stat], reference(stat, form.baseStats[stat], level, 15, 0));
      if (previous) assert.ok(result.stats[stat] >= previous[stat], `${form.formId} ${stat} is monotonic`);
    }
    previous = result.stats;
    matrix.push([form.formId, level, ...MONSTER_STAT_KEYS.map(stat => result.stats[stat])]);
  }
}
assert.equal(matrix.length, 36 * 9);
assert.equal(createHash('sha256').update(JSON.stringify(matrix)).digest('hex'), '97b21cd52d73ae962b19729ae070ffa03e732623c056c7f7ec6216166a607faa');

assert.deepEqual(calculateMonsterStats({ formId: 'MON_UNKNOWN', level: 1 }), { ok: false, reason: 'unknown_form_id', field: 'formId', value: 'MON_UNKNOWN' });
assert.equal(calculateMonsterStats({ formId: 'MON_001', level: 0 }).reason, 'out_of_range');
assert.equal(calculateMonsterStats({ formId: 'MON_001', level: 1.5 }).reason, 'invalid_integer');
assert.equal(calculateMonsterStats({ formId: 'MON_001', level: 1, potential: { hp: 1 } }).reason, 'missing_stat');
assert.equal(calculateMonsterStats({ formId: 'MON_001', level: 1, training: { ...EMPTY_MONSTER_TRAINING, luck: 1 } }).reason, 'unknown_stat');
assert.equal(calculateMonsterStats({ formId: 'MON_001', level: 1, potential: { ...DEFAULT_MONSTER_POTENTIAL, hp: 32 } }).reason, 'out_of_range');
assert.equal(calculateMonsterStats({ formId: 'MON_001', level: 1, training: { hp: 200, atk: 200, def: 200, spAtk: 1, spDef: 0, spd: 0 } }).reason, 'training_total_exceeded');
assert.equal(calculateMonsterStat({ ...source, stat: 'luck' }).reason, 'unknown_stat');
assert.equal(calculateMonsterStatValue({ stat: 'atk', baseStat: 0, level: 1, potential: 15, training: 0 }).reason, 'out_of_range');
assert.equal(calculateMonsterStatValue({ stat: 'atk', baseStat: 42, level: 1, potential: 15, training: 0 }).value, 5);

console.log('V8.3 canonical six-stat formula: PASS (36 forms × 9 levels × 6 stats)');
