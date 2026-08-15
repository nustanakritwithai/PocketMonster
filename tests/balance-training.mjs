import assert from 'node:assert/strict';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import {
  trainingCapacity,
  totalTrainingUsed,
  trainingCapacityRemaining,
  diminishingMultiplier,
  aptitudeMultiplier,
  conditionTrainingMultiplier,
  conditionCombatModifier,
  trainingGain,
} from '../balance-formulas.mjs';

// R3 — Total Training Capacity = 40 + 8L (shared across all 5 lines).
const CAPACITY = { 1: 48, 10: 120, 20: 200, 35: 320, 50: 440 };
for (const [level, expected] of Object.entries(CAPACITY)) {
  assert.equal(trainingCapacity(Number(level)), expected, `trainingCapacity(${level}) must equal ${expected}`);
}

// R3 — Diminishing multiplier by the current value of the trained line.
assert.equal(diminishingMultiplier(0), 1.0, '0-50 band is 1.00x');
assert.equal(diminishingMultiplier(49), 1.0, 'just under 50 stays 1.00x');
assert.equal(diminishingMultiplier(50), 0.8, '51-100 band is 0.80x (boundary at 50)');
assert.equal(diminishingMultiplier(100), 0.6, '101-150 band is 0.60x');
assert.equal(diminishingMultiplier(150), 0.4, '151-200 band is 0.40x');
assert.equal(diminishingMultiplier(200), 0.0, 'beyond 200 stops adding training stat (overflow)');

// R3 / B3 — Aptitude stars map to gain multipliers.
assert.equal(aptitudeMultiplier(1), 0.9);
assert.equal(aptitudeMultiplier(3), 1.0);
assert.equal(aptitudeMultiplier(5), 1.1);
assert.equal(aptitudeMultiplier(9), 1.1, 'aptitude clamps to 5 stars');
assert.equal(aptitudeMultiplier(0), 0.9, 'aptitude clamps to 1 star');

// R3 — Condition affects training gain and combat stats.
assert.equal(conditionTrainingMultiplier('excellent'), 1.1);
assert.equal(conditionTrainingMultiplier('normal'), 1.0);
assert.equal(conditionTrainingMultiplier('bad'), 0.6);
assert.equal(conditionTrainingMultiplier('sore'), 0.6, 'Sore is an alias for Bad');
assert.equal(conditionTrainingMultiplier('unknown'), 1.0, 'unknown condition defaults to Normal');
assert.equal(conditionCombatModifier('excellent'), 0.05);
assert.equal(conditionCombatModifier('bad'), -0.15);

// R3 — gain = baseGain × aptitude × condition × foodBuff × facility × diminishing.
const gain = trainingGain({ baseGain: 15, currentValue: 0, aptitudeStars: 5, condition: 'excellent', foodBuff: 1.2 });
assert.ok(Math.abs(gain - 15 * 1.1 * 1.1 * 1.2 * 1 * 1.0) < 1e-9, 'training gain multiplies all modifiers');
const baseline = trainingGain({ baseGain: 15, aptitudeStars: 3, condition: 'normal' });
assert.equal(baseline, 15, 'neutral modifiers leave base gain unchanged');
const diminished = trainingGain({ baseGain: 15, currentValue: 120, aptitudeStars: 3, condition: 'normal' });
assert.ok(Math.abs(diminished - 15 * 0.6) < 1e-9, 'high current value applies 0.60x diminishing');

// Single Training Budget: gain can never overflow remaining shared capacity.
const clampedByCapacity = trainingGain({ baseGain: 100, capacityRemaining: 4 });
assert.equal(clampedByCapacity, 4, 'training gain is clamped to remaining capacity');
assert.equal(trainingGain({ baseGain: 10, capacityRemaining: 0 }), 0, 'no gain when capacity is exhausted');

// Shared-pool accounting across the 5 lines.
const training = { power: 110, speed: 50, technique: 40, defense: 0, spirit: 0 };
assert.equal(totalTrainingUsed(training), 200, 'all 5 lines sum into one pool');
assert.equal(trainingCapacityRemaining(20, training), 0, 'a full Lv.20 build leaves zero remaining capacity');
assert.equal(trainingCapacityRemaining(20, { power: 50 }), 150, 'remaining capacity reflects unused pool');
assert.ok(totalTrainingUsed(training) <= trainingCapacity(20), 'reference build respects the capacity invariant');

console.log('V7.1 balance training capacity/gain regression: PASS');
