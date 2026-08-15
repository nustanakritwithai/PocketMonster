import assert from 'node:assert/strict';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  computeSkillExp,
  masteryRankFromExp,
  masteryRawPower,
  learnSkill,
  addSkillExp,
  getSkill,
  evaluateSkillCandidate,
  listSkillCandidates,
  validateMutation,
  applyMutation,
} from '../skill-progression.mjs';

const mk = (over = {}) => normalizeInstance({ instanceId: 's1', level: 20, ...over });

// Skill EXP: miss/immune = 0; novelty decays with spam (R7).
assert.equal(computeSkillExp({ base: 10, hitQuality: 0 }), 0, 'a miss grants no skill EXP');
assert.equal(computeSkillExp({ base: 10, contribution: 0 }), 0, 'no contribution grants no skill EXP');
const clean = computeSkillExp({ base: 10, hitQuality: 1, targetTier: 1, spamCount: 0, contribution: 1 });
const spammed = computeSkillExp({ base: 10, hitQuality: 1, targetTier: 1, spamCount: 5, contribution: 1 });
assert.ok(clean > 0, 'a good hit grants skill EXP');
assert.ok(spammed < clean, 'spamming the same skill diminishes skill EXP');
assert.ok(computeSkillExp({ base: 10, targetTier: 2 }) > clean, 'tougher targets grant more skill EXP');

// Mastery ranks from cumulative EXP (R7 thresholds).
const t = BALANCE_CONFIG.skill.masteryThresholds;
assert.equal(masteryRankFromExp(0), 'novice');
assert.equal(masteryRankFromExp(t.familiar), 'familiar');
assert.equal(masteryRankFromExp(t.skilled), 'skilled');
assert.equal(masteryRankFromExp(t.expert), 'expert');
assert.equal(masteryRankFromExp(t.master), 'master');
assert.ok(masteryRawPower('master') <= 0.12 + 1e-9, 'mastery raw power stays within ~12% budget');
assert.ok(masteryRawPower('master') > masteryRawPower('novice'), 'higher mastery grants more raw power');

// Learn + gain mastery through use.
const user = mk();
learnSkill(user, { skillId: 'flame_bite', slot: 's1' });
assert.ok(getSkill(user, 'flame_bite'), 'skill learned');
const rankUp = addSkillExp(user, 'flame_bite', t.familiar);
assert.equal(rankUp.toRank, 'familiar', 'accumulated EXP raises mastery');
assert.equal(rankUp.rankedUp, true, 'rank-up is reported');

// Candidate eligibility is data-driven (R7).
const skillDef = { id: 'flame_rush', requirements: { required: [{ field: 'level', op: 'gte', value: 15 }, { field: 'training.power', op: 'gte', value: 40 }] } };
const weak = mk({ level: 10, training: { power: 10 } });
const ready = mk({ level: 20, training: { power: 60 } });
assert.equal(evaluateSkillCandidate(skillDef, weak).eligible, false, 'under-leveled/under-trained monster is not a candidate');
assert.equal(evaluateSkillCandidate(skillDef, ready).eligible, true, 'meeting requirements makes it a candidate');
assert.deepEqual(listSkillCandidates([skillDef], ready), ['flame_rush'], 'candidate list surfaces eligible unlearned skills');
learnSkill(ready, { skillId: 'flame_rush', slot: 's3' });
assert.deepEqual(listSkillCandidates([skillDef], ready), [], 'already-known skills are not re-listed');

// Mutation requires Master rank + a measurable trade-off + budget compliance (R7).
const mutant = mk();
learnSkill(mutant, { skillId: 'flame_rush', slot: 's3' });
const base = { id: 'flame_rush', damage: 100, utility: 0 };
const goodMut = { id: 'flame_rush_burst', damage: 108, utility: 0, tradeoffs: [{ stat: 'cooldown', delta: '+2s' }] };
// Not yet Master.
assert.equal(validateMutation({ skill: getSkill(mutant, 'flame_rush'), baseSkillDef: base, mutationDef: goodMut }).ok, false, 'mutation blocked below Master');
addSkillExp(mutant, 'flame_rush', t.master);
assert.equal(getSkill(mutant, 'flame_rush').masteryRank, 'master', 'reached Master');
// No trade-off -> rejected.
const noTradeoff = { id: 'm2', damage: 105, tradeoffs: [] };
assert.equal(validateMutation({ skill: getSkill(mutant, 'flame_rush'), baseSkillDef: base, mutationDef: noTradeoff }).ok, false, 'mutation without a trade-off is rejected');
// Over-budget power -> rejected.
const overBudget = { id: 'm3', damage: 130, tradeoffs: [{ stat: 'cost', delta: '+50%' }] };
assert.equal(validateMutation({ skill: getSkill(mutant, 'flame_rush'), baseSkillDef: base, mutationDef: overBudget }).ok, false, 'mutation exceeding the power budget is rejected');
// Valid mutation applies.
const applied = applyMutation(mutant, { skillId: 'flame_rush', baseSkillDef: base, mutationDef: goodMut });
assert.equal(applied.ok, true, 'a valid Master mutation with a trade-off applies');
assert.equal(getSkill(mutant, 'flame_rush').mutationId, 'flame_rush_burst', 'mutation recorded on the skill');

console.log('V7.5 skill progression regression: PASS');
