import assert from 'node:assert/strict';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import {
  defenseK,
  defenseMitigation,
  effectiveHp,
  clampDerived,
} from '../balance-formulas.mjs';

// R6 — K scales by level band.
assert.equal(defenseK(5), 60, 'Lv <=10 uses K=60');
assert.equal(defenseK(20), 90, 'Lv <=20 uses K=90');
assert.equal(defenseK(35), 130, 'Lv <=35 uses K=130');
assert.equal(defenseK(50), 180, 'Lv <=50 uses K=180');

// R6 — damageMultiplier = K / (K + DEF); zero DEF takes full damage.
const noDef = defenseMitigation(0, 20);
assert.equal(noDef.damageMultiplier, 1, 'no DEF means full damage taken');
assert.equal(noDef.effectiveReduction, 0, 'no DEF means zero reduction');

const someDef = defenseMitigation(90, 20); // DEF == K at this band.
assert.ok(Math.abs(someDef.damageMultiplier - 0.5) < 1e-9, 'DEF equal to K halves damage');
assert.ok(Math.abs(someDef.effectiveReduction - 0.5) < 1e-9, 'DEF equal to K is 50% reduction');

// R6 — DEF-only reduction is hard-capped at 70%.
const hugeDef = defenseMitigation(100000, 20);
assert.ok(hugeDef.effectiveReduction <= BALANCE_CONFIG.defense.hardCapReduction + 1e-9, 'reduction cannot exceed the 70% hard cap');
assert.ok(Math.abs(hugeDef.effectiveReduction - 0.7) < 1e-9, 'massive DEF is clamped to exactly 70%');
assert.ok(hugeDef.damageMultiplier >= 0.3 - 1e-9, 'damage multiplier floors at 0.30');

// Effective HP grows with both HP and DEF.
const ehpLowDef = effectiveHp(1000, 0, 20);
const ehpHighDef = effectiveHp(1000, 90, 20);
assert.equal(ehpLowDef, 1000, 'with no DEF, EHP equals raw HP');
assert.ok(ehpHighDef > ehpLowDef, 'more DEF yields more effective HP');
assert.ok(Math.abs(ehpHighDef - 2000) < 1e-6, 'DEF=K doubles effective HP');

// R6 — Derived stats clamp to their hard caps.
assert.equal(clampDerived('critRate', 0.9), 0.3, 'crit rate hard cap 30%');
assert.equal(clampDerived('cooldownReduction', 0.9), 0.25, 'CDR hard cap 25%');
assert.equal(clampDerived('attackTempo', 0.9), 0.2, 'attack tempo hard cap 20%');
assert.equal(clampDerived('movement', 0.9), 0.25, 'movement hard cap 25%');
assert.equal(clampDerived('elementResist', 0.9), 0.5, 'element resist hard cap 50%');
assert.equal(clampDerived('critRate', -1), 0, 'derived stats never go negative');

console.log('V7.1 balance defense/mitigation regression: PASS');
