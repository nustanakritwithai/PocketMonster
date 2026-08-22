import assert from 'node:assert/strict';
import {
  CAPTURE_TRANSACTION_VERSION,
  DEFAULT_CAPTURE_ATTEMPT_LEDGER_LIMIT,
  beginCaptureAttempt,
  cancelCaptureAttempt,
  captureAttemptLedgerSize,
  captureAttemptSnapshot,
  clearCaptureAttemptLedger,
  commitCaptureAttempt,
  createCaptureAttemptLedger,
  resolveCaptureAttempt,
} from '../capture-transaction.mjs';

const CALCULATOR_INPUT = Object.freeze({
  targetId: 'wild-stage2',
  monsterId: 'MON_020',
  currentHp: 10,
  maxHp: 100,
  activeStatusIds: Object.freeze(['ST_PARALYZE']),
  ballClass: 'Ultra',
  ballTargetType: 'FIRE',
  targetSecondaryType: null,
  targetLevel: 20,
  referenceLevel: 999,
  variant: 'Normal',
  ownedMonsterActive: true,
  ballQuantity: 0,
  projectileHit: false,
  targetAlive: true,
});

function begin(ledger, inventory, overrides = {}) {
  return beginCaptureAttempt(ledger, {
    attemptId: 'attempt-1',
    inventory,
    targetId: 'wild-stage2',
    targetMonsterId: 'MON_020',
    ballClass: 'Basic',
    ballTargetType: null,
    referenceLevel: 20,
    ownedMonsterActive: false,
    ...overrides,
  });
}

function resolve(ledger, overrides = {}) {
  return resolveCaptureAttempt(ledger, {
    attemptId: 'attempt-1',
    projectileHit: true,
    calculatorInput: CALCULATOR_INPUT,
    rng: () => 0.73,
    ...overrides,
  });
}

assert.equal(CAPTURE_TRANSACTION_VERSION, 'CAP_TX_v1.0');
assert.equal(DEFAULT_CAPTURE_ATTEMPT_LEDGER_LIMIT, 64);
const ledger = createCaptureAttemptLedger();
assert.equal(Object.isFrozen(ledger), true);
assert.deepEqual(ledger, { transactionVersion: 'CAP_TX_v1.0' });
assert.equal(captureAttemptLedgerSize(ledger), 0);
assert.equal(captureAttemptLedgerSize({}), null);
assert.equal(captureAttemptSnapshot(ledger, 'missing'), null);
assert.throws(() => createCaptureAttemptLedger({ maxEntries: 0 }), RangeError);
assert.throws(() => createCaptureAttemptLedger({ maxEntries: 1.5 }), RangeError);
assert.throws(() => createCaptureAttemptLedger({ maxEntries: 1025 }), RangeError);

const inventory = { captureBalls: 1, untouched: 7 };
const started = begin(ledger, inventory);
assert.equal(started.ok, true, started.reason);
assert.equal(started.replay, false);
assert.equal(started.ballConsumed, true);
assert.equal(inventory.captureBalls, 0, 'begin consumes exactly one ball');
assert.equal(inventory.untouched, 7);
assert.equal(started.attempt.ballQuantityBefore, 1, 'calculator receives pre-consumption quantity');
assert.equal(started.attempt.targetMonsterId, 'MON_020');
assert.equal(started.attempt.phase, 'thrown');
assert.equal(Object.isFrozen(started), true);
assert.equal(Object.isFrozen(started.attempt), true);

const replay = begin(ledger, inventory);
assert.equal(replay.ok, true);
assert.equal(replay.replay, true);
assert.equal(replay.ballConsumed, false);
assert.equal(inventory.captureBalls, 0, 'exact replay never consumes again');
const conflict = begin(ledger, inventory, { targetId: 'different-wild' });
assert.equal(conflict.ok, false);
assert.equal(conflict.reason, 'attempt_id_conflict');
assert.equal(inventory.captureBalls, 0);

