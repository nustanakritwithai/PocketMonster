import {
  MONSTER_STAT_KEYS,
  MONSTER_STAT_SOURCE_LIMITS,
} from './monster-stat-contract.mjs';
import { monsterStatCatalogEntry } from './monster-stat-catalog.mjs';

export const MONSTER_STAT_FORMULA_VERSION = 'monster-stat-formula/v1';
export const MONSTER_STAT_FORMULA_ACTIVATION = 'formula_ready';

export const DEFAULT_MONSTER_POTENTIAL = Object.freeze(Object.fromEntries(
  MONSTER_STAT_KEYS.map(stat => [stat, MONSTER_STAT_SOURCE_LIMITS.potential.default]),
));
export const EMPTY_MONSTER_TRAINING = Object.freeze(Object.fromEntries(
  MONSTER_STAT_KEYS.map(stat => [stat, 0]),
));

function failure(reason, field, value = null) {
  return Object.freeze({ ok: false, reason, field, value });
}

function validateInteger(value, { min, max }, field) {
  if (!Number.isInteger(value)) return failure('invalid_integer', field, value ?? null);
  if (value < min || value > max) return failure('out_of_range', field, value);
  return null;
}

function validateStatVector(vector, { min, max }, field) {
  if (!vector || typeof vector !== 'object' || Array.isArray(vector)) {
    return failure('invalid_stat_vector', field, vector ?? null);
  }
  const keys = Object.keys(vector);
  const unknownKey = keys.find(key => !MONSTER_STAT_KEYS.includes(key));
  if (unknownKey) return failure('unknown_stat', `${field}.${unknownKey}`, unknownKey);
  const missingKey = MONSTER_STAT_KEYS.find(stat => !Object.hasOwn(vector, stat));
  if (missingKey) return failure('missing_stat', `${field}.${missingKey}`, null);
  for (const stat of MONSTER_STAT_KEYS) {
    const invalid = validateInteger(vector[stat], { min, max }, `${field}.${stat}`);
    if (invalid) return invalid;
  }
  return null;
}

export function calculateMonsterStatValue({
  stat,
  baseStat,
  level,
  potential,
  training,
} = {}) {
  if (!MONSTER_STAT_KEYS.includes(stat)) return failure('unknown_stat', 'stat', stat ?? null);
  const baseError = validateInteger(baseStat, { min: 1, max: Number.MAX_SAFE_INTEGER }, 'baseStat');
  if (baseError) return baseError;
  const levelError = validateInteger(
    level,
    { min: MONSTER_STAT_SOURCE_LIMITS.level.min, max: MONSTER_STAT_SOURCE_LIMITS.level.max },
    'level',
  );
  if (levelError) return levelError;
  const potentialError = validateInteger(
    potential,
    { min: MONSTER_STAT_SOURCE_LIMITS.potential.min, max: MONSTER_STAT_SOURCE_LIMITS.potential.max },
    'potential',
  );
  if (potentialError) return potentialError;
  const trainingError = validateInteger(
    training,
    { min: 0, max: MONSTER_STAT_SOURCE_LIMITS.training.perStatMax },
    'training',
  );
  if (trainingError) return trainingError;

  const subtotal = (2 * baseStat) + potential + (training / MONSTER_STAT_SOURCE_LIMITS.training.divisor);
  const levelScaled = Math.floor((subtotal * level) / 100);
  const flatBonus = stat === 'hp' ? level + 10 : 5;
  return Object.freeze({
    ok: true,
    reason: null,
    stat,
    value: levelScaled + flatBonus,
    baseStat,
    level,
    potential,
    training,
    subtotal,
    levelScaled,
    flatBonus,
    formulaVersion: MONSTER_STAT_FORMULA_VERSION,
    activation: MONSTER_STAT_FORMULA_ACTIVATION,
  });
}

export function calculateMonsterStats({
  formId,
  level,
  potential = DEFAULT_MONSTER_POTENTIAL,
  training = EMPTY_MONSTER_TRAINING,
} = {}) {
  const form = monsterStatCatalogEntry(formId);
  if (!form) return failure('unknown_form_id', 'formId', formId ?? null);
  const levelError = validateInteger(
    level,
    { min: MONSTER_STAT_SOURCE_LIMITS.level.min, max: MONSTER_STAT_SOURCE_LIMITS.level.max },
    'level',
  );
  if (levelError) return levelError;
  const potentialError = validateStatVector(
    potential,
    { min: MONSTER_STAT_SOURCE_LIMITS.potential.min, max: MONSTER_STAT_SOURCE_LIMITS.potential.max },
    'potential',
  );
  if (potentialError) return potentialError;
  const trainingError = validateStatVector(
    training,
    { min: 0, max: MONSTER_STAT_SOURCE_LIMITS.training.perStatMax },
    'training',
  );
  if (trainingError) return trainingError;
  const trainingTotal = MONSTER_STAT_KEYS.reduce((total, stat) => total + training[stat], 0);
  if (trainingTotal > MONSTER_STAT_SOURCE_LIMITS.training.totalMax) {
    return failure('training_total_exceeded', 'training', trainingTotal);
  }

  const stats = {};
  const breakdown = {};
  for (const stat of MONSTER_STAT_KEYS) {
    const result = calculateMonsterStatValue({
      stat,
      baseStat: form.baseStats[stat],
      level,
      potential: potential[stat],
      training: training[stat],
    });
    if (!result.ok) return result;
    stats[stat] = result.value;
    breakdown[stat] = result;
  }
  return Object.freeze({
    ok: true,
    reason: null,
    formId: form.formId,
    runtimeSpeciesId: form.runtimeSpeciesId,
    level,
    potential: Object.freeze({ ...potential }),
    training: Object.freeze({ ...training }),
    trainingTotal,
    stats: Object.freeze(stats),
    breakdown: Object.freeze(breakdown),
    formulaVersion: MONSTER_STAT_FORMULA_VERSION,
    activation: MONSTER_STAT_FORMULA_ACTIVATION,
  });
}

export function calculateMonsterStat(input = {}) {
  if (!MONSTER_STAT_KEYS.includes(input.stat)) return failure('unknown_stat', 'stat', input.stat ?? null);
  const result = calculateMonsterStats(input);
  if (!result.ok) return result;
  return result.breakdown[input.stat];
}
