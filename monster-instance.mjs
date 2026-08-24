// Monster Life RPG — V7.2 Raising Progression Core
// The Monster Instance is the primary data unit (R1, R18). This module defines
// its schema, save migration from the V7.0.x shape, EXP→level application, the
// shared training pool, and Body/Mind offline simulation (R11). It is a pure data
// layer with no engine/UI coupling (R19, R24).

import { BALANCE_CONFIG } from './balance-config.mjs';
import { monsterCatalogEntry } from './monster-catalog.mjs';
import { MONSTER_STAT_KEYS, MONSTER_STAT_SOURCE_LIMITS } from './monster-stat-contract.mjs';
import { monsterStatCatalogEntry } from './monster-stat-catalog.mjs';
import { defaultPassiveIdForSpecies, isPassiveEligibleForSpecies } from './passive-catalog.mjs';
import { skillCatalogEntry } from './skill-catalog.mjs';
import { createRng } from './rng.mjs';
import {
  levelFromTotalExp,
  cumulativeExpToLevel,
  trainingCapacity,
  totalTrainingUsed,
  clamp,
} from './balance-formulas.mjs';

export const INSTANCE_SAVE_VERSION = 15;
export const INSTANCE_STAT_SCHEMA_VERSION = 'monster-instance-stats/v1';
export const INSTANCE_EXP_SCHEMA_VERSION = 'workbook-exp/v1';
export const TRAINING_LINES = Object.freeze(['power', 'defense', 'speed', 'technique', 'spirit']);
export const CORE_GENES = Object.freeze(['hp', 'atk', 'def', 'spd']);
export const INSTANCE_POTENTIAL_STATS = MONSTER_STAT_KEYS;
export const INSTANCE_POTENTIAL_LIMITS = Object.freeze({ min: 0, max: 31 });
export const INSTANCE_STAT_TRAINING_MAP = Object.freeze({
  hp: null,
  atk: 'power',
  def: 'defense',
  spAtk: 'technique',
  spDef: 'spirit',
  spd: 'speed',
});
export const INSTANCE_BREEDING_VERSION = 'BRD_v1.0';
export const TRANSIENT_COOLDOWN_FIELDS = Object.freeze([
  'cooldownRemaining',
  'cooldownRemainingMs',
  'skillCds',
]);
export const TRANSIENT_PASSIVE_FIELDS = Object.freeze([
  'passive',
  'passiveEventState',
  'passiveEventStates',
  'passiveEventLedger',
  'passiveEventLedgers',
  'passiveRuntimeState',
  'passiveRuntimeStates',
  'processedEventIds',
  'eventFingerprintById',
]);

// Body/Mind passive drift per hour while the game is closed (R11). No death.
export const LIFE_RATES = Object.freeze({
  offlineCapHours: 10,
  hungerPerHour: -6,
  energyPerHour: 5,
  stressPerHour: -4,
  fitnessPerHour: -0.5,
  healthPerHour: 3,
  moodBaseline: 60,
  moodReversionPerHour: 0.2,
  hungerMoodPenaltyBelow: 25,
});

// Condition is derived from Energy + Stress + Health, never rolled blindly (R11).
export const CONDITION_BANDS = Object.freeze([
  Object.freeze({ min: 88, key: 'excellent' }),
  Object.freeze({ min: 72, key: 'good' }),
  Object.freeze({ min: 52, key: 'normal' }),
  Object.freeze({ min: 36, key: 'tired' }),
  Object.freeze({ min: 20, key: 'fatigued' }),
  Object.freeze({ min: -Infinity, key: 'bad' }),
]);
const CONDITION_ORDER = Object.freeze(['excellent', 'good', 'normal', 'tired', 'fatigued', 'bad']);

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp100(value, fallback = 0) {
  return clamp(num(value, fallback), 0, 100);
}

function legacyCumulativeExpToLevel(level) {
  const target = clamp(Math.floor(num(level, 1)), 1, 50);
  let total = 0;
  for (let current = 1; current < target; current += 1) {
    total += Math.round(60 + (20 * current) + (4 * current * current));
  }
  return total;
}

