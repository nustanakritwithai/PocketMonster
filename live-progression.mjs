// Monster Life RPG — V8.0 live-loop adapters
// Connects the data-driven V7.x modules to the playable instance shape without
// Three.js / DOM coupling so the same path can be unit-tested (R19, R24).

import { BALANCE_CONFIG } from './balance-config.mjs';
import {
  captureChance as formulaCaptureChance,
  conditionCombatModifier,
  cumulativeExpToLevel,
  defenseMitigation,
  trainingCapacity,
  trainingGain,
  totalTrainingUsed,
} from './balance-formulas.mjs';
import { combatRating, DEFAULT_CONVERSION, derivedStats, finalStats, statBreakdown } from './combat-rating.mjs';
import { activeTrainingFoodMultiplier, nutritionFlat } from './food-care.mjs';
import { canonicalFormIdForInstance, deriveCondition } from './monster-instance.mjs';
import { MONSTER_STAT_KEYS } from './monster-stat-contract.mjs';
import { monsterStatCatalogFormForStage } from './monster-stat-catalog.mjs';
import { calculateMonsterStats } from './monster-stat-formula.mjs';
import { resolvePassiveStaticModifier } from './passive-resolver.mjs';
import { EQUIPMENT_CATALOG, personalityTrainingMultiplier } from './content-catalog.mjs';

export const LEVEL_GROWTH_SCALE = Object.freeze({ hp: 0.14, atk: 0.08, def: 0.08, spd: 0.05 });
export const STARTER_EQUIPMENT = EQUIPMENT_CATALOG.filter(item => ['ranch_band', 'guard_charm', 'swift_lens'].includes(item.id));
export const CANONICAL_LIVE_STAT_VERSION = 'canonical-live-stats/v1';
export const LIVE_DAMAGE_CLASS_POLICY = Object.freeze({
  Physical: Object.freeze({ attackStat: 'atk', defenseStat: 'def', workbookAttackStat: 'ATK', workbookDefenseStat: 'DEF' }),
  Special: Object.freeze({ attackStat: 'spAtk', defenseStat: 'spDef', workbookAttackStat: 'SPATK', workbookDefenseStat: 'SPDEF' }),
  basicAttackClass: 'Physical',
  nonPhysicalDirectClass: 'Special',
});
export const WILD_STAT_VARIANT_MULTIPLIERS = Object.freeze({
  Normal: Object.freeze({ hp: 1, atk: 1, def: 1, spAtk: 1, spDef: 1, spd: 1 }),
  Rare: Object.freeze({ hp: 1, atk: 1, def: 1, spAtk: 1, spDef: 1, spd: 1 }),
  Elite: Object.freeze({ hp: 1.3, atk: 1.12, def: 1.1, spAtk: 1.12, spDef: 1.1, spd: 1 }),
  Boss: Object.freeze({ hp: 2, atk: 1.35, def: 1.3, spAtk: 1.35, spDef: 1.3, spd: 1 }),
});

function canonicalLiveFailure(reason, field, value = null) {
  return Object.freeze({ ok: false, reason, field, value, activation: 'runtime_live' });
}

export function computeCanonicalOwnedStats(inst, equipmentFlat = null) {
  const formId = inst?.canonicalFormId ?? canonicalFormIdForInstance(inst);
  const formula = calculateMonsterStats({
    formId,
    level: inst?.level,
    potential: inst?.potential,
    training: inst?.statTraining,
  });
  if (!formula.ok) return Object.freeze({ ...formula, activation: 'runtime_rejected' });

  const condition = inst?._condition ?? deriveCondition(inst);
  const conditionMultiplier = 1 + conditionCombatModifier(condition);
  const stats = {};
  const breakdown = {};
  for (const stat of MONSTER_STAT_KEYS) {
    const nutrition = nutritionFlat(inst, stat);
    const equipment = Number.isFinite(equipmentFlat?.[stat]) ? equipmentFlat[stat] : 0;
    const beforePassive = Math.max(1, Math.round((formula.stats[stat] + nutrition + equipment) * conditionMultiplier));
    const passiveModifiers = resolvePassiveStaticModifier({
      passiveId: inst?.passiveId,
      ownerSpeciesId: inst?.speciesId,
      ownerFainted: inst?.fainted === true || (Number.isFinite(inst?.hp) && inst.hp <= 0),
    }).filter(modifier => modifier.kind === 'stat_multiplier' && modifier.stat === stat.toUpperCase());
    const passiveMultiplier = passiveModifiers.reduce((value, modifier) => value * modifier.multiplier, 1);
    stats[stat] = Math.max(1, Math.round(beforePassive * passiveMultiplier));
    breakdown[stat] = Object.freeze({
      ...formula.breakdown[stat],
      nutritionFlat: nutrition,
      equipmentFlat: equipment,
      condition,
      conditionMultiplier,
      beforePassive,
      passiveMultiplier,
      passiveSources: Object.freeze(passiveModifiers.map(modifier => modifier.sourcePassiveId)),
      final: stats[stat],
    });
  }
  return Object.freeze({
    ok: true,
    reason: null,
    formId,
    runtimeSpeciesId: formula.runtimeSpeciesId,
    level: formula.level,
    stats: Object.freeze(stats),
    breakdown: Object.freeze(breakdown),
    formula,
    version: CANONICAL_LIVE_STAT_VERSION,
    activation: 'runtime_live',
  });
}

