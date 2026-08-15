// Monster Life RPG — V7.1 Balance Foundation
// Deterministic, side-effect-free balance formulas. Every function reads its
// tunables from a balance config (defaults to BALANCE_CONFIG) so the engine can
// stay content-agnostic (Master Plan R1 "data-driven", R23 formulas layer).

import { BALANCE_CONFIG } from './balance-config.mjs';

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeConditionKey(condition) {
  if (typeof condition !== 'string') return 'normal';
  const key = condition.trim().toLowerCase();
  return key === 'sore' ? 'bad' : key;
}

// ---------------------------------------------------------------------------
// R2 — Growth EXP and level curve
// ---------------------------------------------------------------------------

// EXP required to advance FROM the given level to the next one.
export function expToNext(level, config = BALANCE_CONFIG) {
  const { min, cap, exp } = config.level;
  const L = clamp(Math.floor(level), min, cap);
  if (L >= cap) return Infinity; // Cap: further growth becomes Career/Mastery reward.
  return Math.round(exp.base + exp.linear * L + exp.quadratic * L * L);
}

// Total accumulated Growth EXP required to REACH the given level from level 1.
export function cumulativeExpToLevel(level, config = BALANCE_CONFIG) {
  const { min, cap } = config.level;
  const target = clamp(Math.floor(level), min, cap);
  let total = 0;
  for (let L = min; L < target; L++) total += expToNext(L, config);
  return total;
}

// Resolve a level (and leftover EXP into the current level) from total Growth EXP.
export function levelFromTotalExp(totalExp, config = BALANCE_CONFIG) {
  const { min, cap } = config.level;
  const total = Number.isFinite(totalExp) && totalExp > 0 ? totalExp : 0;
  let level = min;
  let remaining = total;
  while (level < cap) {
    const need = expToNext(level, config);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }
  return {
    level,
    expIntoLevel: level >= cap ? 0 : Math.round(remaining),
    expToNext: level >= cap ? Infinity : expToNext(level, config),
    atCap: level >= cap,
  };
}

// C4 / R2 — Relative-level Growth EXP modifier. Piecewise around |d| <= 5.
export function relativeLevelExpModifier(enemyLevel, monsterLevel, config = BALANCE_CONFIG) {
  const cfg = config.relativeExp;
  const d = Math.floor(enemyLevel) - Math.floor(monsterLevel);
  if (d <= cfg.floorAtOrBelow) return cfg.min;
  if (d >= cfg.capAtOrAbove) return cfg.max;
  return clamp(1 + cfg.slopePerLevel * d, cfg.min, cfg.max);
}

// ---------------------------------------------------------------------------
// R3 — Training capacity, diminishing return, gain
// ---------------------------------------------------------------------------

export function trainingCapacity(level, config = BALANCE_CONFIG) {
  const { min, cap } = config.level;
  const L = clamp(Math.floor(level), min, cap);
  const { base, perLevel } = config.training.capacity;
  return base + perLevel * L;
}