function legacyLevelFromTotalExp(totalExp) {
  const total = Math.max(0, num(totalExp, 0));
  let level = 1;
  while (level < 50 && legacyCumulativeExpToLevel(level + 1) <= total) level += 1;
  return level;
}

function normalizeGrowthAwardIds(raw) {
  return [...new Set((Array.isArray(raw) ? raw : [])
    .filter(id => typeof id === 'string' && id.trim())
    .map(id => id.trim()))];
}

export function canonicalGrowthProfile(source = {}) {
  const formId = canonicalFormIdForInstance(source);
  const form = monsterStatCatalogEntry(formId);
  if (!form) return Object.freeze({ ok: false, reason: 'unknown_canonical_form', formId, growthCurve: null, baseExpYield: null });
  return Object.freeze({
    ok: true,
    reason: null,
    formId,
    growthCurve: form.growthCurve,
    baseExpYield: form.baseExpYield,
    activation: 'runtime_live',
  });
}

export function migrateLegacyGrowthExp({ level = 1, totalExp = 0, growthCurve = 'Medium' } = {}) {
  const declaredLevel = clamp(Math.floor(num(level, 1)), 1, 50);
  const rawTotal = Math.max(0, Math.floor(num(totalExp, 0)));
  const effectiveLevel = Math.max(declaredLevel, legacyLevelFromTotalExp(rawTotal));
  const legacyAtLevel = legacyCumulativeExpToLevel(effectiveLevel);
  const canonicalAtLevel = cumulativeExpToLevel(effectiveLevel, BALANCE_CONFIG, growthCurve);
  if (effectiveLevel >= 50) {
    return canonicalAtLevel + Math.max(0, rawTotal - legacyAtLevel);
  }
  const legacyNext = legacyCumulativeExpToLevel(effectiveLevel + 1);
  const canonicalNext = cumulativeExpToLevel(effectiveLevel + 1, BALANCE_CONFIG, growthCurve);
  const progress = clamp((rawTotal - legacyAtLevel) / Math.max(1, legacyNext - legacyAtLevel), 0, 1);
  return Math.round(canonicalAtLevel + (progress * (canonicalNext - canonicalAtLevel)));
}

function persistedPotentialValue(raw, stat) {
  if (stat === 'spAtk') return raw?.spAtk ?? raw?.spatk;
  if (stat === 'spDef') return raw?.spDef ?? raw?.spdef;
  return raw?.[stat];
}

function persistedStatValue(raw, stat) {
  if (stat === 'spAtk') return raw?.spAtk ?? raw?.spatk;
  if (stat === 'spDef') return raw?.spDef ?? raw?.spdef;
  return raw?.[stat];
}

function deterministicPotentialRoll(instanceId, stat) {
  return createRng(`monster-instance-v10:${String(instanceId)}:${stat}`)
    .int(INSTANCE_POTENTIAL_LIMITS.min, INSTANCE_POTENTIAL_LIMITS.max);
}

// Runtime uses camel-case special-stat keys while Workbook persistence uses
// `spatk`/`spdef`. Missing legacy values receive a stable per-instance roll so
// repeated migration/reload can never reroll a monster's immutable Potential.
export function normalizeInstancePotential(raw, instanceId) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const potential = {};
  for (const stat of INSTANCE_POTENTIAL_STATS) {
    const value = persistedPotentialValue(source, stat);
    potential[stat] = Number.isInteger(value)
      && value >= INSTANCE_POTENTIAL_LIMITS.min
      && value <= INSTANCE_POTENTIAL_LIMITS.max
      ? value
      : deterministicPotentialRoll(instanceId, stat);
  }
  return potential;
}

export function potentialForPersistence(raw, instanceId) {
  const potential = normalizeInstancePotential(raw, instanceId);
  return {
    hp: potential.hp,
    atk: potential.atk,
    def: potential.def,
    spatk: potential.spAtk,
    spdef: potential.spDef,
    spd: potential.spd,
  };
}

