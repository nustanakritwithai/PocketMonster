// Monster Life RPG — V7.9 Breeding & Genetics
// Breeding passes on POTENTIAL (genes, aptitude, trait/skill potential), never the
// parents' training, level, mastery or gear, and Generation adds NO raw power
// (R1, R13). Close relatives are blocked. Fully deterministic under a seed (R23).

import { createRng } from './rng.mjs';
import { clamp } from './balance-formulas.mjs';
import { normalizeInstance, CORE_GENES } from './monster-instance.mjs';
import { resolveWorkbookEvolutionStage } from './evolution.mjs';
import { MONSTER_CATALOG } from './monster-catalog.mjs';
import { resolveSecondaryTypeAssignment } from './secondary-type-resolver.mjs';
import {
  resolveBreedingSkillMemory,
  resolveFamilySkillMemoryTarget,
} from './skill-progression.mjs';

export const GENE_RANKS = Object.freeze(['D', 'C', 'B', 'A', 'S']);
export const BREEDING_REQUIRED_STAGE = 2;
export const BREEDING_MIN_LEVEL = 20;
export const BREEDING_MIN_BOND = 50;
export const BREEDING_VERSION = 'BRD_v1.0';
export const PARENT_BREEDING_COOLDOWN_MS = 30 * 60 * 1000;
export const STANDARD_BREEDING_ROLES = Object.freeze({ eggHolder: 'Female', partner: 'Male' });
export const BREEDING_GROUPS = Object.freeze([
  'Field',
  'Water1',
  'Mineral',
  'Flying',
  'Bug',
  'Dragon',
  'Humanlike',
  'Amorphous',
]);
export const POTENTIAL_STATS = Object.freeze(['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']);
export const POTENTIAL_LIMITS = Object.freeze({ min: 0, max: 31 });

const BREEDING_PROFILE_RULES = Object.freeze({
  normalooze: Object.freeze(['Field', '50M/50F', 'Yes']),
  flameling: Object.freeze(['Field', '50M/50F', 'Yes']),
  aquapuff: Object.freeze(['Water1', '50M/50F', 'Yes']),
  voltkit: Object.freeze(['Field', '50M/50F', 'Yes']),
  mossbun: Object.freeze(['Field', '50M/50F', 'Yes']),
  frostowl: Object.freeze(['Field', '50M/50F', 'Yes']),
  punchcub: Object.freeze(['Humanlike', '50M/50F', 'Yes']),
  toxitoad: Object.freeze(['Field', '50M/50F', 'Yes']),
  sandmole: Object.freeze(['Field', '50M/50F', 'Yes']),
  galebird: Object.freeze(['Flying', '50M/50F', 'Yes']),
  mindcoon: Object.freeze(['Field', '50M/50F', 'Yes']),
  buglet: Object.freeze(['Bug', '50M/50F', 'Yes']),
  rockhorn: Object.freeze(['Mineral', '50M/50F', 'Yes']),
  ghostpurr: Object.freeze(['Amorphous', 'Genderless', 'SpecialRecipeOnly']),
  emberdrake: Object.freeze(['Dragon', '75M/25F', 'Yes']),
  voidhorn: Object.freeze(['Field', '50M/50F', 'Yes']),
  ironbug: Object.freeze(['Mineral', 'Genderless', 'SpecialRecipeOnly']),
  fairimp: Object.freeze(['Field', '25M/75F', 'Yes']),
});

export const WORKBOOK_BREEDING_PROFILES = Object.freeze(MONSTER_CATALOG.map(mapping => {
  const rule = BREEDING_PROFILE_RULES[mapping.runtimeSpeciesId];
  if (!rule) throw new TypeError(`Missing breeding profile for ${mapping.runtimeSpeciesId}`);
  const [breedingGroup, genderRule, breedingEligibility] = rule;
  return Object.freeze({
    runtimeSpeciesId: mapping.runtimeSpeciesId,
    childMonsterId: mapping.workbookBaseMonsterId,
    adultMonsterId: mapping.workbookStage2MonsterId,
    breedingGroup,
    genderRule,
    breedingEligibility,
    hatchTimeMin: 15,
    baseBond: 10,
    requiredStage: BREEDING_REQUIRED_STAGE,
    requiredLevel: BREEDING_MIN_LEVEL,
    breedingVersion: BREEDING_VERSION,
  });
}));

const BREEDING_PROFILE_BY_SPECIES = new Map(WORKBOOK_BREEDING_PROFILES.map(profile => [
  profile.runtimeSpeciesId,
  profile,
]));
const BREEDING_PROFILE_BY_CHILD_MONSTER = new Map(WORKBOOK_BREEDING_PROFILES.map(profile => [
  profile.childMonsterId,
  profile,
]));

export function workbookBreedingProfile(runtimeSpeciesId) {
  return BREEDING_PROFILE_BY_SPECIES.get(runtimeSpeciesId) ?? null;
}

// R13 inheritance baselines (tunable rules, not content).
export const INHERITANCE = Object.freeze({
  geneParentAShare: 0.45,
  geneParentBShare: 0.45,
  // remaining 0.10 is a mutation roll:
  mutationSameChance: 0.7,
  mutationUpChance: 0.15, // else -1
  aptitudeWeights: Object.freeze({ parentA: 0.35, parentB: 0.35, speciesBase: 0.3 }),
});

