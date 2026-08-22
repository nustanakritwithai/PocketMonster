// Monster Life RPG — V7.5 Skill Progression
// Skills are learned and mastered through USE, not auto-unlocked by level (A3).
// This layer computes Skill EXP (miss/immune = 0), mastery ranks with a bounded
// raw-power increase, candidate eligibility, and mutation with a mandatory
// trade-off inside the skill power budget (R7). Resolver is UI-independent (R24).

import { BALANCE_CONFIG, SKILL_MASTERY } from './balance-config.mjs';
import { clamp } from './balance-formulas.mjs';
import { evaluateEligibility, MASTERY_RANK_ORDER } from './requirements.mjs';
import { skillCatalogEntry } from './skill-catalog.mjs';
import { learnsetEntriesForMonster } from './learnset-catalog.mjs';
import { monsterCatalogEntry } from './monster-catalog.mjs';

export const MANUAL_SKILL_SLOTS = Object.freeze(['s1', 's2', 's3']);
export const SYSTEM_SKILL_SLOTS = Object.freeze(['basicAI', 'passive', 'evolutionTrait']);
export const SKILL_SLOTS = Object.freeze([...SYSTEM_SKILL_SLOTS.slice(0, 1), ...MANUAL_SKILL_SLOTS, ...SYSTEM_SKILL_SLOTS.slice(1)]);

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

// R7 — skillExp = base × hitQuality × targetTier × novelty × contribution.
// Miss / immune / no-effect (hitQuality <= 0) grants 0.
export function computeSkillExp({
  base = 10,
  hitQuality = 1,
  targetTier = 1,
  spamCount = 0,
  contribution = 1,
} = {}, config = BALANCE_CONFIG) {
  if (!(hitQuality > 0) || !(contribution > 0)) return 0;
  const novelty = config.skill.noveltyDecay ** Math.max(0, spamCount);
  const exp = base * hitQuality * targetTier * novelty * clamp(contribution, 0, 1);
  return Math.max(0, Math.round(exp));
}

// Resolve mastery rank from cumulative skill EXP (R7).
export function masteryRankFromExp(masteryExp, config = BALANCE_CONFIG) {
  const t = config.skill.masteryThresholds;
  const exp = num(masteryExp, 0);
  if (exp >= t.master) return 'master';
  if (exp >= t.expert) return 'expert';
  if (exp >= t.skilled) return 'skilled';
  if (exp >= t.familiar) return 'familiar';
  return 'novice';
}

// Cumulative raw-power multiplier granted by a mastery rank (R7, ~0..+11%).
export function masteryRawPower(rank) {
  return SKILL_MASTERY[rank]?.rawPower ?? 0;
}

export function getSkill(instance, skillId) {
  return (instance.skills ?? []).find(s => s.skillId === skillId) ?? null;
}

// Learn a skill into a slot (candidate → owned). No-op if already known.
export function learnSkill(instance, { skillId, slot = 's1' }) {
  if (!Array.isArray(instance.skills)) instance.skills = [];
  if (slot !== null && !SKILL_SLOTS.includes(slot)) return null;
  if (getSkill(instance, skillId)) return getSkill(instance, skillId);
  const record = { skillId, slot, masteryExp: 0, masteryRank: 'novice', mutationId: null };
  instance.skills.push(record);
  return record;
}

