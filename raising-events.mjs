// Monster Life RPG — V7.8 Raising Events
// A data-driven event engine: triggers → weighted selection → player choices →
// consequences + history flags (R12). Events create character and unlock paths;
// they must NOT be the best stat farm (R12 Event Balance). Resolver is UI-free.

import { createRng } from './rng.mjs';
import { clamp } from './balance-formulas.mjs';
import { TRAINING_LINES, addGrowthExp, addTrainingExp, appendHistory } from './monster-instance.mjs';

const DAY_MS = 24 * 3600 * 1000;

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp100(value) {
  return clamp(num(value, 0), 0, 100);
}

// Build the trigger/consequence context from an instance.
export function eventContext(instance, extra = {}) {
  return {
    speciesTags: instance.speciesTags ?? [],
    stage: instance.stage ?? null,
    personality: instance.personalityId ?? 'balanced',
    zone: instance.currentZone ?? null,
    stats: {
      ...instance.training,
      mood: instance.mind?.mood,
      stress: instance.mind?.stress,
      bond: instance.mind?.bond,
      energy: instance.body?.energy,
    },
    ...extra,
  };
}

function matchesStatRanges(ranges, stats) {
  if (!ranges || typeof ranges !== 'object') return true;
  return Object.entries(ranges).every(([key, range]) => {
    const value = num(stats?.[key], NaN);
    if (Number.isNaN(value)) return false;
    if (range.min != null && value < range.min) return false;
    if (range.max != null && value > range.max) return false;
    return true;
  });
}

function triggerMatches(trigger = {}, context) {
  if (Array.isArray(trigger.speciesTags) && !trigger.speciesTags.every(tag => (context.speciesTags ?? []).includes(tag))) return false;
  if (trigger.stage && trigger.stage !== context.stage) return false;
  if (Array.isArray(trigger.stages) && !trigger.stages.includes(context.stage)) return false;
  if (trigger.zone && trigger.zone !== context.zone) return false;
  if (!matchesStatRanges(trigger.statRanges, context.stats)) return false;
  return true;
}

function onCooldown(instance, eventDef, now) {
  const perEvent = num(eventDef.cooldownMs, DAY_MS);
  const lastAt = instance.eventCooldowns?.[eventDef.id];
  if (lastAt != null && now - lastAt < perEvent) return true;
  if (eventDef.category) {
    const catLast = instance.eventCategoryCooldowns?.[eventDef.category];
    const catCd = num(eventDef.categoryCooldownMs, 0);
    if (catLast != null && catCd > 0 && now - catLast < catCd) return true;
  }
  return false;
}

// Weight = baseWeight × personality modifiers (e.g. Curious ×1.2) (R12).
export function eventWeight(eventDef, context) {
  const base = num(eventDef.baseWeight, 1);
  const modifier = eventDef.personalityWeights?.[context.personality] ?? 1;
  return Math.max(0, base * modifier);
}

// List currently eligible events with computed weights (respects cooldowns).
export function evaluateEventTriggers(eventDefs, instance, { now = Date.now() } = {}) {
  const context = eventContext(instance);
  return (eventDefs ?? [])
    .filter(def => triggerMatches(def.trigger, context) && !onCooldown(instance, def, now))
    .map(def => ({ id: def.id, weight: eventWeight(def, context), def }))
    .filter(entry => entry.weight > 0);
}

// Seeded weighted pick among eligible events (deterministic for tests, R23).
export function rollEvent(eligible, seed = 0) {
  if (!Array.isArray(eligible) || eligible.length === 0) return null;
  const rng = createRng(seed);
  return rng.weighted(eligible.map(e => [e, e.weight])) ?? null;
}

export function getChoices(eventDef) {
  return (eventDef?.choices ?? []).map(c => ({ id: c.id, label: c.label }));
}

// Apply a chosen consequence: stat/growth EXP, mood/bond, and a history flag (R12).
export function applyChoice(instance, eventDef, choiceId, { now = Date.now() } = {}) {
  const choice = (eventDef?.choices ?? []).find(c => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'invalid choice' };
  const effects = choice.effects ?? {};

  const trainingApplied = {};
  for (const [line, amount] of Object.entries(effects.statExp ?? {})) {
    if (TRAINING_LINES.includes(line)) trainingApplied[line] = addTrainingExp(instance, line, amount);
  }
  if (effects.growthExp) addGrowthExp(instance, effects.growthExp);

  const mind = instance.mind;
  const body = instance.body;
  if (effects.mood) mind.mood = clamp100(mind.mood + effects.mood);
  if (effects.stress) mind.stress = clamp100(mind.stress + effects.stress);
  if (effects.bond) mind.bond = clamp100(mind.bond + effects.bond);
  if (effects.trust) mind.trust = clamp100(mind.trust + effects.trust);
  if (effects.discipline) mind.discipline = clamp100((mind.discipline ?? 20) + effects.discipline);
  if (body) {
    if (effects.energy) body.energy = clamp100(body.energy + effects.energy);
    if (effects.hunger) body.hunger = clamp100(body.hunger + effects.hunger);
    if (effects.fitness) body.fitness = clamp100(body.fitness + effects.fitness);
  }

  // Record cooldown + history flag (eventId:choiceId) — used to unlock evolution.
  if (!instance.eventCooldowns) instance.eventCooldowns = {};
  instance.eventCooldowns[eventDef.id] = now;
  if (eventDef.category) {
    if (!instance.eventCategoryCooldowns) instance.eventCategoryCooldowns = {};
    instance.eventCategoryCooldowns[eventDef.category] = now;
  }
  if (!Array.isArray(instance.eventFlags)) instance.eventFlags = [];
  const flag = `${eventDef.id}:${choiceId}`;
  if (!instance.eventFlags.includes(flag)) instance.eventFlags.push(flag);
  appendHistory(instance, { type: 'event', eventId: eventDef.id, choiceId }, now);

  return { ok: true, flag, trainingApplied, effects };
}

// R12 Event Balance — non-rare event training must be smaller than one normal
// Ranch training session, so events never become the best stat farm.
export function validateEventBalance(eventDef, { normalSessionGain = 15 } = {}) {
  const violations = [];
  for (const choice of eventDef?.choices ?? []) {
    const total = Object.values(choice.effects?.statExp ?? {}).reduce((a, b) => a + num(b), 0);
    if (!eventDef.rare && total >= normalSessionGain) {
      violations.push({ choiceId: choice.id, total });
    }
  }
  return { ok: violations.length === 0, violations };
}
