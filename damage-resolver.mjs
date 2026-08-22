// PocketMonster V8.1 — deterministic Workbook direct-damage adapter.
// This is intentionally preview-only until balance decision D7 approves replacing
// the current liveMoveDamage path. It resolves one skill result; multi-hit divides
// that result instead of multiplying the skill's total Power budget.

import { clamp } from './balance-formulas.mjs';
import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { skillCatalogEntry } from './skill-catalog.mjs';
import { RUNTIME_TYPES, typeEffectiveness } from './type-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const WORKBOOK_DAMAGE_POLICY = Object.freeze({
  formulaVersion: 'DMG_v1.0',
  activation: 'preview_only',
  liveResolver: 'liveMoveDamage_unchanged',
  statModel: 'D2_ATK_DEF_RUNTIME_ONLY',
  typeChart: 'A09_SHARED_RUNTIME_CHART_UNCHANGED',
  serverAuthorityClaim: false,
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

export const WORKBOOK_DAMAGE_RULES = Object.freeze({
  levelScaleDivisor: 5,
  baseFormulaDivisor: 50,
  baseDamageFlat: 2,
  stab: 1.2,
  noStab: 1,
  criticalMultiplier: 1.5,
  baseCriticalChancePct: 5,
  criticalChanceCapPct: 80,
  variance: Object.freeze({ min: 0.9, max: 1, preview: 0.95 }),
  minimumSuccessfulDamage: 1,
  statModifier: Object.freeze({ min: 0.25, max: 2.5 }),
  damageTaken: Object.freeze({ min: 0.25, max: 3 }),
  armorPierce: Object.freeze({ defaultPct: 25, capPct: 50 }),
  bonusVsDarkPct: 25,
  fireResistPct: 25,
});

const MULTI_HIT_COUNTS = Object.freeze({
  SK_GRASS_06: 3,
  SK_ELECTRIC_06: 3,
  SK_PSYCHIC_06: 3,
  SK_BUG_05: 3,
  SK_FIGHTING_02: 3,
});
const CRITICAL_CATEGORIES = new Set(['Physical', 'Special', 'Ultimate']);
const RUNTIME_TYPE_SET = new Set(RUNTIME_TYPES);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function validTypes(types) {
  return Array.isArray(types) && types.every(type => RUNTIME_TYPE_SET.has(type));
}

export function damageProfileForSkill(skillId) {
  const skill = skillCatalogEntry(skillId);
  if (!skill) return null;
  const hitCount = MULTI_HIT_COUNTS[skillId] ?? 1;
  return Object.freeze({
    skillId,
    power: skill.power,
    runtimeType: skill.runtimeType,
    directDamage: skill.directDamage,
    canCrit: skill.directDamage && CRITICAL_CATEGORIES.has(skill.category),
    hitCount,
    powerBudgetRule: hitCount > 1 ? 'TotalPowerBudget' : 'SingleResolution',
    armorPiercePct: skill.armorPiercePct,
    bonusVsDark: skill.effect === 'BonusVsDark',
    formulaVersion: skill.damageFormulaVersion,
  });
}

export function splitDamageBudget(totalDamage, hitCount = 1) {
  const total = Math.max(0, Math.floor(finite(totalDamage, 0)));
  const count = Math.max(1, Math.floor(finite(hitCount, 1)));
  const perHit = Math.floor(total / count);
  const remainder = total % count;
  return Object.freeze(Array.from({ length: count }, (_, index) => perHit + (index < remainder ? 1 : 0)));
}

function skippedDamage(profile, reason) {
  return result(true, reason, {
    skipped: true,
    formulaVersion: WORKBOOK_DAMAGE_POLICY.formulaVersion,
    activation: WORKBOOK_DAMAGE_POLICY.activation,
    skillId: profile.skillId,
    hitCount: profile.hitCount,
    totalDamage: 0,
    hitDamages: Object.freeze([]),
    rngDraws: 0,
  });
}

function readDamageRng(rng) {
  if (typeof rng !== 'function') return result(false, 'rng_required');
  let criticalRoll;
  let varianceRoll;
  try {
    criticalRoll = rng();
    if (!Number.isFinite(criticalRoll) || criticalRoll < 0 || criticalRoll > 1) {
      return result(false, 'invalid_rng_value', { rngDraws: 1 });
    }
    varianceRoll = rng();
    if (!Number.isFinite(varianceRoll) || varianceRoll < 0 || varianceRoll > 1) {
      return result(false, 'invalid_rng_value', { rngDraws: 2 });
    }
  } catch {
    return result(false, 'rng_failure');
  }
  return result(true, null, { criticalRoll, varianceRoll, rngDraws: 2 });
}