function rankToIndex(rank) {
  const i = GENE_RANKS.indexOf(String(rank).toUpperCase());
  return i < 0 ? 2 : i; // default 'B'
}
function indexToRank(index) {
  return GENE_RANKS[clamp(Math.round(index), 0, GENE_RANKS.length - 1)];
}

// Parent-child and sibling (shared parent) pairs are blocked in the slice (R13).
export function isCloseRelative(a, b) {
  if (!a || !b) return false;
  if (a.instanceId === b.instanceId) return true;
  const ap = [a.parents?.a, a.parents?.b].filter(Boolean);
  const bp = [b.parents?.a, b.parents?.b].filter(Boolean);
  if (ap.includes(b.instanceId) || bp.includes(a.instanceId)) return true; // parent-child
  return ap.some(id => bp.includes(id)); // shared parent -> sibling
}

export function canBreed(a, b) {
  if (!a || !b
    || typeof a.instanceId !== 'string' || a.instanceId.trim().length === 0
    || typeof b.instanceId !== 'string' || b.instanceId.trim().length === 0) {
    return { ok: false, reason: 'invalid_state' };
  }
  if (a.instanceId === b.instanceId) return { ok: false, reason: 'breeding_same_instance' };
  if (isCloseRelative(a, b)) return { ok: false, reason: 'breeding_relative_gate' };
  return { ok: true, reason: null };
}

