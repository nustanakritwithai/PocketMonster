// Monster Life RPG — V7.9 Breeding & Genetics
// Breeding passes on POTENTIAL (genes, aptitude, trait/skill potential), never the
// parents' training, level, mastery or gear, and Generation adds NO raw power
// (R1, R13). Close relatives are blocked. Fully deterministic under a seed (R23).

import { createRng } from './rng.mjs';
import { clamp } from './balance-formulas.mjs';
import { normalizeInstance, CORE_GENES } from './monster-instance.mjs';
import { resolveWorkbookEvolutionStage } from './evolution.mjs';

export const GENE_RANKS = Object.freeze(['D', 'C', 'B', 'A', 'S']);
export const BREEDING_REQUIRED_STAGE = 2;
export const BREEDING_MIN_LEVEL = 20;
export const BREEDING_MIN_BOND = 50;
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
