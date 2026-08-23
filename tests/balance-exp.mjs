import assert from 'node:assert/strict';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import {
  expToNext,
  cumulativeExpToLevel,
  levelFromTotalExp,
  relativeLevelExpModifier,
} from '../balance-formulas.mjs';

// M7 reference table: live default uses the Workbook Medium cubic curve.
const EXP_TO_NEXT = {
  1: 7, 2: 19, 5: 91, 10: 331, 15: 721, 20: 1261,
  25: 1951, 30: 2791, 35: 3781, 40: 4921, 45: 6211, 50: 7651, 59: 10621,
};
for (const [level, expected] of Object.entries(EXP_TO_NEXT)) {
  assert.equal(expToNext(Number(level)), expected, `expToNext(${level}) must equal ${expected}`);
}
assert.ok(expToNext(50) > 0, 'Lv.50 continues on the Workbook curve');
assert.equal(expToNext(60), 0, 'Lv.60 is the canonical cap');
assert.equal(expToNext(999), 0, 'beyond cap stays capped');

// R2 cumulative-EXP-to-reach-level reference values.
const CUMULATIVE = {
  1: 0, 2: 7, 5: 124, 10: 999, 15: 3374, 20: 7999,
  25: 15624, 30: 26999, 35: 42874, 40: 63999, 45: 91124, 50: 124999, 60: 215999,
};
for (const [level, expected] of Object.entries(CUMULATIVE)) {
  assert.equal(cumulativeExpToLevel(Number(level)), expected, `cumulativeExpToLevel(${level}) must equal ${expected}`);
}

// levelFromTotalExp must invert cumulativeExpToLevel and never exceed the cap.
for (let level = 1; level <= 60; level++) {
  const total = cumulativeExpToLevel(level);
  const resolved = levelFromTotalExp(total);
  assert.equal(resolved.level, level, `total EXP for Lv.${level} must resolve back to Lv.${level}`);
  assert.equal(resolved.expIntoLevel, 0, `exact threshold has zero leftover EXP at Lv.${level}`);
}
const midway = cumulativeExpToLevel(10) + 100;
const mid = levelFromTotalExp(midway);
assert.equal(mid.level, 10, 'partial progress stays in the current level');
assert.equal(mid.expIntoLevel, 100, 'leftover EXP into the level is tracked');

const capped = levelFromTotalExp(10 ** 9);
assert.equal(capped.level, BALANCE_CONFIG.level.cap, 'huge EXP caps at Lv.60');
assert.equal(capped.atCap, true, 'atCap flag set when capped');
assert.equal(capped.expToNext, 0, 'no next-level EXP at cap');
assert.ok(capped.overflowExp > 0, 'overflow EXP is preserved at cap');
assert.equal(levelFromTotalExp(-5).level, 1, 'negative EXP resolves to Lv.1');

// C4 / R2 relative-level Growth EXP modifier.
assert.equal(relativeLevelExpModifier(5, 20), 0.15, 'enemy >=10 levels lower gives the floor 0.15');
assert.equal(relativeLevelExpModifier(15, 20), 0.6, 'd=-5 gives 1 + 0.08*-5 = 0.60');
assert.equal(relativeLevelExpModifier(20, 20), 1.0, 'equal level gives 1.00');
assert.equal(relativeLevelExpModifier(25, 20), 1.25, 'd=+5 caps at 1.25');
assert.equal(relativeLevelExpModifier(40, 20), 1.25, 'far-higher enemy stays capped at 1.25');
let previous = -Infinity;
for (let d = -15; d <= 10; d++) {
  const modifier = relativeLevelExpModifier(20 + d, 20);
  assert.ok(modifier >= 0.15 && modifier <= 1.25, `modifier for d=${d} must stay within [0.15, 1.25]`);
  assert.ok(modifier >= previous, `modifier must be non-decreasing with enemy level (d=${d})`);
  previous = modifier;
}

console.log('V7.1 balance EXP/level curve regression: PASS');
