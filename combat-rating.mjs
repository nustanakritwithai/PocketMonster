// Monster Life RPG — V7.1 Balance Foundation
// Combat Rating (CR) + per-source stat breakdown. This is the "simulator" layer
// from the roadmap (R23): it lets us build same-level monsters and compare CR, and
// it traces every point of power back to a source (R26 Final Design Test).

import { BALANCE_CONFIG } from './balance-config.mjs';
import {
  clamp,
  clampDerived,
  conditionCombatModifier,
  coreStatFinal,
  coreStatRaw,
  effectiveHp,
  geneModifier,
} from './balance-formulas.mjs';

export const CORE_STATS = Object.freeze(['hp', 'atk', 'def', 'spd']);

// Default Species Training Conversion Profile (R5). Content should override this
// per species/form; a Tank's Power point yields less ATK than a DPS's, etc.
export const DEFAULT_CONVERSION = Object.freeze({
  hp: Object.freeze({ defense: 3.0, spirit: 0.6 }),
  atk: Object.freeze({ power: 1.0, technique: 0.25, speed: 0.15 }),
  def: Object.freeze({ defense: 1.0, spirit: 0.25, technique: 0.15 }),
  spd: Object.freeze({ speed: 1.0, technique: 0.2 }),
});

// Derived-stat coefficients per trained point (content-tunable).
const DERIVED_COEFF = Object.freeze({
  critRate: Object.freeze({ technique: 0.0009 }),
  critDamage: Object.freeze({ power: 0.0015 }),
  attackTempo: Object.freeze({ speed: 0.0011 }),
  cooldownReduction: Object.freeze({ technique: 0.0011 }),
  elementResist: Object.freeze({ spirit: 0.004 }),
});

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function trainingContribution(stat, training, conversion) {
  const map = conversion[stat] ?? {};
  let total = 0;
  for (const [line, coeff] of Object.entries(map)) {
    total += coeff * num(training?.[line], 0);
  }
  return total;
}

// Full per-source breakdown for one core stat, so any final value is explainable.
export function statBreakdown(build, stat, config = BALANCE_CONFIG) {
  const species = build.species ?? {};
  const base = num(species.base?.[stat], 0);
  const growthPerLevel = num(species.growthPerLevel?.[stat], 0);
  const level = clamp(Math.floor(num(build.level, 1)), config.level.min, config.level.cap);
  const levelGrowth = growthPerLevel * (level - 1);
  const conversion = species.conversion ?? DEFAULT_CONVERSION;
  const training = trainingContribution(stat, build.training, conversion);
  const nutritionFlat = num(build.nutritionFlat?.[stat], 0);
  const equipmentFlat = num(build.equipmentFlat?.[stat], 0);

  const raw = coreStatRaw({ speciesBase: base, levelGrowth, training, nutritionFlat, equipmentFlat });
  const geneRank = build.genes?.[stat] ?? 'B';
  const evolutionProfile = num(build.evolutionProfile?.[stat], 1) || 1;
  const conditionModifier = 1 + conditionCombatModifier(build.condition ?? 'normal', config);
  const final = coreStatFinal(
    { raw, geneRank, evolutionProfile, condition: build.condition ?? 'normal' },
    config,
  );

  return {
    stat,
    speciesBase: base,
    levelGrowth,
    training,
    nutritionFlat,
    equipmentFlat,
    raw,
    geneRank,
    geneMultiplier: geneModifier(geneRank, config),
    evolutionProfile,
    conditionModifier,
    final,
  };
}

export function finalStats(build, config = BALANCE_CONFIG) {
  const breakdown = {};
  const stats = {};
  for (const stat of CORE_STATS) {
    const detail = statBreakdown(build, stat, config);
    breakdown[stat] = detail;
    stats[stat] = detail.final;
  }
  return { stats, breakdown };
}

export function derivedStats(build, config = BALANCE_CONFIG) {
  const training = build.training ?? {};
  const bonus = build.derivedBonus ?? {};
  const raw = {
    critRate: config.derived.critRate.base + DERIVED_COEFF.critRate.technique * num(training.technique) + num(bonus.critRate),
    critDamage: config.derived.critDamage.base + DERIVED_COEFF.critDamage.power * num(training.power) + num(bonus.critDamage),
    attackTempo: config.derived.attackTempo.base + DERIVED_COEFF.attackTempo.speed * num(training.speed) + num(bonus.attackTempo),
    cooldownReduction: config.derived.cooldownReduction.base + DERIVED_COEFF.cooldownReduction.technique * num(training.technique) + num(bonus.cooldownReduction),
    elementResist: config.derived.elementResist.base + DERIVED_COEFF.elementResist.spirit * num(training.spirit) + num(bonus.elementResist),
  };
  return {
    critRate: clampDerived('critRate', raw.critRate, config),
    critDamage: clamp(raw.critDamage, config.derived.critDamage.base, config.derived.critDamage.hard),
    attackTempo: clampDerived('attackTempo', raw.attackTempo, config),
    cooldownReduction: clampDerived('cooldownReduction', raw.cooldownReduction, config),
    elementResist: clampDerived('elementResist', raw.elementResist, config),
  };
}

// Sustained DPS estimate from final ATK, tempo, crit and skill output.
export function estimateDps(stats, derived, skillMultiplier = 1) {
  const atk = num(stats.atk, 0);
  const critFactor = 1 + derived.critRate * (derived.critDamage - 1);
  const tempoFactor = 1 + derived.attackTempo;
  const skill = Number.isFinite(skillMultiplier) && skillMultiplier > 0 ? skillMultiplier : 1;
  return atk * tempoFactor * critFactor * skill;
}

// Combat Rating blends offense (DPS), survivability (EHP) and utility on one scale.
export function combatRating(build, config = BALANCE_CONFIG) {
  const level = clamp(Math.floor(num(build.level, 1)), config.level.min, config.level.cap);
  const { stats, breakdown } = finalStats(build, config);
  const derived = derivedStats(build, config);
  const dps = estimateDps(stats, derived, num(build.skillMultiplier, 1) || 1);
  const ehp = effectiveHp(stats.hp, stats.def, level, config);
  const utility = derived.cooldownReduction + derived.elementResist * 0.5;

  const w = config.combatRating;
  // Normalize components to comparable magnitudes before applying tuned weights.
  const dpsComponent = dps;
  const ehpComponent = ehp / w.ehpScale;
  const utilityComponent = utility * w.utilityScale;
  const cr =
    w.dpsWeight * dpsComponent +
    w.ehpWeight * ehpComponent +
    w.utilityWeight * utilityComponent;

  return {
    name: build.name ?? 'monster',
    level,
    stats,
    derived,
    dps,
    ehp,
    utility,
    components: { dps: dpsComponent, ehp: ehpComponent, utility: utilityComponent },
    cr: Math.round(cr),
    breakdown,
  };
}

// Compare a set of same-level builds; report CR spread against a tolerance band.
export function compareBuilds(builds, { tolerance = 0.15, config = BALANCE_CONFIG } = {}) {
  const rated = builds.map(build => combatRating(build, config));
  const crs = rated.map(r => r.cr);
  const min = Math.min(...crs);
  const max = Math.max(...crs);
  const mean = crs.reduce((a, b) => a + b, 0) / (crs.length || 1);
  const spread = mean > 0 ? (max - min) / mean : 0;
  const levels = new Set(rated.map(r => r.level));
  return {
    rated,
    min,
    max,
    mean,
    spread,
    sameLevel: levels.size === 1,
    withinTolerance: spread <= tolerance,
    tolerance,
  };
}