function equipResult(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

export function manualSkillLoadout(instance) {
  const skills = Array.isArray(instance?.skills) ? instance.skills : [];
  return Object.freeze(MANUAL_SKILL_SLOTS.map(slot => {
    const equipped = skills.find(skill => skill?.slot === slot) ?? null;
    return Object.freeze({ slot, skillId: equipped?.skillId ?? null, skill: equipped });
  }));
}

export function basicAiSkill(instance) {
  return (Array.isArray(instance?.skills) ? instance.skills : [])
    .find(skill => skill?.slot === 'basicAI') ?? null;
}

export function validateSkillSlotState(instance) {
  const skills = Array.isArray(instance?.skills) ? instance.skills : [];
  const issues = [];
  const occupied = new Map();
  const skillIds = new Set();
  for (let index = 0; index < skills.length; index += 1) {
    const skill = skills[index];
    if (typeof skill?.skillId === 'string') {
      if (skillIds.has(skill.skillId)) issues.push(Object.freeze({ code: 'duplicate_skill', index, skillId: skill.skillId }));
      else skillIds.add(skill.skillId);
    }
    const slot = skill?.slot ?? null;
    if (slot !== null && !SKILL_SLOTS.includes(slot)) {
      issues.push(Object.freeze({ code: 'slot_locked', index, slot }));
      continue;
    }
    if (!MANUAL_SKILL_SLOTS.includes(slot)) continue;
    if (occupied.has(slot)) issues.push(Object.freeze({ code: 'duplicate_slot', index, slot }));
    else occupied.set(slot, index);
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function equipSkill(instance, { skillId, slot } = {}) {
  if (!instance || typeof instance !== 'object' || !Array.isArray(instance.skills)) {
    return equipResult(false, 'invalid_state');
  }
  if (!MANUAL_SKILL_SLOTS.includes(slot)) {
    return equipResult(false, 'slot_locked', { slot: slot ?? null });
  }
  const definition = skillCatalogEntry(skillId);
  if (!definition) return equipResult(false, 'unknown_id', { skillId: skillId ?? null });
  const learned = getSkill(instance, skillId);
  if (!learned) return equipResult(false, 'not_learned', { skillId });
  const occupant = instance.skills.find(skill => skill !== learned && skill?.slot === slot);
  if (occupant) return equipResult(false, 'duplicate_slot', { slot, occupiedBy: occupant.skillId });
  learned.slot = slot;
  return equipResult(true, null, { skillId, slot, definition });
}

export function resolveStage1Learnset(instance) {
  if (!instance || typeof instance !== 'object') {
    return Object.freeze({ ok: false, reason: 'invalid_state', entries: Object.freeze([]), candidates: Object.freeze([]) });
  }
  const mapping = monsterCatalogEntry(instance.speciesId);
  if (!mapping) {
    return Object.freeze({ ok: false, reason: 'unknown_id', entries: Object.freeze([]), candidates: Object.freeze([]) });
  }
  const level = Number.isFinite(instance.level) ? Math.max(1, Math.floor(instance.level)) : 1;
  const entries = learnsetEntriesForMonster(mapping.workbookBaseMonsterId)
    .filter(entry => entry.stage === 1 && entry.requiredStage === 1 && entry.method === 'LevelUp')
    .map(entry => Object.freeze({
      entry,
      skillId: entry.skillId,
      learnLevel: entry.learnLevel,
      eligible: level >= entry.learnLevel,
      learned: Boolean(getSkill(instance, entry.skillId)),
      reason: level < entry.learnLevel ? 'level_required' : getSkill(instance, entry.skillId) ? 'already_learned' : null,
    }));
  const candidates = Object.freeze(entries
    .filter(result => result.eligible && !result.learned)
    .map(result => result.skillId));
  return Object.freeze({
    ok: true,
    reason: null,
    runtimeSpeciesId: instance.speciesId,
    workbookMonsterId: mapping.workbookBaseMonsterId,
    level,
    entries: Object.freeze(entries),
    candidates,
    autoGrant: false,
  });
}

export function listStage1SkillCandidates(instance) {
  return resolveStage1Learnset(instance).candidates;
}

// Add Skill EXP from a use event and recompute mastery rank.
export function addSkillExp(instance, skillId, exp, config = BALANCE_CONFIG) {
  const skill = getSkill(instance, skillId);
  if (!skill) return null;
  const fromRank = skill.masteryRank;
  skill.masteryExp = num(skill.masteryExp, 0) + Math.max(0, num(exp, 0));
  skill.masteryRank = masteryRankFromExp(skill.masteryExp, config);
  return {
    skillId,
    masteryExp: skill.masteryExp,
    fromRank,
    toRank: skill.masteryRank,
    rankedUp: MASTERY_RANK_ORDER.indexOf(skill.masteryRank) > MASTERY_RANK_ORDER.indexOf(fromRank),
    rawPower: masteryRawPower(skill.masteryRank),
  };
}

// Build a context for the requirement engine from an instance.
function skillContext(instance) {
  const skillMastery = {};
  for (const s of instance.skills ?? []) skillMastery[s.skillId] = s.masteryRank;
  return {
    level: instance.level,
    training: instance.training,
    aptitude: instance.aptitude,
    bond: instance.mind?.bond,
    trust: instance.mind?.trust,
    traitIds: instance.traitIds,
    types: [instance.speciesType, instance.secondaryType].filter(Boolean),
    skillMastery,
    career: instance.career,
  };
}

// A skill becomes a candidate to learn when its eligibility is met (R7).
export function evaluateSkillCandidate(skillDef, instance) {
  const result = evaluateEligibility(skillDef?.requirements ?? {}, skillContext(instance));
  return { skillId: skillDef?.id, ...result };
}

export function listSkillCandidates(skillDefs, instance) {
  return (skillDefs ?? [])
    .map(def => ({ def, result: evaluateSkillCandidate(def, instance) }))
    .filter(({ def, result }) => result.eligible && !getSkill(instance, def.id))
    .map(({ def }) => def.id);
}

// A raw-power rating for a skill definition (for mutation budget checks).
export function skillPowerRating(skillDef = {}) {
  return num(skillDef.damage, 0) + num(skillDef.utility, 0) * 0.5;
}

// R7 Mutation Rule — a mutation needs Master rank, at least one measurable
// trade-off, and must not exceed the base skill's power beyond the budget delta.
export function validateMutation({ skill, baseSkillDef, mutationDef }, config = BALANCE_CONFIG) {
  if (!skill) return { ok: false, reason: 'skill not owned' };
  if (skill.masteryRank !== 'master') return { ok: false, reason: 'requires Master mastery' };
  const tradeoffs = mutationDef?.tradeoffs;
  if (!Array.isArray(tradeoffs) || tradeoffs.length === 0) {
    return { ok: false, reason: 'mutation must have at least one measurable trade-off' };
  }
  const basePower = skillPowerRating(baseSkillDef);
  const mutatedPower = skillPowerRating(mutationDef);
  const maxAllowed = basePower * (1 + config.skill.mutationMaxPowerDelta);
  if (mutatedPower > maxAllowed) {
    return { ok: false, reason: 'mutation exceeds the skill power budget', basePower, mutatedPower, maxAllowed };
  }
  return { ok: true, basePower, mutatedPower, maxAllowed };
}

export function applyMutation(instance, { skillId, baseSkillDef, mutationDef }, config = BALANCE_CONFIG) {
  const skill = getSkill(instance, skillId);
  const validation = validateMutation({ skill, baseSkillDef, mutationDef }, config);
  if (!validation.ok) return validation;
  skill.mutationId = mutationDef.id;
  return { ok: true, mutationId: mutationDef.id, ...validation };
}
