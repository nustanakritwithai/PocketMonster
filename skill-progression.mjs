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
import { resolveWorkbookEvolutionStage } from './evolution.mjs';

export const MANUAL_SKILL_SLOTS = Object.freeze(['s1', 's2', 's3', 's4']);
export const SYSTEM_SKILL_SLOTS = Object.freeze(['basicAI', 'passive', 'evolutionTrait']);
export const SKILL_SLOTS = Object.freeze([...SYSTEM_SKILL_SLOTS.slice(0, 1), ...MANUAL_SKILL_SLOTS, ...SYSTEM_SKILL_SLOTS.slice(1)]);
export const WORKBOOK_DEFAULT_SKILL_SUFFIXES = Object.freeze(['01', '02', '04', '03']);

const EMPTY_SKILL_IDS = Object.freeze([]);

const CONSUMED_SKILL_CASTS = new WeakMap();

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
  return (instance?.skills ?? []).find(s => s?.skillId === skillId) ?? null;
}

// Monster_Table.DefaultSkill1..4 and every Field Build_Preset use this exact
// order. This is a read-only template: learning/equipping remains explicit and
// must still satisfy the Learnset rules.
export function workbookDefaultSkillIds(runtimeSpeciesId) {
  const mapping = monsterCatalogEntry(runtimeSpeciesId);
  if (!mapping) return EMPTY_SKILL_IDS;
  const ids = WORKBOOK_DEFAULT_SKILL_SUFFIXES
    .map(suffix => `SK_${mapping.workbookTypeCandidate}_${suffix}`);
  if (ids.some(skillId => !skillCatalogEntry(skillId))) return EMPTY_SKILL_IDS;
  return Object.freeze(ids);
}

// Learn a skill into a slot (candidate → owned). No-op if already known.
export function learnSkill(instance, { skillId, slot = 's1' }) {
  if (!Array.isArray(instance.skills)) instance.skills = [];
  if (slot !== null && !SKILL_SLOTS.includes(slot)) return null;
  if (getSkill(instance, skillId)) return getSkill(instance, skillId);
  const definition = skillCatalogEntry(skillId);
  const record = {
    skillId,
    slot,
    masteryExp: 0,
    masteryRank: 'novice',
    mutationId: null,
    ...(definition ? { currentUses: definition.maxUses } : {}),
  };
  instance.skills.push(record);
  return record;
}

function skillUseResult(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, consumed: 0, ...detail });
}

function currentSkillUses(skill, maxUses) {
  if (skill?.currentUses == null) return maxUses;
  if (!Number.isFinite(skill.currentUses)) return 0;
  return Math.max(0, Math.min(maxUses, Math.floor(skill.currentUses)));
}

function consumedCastIds(instance, skillId, create = false) {
  let bySkill = CONSUMED_SKILL_CASTS.get(instance);
  if (!bySkill && create) {
    bySkill = new Map();
    CONSUMED_SKILL_CASTS.set(instance, bySkill);
  }
  let castIds = bySkill?.get(skillId);
  if (!castIds && create) {
    castIds = new Set();
    bySkill.set(skillId, castIds);
  }
  return castIds ?? null;
}

function rememberConsumedCast(instance, skillId, castId) {
  const castIds = consumedCastIds(instance, skillId, true);
  castIds.add(castId);
}