function compatibilityResult(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function speciesProfile(speciesById, speciesId) {
  if (speciesById == null) return workbookBreedingProfile(speciesId);
  if (typeof speciesById === 'function') return speciesById(speciesId) ?? null;
  if (speciesById instanceof Map) return speciesById.get(speciesId) ?? null;
  return speciesById && typeof speciesById === 'object' ? speciesById[speciesId] ?? null : null;
}

function breedingBond(instance) {
  const value = instance?.mind?.bond ?? instance?.bond;
  return Number.isFinite(value) ? value : 0;
}

function cooldownUntil(instance) {
  const value = instance?.breedingCooldownUntil;
  if (value == null) return 0;
  return Number.isFinite(value) ? value : null;
}

function normalizedBreedingEligibility(profile) {
  const value = profile?.breedingEligibility ?? profile?.breedingEligible;
  if (value === true || value === 'Yes') return 'Yes';
  if (value === 'SpecialRecipeOnly') return 'SpecialRecipeOnly';
  return 'No';
}

export function genderCompatible(eggHolder, partner) {
  return eggHolder?.gender === STANDARD_BREEDING_ROLES.eggHolder
    && partner?.gender === STANDARD_BREEDING_ROLES.partner;
}

// Pure BRD_v1.0 standard-pair gate. Arguments are deliberately role-named and
// positional: A32 must resolve the owned Female Egg Holder before calling it.
// The legacy breed(parentA, parentB) generator remains symmetric and does not
// opt into this adapter; A32 owns the egg transaction/live integration.
export function evaluateStandardBreedingCompatibility(eggHolder, partner, {
  speciesById,
  now = Date.now(),
} = {}) {
  if (!Number.isFinite(now)) return compatibilityResult(false, 'invalid_state');
  const base = canBreed(eggHolder, partner);
  if (!base.ok) return compatibilityResult(false, base.reason);
  const profileA = speciesProfile(speciesById, eggHolder.speciesId);
  const profileB = speciesProfile(speciesById, partner.speciesId);
  if (!profileA || !profileB) {
    return compatibilityResult(false, 'unknown_id', {
      speciesIds: Object.freeze([eggHolder.speciesId ?? null, partner.speciesId ?? null]),
    });
  }

  const eligibilities = Object.freeze([
    normalizedBreedingEligibility(profileA),
    normalizedBreedingEligibility(profileB),
  ]);
  if (eggHolder.gender === 'Genderless' || partner.gender === 'Genderless'
    || eligibilities.includes('SpecialRecipeOnly')) {
    return compatibilityResult(false, 'breeding_recipe_only', { eligibilities });
  }

  const stageResolutions = Object.freeze([
    resolveWorkbookEvolutionStage(eggHolder),
    resolveWorkbookEvolutionStage(partner),
  ]);
  if (stageResolutions.some(result => !result.ok || !result.stage2)) {
    return compatibilityResult(false, 'breeding_stage_gate', {
      stages: Object.freeze(stageResolutions.map(result => result.stage2 ? BREEDING_REQUIRED_STAGE : null)),
      stageEvidence: Object.freeze(stageResolutions.map(result => result.stageEvidence)),
      requiredStage: BREEDING_REQUIRED_STAGE,
    });
  }
  const levels = Object.freeze([eggHolder.level, partner.level]);
  if (levels.some(value => !Number.isInteger(value) || value < BREEDING_MIN_LEVEL)) {
    return compatibilityResult(false, 'breeding_level_gate', {
      levels,
      minLevel: BREEDING_MIN_LEVEL,
    });
  }
  const bonds = Object.freeze([breedingBond(eggHolder), breedingBond(partner)]);
  if (bonds.some(value => value < BREEDING_MIN_BOND)) {
    return compatibilityResult(false, 'breeding_bond_gate', { bonds, minBond: BREEDING_MIN_BOND });
  }
  if (!genderCompatible(eggHolder, partner)) {
    return compatibilityResult(false, 'breeding_gender_gate', {
      genders: Object.freeze([eggHolder.gender ?? null, partner.gender ?? null]),
      requiredGenders: STANDARD_BREEDING_ROLES,
    });
  }
  const groups = Object.freeze([profileA.breedingGroup ?? null, profileB.breedingGroup ?? null]);
  if (groups.some(group => !BREEDING_GROUPS.includes(group)) || groups[0] !== groups[1]) {
    return compatibilityResult(false, 'breeding_group_gate', {
      groups,
    });
  }
  if (eligibilities.some(value => value !== 'Yes')) {
    return compatibilityResult(false, 'breeding_eligibility_gate', { eligibilities });
  }
  const cooldowns = Object.freeze([cooldownUntil(eggHolder), cooldownUntil(partner)]);
  if (cooldowns.includes(null)) {
    return compatibilityResult(false, 'invalid_state', { cooldowns });
  }
  if (cooldowns.some(value => value > now)) {
    return compatibilityResult(false, 'breeding_cooldown', { cooldowns, now });
  }
  return compatibilityResult(true, null, {
    breedingGroup: groups[0],
    stageEvidence: Object.freeze(stageResolutions.map(result => result.stageEvidence)),
    requiredStage: BREEDING_REQUIRED_STAGE,
    minLevel: BREEDING_MIN_LEVEL,
    minBond: BREEDING_MIN_BOND,
  });
}

// One gene: 45% parent A rank, 45% parent B, 10% mutation (70% same / 15% up / 15% down).
export function inheritGene(rankA, rankB, rng) {
  const roll = rng.next();
  if (roll < INHERITANCE.geneParentAShare) return String(rankA).toUpperCase();
  if (roll < INHERITANCE.geneParentAShare + INHERITANCE.geneParentBShare) return String(rankB).toUpperCase();
  // Mutation, anchored on one parent's rank.
  const anchor = rankToIndex(rng.next() < 0.5 ? rankA : rankB);
  const mutRoll = rng.next();
  if (mutRoll < INHERITANCE.mutationSameChance) return indexToRank(anchor);
  if (mutRoll < INHERITANCE.mutationSameChance + INHERITANCE.mutationUpChance) return indexToRank(anchor + 1);
  return indexToRank(anchor - 1);
}

// One aptitude line: weighted parents + species base, plus a small ±1 mutation.
export function inheritAptitude(aptA, aptB, speciesBase, rng) {
  const w = INHERITANCE.aptitudeWeights;
  const weighted = w.parentA * aptA + w.parentB * aptB + w.speciesBase * speciesBase;
  const mutation = rng.next() < 0.2 ? (rng.next() < 0.5 ? -1 : 1) : 0;
  return clamp(Math.round(weighted + mutation), 1, 5);
}

function validPotentialRecord(value) {
  return value && typeof value === 'object' && POTENTIAL_STATS.every(stat => (
    Number.isInteger(value[stat])
      && value[stat] >= POTENTIAL_LIMITS.min
      && value[stat] <= POTENTIAL_LIMITS.max
  ));
}

function takeSeededStat(rng, available) {
  const index = rng.int(0, available.length - 1);
  return available.splice(index, 1)[0];
}

// BRD_v1.0: choose exactly two unique Potential stats from the Egg Holder and
// one unique stat from the Partner. Every unselected stat is a fresh bounded
// 0..31 roll. A dedicated seed stream keeps this adapter deterministic without
// perturbing the legacy gene/aptitude RNG sequence.
export function resolvePotentialInheritance(eggHolder, partner, { seed = 0 } = {}) {
  if (!eggHolder || typeof eggHolder !== 'object' || !partner || typeof partner !== 'object') {
    return Object.freeze({ ok: false, reason: 'invalid_parent' });
  }
  if (!validPotentialRecord(eggHolder.potential) || !validPotentialRecord(partner.potential)) {
    return Object.freeze({ ok: false, reason: 'invalid_potential' });
  }

  const rng = createRng(`${String(seed)}:potential`);
  const available = [...POTENTIAL_STATS];
  const holderStats = [takeSeededStat(rng, available), takeSeededStat(rng, available)];
  const partnerStat = takeSeededStat(rng, available);
  const inheritedStats = Object.freeze([...holderStats, partnerStat]);
  const inherited = new Set(inheritedStats);
  const potential = {};
  const sources = {};

  for (const stat of POTENTIAL_STATS) {
    if (holderStats.includes(stat)) {
      potential[stat] = eggHolder.potential[stat];
      sources[stat] = 'egg_holder';
    } else if (stat === partnerStat) {
      potential[stat] = partner.potential[stat];
      sources[stat] = 'partner';
    } else {
      potential[stat] = rng.int(POTENTIAL_LIMITS.min, POTENTIAL_LIMITS.max);
      sources[stat] = 'random';
    }
  }

  return Object.freeze({
    ok: true,
    reason: null,
    seed,
    potential: Object.freeze(potential),
    sources: Object.freeze(sources),
    inheritedStats,
    randomStats: Object.freeze(POTENTIAL_STATS.filter(stat => !inherited.has(stat))),
    holderInheritedCount: holderStats.length,
    partnerInheritedCount: 1,
  });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function transactionResult(ok, reason, state, detail = {}) {
  return Object.freeze({ ok, reason, state, ...detail });
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const SKILL_MEMORY_REQUEST_LEDGER_FIELD = 'breedingSkillMemoryRequestByEggId';

function normalizedSkillMemoryRequestId(value) {
  return nonEmptyString(value) ? value : null;
}

function skillMemoryRequestLedgerSnapshot(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return Object.freeze({ ok: false, ledger: null, legacy: false });
  }
  if (!Object.prototype.hasOwnProperty.call(state, SKILL_MEMORY_REQUEST_LEDGER_FIELD)) {
    return Object.freeze({ ok: true, ledger: Object.freeze({}), legacy: true });
  }
  const ledger = state[SKILL_MEMORY_REQUEST_LEDGER_FIELD];
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    return Object.freeze({ ok: false, ledger: null, legacy: false });
  }
  return Object.freeze({ ok: true, ledger, legacy: false });
}

function skillMemoryRequestSnapshot(state, egg) {
  const ledgerSnapshot = skillMemoryRequestLedgerSnapshot(state);
  if (!ledgerSnapshot.ok) return Object.freeze({ ok: false, skillId: null });
  if (Object.prototype.hasOwnProperty.call(ledgerSnapshot.ledger, egg.eggId)) {
    const skillId = ledgerSnapshot.ledger[egg.eggId];
    if (skillId !== null && !nonEmptyString(skillId)) return Object.freeze({ ok: false, skillId: null });
    return Object.freeze({ ok: true, skillId, legacy: false });
  }
  // Eggs created before A33 have no separate caller-command ledger. Their
  // canonical output is the only recoverable request identity.
  return Object.freeze({
    ok: true,
    skillId: egg.inheritedSkillMemoryId ?? null,
    legacy: true,
  });
}

function appendSkillMemoryRequest(ledger, eggId, skillId) {
  return {
    ...ledger,
    [eggId]: skillId,
  };
}

// The raw caller selection is transaction identity, not workbook egg data.
// Live create/load boundaries use this adapter so null output cannot erase an
// invalid-but-exact command and malformed ledgers remain fail-closed.
export function applyBreedingSkillMemoryRequestLedger(targetState, sourceState) {
  if (!targetState || typeof targetState !== 'object' || Array.isArray(targetState)
    || !sourceState || typeof sourceState !== 'object' || Array.isArray(sourceState)) return false;
  const sourceHasLedger = Object.prototype.hasOwnProperty.call(sourceState, SKILL_MEMORY_REQUEST_LEDGER_FIELD);
  const sourceLedger = sourceHasLedger ? sourceState[SKILL_MEMORY_REQUEST_LEDGER_FIELD] : {};
  targetState[SKILL_MEMORY_REQUEST_LEDGER_FIELD] = sourceLedger && typeof sourceLedger === 'object'
    && !Array.isArray(sourceLedger)
    ? { ...sourceLedger }
    : sourceLedger;
  return true;
}

function ownedMonster(state, instanceId) {
  const matches = Array.isArray(state?.collection)
    ? state.collection.filter(monster => monster?.instanceId === instanceId)
    : [];
  return matches.length === 1 ? matches[0] : null;
}

function existingEggs(state, eggId) {
  return (Array.isArray(state?.eggs) ? state.eggs : []).filter(egg => egg?.eggId === eggId);
}

export function resolveGenderFromSeed(genderRule, seed) {
  if (!Number.isSafeInteger(seed)) return null;
  if (genderRule === 'Genderless') return 'Genderless';
  const match = /^(25|50|75)M\/(75|50|25)F$/.exec(genderRule ?? '');
  if (!match || Number(match[1]) + Number(match[2]) !== 100) return null;
  const roll = ((seed % 100) + 100) % 100;
  return roll < Number(match[1]) ? 'Male' : 'Female';
}

function resolveSecondaryAffinity(eggHolder) {
  const candidateType = eggHolder?.secondaryType ?? null;
  if (candidateType == null) return null;
  const resolution = resolveSecondaryTypeAssignment({
    runtimeSpeciesId: eggHolder.speciesId,
    stage: 2,
    candidateType,
  });
  return resolution.ok ? resolution.secondaryType : null;
}

function samePotential(left, right) {
  return POTENTIAL_STATS.every(stat => left?.[stat] === right?.[stat]);
}

function sameOrderedValues(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function eggCreationSnapshotMatches(egg, eggHolder, partner, {
  eggId,
  now,
  inheritedSkillMemoryId,
}) {
  if (!eggHolder || !partner) return false;
  const holderStage = resolveWorkbookEvolutionStage(eggHolder);
  const holderProfile = workbookBreedingProfile(eggHolder.speciesId);
  if (!holderStage.ok || !holderStage.stage2 || !holderProfile
    || holderStage.path?.fromWorkbookMonsterId !== holderProfile.childMonsterId) return false;
  const inheritance = resolvePotentialInheritance(eggHolder, partner, { seed: eggId });
  if (!inheritance.ok) return false;
  const skillMemory = resolveBreedingSkillMemory(eggHolder, partner, inheritedSkillMemoryId);
  return egg.breedingVersion === BREEDING_VERSION
    && egg.childMonsterId === holderProfile.childMonsterId
    && egg.hatchAt === now + holderProfile.hatchTimeMin * 60 * 1000
    && sameOrderedValues(egg.potentialInheritedStats, inheritance.inheritedStats)
    && samePotential(egg.potentialValues, inheritance.potential)
    && (egg.secondaryAffinity ?? null) === resolveSecondaryAffinity(eggHolder)
    && (egg.inheritedSkillMemoryId ?? null) === skillMemory.inheritedSkillMemoryId
    && egg.recipeId == null;
}

function eggIssue(code, field, detail = {}) {
  return Object.freeze({ code, field, ...detail });
}

export function validateWorkbookEgg(egg) {
  const issues = [];
  if (!egg || typeof egg !== 'object' || Array.isArray(egg)) {
    return Object.freeze({ ok: false, issues: Object.freeze([eggIssue('egg_schema_invalid', 'root')]) });
  }
  if (!UUID_PATTERN.test(egg.eggId ?? '')) issues.push(eggIssue('egg_schema_invalid', 'eggId'));
  if (egg.breedingVersion !== BREEDING_VERSION) issues.push(eggIssue('unsupported_breeding_version', 'breedingVersion'));
  const childProfile = BREEDING_PROFILE_BY_CHILD_MONSTER.get(egg.childMonsterId) ?? null;
  if (!childProfile || childProfile.breedingEligibility !== 'Yes') {
    issues.push(eggIssue('child_species_unresolved', 'childMonsterId'));
  }
  if (!nonEmptyString(egg.eggHolderOwnedMonsterId)) issues.push(eggIssue('egg_schema_invalid', 'eggHolderOwnedMonsterId'));
  if (!nonEmptyString(egg.partnerOwnedMonsterId)) issues.push(eggIssue('egg_schema_invalid', 'partnerOwnedMonsterId'));
  if (egg.eggHolderOwnedMonsterId === egg.partnerOwnedMonsterId) issues.push(eggIssue('egg_schema_invalid', 'parentIds'));
  if (!Number.isSafeInteger(egg.createdAt)) issues.push(eggIssue('egg_schema_invalid', 'createdAt'));
  if (!Number.isSafeInteger(egg.hatchAt) || egg.hatchAt <= egg.createdAt) issues.push(eggIssue('egg_schema_invalid', 'hatchAt'));
  const hatchProfile = childProfile;
  if (hatchProfile && Number.isSafeInteger(egg.createdAt)
    && egg.hatchAt !== egg.createdAt + hatchProfile.hatchTimeMin * 60 * 1000) {
    issues.push(eggIssue('invalid_hatch_time', 'hatchAt'));
  }
  if (!Number.isSafeInteger(egg.genderSeed)) issues.push(eggIssue('egg_schema_invalid', 'genderSeed'));
  if (!Array.isArray(egg.potentialInheritedStats)
    || egg.potentialInheritedStats.length !== 3
    || new Set(egg.potentialInheritedStats).size !== 3
    || egg.potentialInheritedStats.some(stat => !POTENTIAL_STATS.includes(stat))) {
    issues.push(eggIssue('egg_schema_invalid', 'potentialInheritedStats'));
  }
  if (!validPotentialRecord(egg.potentialValues)) issues.push(eggIssue('egg_schema_invalid', 'potentialValues'));
  if (egg.secondaryAffinity != null) {
    const profile = BREEDING_PROFILE_BY_CHILD_MONSTER.get(egg.childMonsterId) ?? null;
    const affinity = profile && nonEmptyString(egg.secondaryAffinity)
      ? resolveSecondaryTypeAssignment({
        runtimeSpeciesId: profile.runtimeSpeciesId,
        stage: 2,
        candidateType: egg.secondaryAffinity,
      })
      : null;
    if (!nonEmptyString(egg.secondaryAffinity) || (profile && !affinity?.ok)) {
      issues.push(eggIssue('egg_schema_invalid', 'secondaryAffinity'));
    }
  }
  if (egg.inheritedSkillMemoryId != null && !nonEmptyString(egg.inheritedSkillMemoryId)) issues.push(eggIssue('egg_schema_invalid', 'inheritedSkillMemoryId'));
  if (egg.inheritedSkillMemoryId != null && nonEmptyString(egg.inheritedSkillMemoryId) && childProfile) {
    const memoryTarget = resolveFamilySkillMemoryTarget(childProfile.runtimeSpeciesId, egg.inheritedSkillMemoryId);
    if (!memoryTarget.ok) {
      issues.push(eggIssue('egg_schema_invalid', 'inheritedSkillMemoryId', { reason: memoryTarget.reason }));
    }
  }
  if (egg.recipeId != null) issues.push(eggIssue('egg_schema_invalid', 'recipeId'));
  if (egg.hatchedOwnedMonsterId != null) {
    if (!UUID_PATTERN.test(egg.hatchedOwnedMonsterId ?? '')) {
      issues.push(eggIssue('egg_schema_invalid', 'hatchedOwnedMonsterId'));
    } else if (egg.hatchedOwnedMonsterId !== hatchedOwnedMonsterIdForEgg(egg.eggId)) {
      issues.push(eggIssue('hatch_state_conflict', 'hatchedOwnedMonsterId'));
    }
  }
  if ('isReadyToHatch' in egg) issues.push(eggIssue('derived_field_persisted', 'isReadyToHatch'));
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

const OPTIONAL_EGG_DEFAULT_FIELDS = Object.freeze([
  'secondaryAffinity',
  'inheritedSkillMemoryId',
  'recipeId',
  'hatchedOwnedMonsterId',
]);

function materializeWorkbookEggDefaults(record) {
  const egg = { ...record };
  if (record.breedingVersion === BREEDING_VERSION) {
    for (const field of OPTIONAL_EGG_DEFAULT_FIELDS) egg[field] = record[field] ?? null;
  }
  return egg;
}

export function normalizeEggsForPersistence(records) {
  return (Array.isArray(records) ? records : [])
    .map(record => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
      const egg = materializeWorkbookEggDefaults(record);
      delete egg.isReadyToHatch;
      if (Array.isArray(record.potentialInheritedStats)) egg.potentialInheritedStats = [...record.potentialInheritedStats];
      if (record.potentialValues && typeof record.potentialValues === 'object'
        && !Array.isArray(record.potentialValues)) {
        egg.potentialValues = { ...record.potentialValues };
      }
      return egg;
    });
}

export function eggCollectionDiagnostics(records) {
  const issues = [];
  const seen = new Set();
  for (const [index, egg] of (Array.isArray(records) ? records : []).entries()) {
    if (!egg || typeof egg !== 'object' || Array.isArray(egg)) {
      issues.push(Object.freeze({ code: 'egg_schema_invalid', index, field: 'root' }));
      continue;
    }
    if (egg.breedingVersion == null) {
      issues.push(Object.freeze({ code: 'legacy_egg_quarantined', index, eggId: egg.eggId ?? null }));
    } else {
      const validation = validateWorkbookEgg(egg);
      for (const issue of validation.issues) issues.push(Object.freeze({ ...issue, index, eggId: egg.eggId ?? null }));
    }
    if (seen.has(egg.eggId)) issues.push(Object.freeze({ code: 'duplicate_egg_id', index, eggId: egg.eggId ?? null }));
    seen.add(egg.eggId);
  }
  return Object.freeze(issues);
}

export function isEggReadyToHatch(egg, now = Date.now()) {
  return Number.isFinite(now) && Number.isSafeInteger(egg?.hatchAt) && now >= egg.hatchAt;
}

function eggValidationFailureReason(validation) {
  if (validation.issues.some(issue => issue.code === 'hatch_state_conflict')) return 'hatch_state_conflict';
  if (validation.issues.some(issue => issue.code === 'child_species_unresolved')) return 'child_species_unresolved';
  if (validation.issues.some(issue => issue.code === 'invalid_hatch_time')) return 'invalid_hatch_time';
  return 'egg_schema_invalid';
}

// The egg UUID is the command identity. Derive a separate stable UUID-shaped
// owned-monster ID so backup/multi-tab replay cannot create a different child.
export function hatchedOwnedMonsterIdForEgg(eggId) {
  if (!UUID_PATTERN.test(eggId ?? '')) return null;
  const rng = createRng(`A32-hatched-owned-monster:${eggId.toLowerCase()}`);
  const chars = Array.from({ length: 32 }, () => rng.int(0, 15).toString(16));
  chars[12] = '5';
  chars[16] = (8 + rng.int(0, 3)).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createStandardBreedingEggTransaction(state, {
  eggId,
  eggHolderOwnedMonsterId,
  partnerOwnedMonsterId,
  genderSeed,
  inheritedSkillMemoryId = null,
  now = Date.now(),
} = {}) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.collection) || !Array.isArray(state.eggs)
    || !Number.isSafeInteger(now) || !UUID_PATTERN.test(eggId ?? '')
    || !nonEmptyString(eggHolderOwnedMonsterId) || !nonEmptyString(partnerOwnedMonsterId)
    || !Number.isSafeInteger(genderSeed)) {
    return transactionResult(false, 'invalid_state', state);
  }
  const requestLedgerSnapshot = skillMemoryRequestLedgerSnapshot(state);
  if (!requestLedgerSnapshot.ok) return transactionResult(false, 'invalid_state', state);
  const requestedSkillMemoryId = normalizedSkillMemoryRequestId(inheritedSkillMemoryId);

  const duplicates = existingEggs(state, eggId);
  if (duplicates.length > 0) {
    const existing = duplicates.length === 1 ? duplicates[0] : null;
    const replayHolders = state.collection.filter(monster => monster?.instanceId === eggHolderOwnedMonsterId);
    const replayPartners = state.collection.filter(monster => monster?.instanceId === partnerOwnedMonsterId);
    const replayHolder = replayHolders.length === 1 ? replayHolders[0] : null;
    const replayPartner = replayPartners.length === 1 ? replayPartners[0] : null;
    const parentsUnavailable = replayHolders.length === 0 && replayPartners.length === 0;
    const requestSnapshot = existing ? skillMemoryRequestSnapshot(state, existing) : null;
    const identityMatches = existing
      && existing.eggId === eggId
      && existing.eggHolderOwnedMonsterId === eggHolderOwnedMonsterId
      && existing.partnerOwnedMonsterId === partnerOwnedMonsterId
      && existing.genderSeed === genderSeed
      && existing.createdAt === now;
    if (existing && validateWorkbookEgg(existing).ok
      && identityMatches
      && requestSnapshot?.ok
      && requestSnapshot.skillId === requestedSkillMemoryId
      && (parentsUnavailable || eggCreationSnapshotMatches(existing, replayHolder, replayPartner, {
          eggId,
          now,
          inheritedSkillMemoryId: requestedSkillMemoryId,
        }))) {
      return transactionResult(true, null, state, { egg: existing, replay: true });
    }
    return transactionResult(false, 'egg_id_conflict', state);
  }

  const eggHolder = ownedMonster(state, eggHolderOwnedMonsterId);
  const partner = ownedMonster(state, partnerOwnedMonsterId);
  if (!eggHolder || !partner) return transactionResult(false, 'unknown_id', state);

  const compatibility = evaluateStandardBreedingCompatibility(eggHolder, partner, { now });
  if (!compatibility.ok) return transactionResult(false, compatibility.reason, state, { compatibility });

  const holderStage = resolveWorkbookEvolutionStage(eggHolder);
  const holderProfile = workbookBreedingProfile(eggHolder.speciesId);
  if (!holderStage.ok || !holderStage.stage2 || !holderProfile
    || holderStage.path?.fromWorkbookMonsterId !== holderProfile.childMonsterId) {
    return transactionResult(false, 'child_species_unresolved', state);
  }

  const inheritance = resolvePotentialInheritance(eggHolder, partner, { seed: eggId });
  if (!inheritance.ok) return transactionResult(false, inheritance.reason, state);
  const skillMemory = resolveBreedingSkillMemory(eggHolder, partner, requestedSkillMemoryId);

  const hatchAt = now + holderProfile.hatchTimeMin * 60 * 1000;
  if (!Number.isSafeInteger(hatchAt) || hatchAt <= now) {
    return transactionResult(false, 'invalid_hatch_time', state);
  }

  const egg = Object.freeze({
    eggId,
    breedingVersion: BREEDING_VERSION,
    childMonsterId: holderProfile.childMonsterId,
    eggHolderOwnedMonsterId,
    partnerOwnedMonsterId,
    createdAt: now,
    hatchAt,
    genderSeed,
    potentialInheritedStats: inheritance.inheritedStats,
    potentialValues: inheritance.potential,
    secondaryAffinity: resolveSecondaryAffinity(eggHolder),
    inheritedSkillMemoryId: skillMemory.inheritedSkillMemoryId,
    recipeId: null,
    hatchedOwnedMonsterId: null,
  });
  const validation = validateWorkbookEgg(egg);
  if (!validation.ok) {
    return transactionResult(false, eggValidationFailureReason(validation), state, { validation });
  }

  const cooldownUntil = now + PARENT_BREEDING_COOLDOWN_MS;
  const collection = state.collection.map(monster => (
    monster.instanceId === eggHolderOwnedMonsterId || monster.instanceId === partnerOwnedMonsterId
      ? { ...monster, breedingCooldownUntil: cooldownUntil, breedingVersion: BREEDING_VERSION }
      : monster
  ));
  const nextState = {
    ...state,
    collection,
    eggs: [...(Array.isArray(state.eggs) ? state.eggs : []), egg],
    [SKILL_MEMORY_REQUEST_LEDGER_FIELD]: appendSkillMemoryRequest(requestLedgerSnapshot.ledger, eggId, requestedSkillMemoryId),
  };
  return transactionResult(true, null, nextState, {
    egg,
    replay: false,
    parentCooldownUntil: cooldownUntil,
    inheritance,
    skillMemory,
  });
}

