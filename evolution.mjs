// Monster Life RPG — V7.7 Evolution
// Evolution is the result of a Raising Profile, not a level-up skin swap (A3, R10).
// It preserves the Instance identity (Gene/Parents/Generation/Bond/Training/History)
// and only redistributes power (+5-8% total budget) while changing skill pool and
// passives. Branch selection is player-driven — never auto-evolve to the top score.

import { BALANCE_CONFIG } from './balance-config.mjs';
import { clamp } from './balance-formulas.mjs';
import { combatRating, CORE_STATS } from './combat-rating.mjs';
import { evaluateEligibility } from './requirements.mjs';
import { masteryRankFromExp } from './skill-progression.mjs';
import { appendHistory } from './monster-instance.mjs';

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

// Build a requirement-engine context from an instance (R10 requirement types).
export function evolutionContext(instance) {
  const skillMastery = {};
  for (const s of instance.skills ?? []) skillMastery[s.skillId] = s.masteryRank;
  return {
    level: instance.level,
    training: instance.training,
    aptitude: instance.aptitude,
    bond: instance.mind?.bond,
    trust: instance.mind?.trust,
    discipline: instance.mind?.discipline,
    traitIds: instance.traitIds,
    skillMastery,
    career: instance.career,
    zoneTime: instance.zoneTime ?? {},
    foodHistory: instance.foodHistory ?? {},
    currentZone: instance.currentZone ?? null,
    weather: instance.weather ?? null,
    formId: instance.formId,
  };
}

export function evaluateEvolution(evoDef, instance) {
  const result = evaluateEligibility(evoDef?.requirements ?? {}, evolutionContext(instance));
  return { evolutionId: evoDef?.id, toFormId: evoDef?.toFormId, ...result };
}

// List every eligible branch. The player chooses; the system never auto-picks (R10).
export function listEligibleBranches(instance, evoDefs) {
  return (evoDefs ?? [])
    .filter(def => (def.fromFormId ?? null) === (instance.formId ?? null))
    .map(def => ({ def, result: evaluateEvolution(def, instance) }))
    .filter(({ result }) => result.eligible)
    .map(({ def }) => def.id);
}

// R10 — Verify an evolution profile adds only ~5-8% total combat power.
export function checkEvolutionBudget(build, evolutionProfile, config = BALANCE_CONFIG) {
  const before = combatRating({ ...build, evolutionProfile: undefined }, config).cr;
  const after = combatRating({ ...build, evolutionProfile }, config).cr;
  const share = before > 0 ? (after - before) / before : 0;
  const { min, max } = config.evolution.budget;
  return { before, after, share, withinBudget: share >= min - 1e-9 && share <= max + 1e-9, min, max };
}

// Preview the outcome of choosing a branch (stat/CR change + carried skills).
export function previewEvolution(instance, evoDef, build, config = BALANCE_CONFIG) {
  const budget = build ? checkEvolutionBudget(build, evoDef.profile, config) : null;
  const skillCarry = (instance.skills ?? []).map(s => {
    const map = evoDef.skillMapping?.[s.skillId];
    const carry = map ? clamp(map.carry ?? 1, config.evolution.minSkillCarry, config.evolution.maxSkillCarry) : 1;
    return { from: s.skillId, to: map?.to ?? s.skillId, carry };
  });
  return { toFormId: evoDef.toFormId, profile: evoDef.profile, secondaryType: evoDef.addsSecondaryType ?? null, budget, skillCarry };
}

// Commit an evolution on the SAME instance. Preserves identity + history (R10, P1).
export function commitEvolution(instance, evoDef, { now = Date.now(), ownedItemCompat = {} } = {}, config = BALANCE_CONFIG) {
  const eligibility = evaluateEvolution(evoDef, instance);
  if (!eligibility.eligible) return { ok: false, reason: 'not eligible', eligibility };

  const fromFormId = instance.formId ?? null;

  // Identity anchors that MUST NOT change.
  const preservedInstanceId = instance.instanceId;
  const preservedParents = instance.parents;
  const preservedGeneration = instance.generation;
  const preservedGenes = instance.genes;

  // Change form + profile + (optional) secondary type.
  instance.formId = evoDef.toFormId;
  instance.evolutionProfile = { ...(instance.evolutionProfile ?? {}) };
  for (const stat of CORE_STATS) {
    instance.evolutionProfile[stat] = num(evoDef.profile?.[stat], 1) || 1;
  }
  if (evoDef.addsSecondaryType) instance.secondaryType = evoDef.addsSecondaryType;

  // Map skill mastery (carry 70-100%); unmapped skills carry 100% (R10).
  const carried = [];
  for (const skill of instance.skills ?? []) {
    const map = evoDef.skillMapping?.[skill.skillId];
    if (map) {
      const carry = clamp(map.carry ?? 1, config.evolution.minSkillCarry, config.evolution.maxSkillCarry);
      skill.skillId = map.to ?? skill.skillId;
      skill.masteryExp = Math.round(num(skill.masteryExp) * carry);
      skill.masteryRank = masteryRankFromExp(skill.masteryExp, config);
      carried.push({ to: skill.skillId, carry });
    }
  }

  // Keep compatible equipment, otherwise unequip (reversible, R10).
  const unequipped = [];
  if (instance.equipment) {
    for (const slot of Object.keys(instance.equipment)) {
      const item = instance.equipment[slot];
      if (!item) continue;
      const compatible = ownedItemCompat[item.id] !== false;
      if (!compatible) {
        unequipped.push(item.id);
        instance.equipment[slot] = null;
      }
    }
  }

  // Append to evolution + life history (never reset — P1).
  if (!Array.isArray(instance.evolutionHistory)) instance.evolutionHistory = [];
  instance.evolutionHistory.push({ from: fromFormId, to: evoDef.toFormId, evolutionId: evoDef.id, at: now });
  appendHistory(instance, { type: 'evolution', from: fromFormId, to: evoDef.toFormId }, now);

  // Assert identity anchors survived.
  instance.instanceId = preservedInstanceId;
  instance.parents = preservedParents;
  instance.generation = preservedGeneration;
  instance.genes = preservedGenes;

  return { ok: true, fromFormId, toFormId: evoDef.toFormId, carried, unequipped };
}
