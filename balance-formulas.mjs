// Monster Life RPG — V7.1 Balance Foundation
// Deterministic, side-effect-free balance formulas. Every function reads its
// tunables from a balance config (defaults to BALANCE_CONFIG) so the engine can
// stay content-agnostic (Master Plan R1 "data-driven", R23 formulas layer).

import {
  BALANCE_CONFIG,
  WORKBOOK_CAPTURE_ADAPTER,
  WORKBOOK_EXP_ADAPTER,
  WORKBOOK_GROWTH_ADAPTER,
} from './balance-config.mjs';

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

function growthCurveDefinition(curve, config = BALANCE_CONFIG) {
  const curves = config.level?.curves ?? WORKBOOK_EXP_ADAPTER.curves;
  return Object.hasOwn(curves, curve) ? curves[curve] : null;
}

function growthCurveName(curve, config = BALANCE_CONFIG) {
  const candidate = typeof curve === 'string' ? curve : config.level?.defaultCurve;
  return growthCurveDefinition(candidate, config) ? candidate : null;
}

function cumulativeForCurve(level, curve, config = BALANCE_CONFIG) {
  const definition = growthCurveDefinition(curve, config);
  if (!definition) return null;
  return Math.round(((level ** definition.exponent) - 1) * definition.multiplier);
}

// EXP required to advance FROM the given level to the next one.
export function expToNext(level, config = BALANCE_CONFIG, curve = config.level?.defaultCurve) {
  const { min, cap } = config.level;
  const L = clamp(Math.floor(level), min, cap);
  const canonicalCurve = growthCurveName(curve, config);
  if (!canonicalCurve) return 0;
  if (L >= cap) return 0;
  return cumulativeForCurve(L + 1, canonicalCurve, config) - cumulativeForCurve(L, canonicalCurve, config);
}

// Total accumulated Growth EXP required to REACH the given level from level 1.
export function cumulativeExpToLevel(level, config = BALANCE_CONFIG, curve = config.level?.defaultCurve) {
  const { min, cap } = config.level;
  const target = clamp(Math.floor(level), min, cap);
  const canonicalCurve = growthCurveName(curve, config);
  return canonicalCurve ? cumulativeForCurve(target, canonicalCurve, config) : 0;
}