export function hatchBreedingEggTransaction(state, { eggId, now = Date.now() } = {}) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.collection)
    || !Array.isArray(state.storage) || !Array.isArray(state.eggs)
    || !Number.isSafeInteger(now) || !UUID_PATTERN.test(eggId ?? '')) {
    return transactionResult(false, 'invalid_state', state);
  }
  const matches = existingEggs(state, eggId);
  if (matches.length === 0) return transactionResult(false, 'egg_not_found', state);
  if (matches.length !== 1) return transactionResult(false, 'egg_id_conflict', state);
  const egg = matches[0];
  if (egg.breedingVersion !== BREEDING_VERSION) {
    return transactionResult(false, 'unsupported_breeding_version', state);
  }
  const validation = validateWorkbookEgg(egg);
  if (!validation.ok) {
    return transactionResult(false, eggValidationFailureReason(validation), state, { validation });
  }

  if (egg.hatchedOwnedMonsterId != null) {
    const hatchedMatches = state.collection.filter(monster => monster?.instanceId === egg.hatchedOwnedMonsterId);
    const profile = BREEDING_PROFILE_BY_CHILD_MONSTER.get(egg.childMonsterId) ?? null;
    const expectedGender = profile ? resolveGenderFromSeed(profile.genderRule, egg.genderSeed) : null;
    const child = hatchedMatches.length === 1 ? hatchedMatches[0] : null;
    const childMatches = child && profile
      && child.speciesId === profile.runtimeSpeciesId
      && child.gender === expectedGender
      && child.parents?.a === egg.eggHolderOwnedMonsterId
      && child.parents?.b === egg.partnerOwnedMonsterId
      && samePotential(child.potential, egg.potentialValues);
    const childSnapshotMatches = childMatches
      && (child.inheritedSkillMemoryId ?? null) === (egg.inheritedSkillMemoryId ?? null);
    return childSnapshotMatches
      ? transactionResult(false, 'egg_already_hatched', state, { child: hatchedMatches[0] })
      : transactionResult(false, 'hatch_state_conflict', state);
  }
  if (!isEggReadyToHatch(egg, now)) return transactionResult(false, 'egg_not_ready', state, { hatchAt: egg.hatchAt });

  const instanceId = hatchedOwnedMonsterIdForEgg(egg.eggId);
  if (!instanceId) return transactionResult(false, 'egg_schema_invalid', state);
  if (state.collection.some(monster => monster?.instanceId === instanceId)) {
    return transactionResult(false, 'hatch_owned_id_conflict', state);
  }
  const profile = BREEDING_PROFILE_BY_CHILD_MONSTER.get(egg.childMonsterId) ?? null;
  if (!profile) return transactionResult(false, 'child_species_unresolved', state);
  const gender = resolveGenderFromSeed(profile.genderRule, egg.genderSeed);
  if (!gender) return transactionResult(false, 'egg_schema_invalid', state);

  const child = normalizeInstance({
    instanceId,
    speciesId: profile.runtimeSpeciesId,
    formId: profile.runtimeSpeciesId,
    level: 1,
    growthExp: 0,
    potential: egg.potentialValues,
    gender,
    secondaryType: null,
    parents: { a: egg.eggHolderOwnedMonsterId, b: egg.partnerOwnedMonsterId },
    origin: 'bred',
    mind: { bond: profile.baseBond },
    inheritedSkillMemoryId: egg.inheritedSkillMemoryId ?? null,
    breedingVersion: egg.breedingVersion,
  }, { now });
  const markedEgg = Object.freeze({
    ...materializeWorkbookEggDefaults(egg),
    hatchedOwnedMonsterId: instanceId,
  });
  const storage = Array.isArray(state.storage) ? state.storage : [];
  const nextState = {
    ...state,
    collection: [...state.collection, child],
    storage: storage.includes(instanceId) ? storage : [...storage, instanceId],
    eggs: state.eggs.map(record => record === egg ? markedEgg : record),
  };
  return transactionResult(true, null, nextState, { child, egg: markedEgg, replay: false });
}

