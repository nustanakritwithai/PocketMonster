import assert from 'node:assert/strict';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import { trainingCapacity, totalTrainingUsed } from '../balance-formulas.mjs';
import { combatRating, compareBuilds } from '../combat-rating.mjs';
import { ARCHETYPES } from '../balance-sim.mjs';

// V7.1 Merge Gate (R23): build same-level monsters and compare CR.
// R26 "Balanced Build": same species + level + shared budget must land in a
// tight CR band while producing clearly different DPS / EHP / Utility.

// Every archetype shares the same level and respects the shared training budget.
const level = ARCHETYPES[0].level;
const capacity = trainingCapacity(level);
for (const build of ARCHETYPES) {
  assert.equal(build.level, level, 'all reference builds are the same level');
  assert.ok(totalTrainingUsed(build.training) <= capacity, `${build.name} respects the Lv.${level} training capacity`);
}

const comparison = compareBuilds(ARCHETYPES, { config: BALANCE_CONFIG });
assert.equal(comparison.sameLevel, true, 'comparison confirms all builds share a level');
assert.ok(comparison.withinTolerance, `CR spread ${(comparison.spread * 100).toFixed(1)}% must be within tolerance ${(comparison.tolerance * 100).toFixed(0)}%`);
assert.ok(comparison.spread <= 0.15, 'balanced builds must sit within a 15% CR band');

// Role distinctiveness: same CR, different distribution.
const byName = Object.fromEntries(comparison.rated.map(r => [r.name, r]));
const topDps = comparison.rated.reduce((a, b) => (b.dps > a.dps ? b : a));
const topEhp = comparison.rated.reduce((a, b) => (b.ehp > a.ehp ? b : a));
const topUtil = comparison.rated.reduce((a, b) => (b.utility > a.utility ? b : a));
assert.equal(topDps.name, 'Attacker', 'Attacker must have the highest DPS');
assert.equal(topEhp.name, 'Tank', 'Tank must have the highest effective HP');
assert.equal(topUtil.name, 'Technical', 'Technical must have the highest utility');
assert.ok(byName.Attacker.ehp < byName.Tank.ehp, 'a glass cannon trades away survivability');
assert.ok(byName.Tank.dps < byName.Attacker.dps, 'a tank trades away offense');

// No single build wins every axis (R26: no dominant build).
for (const r of comparison.rated) {
  const dominatesAll = r.dps >= topDps.dps && r.ehp >= topEhp.ehp && r.utility >= topUtil.utility;
  assert.ok(!dominatesAll || comparison.rated.length === 1, `${r.name} must not dominate every axis`);
}

// CR must be deterministic.
const first = combatRating(ARCHETYPES[0]);
const second = combatRating(ARCHETYPES[0]);
assert.deepEqual(first.stats, second.stats, 'stat computation is deterministic');
assert.equal(first.cr, second.cr, 'CR is deterministic');

// Every final stat must be fully explained by its per-source breakdown.
for (const stat of ['hp', 'atk', 'def', 'spd']) {
  const b = first.breakdown[stat];
  const recomputed = Math.round(b.raw * b.geneMultiplier * b.evolutionProfile * b.conditionModifier);
  assert.equal(b.final, recomputed, `${stat} final must trace back to its sources`);
}

console.log(`V7.1 balance CR merge-gate regression: PASS (spread ${(comparison.spread * 100).toFixed(1)}%, CR≈${Math.round(comparison.mean)})`);
