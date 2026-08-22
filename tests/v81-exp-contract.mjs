import assert from 'node:assert/strict';
import { BALANCE_CONFIG, WORKBOOK_EXP_ADAPTER } from '../balance-config.mjs';
import {
  calculateWorkbookBattleExpPreview,
  calculateWorkbookExpCurvePreview,
  expToNext,
  resolveWorkbookExpAward,
  resolveWorkbookExpProgress,
  workbookLevelDifferenceMultiplier,
} from '../balance-formulas.mjs';

assert.equal(WORKBOOK_EXP_ADAPTER.activation, 'calculator_only');
assert.equal(WORKBOOK_EXP_ADAPTER.runtimeEligible, false);
assert.equal(Object.isFrozen(WORKBOOK_EXP_ADAPTER), true);
assert.equal(Object.isFrozen(WORKBOOK_EXP_ADAPTER.curves), true);
assert.equal(BALANCE_CONFIG.level.cap, 50, 'live level cap remains unchanged');
assert.equal(expToNext(50), Infinity, 'Workbook source curves do not activate in the live game');

const curveVectors = [
  ['Fast', 1, 0, 6],
  ['Fast', 5, 99, 73],
  ['Medium', 10, 999, 331],
  ['MediumSlow', 5, 143, 105],
  ['Slow', 3, 35, 50],
  ['Slow', 60, 291599, 0],
];
for (const [curve, level, cumulative, toNext] of curveVectors) {
  const result = calculateWorkbookExpCurvePreview({ curve, level });
  assert.deepEqual(
    { ok: result.ok, level: result.level, cumulative: result.cumulative, toNext: result.toNext },
    { ok: true, level, cumulative, toNext },
    `${curve} Lv.${level} matches EXP_Curve`,
  );
}
assert.equal(calculateWorkbookExpCurvePreview({ curve: 'Fast', level: 0 }).level, 1);
assert.equal(calculateWorkbookExpCurvePreview({ curve: 'Fast', level: 999 }).level, 60);
assert.equal(calculateWorkbookExpCurvePreview({ curve: 'Missing' }).reason, 'unknown_id');
assert.equal(calculateWorkbookExpCurvePreview({ curve: 'toString' }).reason, 'unknown_id');
for (const curve of Object.keys(WORKBOOK_EXP_ADAPTER.curves)) {
  let previous = -1;
  for (let level = 1; level <= 60; level += 1) {
    const cumulative = calculateWorkbookExpCurvePreview({ curve, level }).cumulative;
    assert.ok(cumulative >= previous, `${curve} curve is monotonic at Lv.${level}`);
    previous = cumulative;
  }
}

const levelDifferenceVectors = [
  [15, 10, 1.4], [14, 10, 1.15], [12, 10, 1.15], [11, 10, 1],
  [8, 10, 1], [7, 10, 0.75], [5, 10, 0.75], [4, 10, 0.5],
];
for (const [enemyLevel, monsterLevel, expected] of levelDifferenceVectors) {
  assert.equal(workbookLevelDifferenceMultiplier(enemyLevel, monsterLevel), expected);
}

const workbookExample = calculateWorkbookBattleExpPreview({
  baseExpYield: 90,
  enemyLevel: 10,
  monsterLevel: 10,
  variant: 'Normal',
  participation: 'Active',
  extraMultiplier: 1,
});
assert.equal(workbookExample.reward, 128, 'EXP_Calculator E12 vector matches FLOOR(BaseYield×EnemyLv÷7×multipliers)');
assert.equal(calculateWorkbookBattleExpPreview({
  baseExpYield: 90, enemyLevel: 15, monsterLevel: 10, variant: 'Elite', participation: 'PartyAssist', extraMultiplier: 1.25,
}).reward, 236);
assert.equal(calculateWorkbookBattleExpPreview({
  baseExpYield: 999, enemyLevel: 60, monsterLevel: 1, variant: 'Boss', participation: 'NoParticipation', extraMultiplier: 3,
}).reward, 0);
assert.equal(calculateWorkbookBattleExpPreview({ variant: 'Legendary' }).reason, 'unknown_id');
assert.equal(calculateWorkbookBattleExpPreview({ variant: 'toString' }).reason, 'unknown_id');
assert.equal(calculateWorkbookBattleExpPreview({ participation: 'Bench' }).reason, 'unknown_id');

const progress = resolveWorkbookExpProgress({ curve: 'Medium', totalExp: 1127 });
assert.deepEqual(
  { level: progress.level, expIntoLevel: progress.expIntoLevel, expToNext: progress.expToNext },
  { level: 10, expIntoLevel: 128, expToNext: 203 },
  'EXP_Calculator E14:E16 vectors match',
);
const capProgress = resolveWorkbookExpProgress({ curve: 'Medium', totalExp: 300000 });
assert.equal(capProgress.level, 60);
assert.equal(capProgress.atSourceCap, true);
assert.equal(capProgress.expToNext, 0);
assert.ok(capProgress.overflowExp > 0);

const callerLedger = [];
const firstAward = resolveWorkbookExpAward({
  awardId: 'encounter:alpha:active',
  currentTotalExp: 999,
  appliedAwardIds: callerLedger,
  curve: 'Medium',
  baseExpYield: 90,
  enemyLevel: 10,
  monsterLevel: 10,
});
assert.equal(firstAward.applied, true);
assert.equal(firstAward.newTotalExp, 1127);
assert.deepEqual(firstAward.appliedAwardIds, ['encounter:alpha:active']);
assert.deepEqual(callerLedger, [], 'award resolver is side-effect free');

const loaded = JSON.parse(JSON.stringify(firstAward));
const duplicate = resolveWorkbookExpAward({
  awardId: 'encounter:alpha:active',
  currentTotalExp: loaded.newTotalExp,
  appliedAwardIds: loaded.appliedAwardIds,
  curve: 'Medium',
  baseExpYield: 90,
  enemyLevel: 10,
  monsterLevel: 10,
});
assert.equal(duplicate.reason, 'duplicate_award');
assert.equal(duplicate.reward, 0);
assert.equal(duplicate.newTotalExp, 1127, 'save/load replay cannot apply the same award twice');
assert.equal(Object.isFrozen(firstAward.appliedAwardIds), true);
assert.equal(resolveWorkbookExpAward({ awardId: '' }).reason, 'invalid_award_id');
assert.equal(resolveWorkbookExpAward({ awardId: 'x', appliedAwardIds: {} }).reason, 'invalid_state');

console.log('V8.1 Workbook EXP calculator contract: PASS');
