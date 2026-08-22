import assert from 'node:assert/strict';
import {
  WORKBOOK_DAMAGE_POLICY,
  WORKBOOK_DAMAGE_RULES,
  damageProfileForSkill,
  previewWorkbookSkillDamage,
  resolveWorkbookSkillDamage,
  splitDamageBudget,
} from '../damage-resolver.mjs';

function vectorRng(values) {
  let calls = 0;
  return {
    rng() {
      assert.ok(calls < values.length, 'resolver requested more RNG values than the vector provides');
      return values[calls++];
    },
    calls: () => calls,
  };
}

assert.equal(WORKBOOK_DAMAGE_POLICY.formulaVersion, 'DMG_v1.0');
assert.equal(WORKBOOK_DAMAGE_POLICY.activation, 'preview_only', 'D7 keeps Workbook rebalance out of the live loop');
assert.equal(WORKBOOK_DAMAGE_POLICY.statModel, 'D2_ATK_DEF_RUNTIME_ONLY');
assert.equal(WORKBOOK_DAMAGE_POLICY.typeChart, 'A09_SHARED_RUNTIME_CHART_UNCHANGED');
assert.equal(WORKBOOK_DAMAGE_POLICY.serverAuthorityClaim, false);
assert.equal(WORKBOOK_DAMAGE_POLICY.sourceWorkbookVersion, '2.1');
assert.equal(WORKBOOK_DAMAGE_POLICY.sourceWorkbookSha256, 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c');
assert.equal(WORKBOOK_DAMAGE_RULES.stab, 1.2);
assert.equal(WORKBOOK_DAMAGE_RULES.variance.preview, 0.95);

const calculatorRng = vectorRng([1, 0.5]);
const calculator = resolveWorkbookSkillDamage({
  skillId: 'SK_FIRE_04',
  attackerLevel: 20,
  attack: 46,
  defense: 40,
  attackerTypes: ['Fire', 'Dragon'],
  defenderTypes: ['Water'],
}, { rng: calculatorRng.rng });
assert.equal(calculator.ok, true);
assert.equal(calculator.baseDamage, 19);
assert.equal(calculator.stabMultiplier, 1.2);
assert.equal(calculator.typeMultiplier, 0.5);
assert.equal(calculator.varianceMultiplier, 0.95);
assert.equal(calculator.totalDamage, 10, 'matches the Workbook core preview vector through the shared A09 type chart');
assert.deepEqual(calculator.hitDamages, [10]);
assert.equal(calculatorRng.calls(), 2, 'one direct skill result consumes one crit and one variance roll');

const preview = previewWorkbookSkillDamage({
  skillId: 'SK_NORMAL_01', attackerLevel: 30, attack: 100, defense: 100,
  attackerTypes: ['Normal'], defenderTypes: ['Normal'],
});
assert.equal(preview.totalDamage, 13, 'matches Workbook common-skill Lv30 reference damage');
assert.equal(preview.varianceMultiplier, 0.95);
assert.equal(preview.critical, false);

const zeroRng = vectorRng([]);
const support = resolveWorkbookSkillDamage({
  skillId: 'SK_FIRE_03', attackerLevel: 20, attack: 46, defense: 40,
  attackerTypes: ['Fire'], defenderTypes: ['Water'],
}, { rng: zeroRng.rng });
assert.equal(support.ok, true);
assert.equal(support.skipped, true);
assert.equal(support.reason, 'non_damage_skill');
assert.equal(support.totalDamage, 0);
assert.deepEqual(support.hitDamages, []);
assert.equal(zeroRng.calls(), 0, 'Power=0 skips direct damage and consumes no RNG');

const multiRng = vectorRng([1, 0.5]);
const multi = resolveWorkbookSkillDamage({
  skillId: 'SK_FIGHTING_02', attackerLevel: 30, attack: 100, defense: 100,
  attackerTypes: ['Fighting'], defenderTypes: ['Normal'],
}, { rng: multiRng.rng });
assert.equal(damageProfileForSkill('SK_FIGHTING_02').hitCount, 3);
assert.equal(multi.totalDamage, 36);
assert.deepEqual(multi.hitDamages, [12, 12, 12]);
assert.equal(multi.hitDamages.reduce((sum, damage) => sum + damage, 0), multi.totalDamage, 'multi-hit divides one total power budget');
assert.notEqual(multi.hitDamages.reduce((sum, damage) => sum + damage, 0), multi.totalDamage * multi.hitCount, 'hit count never multiplies the resolved total again');
assert.deepEqual(splitDamageBudget(31, 3), [11, 10, 10], 'integer remainder is distributed without losing damage');
assert.equal(multiRng.calls(), 2, 'multi-hit resolves crit/variance once for the skill result');
for (const skillId of ['SK_GRASS_06', 'SK_ELECTRIC_06', 'SK_PSYCHIC_06', 'SK_BUG_05', 'SK_FIGHTING_02']) {
  assert.equal(damageProfileForSkill(skillId).hitCount, 3, `${skillId} keeps the Workbook total-budget hit count`);
  assert.equal(damageProfileForSkill(skillId).powerBudgetRule, 'TotalPowerBudget');
}
assert.equal(damageProfileForSkill('SK_FIRE_06').hitCount, 1);
assert.equal(damageProfileForSkill('SK_BUG_05').canCrit, false, 'Control damage does not gain an implicit crit path');

const crit = resolveWorkbookSkillDamage({
  skillId: 'SK_FIRE_04', attackerLevel: 20, attack: 46, defense: 40,
  attackerTypes: ['Fire', 'Dragon'], defenderTypes: ['Water'],
}, { rng: vectorRng([0, 1]).rng });
assert.equal(crit.critical, true);
assert.equal(crit.criticalMultiplier, 1.5);
assert.equal(crit.totalDamage, 17);

const immuneRng = vectorRng([]);
const immune = resolveWorkbookSkillDamage({
  skillId: 'SK_ELECTRIC_01', attackerLevel: 30, attack: 100, defense: 100,
  attackerTypes: ['Electric'], defenderTypes: ['Ground'],
}, { rng: immuneRng.rng });
assert.equal(immune.reason, 'type_immune');
assert.equal(immune.totalDamage, 0);
assert.equal(immuneRng.calls(), 0, 'immune target does not consume damage RNG');

const pierce = resolveWorkbookSkillDamage({
  skillId: 'SK_FIGHTING_01', attackerLevel: 30, attack: 100, defense: 100,
  attackerTypes: ['Fighting'], defenderTypes: ['Fighting'],
}, { rng: vectorRng([1, 0.5]).rng });
assert.equal(pierce.armorPiercePct, 25);
assert.equal(pierce.effectiveDefense, 75);

const lightVsDark = resolveWorkbookSkillDamage({
  skillId: 'SK_LIGHT_01', attackerLevel: 30, attack: 100, defense: 100,
  attackerTypes: ['Fairy'], defenderTypes: ['Dark'],
}, { rng: vectorRng([1, 0.5]).rng });
assert.equal(lightVsDark.skillType, 'Fairy', 'Workbook LIGHT resolves through the canonical Fairy runtime type');
assert.equal(lightVsDark.conditionalMultiplier, 1.25);

assert.equal(resolveWorkbookSkillDamage({
  skillId: 'SK_UNKNOWN_01', attackerLevel: 20, attack: 10, defense: 10,
}, { rng: vectorRng([]).rng }).reason, 'unknown_id');
assert.equal(resolveWorkbookSkillDamage({
  skillId: 'SK_FIRE_01', attackerLevel: 20, attack: 10, defense: 10,
  attackerTypes: ['Fire'], defenderTypes: ['Grass'],
}).reason, 'rng_required');
assert.equal(resolveWorkbookSkillDamage({
  skillId: 'SK_FIRE_01', attackerLevel: 20, attack: 10, defense: 10,
  attackerTypes: ['Fire'], defenderTypes: ['Grass'],
}, { rng: () => 2 }).reason, 'invalid_rng_value');

assert.ok(Object.isFrozen(calculator));
assert.ok(Object.isFrozen(calculator.hitDamages));
console.log('V8.1 deterministic Workbook damage resolver: PASS');