// Sum of the 5 training lines against the shared capacity pool (R3 Single Budget).
export function totalTrainingUsed(training = {}, config = BALANCE_CONFIG) {
  return config.training.lines.reduce((sum, line) => {
    const value = Number(training[line]);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}

export function trainingCapacityRemaining(level, training = {}, config = BALANCE_CONFIG) {
  return trainingCapacity(level, config) - totalTrainingUsed(training, config);
}

// Diminishing multiplier based on the current value of the line being trained.
export function diminishingMultiplier(currentValue, config = BALANCE_CONFIG) {
  const value = Number.isFinite(currentValue) && currentValue > 0 ? currentValue : 0;
  for (const band of config.training.diminishing) {
    if (value < band.upTo) return band.multiplier;
  }
  return config.training.overflowMultiplier;
}

export function aptitudeMultiplier(stars, config = BALANCE_CONFIG) {
  const key = clamp(Math.round(stars), 1, 5);
  return config.training.aptitude[key] ?? 1.0;
}

export function conditionTrainingMultiplier(condition, config = BALANCE_CONFIG) {
  const band = config.condition[normalizeConditionKey(condition)] ?? config.condition.normal;
  return band.training;
}

// Additive combat modifier from condition (e.g. +0.05 for Excellent, -0.15 for Bad).
export function conditionCombatModifier(condition, config = BALANCE_CONFIG) {
  const band = config.condition[normalizeConditionKey(condition)] ?? config.condition.normal;
  return band.combat;
}

// R3 — gain = baseGain × aptitude × condition × foodBuff × facility × diminishing.
export function trainingGain({
  baseGain,
  currentValue = 0,
  aptitudeStars = 3,
  condition = 'normal',
  foodBuff = 1,
  facility = 1,
  capacityRemaining = Infinity,
} = {}, config = BALANCE_CONFIG) {
  const base = Number.isFinite(baseGain) && baseGain > 0 ? baseGain : 0;
  const raw =
    base *
    aptitudeMultiplier(aptitudeStars, config) *
    conditionTrainingMultiplier(condition, config) *
    (Number.isFinite(foodBuff) && foodBuff > 0 ? foodBuff : 1) *
    (Number.isFinite(facility) && facility > 0 ? facility : 1) *
    diminishingMultiplier(currentValue, config);
  // Never let training gain exceed the shared capacity pool (Single Budget rule).
  const room = Number.isFinite(capacityRemaining) ? Math.max(0, capacityRemaining) : raw;
  return Math.min(raw, room);
}

// ---------------------------------------------------------------------------
// R5 — Core stat model
// ---------------------------------------------------------------------------

export function geneModifier(rank, config = BALANCE_CONFIG) {
  if (typeof rank !== 'string') return 1.0;
  return config.gene[rank.trim().toUpperCase()] ?? 1.0;
}

// raw = speciesBase + levelGrowth + training + nutritionFlat + equipmentFlat.
export function coreStatRaw({
  speciesBase = 0,
  levelGrowth = 0,
  training = 0,
  nutritionFlat = 0,
  equipmentFlat = 0,
} = {}) {
  return (
    Number(speciesBase || 0) +
    Number(levelGrowth || 0) +
    Number(training || 0) +
    Number(nutritionFlat || 0) +
    Number(equipmentFlat || 0)
  );
}

// final = round(raw × geneModifier × evolutionProfile × conditionModifier).
export function coreStatFinal({
  raw,
  geneRank = 'B',
  evolutionProfile = 1,
  condition = 'normal',
} = {}, config = BALANCE_CONFIG) {
  const base = Number.isFinite(raw) ? raw : coreStatRaw(raw ?? {});
  const conditionModifier = 1 + conditionCombatModifier(condition, config);
  const evo = Number.isFinite(evolutionProfile) && evolutionProfile > 0 ? evolutionProfile : 1;
  return Math.round(base * geneModifier(geneRank, config) * evo * conditionModifier);
}

// ---------------------------------------------------------------------------
// R6 — Damage pipeline / defense scaling
// ---------------------------------------------------------------------------

export function defenseK(level, config = BALANCE_CONFIG) {
  const L = Math.floor(level);
  for (const band of config.defense.kByLevelBand) {
    if (L <= band.upToLevel) return band.k;
  }
  return config.defense.fallbackK;
}

// damageMultiplier = K / (K + DEF); effectiveReduction hard-capped (default 70%).
export function defenseMitigation(def, level, config = BALANCE_CONFIG) {
  const K = defenseK(level, config);
  const defense = Number.isFinite(def) && def > 0 ? def : 0;
  const rawMultiplier = K / (K + defense);
  const cap = config.defense.hardCapReduction;
  const damageMultiplier = Math.max(1 - cap, rawMultiplier);
  return {
    K,
    damageMultiplier,
    effectiveReduction: 1 - damageMultiplier,
  };
}

// Effective HP: how much raw damage the mob can absorb given its DEF mitigation.
export function effectiveHp(hp, def, level, config = BALANCE_CONFIG) {
  const { damageMultiplier } = defenseMitigation(def, level, config);
  const health = Number.isFinite(hp) && hp > 0 ? hp : 0;
  return health / damageMultiplier;
}

export function clampDerived(kind, value, config = BALANCE_CONFIG) {
  const spec = config.derived[kind];
  if (!spec) return value;
  const base = spec.base ?? 0;
  const v = Number.isFinite(value) ? value : base;
  return clamp(v, 0, spec.hard);
}

// ---------------------------------------------------------------------------
// R14 — Capture chance
// ---------------------------------------------------------------------------

// Interpolate hpFactor from the descending target-HP table.
export function captureHpFactor(hpRatio, config = BALANCE_CONFIG) {
  const table = config.capture.hpFactorTable;
  const ratio = clamp(hpRatio, 0, 1);
  const highest = table[0];
  if (ratio >= highest.hpRatio) return highest.factor;
  const lowest = table[table.length - 1];
  if (ratio <= lowest.hpRatio) return lowest.factor;
  for (let i = 0; i < table.length - 1; i++) {
    const upper = table[i];
    const lower = table[i + 1];
    if (ratio <= upper.hpRatio && ratio >= lower.hpRatio) {
      const span = upper.hpRatio - lower.hpRatio;
      const t = span === 0 ? 0 : (ratio - lower.hpRatio) / span;
      return lower.factor + (upper.factor - lower.factor) * t;
    }
  }
  return lowest.factor;
}

// chance = clamp(min, max, speciesRate × hpFactor × ball × status × level × tier).
export function captureChance({
  speciesRate = 0.4,
  hpRatio = 1.0,
  ballModifier = 1.0,
  statusModifier = 1.0,
  levelModifier = 1.0,
  tierModifier = 1.0,
} = {}, config = BALANCE_CONFIG) {
  const { minChance, maxChance } = config.capture;
  if (tierModifier <= 0) return 0; // Boss / uncapturable.
  const raw =
    speciesRate *
    captureHpFactor(hpRatio, config) *
    ballModifier *
    statusModifier *
    levelModifier *
    tierModifier;
  return clamp(raw, minChance, maxChance);
}