export function normalizeInstanceStatTraining(raw, legacyTraining = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const legacy = legacyTraining && typeof legacyTraining === 'object' && !Array.isArray(legacyTraining)
    ? legacyTraining
    : {};
  const training = {};
  let remaining = MONSTER_STAT_SOURCE_LIMITS.training.totalMax;
  for (const stat of MONSTER_STAT_KEYS) {
    const canonicalValue = persistedStatValue(source, stat);
    const legacyLine = INSTANCE_STAT_TRAINING_MAP[stat];
    const legacyValue = legacyLine ? legacy[legacyLine] : 0;
    const candidate = Number.isFinite(canonicalValue) ? canonicalValue : legacyValue;
    const bounded = clamp(
      Math.floor(Number.isFinite(candidate) ? candidate : 0),
      0,
      MONSTER_STAT_SOURCE_LIMITS.training.perStatMax,
    );
    training[stat] = Math.min(bounded, remaining);
    remaining -= training[stat];
  }
  return training;
}

export function statTrainingForPersistence(raw, legacyTraining = {}) {
  const training = normalizeInstanceStatTraining(raw, legacyTraining);
  return {
    hp: training.hp,
    atk: training.atk,
    def: training.def,
    spatk: training.spAtk,
    spdef: training.spDef,
    spd: training.spd,
  };
}

export function canonicalFormIdForInstance(source = {}) {
  const mapping = monsterCatalogEntry(source?.speciesId);
  if (!mapping) return null;
  if (source.canonicalFormId === mapping.workbookBaseMonsterId
    || source.canonicalFormId === mapping.workbookStage2MonsterId) {
    return source.canonicalFormId;
  }
  if (source.formId === mapping.workbookStage2MonsterId) return mapping.workbookStage2MonsterId;
  if (source.formId === mapping.workbookBaseMonsterId) return mapping.workbookBaseMonsterId;
  const hasEvolutionPath = typeof source.evolutionPath === 'string' && source.evolutionPath.length > 0;
  const hasEvolutionHistory = Array.isArray(source.evolutionHistory) && source.evolutionHistory.length > 0;
  return hasEvolutionPath || hasEvolutionHistory
    ? mapping.workbookStage2MonsterId
    : mapping.workbookBaseMonsterId;
}

function withoutTransientCooldownFields(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const copy = { ...raw };
  for (const field of TRANSIENT_COOLDOWN_FIELDS) delete copy[field];
  for (const field of TRANSIENT_PASSIVE_FIELDS) delete copy[field];
  return copy;
}

function normalizedPassiveId(source) {
  const defaultPassiveId = defaultPassiveIdForSpecies(source?.speciesId);
  if (!defaultPassiveId) return null;
  return isPassiveEligibleForSpecies(source.speciesId, source.passiveId)
    ? source.passiveId
    : defaultPassiveId;
}

export function normalizeOwnedSkillRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const record = withoutTransientCooldownFields(raw);
  const definition = skillCatalogEntry(record.skillId);
  if (definition) {
    const sourceUses = record.currentUses;
    record.currentUses = sourceUses == null
      ? definition.maxUses
      : Number.isFinite(sourceUses)
        ? clamp(Math.floor(sourceUses), 0, definition.maxUses)
        : 0;
  } else if ('currentUses' in record) {
    record.currentUses = Number.isFinite(record.currentUses)
      ? Math.max(0, Math.floor(record.currentUses))
      : 0;
  }
  return record;
}

export function sanitizeMonsterInstanceForPersistence(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const instance = withoutTransientCooldownFields(raw);
  instance.skills = Array.isArray(raw.skills)
    ? raw.skills.map(normalizeOwnedSkillRecord)
    : [];
  instance.potential = potentialForPersistence(raw.potential, raw.instanceId);
  instance.statTraining = statTrainingForPersistence(raw.statTraining, raw.training);
  instance.canonicalFormId = canonicalFormIdForInstance(raw);
  instance.statSchemaVersion = INSTANCE_STAT_SCHEMA_VERSION;
  const growth = canonicalGrowthProfile(raw);
  instance.growthCurve = growth.ok ? growth.growthCurve : BALANCE_CONFIG.level.defaultCurve;
  instance.growthExpSchemaVersion = INSTANCE_EXP_SCHEMA_VERSION;
  instance.growthAwardIds = normalizeGrowthAwardIds(raw.growthAwardIds);
  instance.passiveId = normalizedPassiveId(raw);
  return instance;
}

