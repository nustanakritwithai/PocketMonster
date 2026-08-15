import assert from 'node:assert/strict';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import { captureHpFactor, captureChance } from '../balance-formulas.mjs';

// R14 — hpFactor reference knots.
assert.equal(captureHpFactor(1.0), 0.55, 'full HP is hardest (0.55x)');
assert.equal(captureHpFactor(0.75), 0.7);
assert.equal(captureHpFactor(0.5), 1.0);
assert.equal(captureHpFactor(0.25), 1.3);
assert.equal(captureHpFactor(0.1), 1.45);
assert.equal(captureHpFactor(0.01), 1.5, 'near-zero HP is easiest (1.5x)');
assert.equal(captureHpFactor(0), 1.5, 'clamps to the lowest knot below 1% HP');
assert.equal(captureHpFactor(1.5), 0.55, 'clamps to the highest knot above full HP');

// Interpolation between knots is monotonic (lower HP is never harder).
let previous = -Infinity;
for (let hp = 100; hp >= 0; hp -= 5) {
  const factor = captureHpFactor(hp / 100);
  assert.ok(factor >= previous - 1e-9, `hpFactor must not decrease as HP drops (hp=${hp}%)`);
  previous = factor;
}
const between = captureHpFactor(0.625); // midpoint of 0.75 and 0.5 knots.
assert.ok(between > 0.7 && between < 1.0, 'interpolates between adjacent knots');

// R14 — Boss is uncapturable (tierModifier 0 → chance 0).
assert.equal(captureChance({ tierModifier: BALANCE_CONFIG.capture.bossTierModifier }), 0, 'boss capture chance is exactly 0');
assert.equal(captureChance({ speciesRate: 0.9, hpRatio: 0.01, tierModifier: 0 }), 0, 'tier 0 always yields 0 regardless of HP');

// Capture chance rises as target HP drops, and is clamped to [min, max].
const full = captureChance({ speciesRate: 0.4, hpRatio: 1.0 });
const low = captureChance({ speciesRate: 0.4, hpRatio: 0.1 });
assert.ok(low > full, 'lower HP improves capture chance');
const forcedHigh = captureChance({ speciesRate: 5, hpRatio: 0.1, ballModifier: 5 });
assert.equal(forcedHigh, BALANCE_CONFIG.capture.maxChance, 'capture chance clamps to the max');
const forcedLow = captureChance({ speciesRate: 0.0001, hpRatio: 1.0 });
assert.equal(forcedLow, BALANCE_CONFIG.capture.minChance, 'capture chance clamps to the min');

console.log('V7.1 balance capture-chance regression: PASS');
