// Monster Life RPG — V7.3 Battle Growth
// Converts meaningful in-battle behavior into Growth EXP + Training EXP (into the
// SAME shared pool as Ranch training) + career milestones, under per-encounter
// caps and anti-grind rules (R4). Battle is NOT a separate stat layer (R1, C7).

import { BALANCE_CONFIG } from './balance-config.mjs';
import { relativeLevelExpModifier, clamp } from './balance-formulas.mjs';
import { TRAINING_LINES, addGrowthExp, addTrainingExp, appendHistory } from './monster-instance.mjs';

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

// Estimate an encounter's threat from level + tier when not supplied.
export function threatScore(enemy = {}, config = BALANCE_CONFIG) {
  if (Number.isFinite(enemy.threatScore)) return enemy.threatScore;
  const tierWeight = config.battle.threatByTier[enemy.tier] ?? 1;
  return num(enemy.level, 1) / 10 + tierWeight;
}

// Per-encounter training cap for a single category (R4 anti-grind).
export function encounterTrainingCap(enemy = {}, config = BALANCE_CONFIG) {
  const { floor, base, threatCoeff } = config.battle.encounterCap;
  return Math.max(floor, Math.round(base + threatScore(enemy, config) * threatCoeff));
}

// Aggregate meaningful contributions per training category with novelty decay,
// then clamp each category to the per-encounter cap.
function resolveTrainingByCategory(events, enemy, config) {
  const cap = encounterTrainingCap(enemy, config);
  const decay = config.battle.noveltyDecay;
  const counts = {};
  const totals = {};
  for (const line of TRAINING_LINES) totals[line] = 0;

  for (const event of Array.isArray(events) ? events : []) {
    const category = event?.category;
    if (!TRAINING_LINES.includes(category)) continue;
    if (event.meaningful === false) continue; // Meaningful-contribution check.
    const amount = Math.max(0, num(event.amount, 0));
    if (amount <= 0) continue;
    const occurrence = counts[category] ?? 0;
    counts[category] = occurrence + 1;
    totals[category] += amount * decay ** occurrence; // Unique-action diminishing.
  }

  const capped = {};
  for (const line of TRAINING_LINES) capped[line] = Math.min(totals[line], cap);
  return { trainingExp: capped, cap };
}

// Compute (but do not apply) battle growth for the ACTIVE monster.
export function resolveBattleGrowth({ monster, enemy = {}, events = [], outcome = 'win' } = {}, config = BALANCE_CONFIG) {
  const monsterLevel = num(monster?.level, 1);
  const relative = relativeLevelExpModifier(num(enemy.level, monsterLevel), monsterLevel, config);
  const tier = enemy.tier ?? 'normal';
  const growthBase = config.battle.growthBaseByTier[tier] ?? config.battle.growthBaseByTier.normal;
  const won = outcome === 'win';

  const { trainingExp, cap } = resolveTrainingByCategory(events, enemy, config);
  const hasContribution = TRAINING_LINES.some(line => trainingExp[line] > 0);

  let growthMultiplier = won ? 1 : config.battle.loseGrowthMultiplier;
  if (!hasContribution) growthMultiplier *= config.battle.noContributionGrowthShare;
  const growthExp = Math.round(growthBase * relative * growthMultiplier);

  // Career + milestones only on victory (no farm on losses/repeats).
  const career = { battleWins: 0, eliteWins: 0, bossWins: 0, trials: 0 };
  const milestonesAwarded = [];
  if (won) {
    career.battleWins = 1;
    if (tier === 'elite') career.eliteWins = 1;
    if (tier === 'boss') career.bossWins = 1;
    if (tier === 'trial') career.trials = 1;
    const already = new Set(monster?.career?.milestones ?? []);
    if ((tier === 'boss' || tier === 'trial') && enemy.milestoneId && !already.has(enemy.milestoneId)) {
      milestonesAwarded.push(enemy.milestoneId);
    }
  }

  return {
    outcome,
    tier,
    relativeModifier: relative,
    trainingCap: cap,
    growthExp,
    trainingExp,
    hasContribution,
    career,
    milestonesAwarded,
  };
}

// Growth EXP a non-active party member receives (share only, no training) (R2).
export function resolvePartyShareGrowth({ enemy = {}, activeGrowthExp = 0 } = {}, config = BALANCE_CONFIG) {
  return Math.round(Math.max(0, num(activeGrowthExp, 0)) * config.battle.partyGrowthShare);
}

// Apply a resolved result to an instance (mutates), returning what changed.
export function applyBattleGrowth(instance, result, { now = Date.now() } = {}, config = BALANCE_CONFIG) {
  const growth = addGrowthExp(instance, result.growthExp, config);
  const trainingApplied = {};
  for (const line of TRAINING_LINES) {
    trainingApplied[line] = addTrainingExp(instance, line, result.trainingExp[line] ?? 0, config);
  }
  instance.career.battleWins += result.career.battleWins;
  instance.career.eliteWins += result.career.eliteWins;
  instance.career.bossWins += result.career.bossWins;
  instance.career.trials += result.career.trials;
  for (const milestone of result.milestonesAwarded) {
    if (!instance.career.milestones.includes(milestone)) instance.career.milestones.push(milestone);
  }
  appendHistory(instance, { type: 'battle', tier: result.tier, outcome: result.outcome, growthExp: result.growthExp }, now);
  return { growth, trainingApplied };
}
