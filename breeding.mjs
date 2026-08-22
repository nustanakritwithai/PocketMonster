// Monster Life RPG — V7.9 Breeding & Genetics
// Breeding passes on POTENTIAL (genes, aptitude, trait/skill potential), never the
// parents' training, level, mastery or gear, and Generation adds NO raw power
// (R1, R13). Close relatives are blocked. Fully deterministic under a seed (R23).

import { createRng } from './rng.mjs';
import { clamp } from './balance-formulas.mjs';
import { normalizeInstance, CORE_GENES } from './monster-instance.mjs';

export const GENE_RANKS = Object.freeze(['D', 'C', 'B', 'A', 'S']);
export const BREEDING_ADULT_STAGES = Object.freeze(['Adult', 'Mature']);
export const BREEDING_MIN_BOND = 50;
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
  if (!a || !b) return { ok: false, reason: 'invalid_state' };
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
  return Number.isFinite(value) ? value : 0;
}

export function genderCompatible(a, b) {
  if (!a || !b) return false;
  if (a.gender === 'Genderless' || b.gender === 'Genderless') return true;
  return (a.gender === 'Male' && b.gender === 'Female')
    || (a.gender === 'Female' && b.gender === 'Male');
}

export function evaluateBreedingCompatibility(a, b, {
  speciesById,
  now = Date.now(),
  adultStages = BREEDING_ADULT_STAGES,
  minBond = BREEDING_MIN_BOND,
} = {}) {
  const base = canBreed(a, b);
  if (!base.ok) return compatibilityResult(false, base.reason);
  if (!adultStages.includes(a.lifeStage) || !adultStages.includes(b.lifeStage)) {
    return compatibilityResult(false, 'breeding_stage_gate', {
      stages: Object.freeze([a.lifeStage ?? null, b.lifeStage ?? null]),
    });
  }
  const profileA = speciesProfile(speciesById, a.speciesId);
  const profileB = speciesProfile(speciesById, b.speciesId);
  if (!profileA || !profileB) {
    return compatibilityResult(false, 'unknown_id', {
      speciesIds: Object.freeze([a.speciesId ?? null, b.speciesId ?? null]),
    });
  }
  if (!profileA.breedingGroup || profileA.breedingGroup !== profileB.breedingGroup) {
    return compatibilityResult(false, 'breeding_group_gate', {
      groups: Object.freeze([profileA.breedingGroup ?? null, profileB.breedingGroup ?? null]),
    });
  }
  if (!genderCompatible(a, b)) {
    return compatibilityResult(false, 'breeding_gender_gate', {
      genders: Object.freeze([a.gender ?? null, b.gender ?? null]),
    });
  }
  const bonds = Object.freeze([breedingBond(a), breedingBond(b)]);
  if (bonds.some(value => value < minBond)) {
    return compatibilityResult(false, 'breeding_bond_gate', { bonds, minBond });
  }
  const cooldowns = Object.freeze([cooldownUntil(a), cooldownUntil(b)]);
  if (cooldowns.some(value => value > now)) {
    return compatibilityResult(false, 'breeding_cooldown', { cooldowns, now });
  }
  return compatibilityResult(true, null, {
    breedingGroup: profileA.breedingGroup,
    minBond,
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
export function breed(parentA, parentB, { species = {}, seed = 0, now = Date.now(), personalityPool = [], compatibility = null } = {}) {
  const check = compatibility
    ? evaluateBreedingCompatibility(parentA, parentB, { ...compatibility, now })
    : canBreed(parentA, parentB);
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

  const hasPotentialInput = parentA.potential != null || parentB.potential != null;
  const potentialInheritance = hasPotentialInput
    ? resolvePotentialInheritance(parentA, parentB, { seed })
    : null;
  if (potentialInheritance && !potentialInheritance.ok) {
    return { ok: false, reason: potentialInheritance.reason };
  }

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
    ...(potentialInheritance ? { potential: potentialInheritance.potential } : {}),
    // Explicitly NOT inherited: training, nutrition, skills/mastery, bond/trust.
  }, { now });

  return { ok: true, child, seed, potentialInheritance };
}

// Wrap a bred child in an egg with a hatch time (R16 Incubator).
export function createEgg(breedResult, { hatchMs = 0, now = Date.now() } = {}) {
  if (!breedResult?.ok) return breedResult;
  return { ok: true, egg: { child: breedResult.child, layedAt: now, hatchAt: now + hatchMs } };
}