export function resolveWorkbookSkillDamage({
  skillId,
  attackerLevel,
  attack,
  defense,
  attackerTypes = [],
  defenderTypes = [],
  skillPowerBonusPct = 0,
  attackStatModifierPct = 0,
  defenseStatModifierPct = 0,
  damageDealtModifierPct = 0,
  damageTakenModifierPct = 0,
  elementResistPct = 0,
  criticalChanceModifierPct = 0,
} = {}, { rng } = {}) {
  const profile = damageProfileForSkill(skillId);
  if (!profile) return result(false, 'unknown_id', { skillId: skillId ?? null });
  if (profile.formulaVersion !== WORKBOOK_DAMAGE_POLICY.formulaVersion) {
    return result(false, 'formula_version_mismatch', { skillId, formulaVersion: profile.formulaVersion });
  }
  if (!profile.directDamage || profile.power <= 0) return skippedDamage(profile, 'non_damage_skill');

  if (!Number.isFinite(attackerLevel) || attackerLevel < 1 || attackerLevel > 60) {
    return result(false, 'invalid_level', { skillId, attackerLevel: attackerLevel ?? null });
  }
  if (!Number.isFinite(attack) || attack <= 0 || !Number.isFinite(defense) || defense <= 0) {
    return result(false, 'invalid_stats', { skillId });
  }
  if (!validTypes(attackerTypes) || !validTypes(defenderTypes)) {
    return result(false, 'invalid_type', { skillId });
  }

  const typeMultiplier = typeEffectiveness(profile.runtimeType, defenderTypes);
  if (typeMultiplier === 0) {
    return result(true, 'type_immune', {
      skipped: true,
      formulaVersion: WORKBOOK_DAMAGE_POLICY.formulaVersion,
      activation: WORKBOOK_DAMAGE_POLICY.activation,
      statModel: WORKBOOK_DAMAGE_POLICY.statModel,
      skillId,
      skillType: profile.runtimeType,
      hitCount: profile.hitCount,
      typeMultiplier,
      totalDamage: 0,
      hitDamages: Object.freeze(Array(profile.hitCount).fill(0)),
      rngDraws: 0,
    });
  }

  const rolls = readDamageRng(rng);
  if (!rolls.ok) return result(false, rolls.reason, { skillId, rngDraws: rolls.rngDraws ?? 0 });

  const rules = WORKBOOK_DAMAGE_RULES;
  const powerMultiplier = Math.max(0, 1 + finite(skillPowerBonusPct) / 100);
  const attackModifier = clamp(1 + finite(attackStatModifierPct) / 100, rules.statModifier.min, rules.statModifier.max);
  const defenseModifier = clamp(1 + finite(defenseStatModifierPct) / 100, rules.statModifier.min, rules.statModifier.max);
  const armorPiercePct = clamp(finite(profile.armorPiercePct), 0, rules.armorPierce.capPct);
  const effectivePower = profile.power * powerMultiplier;
  const effectiveAttack = attack * attackModifier;
  const effectiveDefense = Math.max(1, defense * defenseModifier * (1 - armorPiercePct / 100));
  const baseDamage = Math.floor(
    ((((2 * attackerLevel / rules.levelScaleDivisor) + 2) * effectivePower * effectiveAttack / effectiveDefense)
      / rules.baseFormulaDivisor) + rules.baseDamageFlat,
  );

  const stabMultiplier = attackerTypes.includes(profile.runtimeType) ? rules.stab : rules.noStab;
  const criticalChancePct = clamp(
    rules.baseCriticalChancePct + finite(criticalChanceModifierPct),
    0,
    rules.criticalChanceCapPct,
  );
  const critical = profile.canCrit && rolls.criticalRoll < criticalChancePct / 100;
  const criticalMultiplier = critical ? rules.criticalMultiplier : 1;
  const conditionalMultiplier = profile.bonusVsDark && defenderTypes.includes('Dark')
    ? 1 + rules.bonusVsDarkPct / 100
    : 1;
  const damageDealtMultiplier = Math.max(0, 1 + finite(damageDealtModifierPct) / 100);
  const damageTakenMultiplier = clamp(
    1 + finite(damageTakenModifierPct) / 100,
    rules.damageTaken.min,
    rules.damageTaken.max,
  );
  const elementResistMultiplier = Math.max(0, 1 - finite(elementResistPct) / 100);
  const varianceMultiplier = rules.variance.min
    + (rules.variance.max - rules.variance.min) * rolls.varianceRoll;
  const unresolvedDamage = baseDamage * stabMultiplier * typeMultiplier * criticalMultiplier
    * conditionalMultiplier * damageDealtMultiplier * damageTakenMultiplier
    * elementResistMultiplier * varianceMultiplier;
  const totalDamage = Math.max(rules.minimumSuccessfulDamage, Math.floor(unresolvedDamage));
  const hitDamages = splitDamageBudget(totalDamage, profile.hitCount);

  return result(true, null, {
    skipped: false,
    formulaVersion: WORKBOOK_DAMAGE_POLICY.formulaVersion,
    activation: WORKBOOK_DAMAGE_POLICY.activation,
    statModel: WORKBOOK_DAMAGE_POLICY.statModel,
    skillId,
    skillType: profile.runtimeType,
    power: profile.power,
    hitCount: profile.hitCount,
    powerBudgetRule: profile.powerBudgetRule,
    effectivePower,
    effectiveAttack,
    effectiveDefense,
    armorPiercePct,
    baseDamage,
    stabMultiplier,
    typeMultiplier,
    criticalChancePct,
    critical,
    criticalMultiplier,
    conditionalMultiplier,
    damageDealtMultiplier,
    damageTakenMultiplier,
    elementResistMultiplier,
    varianceMultiplier,
    totalDamage,
    hitDamages,
    rngDraws: rolls.rngDraws,
  });
}

// Deterministic UI/debug projection: no critical and Workbook midpoint variance.
export function previewWorkbookSkillDamage(input = {}) {
  const values = [1, 0.5];
  let index = 0;
  return resolveWorkbookSkillDamage(input, { rng: () => values[index++] });
}