function normalizeGenes(raw = {}) {
  const genes = {};
  for (const stat of CORE_GENES) {
    const rank = typeof raw[stat] === 'string' ? raw[stat].toUpperCase() : 'B';
    genes[stat] = BALANCE_CONFIG.gene[rank] != null ? rank : 'B';
  }
  return genes;
}

function normalizeAptitude(raw = {}) {
  const apt = {};
  for (const line of TRAINING_LINES) apt[line] = clamp(Math.round(num(raw[line], 3)), 1, 5);
  return apt;
}

export function normalizeTraining(raw = {}, config = BALANCE_CONFIG) {
  const training = {};
  const limits = config.training.allocationLimits;
  let remaining = limits.totalMax;
  for (const line of TRAINING_LINES) {
    const bounded = clamp(num(raw?.[line], 0), 0, limits.perLineMax);
    training[line] = Math.min(bounded, remaining);
    remaining -= training[line];
  }
  return training;
}

// Build a fully-formed instance from partial data, filling every R18 field.
export function normalizeInstance(raw = {}, { now = Date.now() } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const persistentSource = withoutTransientCooldownFields(source);
  const declaredLevel = clamp(Math.floor(num(source.level, 1)), BALANCE_CONFIG.level.min, BALANCE_CONFIG.level.cap);
  const growthProfile = canonicalGrowthProfile(source);
  const growthCurve = growthProfile.ok ? growthProfile.growthCurve : BALANCE_CONFIG.level.defaultCurve;
  const sourceGrowthExp = Math.max(0, Math.floor(num(source.growthExp, num(source.exp, 0))));
  const migratedGrowthExp = source.growthExpSchemaVersion === INSTANCE_EXP_SCHEMA_VERSION
    ? sourceGrowthExp
    : migrateLegacyGrowthExp({ level: declaredLevel, totalExp: sourceGrowthExp, growthCurve });
  const growthExp = Math.max(migratedGrowthExp, cumulativeExpToLevel(declaredLevel, BALANCE_CONFIG, growthCurve));
  const level = levelFromTotalExp(growthExp, BALANCE_CONFIG, growthCurve).level;

  // Legacy shape used `exp`; the trait lived inside `genes.trait`.
  const legacyTrait = typeof source.genes?.trait === 'string' ? [source.genes.trait] : [];
  const traitIds = Array.isArray(source.traitIds) && source.traitIds.length ? source.traitIds.slice() : legacyTrait;
  const instanceId = typeof source.instanceId === 'string' && source.instanceId.trim().length > 0
    ? source.instanceId
    : `m${now}-${Math.floor(Math.random() * 1e6)}`;

  const body = {
    hp: clamp100(source.body?.hp, num(source.hp, 100)),
    hunger: clamp100(source.body?.hunger, num(source.hunger, 80)),
    energy: clamp100(source.body?.energy, num(source.energy, 82)),
    fitness: clamp100(source.body?.fitness, num(source.fitness, 50)),
    health: clamp100(source.body?.health, 100),
  };
  const mind = {
    mood: clamp100(source.mind?.mood, num(source.mood, 72)),
    stress: clamp100(source.mind?.stress, num(source.stress, 10)),
    bond: clamp100(source.mind?.bond, num(source.bond, 24)),
    trust: clamp100(source.mind?.trust, num(source.trust, 20)),
    discipline: clamp100(source.mind?.discipline, num(source.discipline, 20)),
  };

  return {
    ...persistentSource,
    instanceId,
    speciesId: source.speciesId ?? null,
    formId: source.formId ?? null,
    level,
    growthExp,
    growthCurve,
    growthExpSchemaVersion: INSTANCE_EXP_SCHEMA_VERSION,
    growthAwardIds: normalizeGrowthAwardIds(source.growthAwardIds),
    potential: normalizeInstancePotential(source.potential, instanceId),
    statTraining: normalizeInstanceStatTraining(source.statTraining, source.training),
    canonicalFormId: canonicalFormIdForInstance(source),
    statSchemaVersion: INSTANCE_STAT_SCHEMA_VERSION,
    genes: normalizeGenes(source.genes),
    aptitude: normalizeAptitude(source.aptitude),
    training: normalizeTraining(source.training),
    nutrition: {
      used: Math.max(0, num(source.nutrition?.used, 0)),
      allocations: source.nutrition?.allocations && typeof source.nutrition.allocations === 'object' ? { ...source.nutrition.allocations } : {},
    },
    personalityId: source.personalityId ?? source.personality ?? 'balanced',
    traitIds,
    passiveId: normalizedPassiveId(source),
    body,
    mind,
    // Uses persist per monster; encounter cooldowns are stripped by schema.
    skills: Array.isArray(source.skills)
      ? source.skills.map(normalizeOwnedSkillRecord)
      : [],
    equipment: {
      gear: source.equipment?.gear ?? null,
      charm: source.equipment?.charm ?? null,
      utility: source.equipment?.utility ?? null,
    },
    parents: {
      a: source.parents?.a ?? source.parentAId ?? null,
      b: source.parents?.b ?? source.parentBId ?? null,
    },
    generation: Math.max(1, Math.floor(num(source.generation, 1))),
    secondaryType: source.secondaryType ?? null,
    lifeHistory: Array.isArray(source.lifeHistory) ? source.lifeHistory.slice() : [],
    career: {
      battleWins: Math.max(0, num(source.career?.battleWins, 0)),
      eliteWins: Math.max(0, num(source.career?.eliteWins, 0)),
      bossWins: Math.max(0, num(source.career?.bossWins, 0)),
      trials: Math.max(0, num(source.career?.trials, 0)),
      milestones: Array.isArray(source.career?.milestones) ? source.career.milestones.slice() : [],
    },
    evolutionHistory: Array.isArray(source.evolutionHistory) ? source.evolutionHistory.slice() : [],
    breedingCooldownUntil: Number.isFinite(source.breedingCooldownUntil)
      ? source.breedingCooldownUntil
      : null,
    breedingVersion: typeof source.breedingVersion === 'string' && source.breedingVersion.length > 0
      ? source.breedingVersion
      : INSTANCE_BREEDING_VERSION,
    inheritedSkillMemoryId: typeof source.inheritedSkillMemoryId === 'string' && source.inheritedSkillMemoryId.length > 0
      ? source.inheritedSkillMemoryId
      : null,
    lastSimulationAt: num(source.lastSimulationAt, now),
    saveVersion: INSTANCE_SAVE_VERSION,
  };
}