let rolls = 0;
const resolved = resolve(ledger, { rng: () => { rolls += 1; return 0.73; } });
assert.equal(resolved.ok, true, resolved.reason);
assert.equal(resolved.replay, false);
assert.equal(resolved.rollPerformed, true);
assert.equal(rolls, 1);
assert.equal(resolved.attempt.phase, 'resolved');
assert.equal(resolved.attempt.resolution.formulaVersion, 'CAP_v1.0');
assert.equal(resolved.attempt.resolution.finalChancePct, 74, 'transaction binds Basic Ball, reference 20, and quantity-before snapshot');
assert.equal(resolved.attempt.resolution.roll, 0.73);
assert.equal(resolved.attempt.resolution.captureSucceeded, true);
assert.deepEqual(resolved.attempt.resolution.captureProfile, {
  monsterId: 'MON_020',
  stage: 2,
  baseBond: 20,
  formulaVersion: 'CAP_v1.0',
});
assert.equal(Object.isFrozen(resolved.attempt.resolution), true);
assert.equal(Object.isFrozen(resolved.attempt.resolution.captureProfile), true);

const resolvedReplay = resolve(ledger, { rng: () => { rolls += 1; return 0; } });
assert.equal(resolvedReplay.ok, true);
assert.equal(resolvedReplay.replay, true);
assert.equal(resolvedReplay.rollPerformed, false);
assert.equal(rolls, 1, 'duplicate projectile callback never rerolls');
assert.equal(resolvedReplay.attempt.resolution.roll, 0.73);

let factoryCalls = 0;
let rewardCalls = 0;
let progressionCalls = 0;
let failureCalls = 0;
const committed = commitCaptureAttempt(ledger, {
  attemptId: 'attempt-1',
  onSuccess: attempt => {
    factoryCalls += 1;
    rewardCalls += 1;
    progressionCalls += 1;
    assert.equal(attempt.phase, 'committing', 'reentrant callbacks see the guarded phase');
    assert.equal(attempt.resolution.captureProfile.baseBond, 20);
    return { ownedMonsterId: 'owned-1', destination: 'party', playerExp: 12 };
  },
  onFailure: () => { failureCalls += 1; },
});
assert.equal(committed.ok, true, committed.reason);
assert.equal(committed.replay, false);
assert.equal(committed.sideEffectApplied, true);
assert.equal(committed.attempt.phase, 'committed');
assert.equal(committed.attempt.commitOutcome, 'success');
assert.deepEqual(committed.attempt.commitSummary, {
  ownedMonsterId: 'owned-1',
  destination: 'party',
  playerExp: 12,
});
assert.equal(factoryCalls, 1);
assert.equal(rewardCalls, 1);
assert.equal(progressionCalls, 1);
assert.equal(failureCalls, 0);

const commitReplay = commitCaptureAttempt(ledger, {
  attemptId: 'attempt-1',
  onSuccess: () => { factoryCalls += 1; },
  onFailure: () => { failureCalls += 1; },
});
assert.equal(commitReplay.ok, true);
assert.equal(commitReplay.replay, true);
assert.equal(commitReplay.sideEffectApplied, false);
assert.equal(factoryCalls, 1, 'duplicate completion cannot duplicate the owned instance');
assert.equal(rewardCalls, 1, 'duplicate completion cannot duplicate rewards');
assert.equal(progressionCalls, 1, 'duplicate completion cannot duplicate progression');