export function applyCanonicalOwnedStats(inst, result, { heal = false } = {}) {
  if (!inst || !result?.ok) return false;
  const oldMax = Number.isFinite(inst.maxHp) && inst.maxHp > 0 ? inst.maxHp : result.stats.hp;
  const oldHp = Number.isFinite(inst.hp) ? inst.hp : oldMax;
  const ratio = oldMax > 0 ? oldHp / oldMax : 1;
  inst.maxHp = result.stats.hp;
  inst.atk = result.stats.atk;
  inst.def = result.stats.def;
  inst.spAtk = result.stats.spAtk;
  inst.spDef = result.stats.spDef;
  inst.spd = result.stats.spd;
  inst.hp = heal ? inst.maxHp : Math.max(0, Math.min(inst.maxHp, Math.round(inst.maxHp * ratio)));
  inst.fainted = inst.hp <= 0;
  return true;
}

export function refreshCanonicalOwnedStats(inst, equipmentFlat = null, { heal = false } = {}) {
  if (heal) {
    inst.fainted = false;
    if (Number.isFinite(inst.hp) && inst.hp <= 0) inst.hp = 1;
  }
  const result = computeCanonicalOwnedStats(inst, equipmentFlat);
  if (!result.ok) return result;
  applyCanonicalOwnedStats(inst, result, { heal });
  return result;
}

export function calculateCanonicalWildStats({
  runtimeSpeciesId,
  stage = 1,
  level,
  potential,
  training,
  variant = 'Normal',
} = {}) {
  const form = monsterStatCatalogFormForStage(runtimeSpeciesId, stage);
  if (!form) return canonicalLiveFailure('unknown_wild_form', 'runtimeSpeciesId', runtimeSpeciesId ?? null);
  const multipliers = WILD_STAT_VARIANT_MULTIPLIERS[variant];
  if (!multipliers) return canonicalLiveFailure('unknown_wild_variant', 'variant', variant ?? null);
  const formula = calculateMonsterStats({ formId: form.formId, level, potential, training });
  if (!formula.ok) return Object.freeze({ ...formula, activation: 'runtime_rejected' });
  const stats = Object.freeze(Object.fromEntries(MONSTER_STAT_KEYS.map(stat => [
    stat,
    Math.max(1, Math.round(formula.stats[stat] * multipliers[stat])),
  ])));
  return Object.freeze({
    ok: true,
    reason: null,
    formId: form.formId,
    runtimeSpeciesId,
    stage,
    level: formula.level,
    variant,
    multipliers,
    stats,
    formula,
    version: CANONICAL_LIVE_STAT_VERSION,
    activation: 'runtime_live',
  });
}

export function speciesRatingProfile(sp) {
  const base = sp?.base ?? { hp: 1, atk: 1, def: 1, spd: 1 };
  const growth = sp?.growthPerLevel ?? {
    hp: base.hp * LEVEL_GROWTH_SCALE.hp,
    atk: base.atk * LEVEL_GROWTH_SCALE.atk,
    def: base.def * LEVEL_GROWTH_SCALE.def,
    spd: base.spd * LEVEL_GROWTH_SCALE.spd,
  };
  return {
    id: sp?.id,
    base,
    growthPerLevel: growth,
    conversion: sp?.conversion ?? DEFAULT_CONVERSION,
  };
}

