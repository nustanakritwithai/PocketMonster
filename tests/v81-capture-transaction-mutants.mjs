import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../capture-transaction.mjs', import.meta.url);
const original = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, tag) {
  const absoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, sourceUrl).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

const INPUT = Object.freeze({
  targetId: 'wild-1', monsterId: 'MON_020', currentHp: 10, maxHp: 100,
  activeStatusIds: Object.freeze(['ST_PARALYZE']), ballClass: 'Ultra', ballTargetType: null,
  targetSecondaryType: null, targetLevel: 20, referenceLevel: 99, variant: 'Normal',
  ownedMonsterActive: true, ballQuantity: 0, projectileHit: false, targetAlive: true,
});

function command(inventory, overrides = {}) {
  return {
    attemptId: 'attempt-1', inventory, targetId: 'wild-1', ballClass: 'Basic',
    targetMonsterId: 'MON_020',
    ballTargetType: null, referenceLevel: 20, ownedMonsterActive: false, ...overrides,
  };
}

function resolveCommand(overrides = {}) {
  return {
    attemptId: 'attempt-1', projectileHit: true, calculatorInput: INPUT, rng: () => 0.73,
    ...overrides,
  };
}

function contract(module) {
  const ledger = module.createCaptureAttemptLedger();
  const inventory = { captureBalls: 1 };
  const started = module.beginCaptureAttempt(ledger, command(inventory));
  assert.equal(started.ok, true, started.reason);
  assert.equal(started.ballConsumed, true);
  assert.equal(started.attempt.ballQuantityBefore, 1);
  assert.equal(inventory.captureBalls, 0);
  assert.equal(module.beginCaptureAttempt(ledger, command(inventory)).replay, true);
  assert.equal(inventory.captureBalls, 0);
  assert.equal(module.beginCaptureAttempt(ledger, command(inventory, { targetId: 'wild-2' })).reason, 'attempt_id_conflict');

  let rolls = 0;
  const resolved = module.resolveCaptureAttempt(ledger, resolveCommand({ rng: () => { rolls += 1; return 0.73; } }));
  assert.equal(resolved.ok, true, resolved.reason);
  assert.equal(resolved.attempt.resolution.finalChancePct, 74);
  assert.equal(resolved.attempt.resolution.captureSucceeded, true);
  assert.equal(resolved.attempt.resolution.captureProfile.baseBond, 20);
  assert.equal(rolls, 1);
  assert.equal(module.resolveCaptureAttempt(ledger, resolveCommand({ rng: () => { rolls += 1; return 0; } })).replay, true);
  assert.equal(rolls, 1);

  let success = 0;
  let failure = 0;
  const committed = module.commitCaptureAttempt(ledger, {
    attemptId: 'attempt-1',
    onSuccess: () => { success += 1; return { ownedMonsterId: 'owned-1' }; },
    onFailure: () => { failure += 1; },
  });
  assert.equal(committed.ok, true, committed.reason);
  assert.equal(committed.attempt.phase, 'committed');
  assert.equal(success, 1);
  assert.equal(failure, 0);
  assert.equal(module.commitCaptureAttempt(ledger, {
    attemptId: 'attempt-1', onSuccess: () => { success += 1; }, onFailure: () => { failure += 1; },
  }).replay, true);
  assert.equal(success, 1);

  const missLedger = module.createCaptureAttemptLedger();
  const missInventory = { captureBalls: 1 };
  assert.equal(module.beginCaptureAttempt(missLedger, command(missInventory, {
    attemptId: 'miss-1', targetId: null, referenceLevel: null,
    targetMonsterId: null,
  })).ok, true);
  let missRolls = 0;
  const miss = module.resolveCaptureAttempt(missLedger, {
    attemptId: 'miss-1', projectileHit: false,
    calculatorInput: null, rng: () => { missRolls += 1; return 0; },
  });
  assert.equal(miss.attempt.resolution.reason, 'projectile_miss');
  assert.equal(miss.rollPerformed, false);
  assert.equal(missRolls, 0);
  let missFailure = 0;
  module.commitCaptureAttempt(missLedger, {
    attemptId: 'miss-1', onSuccess: () => assert.fail(), onFailure: () => { missFailure += 1; },
  });
  assert.equal(missFailure, 1);

  const targetLedger = module.createCaptureAttemptLedger();
  module.beginCaptureAttempt(targetLedger, command({ captureBalls: 1 }, {
    attemptId: 'target-1', targetId: null, referenceLevel: null,
    targetMonsterId: null,
  }));
  let targetRolls = 0;
  const targetMismatch = module.resolveCaptureAttempt(targetLedger, {
    attemptId: 'target-1', projectileHit: true, calculatorInput: { ...INPUT, targetId: null },
    rng: () => { targetRolls += 1; return 0; },
  });
  assert.equal(targetMismatch.reason, 'target_mismatch');
  assert.equal(targetRolls, 0);

  const monsterIdentityLedger = module.createCaptureAttemptLedger();
  module.beginCaptureAttempt(monsterIdentityLedger, command({ captureBalls: 1 }));
  assert.equal(module.resolveCaptureAttempt(monsterIdentityLedger, resolveCommand({
    calculatorInput: { ...INPUT, monsterId: 'MON_002' },
  })).reason, 'target_mismatch');

  const bossLedger = module.createCaptureAttemptLedger();
  module.beginCaptureAttempt(bossLedger, command({ captureBalls: 1 }));
  let bossRolls = 0;
  const boss = module.resolveCaptureAttempt(bossLedger, resolveCommand({
    calculatorInput: { ...INPUT, variant: 'Boss' }, rng: () => { bossRolls += 1; return 0; },
  }));
  assert.equal(boss.attempt.resolution.reason, 'capture_disabled');
  assert.equal(bossRolls, 0);

  const thresholdLedger = module.createCaptureAttemptLedger();
  module.beginCaptureAttempt(thresholdLedger, command({ captureBalls: 1 }));
  assert.equal(module.resolveCaptureAttempt(thresholdLedger, resolveCommand({ rng: () => 0.74 })).attempt.resolution.captureSucceeded, false);

  const invalidRollLedger = module.createCaptureAttemptLedger();
  module.beginCaptureAttempt(invalidRollLedger, command({ captureBalls: 1 }));
  let invalidRolls = 0;
  assert.equal(module.resolveCaptureAttempt(invalidRollLedger, resolveCommand({
    rng: () => { invalidRolls += 1; return 1; },
  })).attempt.resolution.reason, 'invalid_roll');
  assert.equal(module.resolveCaptureAttempt(invalidRollLedger, resolveCommand({
    rng: () => { invalidRolls += 1; return 0; },
  })).replay, true);
  assert.equal(invalidRolls, 1);

  const cancelLedger = module.createCaptureAttemptLedger();
  const cancelInventory = { captureBalls: 1 };
  module.beginCaptureAttempt(cancelLedger, command(cancelInventory));
  const cancelled = module.cancelCaptureAttempt(cancelLedger, 'attempt-1');
  assert.equal(cancelInventory.captureBalls, 0);
  assert.equal(cancelled.attempt.ballQuantityBefore, 1);
  assert.equal(module.resolveCaptureAttempt(cancelLedger, resolveCommand()).reason, 'attempt_cancelled');

  const activeLedger = module.createCaptureAttemptLedger({ maxEntries: 1 });
  module.beginCaptureAttempt(activeLedger, command({ captureBalls: 2 }, { attemptId: 'active-1' }));
  const secondInventory = { captureBalls: 2 };
  assert.equal(module.beginCaptureAttempt(activeLedger, command(secondInventory, { attemptId: 'active-2' })).reason, 'ledger_capacity');
  assert.equal(secondInventory.captureBalls, 2);

  const throwingLedger = module.createCaptureAttemptLedger();
  module.beginCaptureAttempt(throwingLedger, command({ captureBalls: 1 }));
  module.resolveCaptureAttempt(throwingLedger, resolveCommand());
  let throws = 0;
  assert.equal(module.commitCaptureAttempt(throwingLedger, {
    attemptId: 'attempt-1', onSuccess: () => { throws += 1; throw new Error('x'); }, onFailure: () => {},
  }).reason, 'commit_failed');
  assert.equal(module.commitCaptureAttempt(throwingLedger, {
    attemptId: 'attempt-1', onSuccess: () => { throws += 1; }, onFailure: () => {},
  }).reason, 'commit_failed');
  assert.equal(throws, 1);

  const reentrantLedger = module.createCaptureAttemptLedger();
  module.beginCaptureAttempt(reentrantLedger, command({ captureBalls: 1 }));
  module.resolveCaptureAttempt(reentrantLedger, resolveCommand());
  let reentrant = 0;
  let nestedReason = null;
  const reentrantCommit = module.commitCaptureAttempt(reentrantLedger, {
    attemptId: 'attempt-1',
    onSuccess: () => {
      reentrant += 1;
      nestedReason = module.commitCaptureAttempt(reentrantLedger, {
        attemptId: 'attempt-1', onSuccess: () => { reentrant += 100; }, onFailure: () => {},
      }).reason;
    },
    onFailure: () => {},
  });
  assert.equal(reentrantCommit.ok, true);
  assert.equal(nestedReason, 'attempt_in_progress');
  assert.equal(reentrant, 1);

  const callbackLedger = module.createCaptureAttemptLedger();
  module.beginCaptureAttempt(callbackLedger, command({ captureBalls: 1 }));
  module.resolveCaptureAttempt(callbackLedger, resolveCommand());
  assert.equal(module.commitCaptureAttempt(callbackLedger, { attemptId: 'attempt-1' }).reason, 'invalid_state');
  assert.equal(module.captureAttemptSnapshot(callbackLedger, 'attempt-1').phase, 'resolved');

  const inheritedInventory = Object.create({ captureBalls: 1 });
  assert.equal(module.beginCaptureAttempt(module.createCaptureAttemptLedger(), command(inheritedInventory, {
    attemptId: 'inherited',
  })).reason, 'invalid_state');
  assert.equal(Object.hasOwn(inheritedInventory, 'captureBalls'), false);
  assert.equal(module.beginCaptureAttempt(module.createCaptureAttemptLedger(), command({ captureBalls: 1 }, {
    attemptId: 'prototype-ball', ballClass: 'constructor',
  })).reason, 'invalid_state');
  assert.equal(module.beginCaptureAttempt(module.createCaptureAttemptLedger(), command({ captureBalls: 1 }, {
    attemptId: 'bad-reference', referenceLevel: 0,
  })).reason, 'invalid_state');
  assert.equal(module.beginCaptureAttempt(module.createCaptureAttemptLedger(), command({ captureBalls: 1 }, {
    attemptId: 'bad-monster', targetMonsterId: 'MON_999',
  })).reason, 'invalid_state');
  assert.equal(module.beginCaptureAttempt(module.createCaptureAttemptLedger(), command({ captureBalls: 1 }, {
    attemptId: 'active-monster', ownedMonsterActive: true,
  })).reason, 'active_monster_must_recall');
  assert.equal(module.beginCaptureAttempt(module.createCaptureAttemptLedger(), command({ captureBalls: 0 }, {
    attemptId: 'no-ball',
  })).reason, 'no_capture_ball');
  assert.equal(module.beginCaptureAttempt(module.createCaptureAttemptLedger(), command({ captureBalls: 1.5 }, {
    attemptId: 'fraction-ball',
  })).reason, 'invalid_state');

  const clearLedger = module.createCaptureAttemptLedger();
  module.beginCaptureAttempt(clearLedger, command({ captureBalls: 1 }));
  assert.equal(module.clearCaptureAttemptLedger(clearLedger).clearedAttempts, 1);
  assert.equal(module.captureAttemptLedgerSize(clearLedger), 0);
}