export function createInstance(overrides = {}, options = {}) {
  return normalizeInstance({ growthExpSchemaVersion: INSTANCE_EXP_SCHEMA_VERSION, ...overrides }, options);
}

export function instanceSpeciesIdentity(instance) {
  const runtimeSpeciesId = typeof instance?.speciesId === 'string' ? instance.speciesId : null;
  const mapping = runtimeSpeciesId ? monsterCatalogEntry(runtimeSpeciesId) : null;
  if (!mapping) {
    return Object.freeze({
      ok: false,
      reason: 'unknown_species_id',
      runtimeSpeciesId,
      workbookBaseMonsterId: null,
      workbookStage2MonsterId: null,
    });
  }
  return Object.freeze({
    ok: true,
    reason: null,
    runtimeSpeciesId,
    workbookBaseMonsterId: mapping.workbookBaseMonsterId,
    workbookStage2MonsterId: mapping.workbookStage2MonsterId,
  });
}

export function catalogIdentityDiagnostics(state = {}) {
  const collection = Array.isArray(state?.collection) ? state.collection : [];
  const diagnostics = [];
  for (let index = 0; index < collection.length; index += 1) {
    const instance = collection[index];
    const identity = instanceSpeciesIdentity(instance);
    if (identity.ok) continue;
    diagnostics.push(Object.freeze({
      code: 'migration_invalid_reference',
      path: `collection[${index}].speciesId`,
      instanceId: typeof instance?.instanceId === 'string' ? instance.instanceId : null,
      runtimeSpeciesId: identity.runtimeSpeciesId,
      reason: identity.reason,
    }));
  }
  return Object.freeze(diagnostics);
}

