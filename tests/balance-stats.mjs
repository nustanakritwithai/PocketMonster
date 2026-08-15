import assert from 'node:assert/strict';
import {
  geneModifier,
  coreStatRaw,
  coreStatFinal,
} from '../balance-formulas.mjs';
import { statBreakdown } from '../combat-rating.mjs';

// B3 / R5 — Gene ranks are small potential modifiers, not quality gates.
assert.equal(geneModifier('D'), 0.96);
assert.equal(geneModifier('C'), 0.98);
assert.equal(geneModifier('B'), 1.0);
assert.equal(geneModifier('A'), 1.02);
assert.equal(geneModifier('S'), 1.04);
assert.equal(geneModifier('a'), 1.02, 'gene rank is case-insensitive');
assert.equal(geneModifier('?'), 1.0, 'unknown gene rank is neutral');

// R5 — raw = speciesBase + levelGrowth + training + nutritionFlat + equipmentFlat.
const raw = coreStatRaw({ speciesBase: 30, levelGrowth: 38, training: 31, nutritionFlat: 2, equipmentFlat: 4 });
assert.equal(raw, 105, 'R22 walkthrough: raw ATK sums to 105');

// R22 numerical walkthrough — Flare Slime ATK before evolution.
// final = round(raw × gene × evolutionProfile × condition).
const preEvo = coreStatFinal({ raw: 105, geneRank: 'A', evolutionProfile: 1, condition: 'good' });
assert.equal(preEvo, 109, 'pre-evolution ATK: 105 × 1.02 (gene A) × 1.02 (Good) ≈ 109');

// R22 — after Flame Wolf evolution (evolutionProfile ATK 1.06) it lands near 116.
const postEvo = coreStatFinal({ raw: 105, geneRank: 'A', evolutionProfile: 1.06, condition: 'good' });
assert.equal(postEvo, 116, 'post-evolution ATK ≈ 116 with a 1.06 evolution profile');

// A weaker gene must still be playable (small delta, never a gate).
const geneD = coreStatFinal({ raw: 105, geneRank: 'D', evolutionProfile: 1, condition: 'normal' });
const geneS = coreStatFinal({ raw: 105, geneRank: 'S', evolutionProfile: 1, condition: 'normal' });
assert.ok(geneS - geneD <= 105 * 0.09, 'D→S gene spread stays within an ~8% potential band');

// statBreakdown must explain every source that produces the final value.
const build = {
  level: 20,
  species: { base: { atk: 30 }, growthPerLevel: { atk: 2.0 } },
  training: { power: 110, technique: 40, speed: 50 },
  genes: { atk: 'A' },
  condition: 'good',
};
const detail = statBreakdown(build, 'atk');
assert.equal(detail.speciesBase, 30, 'breakdown reports species base');
assert.equal(detail.levelGrowth, 38, 'breakdown reports level growth (2.0 × 19)');
assert.ok(Math.abs(detail.training - (110 + 40 * 0.25 + 50 * 0.15)) < 1e-9, 'breakdown reports converted training');
assert.equal(detail.geneRank, 'A', 'breakdown reports gene rank');
const recomputed = Math.round(detail.raw * detail.geneMultiplier * detail.evolutionProfile * detail.conditionModifier);
assert.equal(detail.final, recomputed, 'final equals the product of every reported source');

console.log('V7.1 balance core-stat formula regression: PASS');
