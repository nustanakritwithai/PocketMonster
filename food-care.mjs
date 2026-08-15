// Monster Life RPG — V7.4 Food & Care
// Food and care resolvers separate from UI (R24). Food is Condition + Growth
// Modifier + Skill/Evolution catalyst — never an unlimited stat potion (A3, R8).
// Permanent nutrition uses its own small capacity; training-food buffs never stack.

import { BALANCE_CONFIG } from './balance-config.mjs';
import { clamp } from './balance-formulas.mjs';
import { appendHistory } from './monster-instance.mjs';

export const FOOD_CATEGORIES = Object.freeze(['daily', 'favorite', 'training', 'nutrition', 'skill', 'evolution']);
export const NUTRITION_STATS = Object.freeze(['hp', 'atk', 'def', 'spd']);

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp100(value) {
  return clamp(num(value, 0), 0, 100);
}

function applyBodyMind(instance, effects = {}, scale = 1) {
  const body = instance.body;
  const mind = instance.mind;
  if (effects.hunger) body.hunger = clamp100(body.hunger + effects.hunger * scale);
  if (effects.energy) body.energy = clamp100(body.energy + effects.energy * scale);
  if (effects.fitness) body.fitness = clamp100(body.fitness + effects.fitness * scale);
  if (effects.health) body.health = clamp100(body.health + effects.health * scale);
  if (effects.mood) mind.mood = clamp100(mind.mood + effects.mood * scale);
  if (effects.stress) mind.stress = clamp100(mind.stress + effects.stress * scale);
  if (effects.bond) mind.bond = clamp100(mind.bond + effects.bond * scale);
  if (effects.trust) mind.trust = clamp100(mind.trust + effects.trust * scale);
}

// A food is a favorite if it matches the species tags OR the instance's own taste.
export function isFavorite(instance, food, species = {}) {
  if (!food) return false;
  if (instance.favoriteFoodId && instance.favoriteFoodId === food.id) return true;
  const speciesTags = new Set(species.favoriteTags ?? []);
  const instanceTags = new Set(instance.favoriteTags ?? []);
  return (food.preferenceTags ?? []).some(tag => speciesTags.has(tag) || instanceTags.has(tag));
}

// Total permanent nutrition points spent so far.
export function nutritionUsed(instance) {
  return num(instance.nutrition?.used, 0);
}

export function nutritionRemaining(instance, config = BALANCE_CONFIG) {
  return config.nutrition.capacity - nutritionUsed(instance);
}

// Permanent flat contribution to a core stat from nutrition allocations (R5).
export function nutritionFlat(instance, stat) {
  return num(instance.nutrition?.allocations?.[stat], 0);
}

// Apply permanent Nutrition food, bounded by Nutrition Capacity (reject/partial).
export function applyNutrition(instance, food, config = BALANCE_CONFIG) {
  const stat = food?.nutrition?.stat;
  const amount = Math.max(0, num(food?.nutrition?.amount, 0));
  if (!NUTRITION_STATS.includes(stat) || amount <= 0) {
    return { category: 'nutrition', applied: 0, rejected: true, reason: 'invalid nutrition food' };
  }
  const remaining = nutritionRemaining(instance, config);
  if (remaining <= 0) {
    return { category: 'nutrition', applied: 0, rejected: true, reason: 'nutrition capacity full' };
  }
  const applied = Math.min(amount, remaining); // Partial fill up to capacity.
  instance.nutrition.used = nutritionUsed(instance) + applied;
  instance.nutrition.allocations[stat] = nutritionFlat(instance, stat) + applied;
  return { category: 'nutrition', applied, rejected: false, partial: applied < amount, stat };
}