// Migrate a whole save state's monster collection to the V8 instance schema,
// preserving all other state (party/storage/inventory/etc.). No data loss (R21 Save).
export function migrateState(state = {}, { now = Date.now() } = {}) {
  const source = state && typeof state === 'object' ? state : {};
  const persistentSource = withoutTransientCooldownFields(source);
  const collection = Array.isArray(source.collection)
    ? source.collection.map(monster => normalizeInstance(monster, { now }))
    : [];
  return {
    ...persistentSource,
    collection,
    saveVersion: INSTANCE_SAVE_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Growth EXP & level
// ---------------------------------------------------------------------------

// Add Growth EXP and recompute level from total EXP on the monster's Workbook curve.
export function addGrowthExp(instance, amount, config = BALANCE_CONFIG) {
  const gain = Math.max(0, num(amount, 0));
  const fromLevel = instance.level;
  const profile = canonicalGrowthProfile(instance);
  const growthCurve = profile.ok ? profile.growthCurve : (instance.growthCurve ?? config.level.defaultCurve);
  instance.growthExp = Math.max(0, num(instance.growthExp, 0) + gain);
  const resolved = levelFromTotalExp(instance.growthExp, config, growthCurve);
  instance.level = resolved.level;
  instance.exp = instance.growthExp;
  instance.growthCurve = growthCurve;
  instance.growthExpSchemaVersion = INSTANCE_EXP_SCHEMA_VERSION;
  return {
    gain,
    fromLevel,
    toLevel: resolved.level,
    leveledUp: resolved.level > fromLevel,
    expIntoLevel: resolved.expIntoLevel,
    expToNext: resolved.expToNext,
    atCap: resolved.atCap,
    overflowExp: resolved.overflowExp,
    growthCurve,
  };
}

// ---------------------------------------------------------------------------
// Training pool (single shared capacity — R3)
// ---------------------------------------------------------------------------

export function trainingUsed(instance, config = BALANCE_CONFIG) {
  return totalTrainingUsed(instance.training, config);
}

export function statTrainingUsed(instance) {
  return MONSTER_STAT_KEYS.reduce((total, stat) => {
    const value = instance?.statTraining?.[stat];
    return total + (Number.isInteger(value) && value > 0 ? value : 0);
  }, 0);
}

export function addStatTraining(instance, stat, amount) {
  if (!instance || !MONSTER_STAT_KEYS.includes(stat)) return 0;
  instance.statTraining = normalizeInstanceStatTraining(instance.statTraining, instance.training);
  const gain = Math.max(0, Math.floor(num(amount, 0)));
  const current = instance.statTraining[stat];
  const statRoom = MONSTER_STAT_SOURCE_LIMITS.training.perStatMax - current;
  const totalRoom = MONSTER_STAT_SOURCE_LIMITS.training.totalMax - statTrainingUsed(instance);
  const applied = Math.min(gain, statRoom, totalRoom);
  instance.statTraining[stat] += applied;
  return applied;
}

export function trainingRemaining(instance, config = BALANCE_CONFIG) {
  const capacity = Math.min(trainingCapacity(instance.level, config), config.training.allocationLimits.totalMax);
  return Math.max(0, capacity - trainingUsed(instance, config));
}

// Add already-computed training gain to a line, clamped to the shared capacity.
export function addTrainingExp(instance, line, gain, config = BALANCE_CONFIG) {
  if (!TRAINING_LINES.includes(line)) return 0;
  if (!instance.training || typeof instance.training !== 'object') instance.training = normalizeTraining({}, config);
  instance.statTraining = normalizeInstanceStatTraining(instance.statTraining, instance.training);
  const remaining = Math.max(0, trainingRemaining(instance, config));
  const perLineMax = config.training.allocationLimits.perLineMax;
  const current = clamp(num(instance.training[line], 0), 0, perLineMax);
  const lineRemaining = perLineMax - current;
  const applied = Math.min(Math.max(0, num(gain, 0)), remaining, lineRemaining);
  instance.training[line] = current + applied;
  const canonicalStat = MONSTER_STAT_KEYS.find(stat => INSTANCE_STAT_TRAINING_MAP[stat] === line);
  if (canonicalStat) addStatTraining(instance, canonicalStat, applied);
  return applied;
}

// Pure timestamp window shared by offline life and Ranch training claims.
// Missing timestamps default to `now`, preventing free retroactive rewards.
export function resolveOfflineTrainingWindow({
  lastClaimAt,
  now,
  capHours = LIFE_RATES.offlineCapHours,
} = {}) {
  if (!Number.isFinite(now)) {
    return Object.freeze({ ok: false, reason: 'invalid_timestamp', elapsedMs: 0, hours: 0, capped: false });
  }
  const previousClaimAt = num(lastClaimAt, now);
  if (now <= previousClaimAt) {
    return Object.freeze({
      ok: false,
      reason: 'duplicate_claim',
      previousClaimAt,
      nextClaimAt: previousClaimAt,
      elapsedMs: 0,
      hours: 0,
      capped: false,
    });
  }
  const elapsedMs = now - previousClaimAt;
  const boundedCapHours = Math.max(0, num(capHours, LIFE_RATES.offlineCapHours));
  const cappedMs = Math.min(elapsedMs, boundedCapHours * 3600 * 1000);
  return Object.freeze({
    ok: true,
    reason: null,
    previousClaimAt,
    nextClaimAt: now,
    elapsedMs,
    hours: cappedMs / (3600 * 1000),
    capped: elapsedMs > cappedMs,
  });
}

// ---------------------------------------------------------------------------
// Body/Mind offline simulation (R11)
// ---------------------------------------------------------------------------

// Advance Body/Mind by the elapsed time (capped). Deterministic; never lethal.
export function simulateLife(instance, now = Date.now(), rates = LIFE_RATES) {
  const last = num(instance.lastSimulationAt, now);
  const elapsedMs = Math.max(0, now - last);
  const cappedMs = Math.min(elapsedMs, rates.offlineCapHours * 3600 * 1000);
  const hours = cappedMs / (3600 * 1000);
  instance.lastSimulationAt = now;
  if (hours <= 0) return { hours: 0, capped: elapsedMs > cappedMs };

  const body = instance.body;
  const mind = instance.mind;
  body.hunger = clamp100(body.hunger + rates.hungerPerHour * hours);
  body.energy = clamp100(body.energy + rates.energyPerHour * hours);
  body.fitness = clamp100(body.fitness + rates.fitnessPerHour * hours);
  body.health = clamp100(body.health + rates.healthPerHour * hours);
  mind.stress = clamp100(mind.stress + rates.stressPerHour * hours);

  let mood = mind.mood + (rates.moodBaseline - mind.mood) * Math.min(1, rates.moodReversionPerHour * hours);
  if (body.hunger < rates.hungerMoodPenaltyBelow) mood -= (rates.hungerMoodPenaltyBelow - body.hunger) * 0.1 * hours;
  mind.mood = clamp100(mood);

  return { hours, capped: elapsedMs > cappedMs };
}

// Derive the current Condition key from Body/Mind (R11). Low hunger drops a band.
export function deriveCondition(instance) {
  const { energy = 0, health = 100, hunger = 100 } = instance.body ?? {};
  const { stress = 0 } = instance.mind ?? {};
  const score = energy * 0.4 + (100 - stress) * 0.35 + health * 0.25;
  let index = CONDITION_BANDS.findIndex(band => score >= band.min);
  if (index < 0) index = CONDITION_ORDER.length - 1;
  if (hunger < 20) index = Math.min(index + 1, CONDITION_ORDER.length - 1);
  return CONDITION_ORDER[index];
}

// Append a timestamped entry to the monster's life history (R7/R18 identity).
export function appendHistory(instance, entry, now = Date.now()) {
  if (!Array.isArray(instance.lifeHistory)) instance.lifeHistory = [];
  instance.lifeHistory.push({ at: now, ...entry });
  return instance.lifeHistory[instance.lifeHistory.length - 1];
}
