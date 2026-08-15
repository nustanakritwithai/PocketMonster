// V8.0 — Complete Vertical Slice integration test.
// Runs one monster through the whole loop wiring every V7.x system together:
// capture → raise/care → train → equip → battle → skill → evolution → boss →
// breeding → next generation, then checks the balance exit gates (R21, R26).

import assert from 'node:assert/strict';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import {
  cumulativeExpToLevel,
  trainingCapacity,
  trainingGain,
  captureChance,
} from '../balance-formulas.mjs';
import {
  normalizeInstance,
  migrateState,
  addGrowthExp,
  addTrainingExp,
  trainingUsed,
  simulateLife,
  deriveCondition,
} from '../monster-instance.mjs';
import { resolveFeed, careRest } from '../food-care.mjs';
import { resolveBattleGrowth, applyBattleGrowth } from '../battle-growth.mjs';
import { learnSkill, addSkillExp, getSkill, applyMutation } from '../skill-progression.mjs';
import { equipItem, computeEquipmentContribution, checkEquipmentBudget } from '../equipment.mjs';
import { evaluateEvolution, listEligibleBranches, commitEvolution } from '../evolution.mjs';
import { breed } from '../breeding.mjs';
import { compareBuilds } from '../combat-rating.mjs';
import { ARCHETYPES } from '../balance-sim.mjs';

const species = {
  id: 'flame_slime',
  base: { hp: 120, atk: 30, def: 25, spd: 28 },
  growthPerLevel: { hp: 8, atk: 2, def: 1.5, spd: 1.6 },
  aptitudeBase: { power: 4, defense: 2, speed: 3, technique: 3, spirit: 2 },
  allowedSecondary: ['spirit'],
  favoriteTags: ['spicy'],
};

// 1) CAPTURE — a wild Flare Slime at low HP is catchable; owned monster recalled.
const wildCaptureChance = captureChance({ speciesRate: 0.45, hpRatio: 0.15, tierModifier: 1 });
assert.ok(wildCaptureChance > 0 && wildCaptureChance <= BALANCE_CONFIG.capture.maxChance, 'wild capture chance is valid');
const mon = normalizeInstance({
  instanceId: 'hero', speciesId: 'flame_slime', formId: 'flame_slime', level: 1,
  genes: { hp: 'B', atk: 'A', def: 'C', spd: 'B' },
  aptitude: species.aptitudeBase, speciesTags: ['fire'],
});
assert.equal(mon.level, 1, 'captured monster starts at Lv.1');

// 2) RAISE / CARE — feeding and resting keep condition high (R11/R8).
mon.body.energy = 40; mon.mind.stress = 55;
careRest(mon);
resolveFeed(mon, { id: 'chili', category: 'favorite', effects: { mood: 8, bond: 4 }, preferenceTags: ['spicy'] }, { species });
assert.ok(['excellent', 'good', 'normal'].includes(deriveCondition(mon)), 'care keeps the monster in decent condition');

// 3) GROW to Lv.20 (the accumulated journey) — never exceeds the cap.
addGrowthExp(mon, cumulativeExpToLevel(20));
assert.equal(mon.level, 20, 'monster reaches Lv.20');
assert.equal(trainingCapacity(mon.level), 200, 'Lv.20 unlocks 200 training capacity');

// 4) TRAIN Power via Ranch into the shared pool (respecting diminishing + capacity).
let guard = 0;
while (mon.training.power < 75 && guard++ < 100) {
  const condition = deriveCondition(mon);
  const gain = trainingGain({ baseGain: 15, currentValue: mon.training.power, aptitudeStars: mon.aptitude.power, condition, capacityRemaining: trainingCapacity(mon.level) - trainingUsed(mon) });
  if (gain <= 0) break;
  addTrainingExp(mon, 'power', gain);
}
assert.ok(mon.training.power >= 70, 'Ranch training builds Power past the evolution requirement');
assert.ok(trainingUsed(mon) <= trainingCapacity(mon.level), 'training never exceeds the shared capacity');

// 5) BATTLE — meaningful contribution vs elites feeds Growth/Training/career (R4).
const eliteEvents = [
  { category: 'power', amount: 4, meaningful: true },
  { category: 'speed', amount: 2, meaningful: true },
];
for (let i = 0; i < 3; i++) {
  const result = resolveBattleGrowth({ monster: mon, enemy: { level: 20, tier: 'elite' }, events: eliteEvents, outcome: 'win' });
  applyBattleGrowth(mon, result);
}
assert.ok(mon.career.eliteWins >= 2, 'elite wins accumulate toward evolution eligibility');
assert.ok(trainingUsed(mon) <= trainingCapacity(mon.level), 'battle training also respects the shared capacity');

// 6) SKILL — learn, master through use, then a valid mutation (R7).
learnSkill(mon, { skillId: 'flame_bite', slot: 's1' });
addSkillExp(mon, 'flame_bite', BALANCE_CONFIG.skill.masteryThresholds.master);
assert.equal(getSkill(mon, 'flame_bite').masteryRank, 'master', 'skill reaches Master through use');
const mut = applyMutation(mon, {
  skillId: 'flame_bite',
  baseSkillDef: { id: 'flame_bite', damage: 100 },
  mutationDef: { id: 'flame_bite_pierce', damage: 106, tradeoffs: [{ stat: 'cooldown', delta: '+1.5s' }] },
});
assert.equal(mut.ok, true, 'a Master skill with a trade-off can mutate within budget');

