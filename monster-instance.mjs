// Monster Life RPG — V7.2 Raising Progression Core
// The Monster Instance is the primary data unit (R1, R18). This module defines
// its schema, save migration from the V7.0.x shape, EXP→level application, the
// shared training pool, and Body/Mind offline simulation (R11). It is a pure data
// layer with no engine/UI coupling (R19, R24).

import { BALANCE_CONFIG } from './balance-config.mjs';
import { monsterCatalogEntry } from './monster-catalog.mjs';
import {
  levelFromTotalExp,
  trainingCapacity,
  totalTrainingUsed,
  clamp,
} from './balance-formulas.mjs';

export const INSTANCE_SAVE_VERSION = 8;
export const TRAINING_LINES = Object.freeze(['power', 'defense', 'speed', 'technique', 'spirit']);
export const CORE_GENES = Object.freeze(['hp', 'atk', 'def', 'spd']);

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
  const level = clamp(Math.floor(num(source.level, 1)), BALANCE_CONFIG.level.min, BALANCE_CONFIG.level.cap);

  // Legacy shape used `exp`; the trait lived inside `genes.trait`.
  const growthExp = Math.max(0, num(source.growthExp, num(source.exp, 0)));
  const legacyTrait = typeof source.genes?.trait === 'string' ? [source.genes.trait] : [];
  const traitIds = Array.isArray(source.traitIds) && source.traitIds.length ? source.traitIds.slice() : legacyTrait;

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
    ...source,
    instanceId: typeof source.instanceId === 'string' ? source.instanceId : `m${now}-${Math.floor(Math.random() * 1e6)}`,
    speciesId: source.speciesId ?? null,
    formId: source.formId ?? null,
    level,
    growthExp,
    genes: normalizeGenes(source.genes),
    aptitude: normalizeAptitude(source.aptitude),
    training: normalizeTraining(source.training),
    nutrition: {
      used: Math.max(0, num(source.nutrition?.used, 0)),
      allocations: source.nutrition?.allocations && typeof source.nutrition.allocations === 'object' ? { ...source.nutrition.allocations } : {},
    },
    personalityId: source.personalityId ?? source.personality ?? 'balanced',
    traitIds,
    body,
    mind,
    // Skill runtime fields (uses/cooldowns) belong to this monster instance.
    // Clone records so normalizing the same raw object cannot share mutations.
    skills: Array.isArray(source.skills)
      ? source.skills.map(skill => skill && typeof skill === 'object' ? { ...skill } : skill)
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
    lastSimulationAt: num(source.lastSimulationAt, now),
    saveVersion: INSTANCE_SAVE_VERSION,
  };
}

export function createInstance(overrides = {}, options = {}) {
  return normalizeInstance(overrides, options);
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
  const collection = Array.isArray(source.collection)
    ? source.collection.map(monster => normalizeInstance(monster, { now }))
    : [];
  return {
    ...source,
    collection,
    saveVersion: INSTANCE_SAVE_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Growth EXP & level
// ---------------------------------------------------------------------------

// Add Growth EXP and recompute level from total EXP (R2). Never exceeds Lv.50.
export function addGrowthExp(instance, amount, config = BALANCE_CONFIG) {
  const gain = Math.max(0, num(amount, 0));
  const fromLevel = instance.level;
  instance.growthExp = Math.max(0, num(instance.growthExp, 0) + gain);
  const resolved = levelFromTotalExp(instance.growthExp, config);
  instance.level = resolved.level;
  return {
    gain,
    fromLevel,
    toLevel: resolved.level,
    leveledUp: resolved.level > fromLevel,
    expIntoLevel: resolved.expIntoLevel,
    expToNext: resolved.expToNext,
    atCap: resolved.atCap,
  };
}

// ---------------------------------------------------------------------------
// Training pool (single shared capacity — R3)
// ---------------------------------------------------------------------------

export function trainingUsed(instance, config = BALANCE_CONFIG) {
  return totalTrainingUsed(instance.training, config);
}

export function trainingRemaining(instance, config = BALANCE_CONFIG) {
  const capacity = Math.min(trainingCapacity(instance.level, config), config.training.allocationLimits.totalMax);
  return Math.max(0, capacity - trainingUsed(instance, config));
}

// Add already-computed training gain to a line, clamped to the shared capacity.
export function addTrainingExp(instance, line, gain, config = BALANCE_CONFIG) {
  if (!TRAINING_LINES.includes(line)) return 0;
  if (!instance.training || typeof instance.training !== 'object') instance.training = normalizeTraining({}, config);
  const remaining = Math.max(0, trainingRemaining(instance, config));
  const perLineMax = config.training.allocationLimits.perLineMax;
  const current = clamp(num(instance.training[line], 0), 0, perLineMax);
  const lineRemaining = perLineMax - current;
  const applied = Math.min(Math.max(0, num(gain, 0)), remaining, lineRemaining);
  instance.training[line] = current + applied;
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