const missLedger = createCaptureAttemptLedger();
const missInventory = { captureBalls: 2 };
const missBegin = begin(missLedger, missInventory, {
  attemptId: 'miss-1',
  targetId: null,
  targetMonsterId: null,
  referenceLevel: null,
});
assert.equal(missBegin.ok, true, missBegin.reason);
assert.equal(missInventory.captureBalls, 1);
const poisonInput = new Proxy({}, { get: () => { throw new Error('formula must not be read on miss'); } });
const miss = resolveCaptureAttempt(missLedger, {
  attemptId: 'miss-1',
  projectileHit: false,
  calculatorInput: poisonInput,
  rng: () => { throw new Error('RNG must not run on miss'); },
});
assert.equal(miss.ok, true, miss.reason);
assert.equal(miss.rollPerformed, false);
assert.equal(miss.attempt.resolution.reason, 'projectile_miss');
assert.equal(miss.attempt.resolution.finalChancePct, 0);
let missFailures = 0;
assert.equal(commitCaptureAttempt(missLedger, {
  attemptId: 'miss-1',
  onSuccess: () => assert.fail('miss cannot succeed'),
  onFailure: () => { missFailures += 1; },
}).ok, true);
assert.equal(commitCaptureAttempt(missLedger, {
  attemptId: 'miss-1',
  onSuccess: () => assert.fail('miss cannot succeed'),
  onFailure: () => { missFailures += 1; },
}).replay, true);
assert.equal(missFailures, 1, 'miss failure effects commit once');

const nullTargetHitLedger = createCaptureAttemptLedger();
begin(nullTargetHitLedger, { captureBalls: 1 }, { attemptId: 'null-hit', targetId: null, targetMonsterId: null, referenceLevel: null });
let nullTargetRolls = 0;
const nullTargetHit = resolveCaptureAttempt(nullTargetHitLedger, {
  attemptId: 'null-hit',
  projectileHit: true,
  calculatorInput: { ...CALCULATOR_INPUT, targetId: null },
  rng: () => { nullTargetRolls += 1; return 0; },
});
assert.equal(nullTargetHit.ok, false);
assert.equal(nullTargetHit.reason, 'target_mismatch');
assert.equal(nullTargetRolls, 0);

for (const mismatchedInput of [
  { ...CALCULATOR_INPUT, targetId: 'other-wild' },
  { ...CALCULATOR_INPUT, monsterId: 'MON_002' },
  Object.fromEntries(Object.entries(CALCULATOR_INPUT).filter(([key]) => key !== 'targetId')),
]) {
  const identityLedger = createCaptureAttemptLedger();
  begin(identityLedger, { captureBalls: 1 });
  let identityRolls = 0;
  const identityResult = resolve(identityLedger, {
    calculatorInput: mismatchedInput,
    rng: () => { identityRolls += 1; return 0; },
  });
  assert.equal(identityResult.reason, 'target_mismatch');
  assert.equal(identityRolls, 0);
  assert.equal(identityResult.attempt.phase, 'thrown');
}

const thresholdLedger = createCaptureAttemptLedger();
begin(thresholdLedger, { captureBalls: 1 });
const threshold = resolve(thresholdLedger, { rng: () => 0.74 });
assert.equal(threshold.attempt.resolution.finalChancePct, 74);
assert.equal(threshold.attempt.resolution.captureSucceeded, false, 'chance threshold is strict roll < chance');

const stage1Ledger = createCaptureAttemptLedger();
begin(stage1Ledger, { captureBalls: 1 }, { targetId: 'wild-stage1', targetMonsterId: 'MON_002' });
const stage1 = resolve(stage1Ledger, {
  calculatorInput: { ...CALCULATOR_INPUT, targetId: 'wild-stage1', monsterId: 'MON_002' },
  rng: () => 0,
});
assert.equal(stage1.attempt.resolution.captureProfile.stage, 1);
assert.equal(stage1.attempt.resolution.captureProfile.baseBond, 10);

const bossLedger = createCaptureAttemptLedger();
begin(bossLedger, { captureBalls: 1 });
let bossRolls = 0;
const boss = resolve(bossLedger, {
  calculatorInput: { ...CALCULATOR_INPUT, variant: 'Boss' },
  rng: () => { bossRolls += 1; return 0; },
});
assert.equal(boss.ok, true);
assert.equal(boss.rollPerformed, false);
assert.equal(boss.attempt.resolution.reason, 'capture_disabled');
assert.equal(boss.attempt.resolution.captureSucceeded, false);
assert.equal(bossRolls, 0, 'uncapturable targets never touch RNG');