// 7) EQUIP — a loadout within the 8-12% budget (R9).
const loadout = [
  { id: 'flame_claw', slot: 'gear', affixes: [{ group: 'atk', stat: 'atk', value: 5 }] },
  { id: 'guard_band', slot: 'charm', affixes: [{ group: 'def', stat: 'def', value: 4 }] },
  { id: 'focus_lens', slot: 'utility', affixes: [{ group: 'cdr', derived: 'cooldownReduction', value: 0.03 }] },
];
for (const item of loadout) equipItem(mon, item);
const build = { level: 20, species, genes: mon.genes, training: mon.training, condition: 'good' };
const budget = checkEquipmentBudget(build, computeEquipmentContribution(loadout));
assert.ok(budget.withinBudget, `loadout stays within equipment budget (${(budget.share * 100).toFixed(1)}%)`);

// 8) EVOLUTION — the raising profile opens Flame Wolf; identity is preserved (R10).
const flameWolf = {
  id: 'to_flame_wolf', fromFormId: 'flame_slime', toFormId: 'flame_wolf',
  requirements: { required: [
    { field: 'level', op: 'gte', value: 20 },
    { field: 'training.power', op: 'gte', value: 70 },
    { field: 'career.eliteWins', op: 'gte', value: 2 },
  ] },
  profile: { atk: 1.08, def: 0.96, spd: 1.02 },
  skillMapping: { flame_bite: { to: 'flame_fang', carry: 0.85 } },
};
assert.deepEqual(listEligibleBranches(mon, [flameWolf]), ['to_flame_wolf'], 'only the earned branch is eligible');
const idBefore = mon.instanceId;
const geneBefore = JSON.stringify(mon.genes);
const trainingBefore = JSON.stringify(mon.training);
const evo = commitEvolution(mon, flameWolf, { ownedItemCompat: { flame_claw: true, guard_band: true, focus_lens: true } });
assert.equal(evo.ok, true, 'evolution commits');
assert.equal(mon.instanceId, idBefore, 'instanceId preserved through evolution');
assert.equal(JSON.stringify(mon.genes), geneBefore, 'genes preserved through evolution');
assert.equal(JSON.stringify(mon.training), trainingBefore, 'training preserved through evolution');
assert.ok(getSkill(mon, 'flame_fang'), 'skill carried into evolved form');

// 9) BOSS — the first boss is uncapturable; a win records a milestone (R14/R4).
assert.equal(captureChance({ speciesRate: 0.9, hpRatio: 0.05, tierModifier: BALANCE_CONFIG.capture.bossTierModifier }), 0, 'boss cannot be captured');
const bossResult = resolveBattleGrowth({ monster: mon, enemy: { level: 24, tier: 'boss', milestoneId: 'first_boss' }, events: eliteEvents, outcome: 'win' });
applyBattleGrowth(mon, bossResult);
assert.ok(mon.career.milestones.includes('first_boss'), 'first boss win records a career milestone');
assert.equal(mon.career.bossWins, 1, 'boss win recorded');

// 10) BREEDING → NEXT GENERATION — potential passes on; no raw power creep (R13).
const partner = normalizeInstance({
  instanceId: 'partner', speciesId: 'flame_slime', level: 30, generation: 1,
  genes: { hp: 'C', atk: 'B', def: 'A', spd: 'B' }, aptitude: species.aptitudeBase,
});
const bred = breed(mon, partner, { species, seed: 'gen2' });
assert.equal(bred.ok, true, 'two unrelated adults breed');
const child = bred.child;
assert.equal(child.level, 1, 'next generation starts at Lv.1');
assert.equal(child.generation, mon.generation + 1, 'generation increments');
assert.equal(trainingUsed(child), 0, 'child inherits no training (potential only)');
assert.equal(child.skills.length, 0, 'child inherits no skill mastery');

// --- Balance exit gates (R21 / R26) ----------------------------------------
// Same-level builds sit in a tight CR band with distinct roles.
const gate = compareBuilds(ARCHETYPES);
assert.ok(gate.withinTolerance, 'balance exit gate: same-level builds share a CR band');

// Save round-trips through migration with no loss/duplication (R21 Save).
const state = { collection: [mon, partner, child], party: ['hero', null, null], storage: ['partner'], inventory: { captureBalls: 5 }, saveVersion: 7 };
const migrated = migrateState(state);
const reMigrated = migrateState(migrated);
assert.equal(migrated.saveVersion, 8, 'state migrates to save version 8');
assert.equal(migrated.collection.length, 3, 'no monster lost in migration');
assert.equal(new Set(migrated.collection.map(m => m.instanceId)).size, 3, 'no duplicate instances after migration');
assert.deepEqual(reMigrated.collection.map(m => m.instanceId), migrated.collection.map(m => m.instanceId), 'migration is idempotent');
const heroAfter = migrated.collection.find(m => m.instanceId === 'hero');
assert.equal(heroAfter.formId, 'flame_wolf', 'evolved form survives save/load');
assert.equal(heroAfter.career.bossWins, 1, 'career survives save/load');

console.log('V8.0 vertical slice integration + balance exit gate: PASS');
