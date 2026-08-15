import assert from 'node:assert/strict';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import { normalizeInstance, trainingUsed } from '../monster-instance.mjs';
import {
  threatScore,
  encounterTrainingCap,
  resolveBattleGrowth,
  resolvePartyShareGrowth,
  applyBattleGrowth,
} from '../battle-growth.mjs';

const mk = (over = {}) => normalizeInstance({ instanceId: 'b1', level: 20, ...over });

// Threat + per-encounter cap scale with tier (R4 anti-grind).
assert.ok(encounterTrainingCap({ level: 20, tier: 'boss' }) > encounterTrainingCap({ level: 20, tier: 'normal' }), 'bosses allow a larger training cap than trash');
assert.ok(threatScore({ level: 20, tier: 'elite' }) > threatScore({ level: 20, tier: 'normal' }), 'elite threat exceeds normal');

// Meaningful contribution earns capped, per-category training EXP.
const winEvents = [
  { category: 'power', amount: 3, meaningful: true },
  { category: 'power', amount: 3, meaningful: true },
  { category: 'defense', amount: 2, meaningful: true },
  { category: 'power', amount: 999, meaningful: false }, // ignored (not meaningful)
];
const win = resolveBattleGrowth({ monster: mk(), enemy: { level: 20, tier: 'strong' }, events: winEvents, outcome: 'win' });
assert.ok(win.growthExp > 0, 'a win grants Growth EXP');
assert.ok(win.trainingExp.power > 0, 'power contribution yields power training EXP');
assert.ok(win.trainingExp.power <= win.trainingCap, 'category training EXP is clamped to the encounter cap');
assert.equal(win.career.battleWins, 1, 'a win increments battle wins');

// Non-meaningful spam is rejected (can hit dummy / stand still = no EXP).
const spam = resolveBattleGrowth({ monster: mk(), enemy: { level: 20, tier: 'normal' }, events: [{ category: 'power', amount: 1000, meaningful: false }], outcome: 'win' });
assert.equal(spam.trainingExp.power, 0, 'meaningless spam earns no training EXP');
assert.ok(spam.growthExp < win.growthExp, 'no meaningful contribution reduces Growth EXP');

// Novelty decay: many repeats of the same action give diminishing returns.
const repeated = Array.from({ length: 10 }, () => ({ category: 'power', amount: 3, meaningful: true }));
const single = [{ category: 'power', amount: 3, meaningful: true }];
const rRepeat = resolveBattleGrowth({ monster: mk(), enemy: { level: 20, tier: 'elite' }, events: repeated, outcome: 'win' });
const rSingle = resolveBattleGrowth({ monster: mk(), enemy: { level: 20, tier: 'elite' }, events: single, outcome: 'win' });
assert.ok(rRepeat.trainingExp.power < 10 * 3, 'repeated identical actions diminish (not linear)');
assert.ok(rRepeat.trainingExp.power >= rSingle.trainingExp.power, 'more real contribution still grants at least as much');

// Losing grants no victory Growth EXP but still some training from what worked.
const loss = resolveBattleGrowth({ monster: mk(), enemy: { level: 20, tier: 'strong' }, events: winEvents, outcome: 'lose' });
assert.equal(loss.growthExp, 0, 'a loss grants no victory Growth EXP');
assert.ok(loss.trainingExp.power > 0, 'a loss still rewards training from successful actions');
assert.equal(loss.career.battleWins, 0, 'a loss does not increment wins');

// Relative-level modifier: a far-lower enemy grants far less Growth EXP.
const highMon = resolveBattleGrowth({ monster: mk({ level: 40 }), enemy: { level: 20, tier: 'normal' }, events: winEvents, outcome: 'win' });
const evenMon = resolveBattleGrowth({ monster: mk({ level: 20 }), enemy: { level: 20, tier: 'normal' }, events: winEvents, outcome: 'win' });
assert.ok(highMon.growthExp < evenMon.growthExp, 'grinding far-weaker enemies is heavily reduced');

// Boss milestone is awarded once (no repeat farm).
const boss = { level: 25, tier: 'boss', milestoneId: 'first_boss' };
const firstClear = resolveBattleGrowth({ monster: mk(), enemy: boss, outcome: 'win', events: winEvents });
assert.deepEqual(firstClear.milestonesAwarded, ['first_boss'], 'first boss clear awards the milestone');
const repeatClear = resolveBattleGrowth({ monster: mk({ career: { milestones: ['first_boss'] } }), enemy: boss, outcome: 'win', events: winEvents });
assert.deepEqual(repeatClear.milestonesAwarded, [], 'repeating a boss does not re-award the milestone');

// Party share: inactive members get a fraction of Growth EXP, no training.
const share = resolvePartyShareGrowth({ enemy: boss, activeGrowthExp: win.growthExp });
assert.ok(share > 0 && share < win.growthExp, 'party members share a fraction of Growth EXP');
assert.ok(Math.abs(share - win.growthExp * BALANCE_CONFIG.battle.partyGrowthShare) <= 1, 'party share uses the configured factor');

// Applying a result mutates the instance and respects the shared training pool.
const applyMon = mk();
const applied = applyBattleGrowth(applyMon, win);
assert.ok(applyMon.growthExp > 0, 'growth applied to instance');
assert.equal(applyMon.career.battleWins, 1, 'career updated on instance');
assert.ok(trainingUsed(applyMon) > 0, 'training applied into the shared pool');
assert.equal(applyMon.lifeHistory.at(-1).type, 'battle', 'battle appended to life history');

console.log('V7.3 battle growth regression: PASS');
