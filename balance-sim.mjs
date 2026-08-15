// Monster Life RPG — V7.1 Balance Foundation
// CLI balance simulator / text debug panel. Builds three same-level, same-budget
// archetypes of one species (the North Star: Attacker / Tank / Technical) and
// prints a CR comparison plus a per-source stat breakdown so every point of power
// is explainable. Run with: `npm run sim` or `node balance-sim.mjs`.

import { BALANCE_CONFIG } from './balance-config.mjs';
import { trainingCapacity, totalTrainingUsed } from './balance-formulas.mjs';
import { combatRating, compareBuilds, CORE_STATS } from './combat-rating.mjs';

const SPECIES = Object.freeze({
  id: 'flame_slime',
  base: Object.freeze({ hp: 120, atk: 30, def: 25, spd: 28 }),
  growthPerLevel: Object.freeze({ hp: 8, atk: 2.0, def: 1.5, spd: 1.6 }),
});

const LEVEL = 20;

// Same level, same shared training budget (capacity(20) = 200), different builds.
export const ARCHETYPES = [
  {
    name: 'Attacker',
    level: LEVEL,
    species: SPECIES,
    genes: { hp: 'B', atk: 'A', def: 'C', spd: 'B' },
    training: { power: 110, speed: 50, technique: 40, defense: 0, spirit: 0 },
    condition: 'good',
    skillMultiplier: 1.0,
  },
  {
    name: 'Tank',
    level: LEVEL,
    species: SPECIES,
    genes: { hp: 'A', atk: 'C', def: 'A', spd: 'C' },
    training: { power: 20, speed: 10, technique: 20, defense: 120, spirit: 30 },
    condition: 'good',
    skillMultiplier: 1.0,
  },
  {
    name: 'Technical',
    level: LEVEL,
    species: SPECIES,
    genes: { hp: 'B', atk: 'B', def: 'B', spd: 'B' },
    training: { power: 20, speed: 45, technique: 90, defense: 0, spirit: 45 },
    condition: 'good',
    skillMultiplier: 1.05,
  },
];

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function pad(value, width) {
  return String(value).padStart(width);
}

function printHeader(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

export function runSimulation(config = BALANCE_CONFIG) {
  const capacity = trainingCapacity(LEVEL, config);
  printHeader(`Balance Simulator — ${SPECIES.id} @ Lv.${LEVEL} (Training Capacity ${capacity})`);

  for (const build of ARCHETYPES) {
    const used = totalTrainingUsed(build.training, config);
    if (used > capacity) {
      throw new Error(`${build.name} uses ${used} training > capacity ${capacity}`);
    }
  }

  const comparison = compareBuilds(ARCHETYPES, { config });

  console.log(
    `${pad('Build', 10)} ${pad('HP', 6)} ${pad('ATK', 5)} ${pad('DEF', 5)} ${pad('SPD', 5)} ` +
    `${pad('DPS', 7)} ${pad('EHP', 8)} ${pad('Util', 6)} ${pad('CR', 6)}`,
  );
  for (const r of comparison.rated) {
    console.log(
      `${pad(r.name, 10)} ${pad(r.stats.hp, 6)} ${pad(r.stats.atk, 5)} ${pad(r.stats.def, 5)} ${pad(r.stats.spd, 5)} ` +
      `${pad(r.dps.toFixed(1), 7)} ${pad(r.ehp.toFixed(0), 8)} ${pad(pct(r.utility), 6)} ${pad(r.cr, 6)}`,
    );
  }

  console.log(
    `\nCR spread: ${pct(comparison.spread)} (mean ${comparison.mean.toFixed(0)}, ` +
    `min ${comparison.min}, max ${comparison.max}) — tolerance ${pct(comparison.tolerance)} → ` +
    `${comparison.withinTolerance ? 'WITHIN BUDGET' : 'OUT OF BUDGET'}`,
  );

  // Debug panel: trace the Attacker's ATK back to each source (R26 Final Design Test).
  const attacker = comparison.rated.find(r => r.name === 'Attacker');
  printHeader('ATK source breakdown — Attacker');
  const b = attacker.breakdown.atk;
  console.log(`  species base      : ${b.speciesBase}`);
  console.log(`  level growth      : ${b.levelGrowth.toFixed(1)}`);
  console.log(`  training          : ${b.training.toFixed(1)}`);
  console.log(`  nutrition (flat)  : ${b.nutritionFlat}`);
  console.log(`  equipment (flat)  : ${b.equipmentFlat}`);
  console.log(`  raw               : ${b.raw.toFixed(1)}`);
  console.log(`  gene ${b.geneRank} (${b.geneMultiplier}×)   : ${(b.raw * b.geneMultiplier).toFixed(1)}`);
  console.log(`  evolution (${b.evolutionProfile}×) : ${(b.raw * b.geneMultiplier * b.evolutionProfile).toFixed(1)}`);
  console.log(`  condition (${b.conditionModifier.toFixed(2)}×): ${b.final} (final)`);

  return comparison;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const comparison = runSimulation();
  const roleOk =
    (() => {
      const byName = Object.fromEntries(comparison.rated.map(r => [r.name, r]));
      const topDps = comparison.rated.reduce((a, b2) => (b2.dps > a.dps ? b2 : a));
      const topEhp = comparison.rated.reduce((a, b2) => (b2.ehp > a.ehp ? b2 : a));
      return topDps.name === 'Attacker' && topEhp.name === 'Tank' && byName.Technical.utility > byName.Attacker.utility;
    })();
  console.log(`\nRole distinctiveness: ${roleOk ? 'OK (Attacker=DPS, Tank=EHP, Technical=Utility)' : 'FAIL'}`);
  process.exitCode = comparison.withinTolerance && roleOk ? 0 : 1;
}
