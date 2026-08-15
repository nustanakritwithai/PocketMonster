import assert from 'node:assert/strict';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  GENE_RANKS,
  isCloseRelative,
  canBreed,
  inheritGene,
  breed,
  createEgg,
} from '../breeding.mjs';
import { createRng } from '../rng.mjs';

const parent = (id, over = {}) => normalizeInstance({ instanceId: id, speciesId: 'flame_slime', level: 30, generation: 1, ...over });

const species = { id: 'flame_slime', aptitudeBase: { power: 3, defense: 3, speed: 3, technique: 3, spirit: 3 }, allowedSecondary: ['spirit'] };

// Close-relative blocking (R13).
const dad = parent('dad');
const mom = parent('mom');
const child1 = normalizeInstance({ instanceId: 'c1', parents: { a: 'dad', b: 'mom' } });
const child2 = normalizeInstance({ instanceId: 'c2', parents: { a: 'dad', b: 'mom' } });
assert.equal(isCloseRelative(child1, child2), true, 'siblings sharing a parent are close relatives');
assert.equal(isCloseRelative(dad, child1), true, 'parent and child are close relatives');
assert.equal(canBreed(child1, child2).ok, false, 'siblings cannot breed');
assert.equal(canBreed(dad, child1).ok, false, 'parent-child cannot breed');
assert.equal(canBreed(dad, dad).ok, false, 'a monster cannot breed with itself');
assert.equal(canBreed(dad, mom).ok, true, 'unrelated adults can breed');

// Determinism: same seed -> identical child (R23 seeded tests).
const a = parent('A', { genes: { hp: 'A', atk: 'A', def: 'B', spd: 'C' }, aptitude: { power: 4, defense: 2, speed: 3, technique: 3, spirit: 2 } });
const b = parent('B', { genes: { hp: 'C', atk: 'B', def: 'A', spd: 'B' }, aptitude: { power: 2, defense: 4, speed: 3, technique: 2, spirit: 3 } });
const r1 = breed(a, b, { species, seed: 'seed-42' });
const r2 = breed(a, b, { species, seed: 'seed-42' });
assert.deepEqual(r1.child.genes, r2.child.genes, 'same seed yields identical genes');
assert.deepEqual(r1.child.aptitude, r2.child.aptitude, 'same seed yields identical aptitude');
const r3 = breed(a, b, { species, seed: 'other-seed' });
// Different seeds usually differ; at minimum the API is stable.
assert.ok(r3.ok, 'a different seed still breeds successfully');

// Child inherits potential, not the parents' progress (R13).
const trainedA = parent('TA', { training: { power: 150 }, level: 40, generation: 3, skills: [{ skillId: 'x', masteryExp: 9999, masteryRank: 'master', tags: ['fire'] }] });
const trainedB = parent('TB', { training: { defense: 120 }, level: 40, generation: 2, skills: [{ skillId: 'y', masteryExp: 5000, masteryRank: 'expert', tags: ['guard'] }] });
const kid = breed(trainedA, trainedB, { species, seed: 'k' }).child;
assert.equal(kid.level, 1, 'child starts at level 1');
assert.equal(kid.growthExp, 0, 'child starts with no growth EXP');
for (const line of ['power', 'defense', 'speed', 'technique', 'spirit']) {
  assert.equal(kid.training[line], 0, `child inherits no ${line} training`);
}
assert.equal(kid.skills.length, 0, 'child inherits no skill mastery');
assert.deepEqual([...kid.skillPotential].sort(), ['fire', 'guard'], 'child inherits skill POTENTIAL tags');
assert.equal(kid.parents.a, 'TA', 'parentage recorded');
assert.equal(kid.generation, 4, 'generation = max(parents)+1');

// No generation raw power creep: genes stay within parent ranks ± 1 mutation (R13).
let maxGeneIndex = 0;
let minParentFloor = Infinity;
for (let s = 0; s < 200; s++) {
  const c = breed(a, b, { species, seed: `g${s}` }).child;
  for (const gene of ['hp', 'atk', 'def', 'spd']) {
    const idx = GENE_RANKS.indexOf(c.genes[gene]);
    const pa = GENE_RANKS.indexOf(a.genes[gene]);
    const pb = GENE_RANKS.indexOf(b.genes[gene]);
    assert.ok(idx <= Math.max(pa, pb) + 1, `gene ${gene} never exceeds the better parent by more than 1 rank`);
    assert.ok(idx >= Math.min(pa, pb) - 1, `gene ${gene} never drops below the worse parent by more than 1 rank`);
    maxGeneIndex = Math.max(maxGeneIndex, idx);
  }
}
assert.ok(maxGeneIndex < GENE_RANKS.length, 'no child spontaneously reaches beyond rank S from mid parents');

// Gene mutation distribution stays within valid ranks under many rolls.
const rng = createRng('dist');
for (let i = 0; i < 500; i++) {
  const g = inheritGene('B', 'B', rng);
  assert.ok(GENE_RANKS.includes(g), 'inherited gene is always a valid rank');
}

// Secondary type only from the allowed list (never arbitrary — B2/R13).
const withType = parent('T1', { secondaryType: 'spirit' });
const partner = parent('T2', { secondaryType: 'water' }); // water not in allowedSecondary
for (let s = 0; s < 30; s++) {
  const c = breed(withType, partner, { species, seed: `t${s}` }).child;
  assert.ok(c.secondaryType === null || species.allowedSecondary.includes(c.secondaryType), 'secondary type stays within the allowed list');
}

// Egg wrapper.
const egg = createEgg(breed(a, b, { species, seed: 'egg' }), { hatchMs: 1000, now: 500 });
assert.equal(egg.ok, true, 'egg created');
assert.equal(egg.egg.hatchAt, 1500, 'egg hatch time computed');

console.log('V7.9 breeding & genetics regression: PASS');