// Resolve a level (and leftover EXP into the current level) from total Growth EXP.
export function levelFromTotalExp(totalExp, config = BALANCE_CONFIG, curve = config.level?.defaultCurve) {
  const { min, cap } = config.level;
  const total = Number.isFinite(totalExp) && totalExp > 0 ? totalExp : 0;
  const canonicalCurve = growthCurveName(curve, config);
  if (!canonicalCurve) {
    return { level: min, expIntoLevel: 0, expToNext: 0, atCap: false, overflowExp: 0, curve: null };
  }
  let level = min;
  while (level < cap && cumulativeForCurve(level + 1, canonicalCurve, config) <= total) level += 1;
  const threshold = cumulativeForCurve(level, canonicalCurve, config);
  const atCap = level >= cap;
  return {
    level,
    expIntoLevel: atCap ? 0 : Math.round(total - threshold),
    expToNext: atCap ? 0 : cumulativeForCurve(level + 1, canonicalCurve, config) - total,
    atCap,
    overflowExp: atCap ? Math.max(0, Math.round(total - threshold)) : 0,
    curve: canonicalCurve,
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

// Workbook v2.1 EXP curve and reward formulas used by the live M7 runtime.
export function calculateWorkbookExpCurvePreview({
  curve = 'Medium',
  level = WORKBOOK_EXP_ADAPTER.sourceLevel.min,
} = {}, adapter = WORKBOOK_EXP_ADAPTER) {
  const definition = Object.hasOwn(adapter.curves, curve) ? adapter.curves[curve] : null;
  if (!definition) return Object.freeze({ ok: false, reason: 'unknown_id', curve: curve ?? null });
  const boundedLevel = clamp(Math.floor(level), adapter.sourceLevel.min, adapter.sourceLevel.cap);
  const rawCumulative = (boundedLevel ** definition.exponent - 1) * definition.multiplier;
  const cumulative = Math.round(rawCumulative);
  const atSourceCap = boundedLevel >= adapter.sourceLevel.cap;
  const rawToNext = atSourceCap
    ? 0
    : (((boundedLevel + 1) ** definition.exponent - 1) * definition.multiplier) - rawCumulative;
  return Object.freeze({
    ok: true,
    reason: null,
    curve,
    level: boundedLevel,
    cumulative,
    toNext: atSourceCap ? 0 : Math.round(rawToNext),
    atSourceCap,
    activation: adapter.activation,
    runtimeEligible: adapter.runtimeEligible,
    levelCapDecision: adapter.levelCapDecision,
    curveDecision: adapter.curveDecision,
  });
}

export function workbookLevelDifferenceMultiplier(enemyLevel, monsterLevel, adapter = WORKBOOK_EXP_ADAPTER) {
  const enemy = clamp(Math.floor(enemyLevel), adapter.sourceLevel.min, adapter.sourceLevel.cap);
  const monster = clamp(Math.floor(monsterLevel), adapter.sourceLevel.min, adapter.sourceLevel.cap);
  const difference = enemy - monster;
  return adapter.reward.levelDifferenceBands.find(band => difference >= band.minimum)?.multiplier
    ?? adapter.reward.levelDifferenceFallback;
}

export function calculateWorkbookBattleExpPreview({
  baseExpYield = 0,
  enemyLevel = WORKBOOK_EXP_ADAPTER.sourceLevel.min,
  monsterLevel = WORKBOOK_EXP_ADAPTER.sourceLevel.min,
  variant = 'Normal',
  participation = 'Active',
  extraMultiplier = WORKBOOK_EXP_ADAPTER.reward.extraMultiplier.default,
} = {}, adapter = WORKBOOK_EXP_ADAPTER) {
  if (!Object.hasOwn(adapter.reward.variants, variant)) {
    return Object.freeze({ ok: false, reason: 'unknown_id', field: 'variant', value: variant ?? null });
  }
  if (!Object.hasOwn(adapter.reward.participation, participation)) {
    return Object.freeze({ ok: false, reason: 'unknown_id', field: 'participation', value: participation ?? null });
  }
  const base = Math.max(0, Number.isFinite(baseExpYield) ? baseExpYield : 0);
  const enemy = clamp(Math.floor(enemyLevel), adapter.sourceLevel.min, adapter.sourceLevel.cap);
  const monster = clamp(Math.floor(monsterLevel), adapter.sourceLevel.min, adapter.sourceLevel.cap);
  const extra = clamp(
    Number.isFinite(extraMultiplier) ? extraMultiplier : adapter.reward.extraMultiplier.default,
    adapter.reward.extraMultiplier.min,
    adapter.reward.extraMultiplier.max,
  );
  const levelDifference = enemy - monster;
  const levelDifferenceMultiplier = workbookLevelDifferenceMultiplier(enemy, monster, adapter);
  const variantMultiplier = adapter.reward.variants[variant];
  const participationMultiplier = adapter.reward.participation[participation];
  const rawReward = (base * enemy / adapter.reward.baseExpDivisor)
    * levelDifferenceMultiplier
    * variantMultiplier
    * participationMultiplier
    * extra;
  return Object.freeze({
    ok: true,
    reason: null,
    reward: Math.floor(rawReward),
    rawReward,
    baseExpYield: base,
    enemyLevel: enemy,
    monsterLevel: monster,
    levelDifference,
    levelDifferenceMultiplier,
    variant,
    variantMultiplier,
    participation,
    participationMultiplier,
    extraMultiplier: extra,
    activation: adapter.activation,
    runtimeEligible: adapter.runtimeEligible,
  });
}

export function resolveWorkbookExpProgress({ curve = 'Medium', totalExp = 0 } = {}, adapter = WORKBOOK_EXP_ADAPTER) {
  const curveCheck = calculateWorkbookExpCurvePreview({ curve, level: adapter.sourceLevel.min }, adapter);
  if (!curveCheck.ok) return curveCheck;
  const total = Math.max(0, Math.floor(Number.isFinite(totalExp) ? totalExp : 0));
  let level = adapter.sourceLevel.min;
  for (let candidate = adapter.sourceLevel.min + 1; candidate <= adapter.sourceLevel.cap; candidate += 1) {
    const threshold = calculateWorkbookExpCurvePreview({ curve, level: candidate }, adapter).cumulative;
    if (threshold > total) break;
    level = candidate;
  }
  const current = calculateWorkbookExpCurvePreview({ curve, level }, adapter);
  const atSourceCap = level >= adapter.sourceLevel.cap;
  const nextCumulative = atSourceCap
    ? current.cumulative
    : calculateWorkbookExpCurvePreview({ curve, level: level + 1 }, adapter).cumulative;
  const expIntoLevel = total - current.cumulative;
  return Object.freeze({
    ok: true,
    reason: null,
    curve,
    totalExp: total,
    level,
    cumulativeAtLevel: current.cumulative,
    expIntoLevel,
    expToNext: atSourceCap ? 0 : Math.max(0, nextCumulative - total),
    atSourceCap,
    overflowExp: atSourceCap ? expIntoLevel : 0,
    activation: adapter.activation,
    runtimeEligible: adapter.runtimeEligible,
  });
}

export function resolveWorkbookExpAward({
  awardId,
  currentTotalExp = 0,
  appliedAwardIds = [],
  ...rewardInput
} = {}, adapter = WORKBOOK_EXP_ADAPTER) {
  const normalizedAwardId = typeof awardId === 'string' ? awardId.trim() : '';
  if (!normalizedAwardId) {
    return Object.freeze({ ok: false, reason: 'invalid_award_id', applied: false, reward: 0 });
  }
  if (!Array.isArray(appliedAwardIds)) {
    return Object.freeze({ ok: false, reason: 'invalid_state', applied: false, reward: 0, awardId: normalizedAwardId });
  }
  const ledger = Object.freeze([...new Set(appliedAwardIds
    .filter(id => typeof id === 'string' && id.trim())
    .map(id => id.trim()))]);
  const total = Math.max(0, Math.floor(Number.isFinite(currentTotalExp) ? currentTotalExp : 0));
  if (ledger.includes(normalizedAwardId)) {
    return Object.freeze({
      ok: false,
      reason: 'duplicate_award',
      applied: false,
      awardId: normalizedAwardId,
      reward: 0,
      previousTotalExp: total,
      newTotalExp: total,
      appliedAwardIds: ledger,
    });
  }
  const preview = calculateWorkbookBattleExpPreview(rewardInput, adapter);
  if (!preview.ok) return Object.freeze({ ...preview, applied: false, awardId: normalizedAwardId, reward: 0 });
  const newTotalExp = total + preview.reward;
  const progress = resolveWorkbookExpProgress({ curve: rewardInput.curve ?? 'Medium', totalExp: newTotalExp }, adapter);
  if (!progress.ok) return Object.freeze({ ...progress, applied: false, awardId: normalizedAwardId, reward: 0 });
  return Object.freeze({
    ok: true,
    reason: null,
    applied: true,
    awardId: normalizedAwardId,
    reward: preview.reward,
    previousTotalExp: total,
    newTotalExp,
    appliedAwardIds: Object.freeze([...ledger, normalizedAwardId]),
    preview,
    progress,
    activation: adapter.activation,
    runtimeEligible: adapter.runtimeEligible,
  });
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

// Workbook v2.1 stat formula exposed as a calculator-only compatibility seam.
// It does not replace the live HP/ATK/DEF/SPD formula or activate SPATK/SPDEF.
export function calculateWorkbookGrowthPreview({
  stat,
  baseStat = 0,
  level = WORKBOOK_GROWTH_ADAPTER.sourceLevel.min,
  potential = WORKBOOK_GROWTH_ADAPTER.potential.default,
  training = 0,
} = {}, adapter = WORKBOOK_GROWTH_ADAPTER) {
  if (!adapter.sourceStats.includes(stat)) {
    return Object.freeze({ ok: false, reason: 'unknown_id', stat: stat ?? null });
  }
  const boundedBase = Math.max(0, Number.isFinite(baseStat) ? baseStat : 0);
  const boundedLevel = clamp(Math.floor(level), adapter.sourceLevel.min, adapter.sourceLevel.cap);
  const boundedPotential = clamp(Math.floor(potential), adapter.potential.min, adapter.potential.max);
  const boundedTraining = clamp(training, 0, adapter.training.perStatMax);
  const subtotal = 2 * boundedBase + boundedPotential + boundedTraining / adapter.training.divisor;
  const levelScaled = Math.floor(subtotal * boundedLevel / 100);
  const flatBonus = stat === 'hp' ? boundedLevel + 10 : 5;
  return Object.freeze({
    ok: true,
    reason: null,
    stat,
    value: levelScaled + flatBonus,
    baseStat: boundedBase,
    level: boundedLevel,
    potential: boundedPotential,
    training: boundedTraining,
    subtotal,
    levelScaled,
    flatBonus,
    activation: adapter.activation,
    runtimeEligible: adapter.activeRuntimeStats.includes(stat),
    statModelDecision: adapter.statModelDecision,
  });
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

// A26 / CAP_v1.0 calculator seam. This does not replace the legacy live formula
// until A27 wires the full capture transaction and its exactly-once guards.
export function captureHpFactorV1(hpRatio, config = WORKBOOK_CAPTURE_ADAPTER) {
  const ratio = Number.isFinite(hpRatio) ? hpRatio : 1;
  const raw = config.hpFactor.base + config.hpFactor.slope * (1 - ratio);
  return clamp(raw, config.hpFactor.min, config.hpFactor.max);
}

export function captureFinalChancePctV1(rawChancePct, config = WORKBOOK_CAPTURE_ADAPTER) {
  if (!Number.isFinite(rawChancePct) || rawChancePct <= 0) return 0;
  return clamp(rawChancePct, config.minChancePct, config.maxChancePct);
}

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
