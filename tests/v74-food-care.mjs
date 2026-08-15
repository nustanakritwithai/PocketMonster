import assert from 'node:assert/strict';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  resolveFeed,
  applyNutrition,
  applyTrainingFood,
  activeTrainingFoodMultiplier,
  nutritionRemaining,
  nutritionFlat,
  isFavorite,
  careRest,
  carePlay,
} from '../food-care.mjs';

const mk = (over = {}) => normalizeInstance({ instanceId: 'f1', level: 10, ...over });

// Daily food restores hunger/energy; overfeeding a full monster is reduced (R8).
const hungry = mk({ body: { hunger: 30, energy: 40 } });
const daily = { id: 'berry', category: 'daily', effects: { hunger: 40, energy: 20 } };
resolveFeed(hungry, daily);
assert.ok(hungry.body.hunger > 30, 'daily food restores hunger');
const full = mk({ body: { hunger: 95, energy: 50 } });
const beforeFull = full.body.hunger;
resolveFeed(full, daily);
const gainedWhenFull = full.body.hunger - beforeFull;
assert.ok(gainedWhenFull < 40, 'overfeeding a full monster yields reduced benefit');

// Favorite food (species OR instance taste) boosts effect and bond (R8).
const species = { favoriteTags: ['spicy'] };
const favFood = { id: 'chili', category: 'favorite', effects: { mood: 10, bond: 3 }, preferenceTags: ['spicy'] };
assert.ok(isFavorite(mk(), favFood, species), 'species favorite tag is recognized');
assert.ok(isFavorite(mk({ favoriteFoodId: 'chili' }), favFood), 'instance-specific favorite is recognized');
const liker = mk({ mind: { mood: 40, bond: 30 } });
const neutral = mk({ mind: { mood: 40, bond: 30 } });
resolveFeed(liker, favFood, { species });
resolveFeed(neutral, favFood, { species: {} });
assert.ok(liker.mind.mood > neutral.mind.mood, 'favorite food gives a stronger mood boost');
assert.ok(liker.mind.bond > neutral.mind.bond, 'favorite food grants extra bond');

// Nutrition food is permanent but bounded by Nutrition Capacity (R8).
const nut = mk();
assert.equal(nutritionRemaining(nut), BALANCE_CONFIG.nutrition.capacity, 'starts with full nutrition capacity');
const nutFood = { id: 'protein', category: 'nutrition', nutrition: { stat: 'atk', amount: 8 } };
const first = applyNutrition(nut, nutFood);
assert.equal(first.applied, 8, 'nutrition applies permanent points');
assert.equal(nutritionFlat(nut, 'atk'), 8, 'permanent flat recorded for the stat');
// Fill the rest and then over-cap: partial then reject.
applyNutrition(nut, { id: 'p2', category: 'nutrition', nutrition: { stat: 'atk', amount: 8 } });
const partial = applyNutrition(nut, { id: 'p3', category: 'nutrition', nutrition: { stat: 'hp', amount: 10 } });
assert.ok(partial.applied <= nutritionRemaining(mk()) && partial.applied >= 0, 'over-cap nutrition is partial');
assert.ok(nutritionRemaining(nut) >= 0, 'nutrition capacity never goes negative');
const rejected = applyNutrition(nut, { id: 'p4', category: 'nutrition', nutrition: { stat: 'def', amount: 5 } });
assert.equal(rejected.rejected, true, 'nutrition is rejected once capacity is full');

// Training food is a temporary buff that never stacks in the same group (R8).
const buffMon = mk();
const tf = { id: 'boost', category: 'training', trainingBuff: { multiplier: 1.3, group: 'gain', durationMs: 1000, lines: ['power'] } };
const b1 = applyTrainingFood(buffMon, tf, { now: 0 });
assert.equal(b1.applied, true, 'training food applies a buff');
assert.ok(Math.abs(activeTrainingFoodMultiplier(buffMon, 'power', 100) - 1.3) < 1e-9, 'buff multiplier is active for the line');
assert.equal(activeTrainingFoodMultiplier(buffMon, 'defense', 100), 1, 'buff only affects its listed lines');
const b2 = applyTrainingFood(buffMon, { ...tf, trainingBuff: { ...tf.trainingBuff, multiplier: 1.2 } }, { now: 10 });
assert.equal(b2.replaced, true, 'a second same-group training food replaces rather than stacks');
assert.equal(buffMon.activeBuffs.filter(b => b.group === 'gain').length, 1, 'only one buff per group exists');
assert.equal(activeTrainingFoodMultiplier(buffMon, 'power', 5000), 1, 'expired buffs are ignored');
// Over-cap multiplier is clamped.
const strong = applyTrainingFood(mk(), { id: 'x', category: 'training', trainingBuff: { multiplier: 9, group: 'g', durationMs: 100 } }, { now: 0 });
assert.ok(strong.multiplier <= BALANCE_CONFIG.care.trainingFoodMaxMultiplier, 'training buff multiplier is capped');

// Skill/Evolution catalysts record a consumed flag + history (R8).
const cat = mk();
resolveFeed(cat, { id: 'moon_fruit', category: 'evolution' });
assert.equal(cat.catalystHistory.length, 1, 'catalyst consumption recorded');
assert.equal(cat.lifeHistory.at(-1).type, 'food', 'catalyst appended to life history');

// Care actions.
const care = mk({ body: { energy: 30 }, mind: { stress: 60, mood: 40, bond: 30 } });
careRest(care);
assert.ok(care.body.energy > 30 && care.mind.stress < 60, 'rest restores energy and lowers stress');
carePlay(care);
assert.ok(care.mind.mood > 40 && care.mind.bond > 30, 'play raises mood and bond');

console.log('V7.4 food & care regression: PASS');