contract(await loadSource(original, 'capture-transaction-current'));

const mutants = [
  ['accept inherited ball class', "typeof ballClass === 'string' && Object.hasOwn(CAPTURE_BALL_RULES, ballClass)", "typeof ballClass === 'string'"],
  ['allow invalid target reference', ': Number.isInteger(referenceLevel) && referenceLevel >= 1;', ': true;'],
  ['allow unknown target monster', "|| (targetId === null ? targetMonsterId !== null : !captureMonsterProfile(targetMonsterId))", '|| false'],
  ['bypass recall gate', 'if (ownedMonsterActive) {', 'if (false && ownedMonsterActive) {'],
  ['accept inherited inventory quantity', "|| !Object.hasOwn(inventory, 'captureBalls')", '|| false'],
  ['accept fractional inventory quantity', '!Number.isInteger(inventory.captureBalls) || inventory.captureBalls < 0', 'inventory.captureBalls < 0'],
  ['bypass empty inventory gate', 'if (inventory.captureBalls <= 0) {', 'if (false && inventory.captureBalls <= 0) {'],
  ['skip ball consumption', 'inventory.captureBalls = ballQuantityBefore - 1;', 'inventory.captureBalls = ballQuantityBefore;'],
  ['double ball consumption', 'inventory.captureBalls = ballQuantityBefore - 1;', 'inventory.captureBalls = ballQuantityBefore - 2;'],
  ['acknowledge conflicting attempt ID', 'if (!sameBeginCommand(existing, command)) {', 'if (false && !sameBeginCommand(existing, command)) {'],
  ['skip bounded capacity', 'if (!makeRoom(state)) {', 'if (false && !makeRoom(state)) {'],
  ['send post-consumption quantity', 'ballQuantity: record.ballQuantityBefore,', 'ballQuantity: calculatorInput.ballQuantity,'],
  ['trust caller reference level', 'referenceLevel: record.referenceLevel,', 'referenceLevel: calculatorInput.referenceLevel,'],
  ['trust caller ball class', 'ballClass: record.ballClass,', 'ballClass: calculatorInput.ballClass,'],
  ['enter formula on projectile miss', 'if (!projectileHit) {', 'if (false && !projectileHit) {'],
  ['allow hit without bound identity', 'if (record.targetId === null\n    || !Object.hasOwn(calculatorInput, \'targetId\')\n    || calculatorInput.targetId !== record.targetId\n    || calculatorInput.monsterId !== record.targetMonsterId) {', 'if (false) {'],
  ['roll uncapturable target', 'if (!calculator.shouldRoll) {', 'if (false && !calculator.shouldRoll) {'],
  ['include equal threshold', 'roll * 100 < calculator.finalChancePct', 'roll * 100 <= calculator.finalChancePct'],
  ['accept upper RNG boundary', 'roll < 0 || roll >= 1', 'roll < 0 || roll > 1'],
  ['leave attempt thrown after resolution', "record.phase = 'resolved';\n  return transactionResult(true, null, { replay: false, rollPerformed: true", "record.phase = 'thrown';\n  return transactionResult(true, null, { replay: false, rollPerformed: true"],
  ['replay committed callback', "if (record.phase === 'committed') {", "if (false && record.phase === 'committed') {"],
  ['retry failed commit', "if (record.phase === 'commit_failed') {", "if (false && record.phase === 'commit_failed') {"],
  ['drop reentrant commit guard', "if (record.phase === 'committing') {", "if (false && record.phase === 'committing') {"],
  ['commit without selected callback', "if (typeof callback !== 'function') {", "if (false && typeof callback !== 'function') {"],
  ['invert callback selection', 'record.resolution.captureSucceeded ? onSuccess : onFailure', 'record.resolution.captureSucceeded ? onFailure : onSuccess'],
  ['do not enter guarded phase', "record.phase = 'committing';", "record.phase = 'resolved';"],
  ['retry callback after exception', "record.phase = 'commit_failed';", "record.phase = 'resolved';"],
  ['refund cancelled ball', "record.phase = 'cancelled';", "record.phase = 'cancelled';\n  record.ballQuantityBefore += 1;"],
  ['skip ledger teardown', 'state.attempts.clear();', 'void state.attempts;'],
];

for (const [name, before, after] of mutants) {
  const source = original.replace(before, after);
  assert.notEqual(source, original, `${name} mutation target drifted`);
  let killed = false;
  try {
    contract(await loadSource(source, `capture-transaction-mutant-${name.replaceAll(' ', '-')}`));
  } catch {
    killed = true;
  }
  assert.equal(killed, true, `${name} must be killed`);
}

console.log(`V8.1 A27 capture transaction mutants: PASS (${mutants.length}/${mutants.length} killed)`);
