import assert from 'node:assert/strict';
import { cumulativeExpToLevel, trainingCapacity } from '../balance-formulas.mjs';
import {
  INSTANCE_SAVE_VERSION,
  TRAINING_LINES,
  normalizeInstance,
  migrateState,
  addGrowthExp,
  addTrainingExp,
  trainingRemaining,
  trainingUsed,
  simulateLife,
  deriveCondition,
  appendHistory,
} from '../monster-instance.mjs';

// --- Schema + legacy migration (R18, R21 Save) -----------------------------
const legacy = {
  instanceId: 'm1',
  speciesId: 'flame_slime',
  level: 5,
  exp: 300,
  genes: { hp: 'B', atk: 'A', def: 'C', spd: 'b', trait: 'Brave' },
  trainingBonus: { hp: 3, atk: 4, def: 1, spd: 2 },
  bond: 40,
  hunger: 55,
  energy: 60,
  mood: 70,
  fitness: 48,
  generation: 2,
  parentAId: 'mA',
  parentBId: 'mB',
};
const inst = normalizeInstance(legacy, { now: 1000 });
assert.equal(inst.saveVersion, INSTANCE_SAVE_VERSION, 'instance is stamped with the V8 save version');
assert.equal(inst.growthExp, 300, 'legacy exp migrates into growthExp');
assert.deepEqual(inst.genes, { hp: 'B', atk: 'A', def: 'C', spd: 'B' }, 'genes normalize (case-insensitive, trait stripped out)');
assert.deepEqual(inst.traitIds, ['Brave'], 'legacy genes.trait migrates into traitIds');
assert.equal(inst.parents.a, 'mA', 'legacy parentAId migrates into parents.a');
assert.equal(inst.parents.b, 'mB', 'legacy parentBId migrates into parents.b');
assert.equal(inst.body.bond ?? inst.mind.bond, 40, 'legacy bond migrates into mind.bond');
assert.equal(inst.body.hunger, 55, 'legacy hunger migrates into body.hunger');
for (const line of TRAINING_LINES) assert.equal(inst.training[line], 0, `training line ${line} starts at 0`);
for (const line of TRAINING_LINES) assert.ok(inst.aptitude[line] >= 1 && inst.aptitude[line] <= 5, 'aptitude defaults within 1-5');
assert.equal(inst.trainingBonus.atk, 4, 'unknown legacy fields are preserved, not dropped');

// Migrating a whole save keeps other state intact.
const migrated = migrateState({ collection: [legacy], party: ['m1', null, null], inventory: { captureBalls: 12 }, saveVersion: 7 }, { now: 1000 });
assert.equal(migrated.saveVersion, INSTANCE_SAVE_VERSION, 'state save version bumped to 8');
assert.equal(migrated.collection.length, 1, 'collection preserved');
assert.deepEqual(migrated.party, ['m1', null, null], 'party preserved');
assert.equal(migrated.inventory.captureBalls, 12, 'inventory preserved');

// --- Growth EXP → level (R2) -----------------------------------------------
const mon = normalizeInstance({ instanceId: 'm2', level: 1, growthExp: 0 });
const step = addGrowthExp(mon, cumulativeExpToLevel(5));
assert.equal(step.toLevel, 5, 'adding the cumulative EXP for Lv.5 reaches Lv.5');
assert.equal(step.leveledUp, true, 'level-up is reported');
assert.equal(mon.level, 5, 'instance level updated');
addGrowthExp(mon, 10 ** 9);
assert.equal(mon.level, 50, 'growth never exceeds the Lv.50 cap');

// --- Training pool (single shared capacity — R3) ---------------------------
const trainee = normalizeInstance({ instanceId: 'm3', level: 20 });
assert.equal(trainingRemaining(trainee), trainingCapacity(20), 'fresh Lv.20 monster has full capacity');
const appliedA = addTrainingExp(trainee, 'power', 150);
assert.equal(appliedA, 150, 'training gain applied to the power line');
const appliedB = addTrainingExp(trainee, 'defense', 100);
assert.equal(appliedB, trainingCapacity(20) - 150, 'second line is clamped to remaining shared capacity');
assert.ok(trainingUsed(trainee) <= trainingCapacity(20), 'total training never exceeds capacity');
assert.equal(addTrainingExp(trainee, 'speed', 50), 0, 'no gain once capacity is exhausted');
assert.equal(addTrainingExp(trainee, 'notaline', 10), 0, 'invalid training line is rejected');

// --- Body/Mind offline simulation (R11) ------------------------------------
const life = normalizeInstance({ instanceId: 'm4', body: { hunger: 80, energy: 40, stress: 60, fitness: 50, health: 70 }, mind: { stress: 60, mood: 40 }, lastSimulationAt: 0 });
const before = { ...life.body };
const result = simulateLife(life, 4 * 3600 * 1000); // 4 hours.
assert.ok(Math.abs(result.hours - 4) < 1e-9, 'simulates the elapsed hours');
assert.ok(life.body.hunger < before.hunger, 'hunger decays over time');
assert.ok(life.body.energy > before.energy, 'energy recovers passively');
assert.ok(life.mind.stress < 60, 'stress decays over time');
assert.ok(life.body.energy <= 100 && life.mind.stress >= 0, 'body/mind stay within 0-100');

// Offline cap: a very long absence is capped (no monster "dies" from neglect).
const neglected = normalizeInstance({ instanceId: 'm5', body: { energy: 0, hunger: 100 }, lastSimulationAt: 0 });
const capped = simulateLife(neglected, 1000 * 3600 * 1000); // 1000 hours.
assert.ok(capped.capped, 'very long absences are flagged as capped');
assert.ok(neglected.body.hunger > 0, 'hunger never reaches a lethal state');

// --- Condition derivation (R11) --------------------------------------------
const healthy = normalizeInstance({ instanceId: 'm6', body: { energy: 100, health: 100, hunger: 100 }, mind: { stress: 0 } });
const worn = normalizeInstance({ instanceId: 'm7', body: { energy: 20, health: 40, hunger: 100 }, mind: { stress: 80 } });
assert.equal(deriveCondition(healthy), 'excellent', 'high energy/health/low stress = Excellent');
assert.ok(['fatigued', 'bad'].includes(deriveCondition(worn)), 'low energy/high stress = poor condition');
const starving = normalizeInstance({ instanceId: 'm8', body: { energy: 100, health: 100, hunger: 5 }, mind: { stress: 0 } });
assert.notEqual(deriveCondition(starving), 'excellent', 'very low hunger drops the condition band');

// --- Life history ----------------------------------------------------------
appendHistory(healthy, { type: 'battle', detail: 'won' }, 500);
assert.equal(healthy.lifeHistory.length, 1, 'history entry appended');
assert.equal(healthy.lifeHistory[0].at, 500, 'history entry is timestamped');

console.log('V7.2 raising progression core regression: PASS');
