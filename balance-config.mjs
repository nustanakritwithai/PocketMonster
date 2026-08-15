// Monster Life RPG — V7.1 Balance Foundation
// Data-driven balance baseline. Every tunable value lives here so balance can be
// adjusted without touching engine/formula code (Master Plan R1, R18 "balance"
// content file, R25 open decisions). All values are Vertical-Slice baselines.

export const BALANCE_SCHEMA_VERSION = 1;

export const BALANCE_CONFIG = Object.freeze({
  version: BALANCE_SCHEMA_VERSION,

  // R2 — Growth EXP and level curve. EXP_to_next(L) = round(60 + 20L + 4L^2).
  level: Object.freeze({
    min: 1,
    cap: 50,
    exp: Object.freeze({ base: 60, linear: 20, quadratic: 4 }),
  }),

  // C4 / R2 — Relative-level Growth EXP modifier around |d| <= 5, floored/capped.
  relativeExp: Object.freeze({
    slopePerLevel: 0.08,
    min: 0.15,
    max: 1.25,
    floorAtOrBelow: -10,
    capAtOrAbove: 5,
  }),

  // R3 — Training capacity, diminishing return, aptitude and condition multipliers.
  training: Object.freeze({
    capacity: Object.freeze({ base: 40, perLevel: 8 }),
    // Shared pool across the 5 training lines (Power/Defense/Speed/Technique/Spirit).
    lines: Object.freeze(['power', 'defense', 'speed', 'technique', 'spirit']),
    // Diminishing multiplier by the CURRENT value of the trained line.
    diminishing: Object.freeze([
      Object.freeze({ upTo: 50, multiplier: 1.0 }),
      Object.freeze({ upTo: 100, multiplier: 0.8 }),
      Object.freeze({ upTo: 150, multiplier: 0.6 }),
      Object.freeze({ upTo: 200, multiplier: 0.4 }),
    ]),
    // Beyond the last band training stat EXP stops (Training Overflow rule, R3).
    overflowMultiplier: 0.0,
    // Aptitude stars 1..5 -> training gain multiplier.
    aptitude: Object.freeze({ 1: 0.9, 2: 0.95, 3: 1.0, 4: 1.05, 5: 1.1 }),
  }),

  // R3 — Condition affects both training gain and combat stats (D1 condition band).
  condition: Object.freeze({
    excellent: Object.freeze({ training: 1.1, combat: 0.05 }),
    good: Object.freeze({ training: 1.05, combat: 0.02 }),
    normal: Object.freeze({ training: 1.0, combat: 0.0 }),
    tired: Object.freeze({ training: 0.9, combat: -0.05 }),
    fatigued: Object.freeze({ training: 0.75, combat: -0.1 }),
    bad: Object.freeze({ training: 0.6, combat: -0.15 }),
  }),

  // B3 / R5 — Core Gene ranks act as small potential modifiers, never quality gates.
  gene: Object.freeze({ D: 0.96, C: 0.98, B: 1.0, A: 1.02, S: 1.04 }),

  // R6 — Defense mitigation damageMultiplier = K / (K + DEF), K scales by level band.
  defense: Object.freeze({
    // Hard cap on DEF-only damage reduction (effectiveReduction).
    hardCapReduction: 0.7,
    // K constant per level band (inclusive upper bound). Higher K -> softer DEF.
    kByLevelBand: Object.freeze([
      Object.freeze({ upToLevel: 10, k: 60 }),
      Object.freeze({ upToLevel: 20, k: 90 }),
      Object.freeze({ upToLevel: 35, k: 130 }),
      Object.freeze({ upToLevel: 50, k: 180 }),
    ]),
    fallbackK: 180,
  }),

  // R6 — Derived-stat baselines and caps.
  derived: Object.freeze({
    critRate: Object.freeze({ base: 0.05, soft: 0.2, hard: 0.3 }),
    critDamage: Object.freeze({ base: 1.5, hard: 2.0 }),
    cooldownReduction: Object.freeze({ base: 0.0, hard: 0.25 }),
    attackTempo: Object.freeze({ base: 0.0, hard: 0.2 }),
    movement: Object.freeze({ base: 0.0, hard: 0.25 }),
    elementResist: Object.freeze({ base: 0.0, hard: 0.5 }),
  }),

  // R8 — Permanent nutrition uses its own small capacity (3-5% power budget).
  nutrition: Object.freeze({ capacity: 20 }),

  // R14 — Capture chance. hpFactor is interpolated across the target-HP table.
  capture: Object.freeze({
    minChance: 0.01,
    maxChance: 0.95,
    bossTierModifier: 0.0,
    // Target HP ratio (descending) -> hpFactor multiplier.
    hpFactorTable: Object.freeze([
      Object.freeze({ hpRatio: 1.0, factor: 0.55 }),
      Object.freeze({ hpRatio: 0.75, factor: 0.7 }),
      Object.freeze({ hpRatio: 0.5, factor: 1.0 }),
      Object.freeze({ hpRatio: 0.25, factor: 1.3 }),
      Object.freeze({ hpRatio: 0.1, factor: 1.45 }),
      Object.freeze({ hpRatio: 0.01, factor: 1.5 }),
    ]),
  }),

  // D1 / R26 — Target Power Budget shares (fractions) each source may contribute.
  // Used by the CR simulator to flag builds whose sources drift out of budget.
  powerBudget: Object.freeze({
    speciesLevel: Object.freeze({ min: 0.5, max: 0.55 }),
    training: Object.freeze({ min: 0.2, max: 0.25 }),
    evolution: Object.freeze({ min: 0.05, max: 0.1 }),
    equipment: Object.freeze({ min: 0.08, max: 0.12 }),
    genetics: Object.freeze({ min: 0.03, max: 0.06 }),
    permanentFood: Object.freeze({ min: 0.03, max: 0.05 }),
    skillMastery: Object.freeze({ min: 0.05, max: 0.1 }),
  }),

  // Combat Rating weights (R23 merge gate: build same-level builds and compare CR).
  // CR blends offense (DPS), survivability (EHP) and utility. The three raw
  // components live on very different scales, so each is normalized to a
  // comparable magnitude first; weights are then calibrated so balanced reference
  // builds (Attacker/Tank/Technical) share a CR band (R26). All are tunable.
  combatRating: Object.freeze({
    ehpScale: 8,
    utilityScale: 400,
    dpsWeight: 1.0,
    ehpWeight: 0.522,
    utilityWeight: 1.334,
  }),
});

// Skill Mastery ranks -> cumulative raw power increase (R7). Behavior unlocks are
// content-defined; only the balance-relevant raw multiplier lives here.
export const SKILL_MASTERY = Object.freeze({
  novice: Object.freeze({ order: 0, rawPower: 0.0 }),
  familiar: Object.freeze({ order: 1, rawPower: 0.02 }),
  skilled: Object.freeze({ order: 2, rawPower: 0.05 }),
  expert: Object.freeze({ order: 3, rawPower: 0.08 }),
  master: Object.freeze({ order: 4, rawPower: 0.11 }),
});

export default BALANCE_CONFIG;