export function evolutionProfileFromMods(mods = {}) {
  return {
    hp: Number.isFinite(mods.hp) ? mods.hp : 1,
    atk: Number.isFinite(mods.atk) ? mods.atk : 1,
    def: Number.isFinite(mods.def) ? mods.def : 1,
    spd: Number.isFinite(mods.spd) ? mods.spd : 1,
  };
}

export function instanceCombatBuild(inst, sp, path, equipmentFlat = null) {
  const profile = inst.evolutionProfile && typeof inst.evolutionProfile === 'object'
    ? evolutionProfileFromMods(inst.evolutionProfile)
    : evolutionProfileFromMods(path?.statMods);
  return {
    level: inst.level,
    species: speciesRatingProfile(sp),
    genes: inst.genes,
    training: inst.training ?? { power: 0, defense: 0, speed: 0, technique: 0, spirit: 0 },
    nutritionFlat: {
      hp: nutritionFlat(inst, 'hp'),
      atk: nutritionFlat(inst, 'atk'),
      def: nutritionFlat(inst, 'def'),
      spd: nutritionFlat(inst, 'spd'),
    },
    equipmentFlat: equipmentFlat ?? { hp: 0, atk: 0, def: 0, spd: 0 },
    evolutionProfile: profile,
    condition: inst._condition ?? deriveCondition(inst),
    passiveId: inst.passiveId ?? null,
    passiveOwnerSpeciesId: inst.speciesId ?? null,
    passiveOwnerFainted: inst.fainted === true || (Number.isFinite(inst.hp) && inst.hp <= 0),
  };
}

export function computeCoreStats(inst, sp, path, equipmentFlat = null) {
  const build = instanceCombatBuild(inst, sp, path, equipmentFlat);
  const rated = finalStats(build);
  return { stats: rated.stats, breakdown: rated.breakdown, build };
}

export function applyComputedStats(inst, stats, { heal = false } = {}) {
  const oldMax = inst.maxHp || 1;
  const oldHp = inst.hp ?? oldMax;
  const ratio = oldMax > 0 ? oldHp / oldMax : 1;
  inst.maxHp = Math.max(1, stats.hp);
  inst.atk = Math.max(1, stats.atk);
  inst.def = Math.max(1, stats.def);
  inst.spd = Math.max(1, stats.spd);
  inst.hp = heal ? inst.maxHp : Math.max(0, Math.min(inst.maxHp, Math.round(inst.maxHp * ratio)));
  inst.fainted = inst.hp <= 0;
  return inst;
}

export function refreshCoreStats(inst, sp, path, equipmentFlat = null, { heal = false } = {}) {
  if (heal) {
    inst.fainted = false;
    if (Number.isFinite(inst.hp) && inst.hp <= 0) inst.hp = 1;
  }
  const computed = computeCoreStats(inst, sp, path, equipmentFlat);
  applyComputedStats(inst, computed.stats, { heal });
  return computed;
}

export function growthExpForLevel(level) {
  return cumulativeExpToLevel(level);
}

export function liveCaptureChance({
  speciesRate,
  hpRatio,
  elite = false,
  uncapturable = false,
  eliteModifier = 0.34,
} = {}) {
  if (uncapturable) return 0;
  return formulaCaptureChance({
    speciesRate,
    hpRatio,
    tierModifier: elite ? eliteModifier : 1,
  });
}

export function liveMoveDamage({
  movePower,
  atk,
  def,
  attackerLevel,
  defenderLevel,
  stab = 1,
  effectiveness = 1,
  atkBuff = 1,
  masteryPower = 0,
  traitBonus = 1,
  critRate = 0,
  critDamage = 1.5,
  critRoll = 1,
} = {}) {
  const mitigation = defenseMitigation(def, defenderLevel);
  const power = Number.isFinite(movePower) ? movePower : 0;
  const base = (power + atk * 0.75 * atkBuff) * (1 + (Math.max(1, attackerLevel) - 1) * 0.025);
  const mastery = 1 + (Number.isFinite(masteryPower) ? masteryPower : 0);
  const crit = Number(critRoll) < Number(critRate) ? (Number.isFinite(critDamage) ? critDamage : 1.5) : 1;
  const damage = Math.max(
    effectiveness === 0 ? 0 : 1,
    Math.round(base * mitigation.damageMultiplier * stab * effectiveness * mastery * traitBonus * crit),
  );
  return { damage, stab, eff: effectiveness, mitigation, crit: crit > 1 };
}

