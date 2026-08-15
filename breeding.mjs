// Monster Life RPG — V7.9 Breeding & Genetics
// Breeding passes on POTENTIAL (genes, aptitude, trait/skill potential), never the
// parents' training, level, mastery or gear, and Generation adds NO raw power
// (R1, R13). Close relatives are blocked. Fully deterministic under a seed (R23).

import { createRng } from './rng.mjs';
import { clamp } from './balance-formulas.mjs';
import { normalizeInstance, CORE_GENES } from './monster-instance.mjs';

export const GENE_RANKS = Object.freeze(['D', 'C', 'B', 'A', 'S']);

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
  if (!a || !b) return { ok: false, reason: 'two parents required' };
  if (a.instanceId === b.instanceId) return { ok: false, reason: 'must be two different monsters' };
  if (isCloseRelative(a, b)) return { ok: false, reason: 'close relatives cannot breed' };
  return { ok: true };
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