// Produce a child instance from two parents. Deterministic under `seed`.
export function breed(parentA, parentB, { species = {}, seed = 0, now = Date.now(), personalityPool = [] } = {}) {
  const check = canBreed(parentA, parentB);
  if (!check.ok) return { ok: false, reason: check.reason };

  const rng = createRng(seed);

  const genes = {};
  for (const gene of CORE_GENES) {
    genes[gene] = inheritGene(parentA.genes?.[gene] ?? 'B', parentB.genes?.[gene] ?? 'B', rng);
  }

  const aptitude = {};
  const lines = ['power', 'defense', 'speed', 'technique', 'spirit'];
  for (const line of lines) {
    const base = species.aptitudeBase?.[line] ?? 3;
    aptitude[line] = inheritAptitude(parentA.aptitude?.[line] ?? 3, parentB.aptitude?.[line] ?? 3, base, rng);
  }

  // Personality: weighted tendency toward parents + a random option.
  const personalityChoices = [
    [parentA.personalityId, 1.2],
    [parentB.personalityId, 1.2],
    ...personalityPool.map(p => [p, 1]),
  ].filter(([p]) => p);
  const personalityId = rng.weighted(personalityChoices) ?? parentA.personalityId ?? 'balanced';

  // Secondary type only from the species' allowed list (never arbitrary — R13/B2).
  const allowed = species.allowedSecondary ?? [];
  const inheritedSecondary = [parentA.secondaryType, parentB.secondaryType].find(t => t && allowed.includes(t)) ?? null;
  const secondaryType = inheritedSecondary && rng.next() < 0.5 ? inheritedSecondary : null;

  // Skill potential = affinity tags from parents' skills (potential, not mastery).
  const potentialTags = new Set();
  for (const parent of [parentA, parentB]) {
    for (const skill of parent.skills ?? []) for (const tag of skill.tags ?? []) potentialTags.add(tag);
  }

  const generation = Math.max(parentA.generation ?? 1, parentB.generation ?? 1) + 1;

  const child = normalizeInstance({
    speciesId: species.id ?? parentA.speciesId,
    level: 1,
    growthExp: 0,
    genes,
    aptitude,
    personalityId,
    secondaryType,
    skillPotential: [...potentialTags],
    parents: { a: parentA.instanceId, b: parentB.instanceId },
    generation,
    // Explicitly NOT inherited: training, nutrition, skills/mastery, bond/trust.
  }, { now });

  return { ok: true, child, seed };
}

// Wrap a bred child in an egg with a hatch time (R16 Incubator).
export function createEgg(breedResult, { hatchMs = 0, now = Date.now() } = {}) {
  if (!breedResult?.ok) return breedResult;
  return { ok: true, egg: { child: breedResult.child, layedAt: now, hatchAt: now + hatchMs } };
}