const eliteLedger = createCaptureAttemptLedger();
begin(eliteLedger, { captureBalls: 1 });
const elite = resolve(eliteLedger, {
  calculatorInput: { ...CALCULATOR_INPUT, variant: 'Elite' },
  rng: () => 0.4,
});
assert.equal(elite.attempt.resolution.finalChancePct, 40.7);
assert.equal(elite.attempt.resolution.captureSucceeded, true);

const invalidRollLedger = createCaptureAttemptLedger();
begin(invalidRollLedger, { captureBalls: 1 });
let invalidRollCalls = 0;
const invalidRoll = resolve(invalidRollLedger, { rng: () => { invalidRollCalls += 1; return 1; } });
assert.equal(invalidRoll.ok, true);
assert.equal(invalidRoll.rollPerformed, true);
assert.equal(invalidRoll.attempt.resolution.reason, 'invalid_roll');
assert.equal(invalidRoll.attempt.resolution.captureSucceeded, false);
assert.equal(resolve(invalidRollLedger, { rng: () => { invalidRollCalls += 1; return 0; } }).replay, true);
assert.equal(invalidRollCalls, 1, 'invalid RNG is terminal and cannot be retried into success');

const cancelLedger = createCaptureAttemptLedger();
const cancelInventory = { captureBalls: 1 };
begin(cancelLedger, cancelInventory);
assert.equal(cancelCaptureAttempt(cancelLedger, 'attempt-1').ok, true);
assert.equal(cancelInventory.captureBalls, 0, 'cancellation does not refund a thrown ball');
assert.equal(cancelCaptureAttempt(cancelLedger, 'attempt-1').replay, true);
assert.equal(resolve(cancelLedger).reason, 'attempt_cancelled');
assert.equal(commitCaptureAttempt(cancelLedger, {
  attemptId: 'attempt-1',
  onSuccess: () => {},
  onFailure: () => {},
}).reason, 'attempt_cancelled');

const reentrantLedger = createCaptureAttemptLedger();
begin(reentrantLedger, { captureBalls: 1 });
resolve(reentrantLedger);
let reentrantCalls = 0;
const reentrantOuter = commitCaptureAttempt(reentrantLedger, {
  attemptId: 'attempt-1',
  onSuccess: () => {
    reentrantCalls += 1;
    const nested = commitCaptureAttempt(reentrantLedger, {
      attemptId: 'attempt-1',
      onSuccess: () => { reentrantCalls += 100; },
      onFailure: () => {},
    });
    assert.equal(nested.reason, 'attempt_in_progress');
  },
  onFailure: () => {},
});
assert.equal(reentrantOuter.ok, true);
assert.equal(reentrantCalls, 1, 'reentrant commit is guarded');

const throwingLedger = createCaptureAttemptLedger();
begin(throwingLedger, { captureBalls: 1 });
resolve(throwingLedger);
let throwingCalls = 0;
const throwingCommit = commitCaptureAttempt(throwingLedger, {
  attemptId: 'attempt-1',
  onSuccess: () => { throwingCalls += 1; throw new Error('side effect failed'); },
  onFailure: () => {},
});
assert.equal(throwingCommit.ok, false);
assert.equal(throwingCommit.reason, 'commit_failed');
assert.equal(throwingCommit.sideEffectApplied, true);
assert.equal(throwingCommit.attempt.phase, 'commit_failed');
assert.equal(commitCaptureAttempt(throwingLedger, {
  attemptId: 'attempt-1',
  onSuccess: () => { throwingCalls += 1; },
  onFailure: () => {},
}).reason, 'commit_failed');
assert.equal(throwingCalls, 1, 'failed commit is terminal and never retries unknown partial effects');

const callbackLedger = createCaptureAttemptLedger();
begin(callbackLedger, { captureBalls: 1 });
resolve(callbackLedger);
assert.equal(commitCaptureAttempt(callbackLedger, { attemptId: 'attempt-1' }).reason, 'invalid_state');
assert.equal(captureAttemptSnapshot(callbackLedger, 'attempt-1').phase, 'resolved');