// Apply a temporary training-food buff. Same group never stacks (R8); the
// stronger/newer buff replaces it, capped by trainingFoodMaxMultiplier.
export function applyTrainingFood(instance, food, { now = Date.now() } = {}, config = BALANCE_CONFIG) {
  const buff = food?.trainingBuff;
  if (!buff || !(buff.multiplier > 0)) {
    return { category: 'training', applied: false, reason: 'invalid training food' };
  }
  if (!Array.isArray(instance.activeBuffs)) instance.activeBuffs = [];
  const group = buff.group ?? 'training';
  const multiplier = Math.min(buff.multiplier, config.care.trainingFoodMaxMultiplier);
  const expiresAt = now + Math.max(0, num(buff.durationMs, 0));
  const existingIndex = instance.activeBuffs.findIndex(b => b.group === group);
  const record = { kind: 'trainingFood', group, multiplier, expiresAt, lines: buff.lines ?? null };
  let replaced = false;
  if (existingIndex >= 0) {
    instance.activeBuffs[existingIndex] = record; // No stacking; replace in place.
    replaced = true;
  } else {
    instance.activeBuffs.push(record);
  }
  return { category: 'training', applied: true, replaced, multiplier, group, expiresAt };
}

// Current active training-food multiplier for a line (default 1.0), for the
// balance training-gain formula to consume. Expired buffs are ignored.
export function activeTrainingFoodMultiplier(instance, line, now = Date.now()) {
  let multiplier = 1;
  for (const buff of instance.activeBuffs ?? []) {
    if (buff.kind !== 'trainingFood' || buff.expiresAt <= now) continue;
    if (buff.lines && !buff.lines.includes(line)) continue;
    multiplier = Math.max(multiplier, buff.multiplier);
  }
  return multiplier;
}

// Feed food of any category, dispatching to the right resolver.
export function resolveFeed(instance, food, { species = {}, now = Date.now() } = {}, config = BALANCE_CONFIG) {
  if (!food || !FOOD_CATEGORIES.includes(food.category)) {
    return { applied: false, reason: 'unknown food' };
  }

  if (food.category === 'nutrition') return applyNutrition(instance, food, config);
  if (food.category === 'training') return applyTrainingFood(instance, food, { now }, config);

  if (food.category === 'skill' || food.category === 'evolution') {
    // Catalysts don't alter body/mind meaningfully; they record a consumed flag
    // for the skill/evolution engines and history (R8).
    if (!Array.isArray(instance.catalystHistory)) instance.catalystHistory = [];
    instance.catalystHistory.push({ foodId: food.id, category: food.category, at: now });
    appendHistory(instance, { type: 'food', category: food.category, foodId: food.id }, now);
    return { category: food.category, applied: true, catalyst: true };
  }

  // Daily / Favorite: temporary body/mind effects.
  const favorite = isFavorite(instance, food, species);
  let scale = favorite ? config.care.preferenceMultiplier : 1;
  // Overfeeding a full monster with daily food yields reduced benefit (R8).
  const overfull = instance.body.hunger >= config.care.overfullThreshold;
  if (food.category === 'daily' && overfull) scale *= config.care.overfullEfficiency;

  applyBodyMind(instance, food.effects, scale);
  if (favorite) instance.mind.bond = clamp100(instance.mind.bond + config.care.favoriteBondBonus);
  appendHistory(instance, { type: 'food', category: food.category, foodId: food.id, favorite }, now);
  return { category: food.category, applied: true, favorite, overfull, scale };
}

// --- Care actions (R16 facilities) -----------------------------------------

export function careRest(instance, { now = Date.now() } = {}, config = BALANCE_CONFIG) {
  applyBodyMind(instance, config.care.rest);
  appendHistory(instance, { type: 'care', action: 'rest' }, now);
  return { action: 'rest', energy: instance.body.energy, stress: instance.mind.stress };
}

export function carePlay(instance, { now = Date.now() } = {}, config = BALANCE_CONFIG) {
  applyBodyMind(instance, config.care.play);
  appendHistory(instance, { type: 'care', action: 'play' }, now);
  return { action: 'play', mood: instance.mind.mood, bond: instance.mind.bond };
}