export function resolveLiveDamageClass({ category = LIVE_DAMAGE_CLASS_POLICY.basicAttackClass, attackerStats, defenderStats } = {}) {
  const damageClass = category === 'Physical' ? 'Physical' : LIVE_DAMAGE_CLASS_POLICY.nonPhysicalDirectClass;
  const route = LIVE_DAMAGE_CLASS_POLICY[damageClass];
  const attackValue = attackerStats?.[route.attackStat];
  const defenseValue = defenderStats?.[route.defenseStat];
  if (!Number.isFinite(attackValue) || attackValue < 1) {
    return Object.freeze({ ok: false, reason: 'invalid_attack_stat', damageClass, stat: route.attackStat, value: attackValue ?? null });
  }
  if (!Number.isFinite(defenseValue) || defenseValue < 1) {
    return Object.freeze({ ok: false, reason: 'invalid_defense_stat', damageClass, stat: route.defenseStat, value: defenseValue ?? null });
  }
  return Object.freeze({
    ok: true,
    reason: null,
    damageClass,
    attackStat: route.attackStat,
    defenseStat: route.defenseStat,
    workbookAttackStat: route.workbookAttackStat,
    workbookDefenseStat: route.workbookDefenseStat,
    attackValue,
    defenseValue,
  });
}

export function liveClassedMoveDamage({ category = LIVE_DAMAGE_CLASS_POLICY.basicAttackClass, attackerStats, defenderStats, ...damageInput } = {}) {
  const route = resolveLiveDamageClass({ category, attackerStats, defenderStats });
  if (!route.ok) return Object.freeze({ ...route, damage: 0, stab: damageInput.stab ?? 1, eff: damageInput.effectiveness ?? 1, crit: false });
  const result = liveMoveDamage({ ...damageInput, atk: route.attackValue, def: route.defenseValue });
  return Object.freeze({ ok: true, reason: null, ...result, ...route });
}

export function evoDefFromPath(path, speciesId) {
  const req = path?.requires || {};
  const required = [];
  if (req.level) required.push({ field: 'level', op: 'gte', value: req.level });
  if (req.bond) required.push({ field: 'bond', op: 'gte', value: req.bond });
  if (req.trainingFocus) required.push({ field: 'trainingFocus', op: 'eq', value: req.trainingFocus });
  if (req.training && typeof req.training === 'object') {
    for (const [line, value] of Object.entries(req.training)) {
      required.push({ field: `training.${line}`, op: 'gte', value });
    }
  }
  if (req.career && typeof req.career === 'object') {
    for (const [key, value] of Object.entries(req.career)) {
      required.push({ field: `career.${key}`, op: 'gte', value });
    }
  }
  if (req.skillMastery && typeof req.skillMastery === 'object') {
    for (const [skillId, rank] of Object.entries(req.skillMastery)) {
      required.push({ field: `skillMastery.${skillId}`, op: 'rankGte', value: rank });
    }
  }
  if (Array.isArray(req.eventFlags)) {
    for (const flag of req.eventFlags) required.push({ field: 'eventFlags', op: 'includes', value: flag });
  }
  return {
    id: path.id,
    fromFormId: path.fromFormId || speciesId,
    toFormId: path.toFormId || path.id,
    requirements: { required },
    profile: evolutionProfileFromMods(path.statMods),
    skillMapping: path.skillMapping || {},
    addsSecondaryType: path.secondaryType ?? null,
    name: path.name,
  };
}

export function ranchTrainingGain(inst, line, baseGain, now = Date.now()) {
  const training = inst.training ?? {};
  const personalityId = inst.personalityId || inst.personality;
  const foodMul = activeTrainingFoodMultiplier(inst, line, now);
  const personalityMul = personalityTrainingMultiplier(personalityId, line);
  return trainingGain({
    baseGain: baseGain * foodMul * personalityMul,
    currentValue: training[line] ?? 0,
    aptitudeStars: inst.aptitude?.[line] ?? 3,
    condition: deriveCondition(inst),
    capacityRemaining: trainingCapacity(inst.level) - totalTrainingUsed(training),
  });
}

export function explainStat(inst, sp, path, equipmentFlat, stat) {
  const build = instanceCombatBuild(inst, sp, path, equipmentFlat);
  return statBreakdown(build, stat);
}

export function formatCrReport(inst, sp, path, equipmentFlat = null) {
  const { stats, breakdown, build } = computeCoreStats(inst, sp, path, equipmentFlat);
  const rated = combatRating(build);
  const derived = derivedStats(build);
  return { stats, breakdown, build, rated, derived };
}