const capacityLedger = createCaptureAttemptLedger({ maxEntries: 1 });
begin(capacityLedger, { captureBalls: 2 }, { attemptId: 'active-1' });
const blockedInventory = { captureBalls: 2 };
const capacityBlocked = begin(capacityLedger, blockedInventory, { attemptId: 'active-2' });
assert.equal(capacityBlocked.reason, 'ledger_capacity');
assert.equal(blockedInventory.captureBalls, 2, 'capacity rejection happens before consumption');
resolveCaptureAttempt(capacityLedger, { attemptId: 'active-1', projectileHit: false });
commitCaptureAttempt(capacityLedger, { attemptId: 'active-1', onSuccess: () => {}, onFailure: () => {} });
assert.equal(begin(capacityLedger, blockedInventory, { attemptId: 'active-2' }).ok, true, 'terminal records are pruned to make bounded room');
assert.equal(captureAttemptSnapshot(capacityLedger, 'active-1'), null);
assert.equal(captureAttemptLedgerSize(capacityLedger), 1);

const clearLedger = createCaptureAttemptLedger();
begin(clearLedger, { captureBalls: 1 });
assert.deepEqual(clearCaptureAttemptLedger(clearLedger), { ok: true, reason: null, clearedAttempts: 1 });
assert.equal(captureAttemptLedgerSize(clearLedger), 0);
assert.deepEqual(clearCaptureAttemptLedger(clearLedger), { ok: true, reason: null, clearedAttempts: 0 });

const forgedLedger = Object.freeze({ transactionVersion: CAPTURE_TRANSACTION_VERSION });
assert.equal(begin(forgedLedger, { captureBalls: 1 }).reason, 'invalid_state');
assert.equal(resolve(forgedLedger).reason, 'unknown_attempt');
assert.equal(commitCaptureAttempt(forgedLedger, { attemptId: 'attempt-1', onSuccess: () => {}, onFailure: () => {} }).reason, 'unknown_attempt');
assert.equal(cancelCaptureAttempt(forgedLedger, 'attempt-1').reason, 'unknown_attempt');
assert.deepEqual(clearCaptureAttemptLedger(forgedLedger), { ok: false, reason: 'invalid_state', clearedAttempts: 0 });

for (const invalid of [
  { attemptId: '', inventory: { captureBalls: 1 } },
  { attemptId: '__proto__.bad!', inventory: { captureBalls: 1 } },
  { attemptId: 'bad-target', inventory: { captureBalls: 1 }, targetId: ' spaced ' },
  { attemptId: 'bad-monster', inventory: { captureBalls: 1 }, targetMonsterId: 'MON_999' },
  { attemptId: 'bad-reference', inventory: { captureBalls: 1 }, referenceLevel: 0 },
  { attemptId: 'bad-recall', inventory: { captureBalls: 1 }, ownedMonsterActive: true },
  { attemptId: 'bad-empty', inventory: { captureBalls: 0 } },
  { attemptId: 'bad-negative', inventory: { captureBalls: -1 } },
  { attemptId: 'bad-fraction', inventory: { captureBalls: 1.5 } },
  { attemptId: 'bad-inventory', inventory: [] },
  { attemptId: 'bad-ball', inventory: { captureBalls: 1 }, ballClass: 'constructor' },
]) {
  const invalidLedger = createCaptureAttemptLedger();
  const before = invalid.inventory?.captureBalls;
  const result = begin(invalidLedger, invalid.inventory, invalid);
  assert.equal(result.ok, false, invalid.attemptId);
  assert.equal(result.ballConsumed, false, invalid.attemptId);
  assert.equal(invalid.inventory?.captureBalls, before, `${invalid.attemptId} does not mutate inventory`);
  assert.equal(captureAttemptLedgerSize(invalidLedger), 0);
}

const inheritedInventory = Object.create({ captureBalls: 2 });
const inheritedResult = begin(createCaptureAttemptLedger(), inheritedInventory, { attemptId: 'inherited-inventory' });
assert.equal(inheritedResult.reason, 'invalid_state');
assert.equal(Object.hasOwn(inheritedInventory, 'captureBalls'), false);

console.log('V8.1 A27 capture transaction: PASS');