// Read-only command validation. A use is metered only after targeting/combat has
// accepted a manual cast; rejected commands never initialize or consume state.
export function evaluateSkillUse(instance, {
  skillId,
  castId,
  castAccepted = false,
} = {}) {
  if (!instance || typeof instance !== 'object' || !Array.isArray(instance.skills)) {
    return skillUseResult(false, 'invalid_state');
  }
  if (typeof castId !== 'string' || castId.trim() === '') {
    return skillUseResult(false, 'invalid_cast_id', { skillId: skillId ?? null });
  }
  const normalizedCastId = castId.trim();
  const definition = skillCatalogEntry(skillId);
  if (!definition) return skillUseResult(false, 'unknown_id', { skillId: skillId ?? null, castId: normalizedCastId });
  const skill = getSkill(instance, skillId);
  if (!skill) return skillUseResult(false, 'not_learned', { skillId, castId: normalizedCastId, maxUses: definition.maxUses });
  if (!MANUAL_SKILL_SLOTS.includes(skill.slot)) {
    return skillUseResult(false, 'manual_slot_required', { skillId, castId: normalizedCastId, slot: skill.slot ?? null, maxUses: definition.maxUses });
  }
  if (consumedCastIds(instance, skillId)?.has(normalizedCastId)) {
    return skillUseResult(false, 'duplicate_cast', {
      skillId,
      castId: normalizedCastId,
      currentUses: currentSkillUses(skill, definition.maxUses),
      maxUses: definition.maxUses,
    });
  }
  const currentUses = currentSkillUses(skill, definition.maxUses);
  if (castAccepted !== true) {
    return skillUseResult(false, 'cast_rejected', { skillId, castId: normalizedCastId, currentUses, maxUses: definition.maxUses });
  }
  if (currentUses <= 0) {
    return skillUseResult(false, 'no_uses', { skillId, castId: normalizedCastId, currentUses: 0, maxUses: definition.maxUses });
  }
  return skillUseResult(true, null, {
    skillId,
    castId: normalizedCastId,
    currentUses,
    nextUses: currentUses - 1,
    maxUses: definition.maxUses,
  });
}

// Commit one accepted cast. castId makes duplicate callbacks idempotent during
// the current runtime; A18 owns persistence/migration of the metered fields.
export function consumeSkillUse(instance, command = {}) {
  const result = evaluateSkillUse(instance, command);
  if (!result.ok) return result;
  const skill = getSkill(instance, result.skillId);
  skill.currentUses = result.nextUses;
  rememberConsumedCast(instance, result.skillId, result.castId);
  return skillUseResult(true, null, {
    skillId: result.skillId,
    castId: result.castId,
    consumed: 1,
    previousUses: result.currentUses,
    currentUses: result.nextUses,
    maxUses: result.maxUses,
  });
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

const STAGE2_NATIVE_METHODS = new Set(['LevelUp', 'Evolution']);

export function resolveStage2Learnset(instance) {
  if (!instance || typeof instance !== 'object') {
    return Object.freeze({
      ok: false,
      reason: 'invalid_state',
      entries: Object.freeze([]),
      candidates: Object.freeze([]),
      stage2: false,
      stageEvidence: null,
    });
  }
  const mapping = monsterCatalogEntry(instance.speciesId);
  if (!mapping) {
    return Object.freeze({
      ok: false,
      reason: 'unknown_id',
      entries: Object.freeze([]),
      candidates: Object.freeze([]),
      stage2: false,
      stageEvidence: null,
    });
  }
  const stage = resolveWorkbookEvolutionStage(instance);
  const level = Number.isFinite(instance.level) ? Math.max(1, Math.floor(instance.level)) : 1;
  const entries = learnsetEntriesForMonster(mapping.workbookStage2MonsterId, { includeBlocked: true })
    .map(entry => {
      const learned = Boolean(getSkill(instance, entry.skillId));
      const supportedMethod = STAGE2_NATIVE_METHODS.has(entry.method);
      let eligible = false;
      let reason = null;
      if (entry.state !== 'Active') reason = 'deferred';
      else if (!supportedMethod) reason = 'unavailable_by_system';
      else if (!stage.stage2) reason = 'evolution_required';
      else if (entry.method === 'LevelUp' && level < entry.learnLevel) reason = 'level_required';
      else if (learned) reason = 'already_learned';
      else eligible = true;
      return Object.freeze({
        entry,
        skillId: entry.skillId,
        method: entry.method,
        referenceLearnLevel: entry.learnLevel,
        eligible,
        learned,
        obtainable: eligible,
        reason,
      });
    });
  const candidates = Object.freeze(entries.filter(entry => entry.eligible).map(entry => entry.skillId));
  return Object.freeze({
    ok: true,
    reason: stage.reason,
    runtimeSpeciesId: instance.speciesId,
    workbookMonsterId: mapping.workbookStage2MonsterId,
    level,
    stage2: stage.stage2,
    stageEvidence: stage.stageEvidence,
    evolutionPath: stage.path,
    runtimeEvolutionDecision: stage.path.runtimeEvolutionDecision,
    supportedMethods: Object.freeze([...STAGE2_NATIVE_METHODS]),
    entries: Object.freeze(entries),
    candidates,
    autoGrant: false,
  });
}

export function listStage2SkillCandidates(instance) {
  return resolveStage2Learnset(instance).candidates;
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
