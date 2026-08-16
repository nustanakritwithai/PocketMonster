// Monster Life RPG — V8.0 live-loop adapters
// Connects the data-driven V7.x modules to the playable instance shape without
// Three.js / DOM coupling so the same path can be unit-tested (R19, R24).

import { BALANCE_CONFIG } from './balance-config.mjs';
import {
  captureChance as formulaCaptureChance,
  cumulativeExpToLevel,
  defenseMitigation,
  trainingCapacity,
  trainingGain,
  totalTrainingUsed,
} from './balance-formulas.mjs';
import { DEFAULT_CONVERSION, finalStats, statBreakdown } from './combat-rating.mjs';
import { nutritionFlat } from './food-care.mjs';
import { deriveCondition } from './monster-instance.mjs';

export const LEVEL_GROWTH_SCALE = Object.freeze({ hp: 0.14, atk: 0.08, def: 0.08, spd: 0.05 });

export const STARTER_EQUIPMENT = Object.freeze([
  Object.freeze({ id: 'ranch_band', slot: 'gear', name: 'Ranch Band', affixes: Object.freeze([Object.freeze({ group: 'atk', stat: 'atk', value: 2 })]) }),
  Object.freeze({ id: 'guard_charm', slot: 'charm', name: 'Guard Charm', affixes: Object.freeze([Object.freeze({ group: 'def', stat: 'def', value: 2 })]) }),
  Object.freeze({ id: 'swift_lens', slot: 'utility', name: 'Swift Lens', affixes: Object.freeze([Object.freeze({ group: 'spd', stat: 'spd', value: 1 })]) }),
]);

export function speciesRatingProfile(sp) {
  const base = sp?.base ?? { hp: 1, atk: 1, def: 1, spd: 1 };
  return {
    id: sp?.id,
    base,
    growthPerLevel: {
      hp: base.hp * LEVEL_GROWTH_SCALE.hp,
      atk: base.atk * LEVEL_GROWTH_SCALE.atk,
      def: base.def * LEVEL_GROWTH_SCALE.def,
      spd: base.spd * LEVEL_GROWTH_SCALE.spd,
    },
    conversion: DEFAULT_CONVERSION,
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

export function growthExpForLevel(level) {
  return cumulativeExpToLevel(level);
}

export function liveCaptureChance({
  speciesRate,
  hpRatio,
  elite = false,
  uncapturable = false,
  eliteModifier = BALANCE_CONFIG.capture.bossTierModifier === 0 ? 0.34 : 0.34,
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
} = {}) {
  const mitigation = defenseMitigation(def, defenderLevel);
  const power = Number.isFinite(movePower) ? movePower : 0;
  const base = (power + atk * 0.75 * atkBuff) * (1 + (Math.max(1, attackerLevel) - 1) * 0.025);
  const mastery = 1 + (Number.isFinite(masteryPower) ? masteryPower : 0);
  const damage = Math.max(
    effectiveness === 0 ? 0 : 1,
    Math.round(base * mitigation.damageMultiplier * stab * effectiveness * mastery * traitBonus),
  );
  return { damage, stab, eff: effectiveness, mitigation };
}

export function evoDefFromPath(path, speciesId) {
  const req = path?.requires || {};
  const required = [];
  if (req.level) required.push({ field: 'level', op: 'gte', value: req.level });
  if (req.bond) required.push({ field: 'bond', op: 'gte', value: req.bond });
  if (req.trainingFocus) required.push({ field: 'trainingFocus', op: 'eq', value: req.trainingFocus });
  return {
    id: path.id,
    fromFormId: speciesId,
    toFormId: path.id,
    requirements: { required },
    profile: evolutionProfileFromMods(path.statMods),
    skillMapping: {},
    addsSecondaryType: path.secondaryType ?? null,
    name: path.name,
  };
}

export function ranchTrainingGain(inst, line, baseGain) {
  const training = inst.training ?? {};
  return trainingGain({
    baseGain,
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
