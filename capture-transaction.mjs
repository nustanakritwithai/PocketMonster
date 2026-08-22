import {
  CAPTURE_BALL_RULES,
  CAPTURE_FORMULA_VERSION,
  captureMonsterProfile,
  resolveWorkbookCapture,
} from './balance-capture.mjs';
import { WORKBOOK_CAPTURE_ADAPTER } from './balance-config.mjs';

export const CAPTURE_TRANSACTION_VERSION = 'CAP_TX_v1.0';
export const DEFAULT_CAPTURE_ATTEMPT_LEDGER_LIMIT = 64;

const LEDGER_STATE = new WeakMap();
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const TERMINAL_PHASES = new Set(['committed', 'commit_failed', 'cancelled']);

function transactionResult(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function ledgerState(ledger) {
  return ledger && typeof ledger === 'object' ? LEDGER_STATE.get(ledger) ?? null : null;
}

function validAttemptId(value) {
  return typeof value === 'string' && ATTEMPT_ID_PATTERN.test(value);
}

function validTargetId(value) {
  return value === null || (typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 128);
}

function captureProfileSnapshot(monsterId) {
  const profile = captureMonsterProfile(monsterId);
  return profile
    ? Object.freeze({
      monsterId: profile.monsterId,
      stage: profile.stage,
      baseBond: profile.baseBond,
      formulaVersion: profile.formulaVersion,
    })
    : null;
}

function resolutionSnapshot(calculator, { roll = null, rollPerformed = false, captureSucceeded = false } = {}) {
  return Object.freeze({
    ok: calculator.ok,
    reason: calculator.reason,
    shouldRoll: calculator.shouldRoll,
    formulaVersion: calculator.formulaVersion,
    rawChancePct: calculator.rawChancePct,
    finalChancePct: calculator.finalChancePct,
    factors: calculator.factors ?? null,
    strongestStatusId: calculator.strongestStatusId ?? null,
    rollAuthority: calculator.rollAuthority,
    roll,
    rollPerformed,
    captureSucceeded,
    captureProfile: captureProfileSnapshot(calculator.monsterId),
  });
}

function projectileMissResolution() {
  return Object.freeze({
    ok: false,
    reason: 'projectile_miss',
    shouldRoll: false,
    formulaVersion: CAPTURE_FORMULA_VERSION,
    rawChancePct: 0,
    finalChancePct: 0,
    factors: null,
    strongestStatusId: null,
    rollAuthority: WORKBOOK_CAPTURE_ADAPTER.rollAuthority,
    roll: null,
    rollPerformed: false,
    captureSucceeded: false,
    captureProfile: null,
  });
}

function attemptSnapshot(record) {
  if (!record) return null;
  return Object.freeze({
    attemptId: record.attemptId,
    targetId: record.targetId,
    targetMonsterId: record.targetMonsterId,
    ballClass: record.ballClass,
    ballTargetType: record.ballTargetType,
    ballQuantityBefore: record.ballQuantityBefore,
    referenceLevel: record.referenceLevel,
    ownedMonsterActive: record.ownedMonsterActive,
    phase: record.phase,
    resolution: record.resolution,
    commitOutcome: record.commitOutcome,
    commitSummary: record.commitSummary,
    callbackInvocations: record.callbackInvocations,
  });
}

function sameBeginCommand(record, command) {
  return record.targetId === command.targetId
    && record.targetMonsterId === command.targetMonsterId
    && record.ballClass === command.ballClass
    && record.ballTargetType === command.ballTargetType
    && record.referenceLevel === command.referenceLevel
    && record.ownedMonsterActive === command.ownedMonsterActive;
}

function makeRoom(state) {
  while (state.attempts.size >= state.maxEntries) {
    const terminal = [...state.attempts.values()].find(record => TERMINAL_PHASES.has(record.phase));
    if (!terminal) return false;
    state.attempts.delete(terminal.attemptId);
  }
  return true;
}

function commitSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.freeze({
    ownedMonsterId: typeof value.ownedMonsterId === 'string' ? value.ownedMonsterId : null,
    destination: typeof value.destination === 'string' ? value.destination : null,
    playerExp: Number.isFinite(value.playerExp) ? value.playerExp : null,
  });
}

export function createCaptureAttemptLedger({ maxEntries = DEFAULT_CAPTURE_ATTEMPT_LEDGER_LIMIT } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1024) {
    throw new RangeError('capture attempt ledger limit must be an integer from 1 to 1024');
  }
  const ledger = Object.freeze({ transactionVersion: CAPTURE_TRANSACTION_VERSION });
  LEDGER_STATE.set(ledger, { attempts: new Map(), maxEntries });
  return ledger;
}

export function captureAttemptSnapshot(ledger, attemptId) {
  const state = ledgerState(ledger);
  if (!state || !validAttemptId(attemptId)) return null;
  return attemptSnapshot(state.attempts.get(attemptId));
}

export function captureAttemptLedgerSize(ledger) {
  return ledgerState(ledger)?.attempts.size ?? null;
}

export function clearCaptureAttemptLedger(ledger) {
  const state = ledgerState(ledger);
  if (!state) return transactionResult(false, 'invalid_state', { clearedAttempts: 0 });
  const clearedAttempts = state.attempts.size;
  state.attempts.clear();
  return transactionResult(true, null, { clearedAttempts });
}

export function beginCaptureAttempt(ledger, {
  attemptId,
  inventory,
  targetId = null,
  targetMonsterId = null,
  ballClass = 'Basic',
  ballTargetType = null,
  referenceLevel,
  ownedMonsterActive,
} = {}) {
  const state = ledgerState(ledger);
  if (!state || !validAttemptId(attemptId)) {
    return transactionResult(false, 'invalid_state', { replay: false, ballConsumed: false, attempt: null });
  }

  const command = { targetId, targetMonsterId, ballClass, ballTargetType, referenceLevel, ownedMonsterActive };
  const existing = state.attempts.get(attemptId);
  if (existing) {
    if (!sameBeginCommand(existing, command)) {
      return transactionResult(false, 'attempt_id_conflict', {
        replay: false,
        ballConsumed: false,
        attempt: attemptSnapshot(existing),
      });
    }
    return transactionResult(true, null, {
      replay: true,
      ballConsumed: false,
      attempt: attemptSnapshot(existing),
    });
  }

  const validBallClass = typeof ballClass === 'string' && Object.hasOwn(CAPTURE_BALL_RULES, ballClass);
  const validBallTargetType = ballTargetType === null
    || (typeof ballTargetType === 'string' && ballTargetType.trim() === ballTargetType && ballTargetType.length > 0);
  const validReferenceLevel = targetId === null
    ? referenceLevel === null || referenceLevel === undefined || (Number.isInteger(referenceLevel) && referenceLevel >= 1)
    : Number.isInteger(referenceLevel) && referenceLevel >= 1;
  if (!validTargetId(targetId)
    || (targetId === null ? targetMonsterId !== null : !captureMonsterProfile(targetMonsterId))
    || !validBallClass
    || !validBallTargetType
    || !validReferenceLevel
    || typeof ownedMonsterActive !== 'boolean'
    || !inventory || typeof inventory !== 'object' || Array.isArray(inventory)
    || !Object.hasOwn(inventory, 'captureBalls')
    || !Number.isInteger(inventory.captureBalls) || inventory.captureBalls < 0) {
    return transactionResult(false, 'invalid_state', { replay: false, ballConsumed: false, attempt: null });
  }
  if (ownedMonsterActive) {
    return transactionResult(false, 'active_monster_must_recall', { replay: false, ballConsumed: false, attempt: null });
  }
  if (inventory.captureBalls <= 0) {
    return transactionResult(false, 'no_capture_ball', { replay: false, ballConsumed: false, attempt: null });
  }
  if (!makeRoom(state)) {
    return transactionResult(false, 'ledger_capacity', { replay: false, ballConsumed: false, attempt: null });
  }

  const ballQuantityBefore = inventory.captureBalls;
  inventory.captureBalls = ballQuantityBefore - 1;
  const record = {
    ...command,
    attemptId,
    ballQuantityBefore,
    phase: 'thrown',
    resolution: null,
    commitOutcome: null,
    commitSummary: null,
    callbackInvocations: 0,
  };
  state.attempts.set(attemptId, record);
  return transactionResult(true, null, {
    replay: false,
    ballConsumed: true,
    attempt: attemptSnapshot(record),
  });
}

export function resolveCaptureAttempt(ledger, {
  attemptId,
  projectileHit,
  calculatorInput = null,
  rng,
} = {}) {
  const state = ledgerState(ledger);
  const record = state && validAttemptId(attemptId) ? state.attempts.get(attemptId) : null;
  if (!record) return transactionResult(false, 'unknown_attempt', { replay: false, rollPerformed: false, attempt: null });
  if (record.phase === 'cancelled') {
    return transactionResult(false, 'attempt_cancelled', { replay: true, rollPerformed: false, attempt: attemptSnapshot(record) });
  }
  if (record.phase !== 'thrown') {
    return transactionResult(true, null, { replay: true, rollPerformed: false, attempt: attemptSnapshot(record) });
  }
  if (typeof projectileHit !== 'boolean') {
    return transactionResult(false, 'invalid_state', { replay: false, rollPerformed: false, attempt: attemptSnapshot(record) });
  }

  if (!projectileHit) {
    record.resolution = projectileMissResolution();
    record.phase = 'resolved';
    return transactionResult(true, null, { replay: false, rollPerformed: false, attempt: attemptSnapshot(record) });
  }
  if (!calculatorInput || typeof calculatorInput !== 'object' || Array.isArray(calculatorInput)) {
    return transactionResult(false, 'invalid_state', { replay: false, rollPerformed: false, attempt: attemptSnapshot(record) });
  }
  if (record.targetId === null
    || !Object.hasOwn(calculatorInput, 'targetId')
    || calculatorInput.targetId !== record.targetId
    || calculatorInput.monsterId !== record.targetMonsterId) {
    return transactionResult(false, 'target_mismatch', { replay: false, rollPerformed: false, attempt: attemptSnapshot(record) });
  }

  const calculator = resolveWorkbookCapture({
    ...calculatorInput,
    ballClass: record.ballClass,
    ballTargetType: record.ballTargetType,
    referenceLevel: record.referenceLevel,
    ownedMonsterActive: record.ownedMonsterActive,
    ballQuantity: record.ballQuantityBefore,
    projectileHit: true,
  });
  const calculatorWithIdentity = Object.freeze({ ...calculator, monsterId: calculatorInput.monsterId });
  if (!calculator.shouldRoll) {
    record.resolution = resolutionSnapshot(calculatorWithIdentity);
    record.phase = 'resolved';
    return transactionResult(true, null, { replay: false, rollPerformed: false, attempt: attemptSnapshot(record) });
  }
  if (typeof rng !== 'function') {
    return transactionResult(false, 'invalid_state', { replay: false, rollPerformed: false, attempt: attemptSnapshot(record) });
  }

  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    record.resolution = resolutionSnapshot({
      ...calculatorWithIdentity,
      ok: false,
      reason: 'invalid_roll',
      shouldRoll: false,
    }, { roll: null, rollPerformed: true, captureSucceeded: false });
    record.phase = 'resolved';
    return transactionResult(true, null, { replay: false, rollPerformed: true, attempt: attemptSnapshot(record) });
  }

  const captureSucceeded = roll * 100 < calculator.finalChancePct;
  record.resolution = resolutionSnapshot(calculatorWithIdentity, {
    roll,
    rollPerformed: true,
    captureSucceeded,
  });
  record.phase = 'resolved';
  return transactionResult(true, null, { replay: false, rollPerformed: true, attempt: attemptSnapshot(record) });
}

export function commitCaptureAttempt(ledger, {
  attemptId,
  onSuccess,
  onFailure,
} = {}) {
  const state = ledgerState(ledger);
  const record = state && validAttemptId(attemptId) ? state.attempts.get(attemptId) : null;
  if (!record) return transactionResult(false, 'unknown_attempt', { replay: false, sideEffectApplied: false, attempt: null });
  if (record.phase === 'committed') {
    return transactionResult(true, null, { replay: true, sideEffectApplied: false, attempt: attemptSnapshot(record) });
  }
  if (record.phase === 'commit_failed') {
    return transactionResult(false, 'commit_failed', { replay: true, sideEffectApplied: false, attempt: attemptSnapshot(record) });
  }
  if (record.phase === 'cancelled') {
    return transactionResult(false, 'attempt_cancelled', { replay: true, sideEffectApplied: false, attempt: attemptSnapshot(record) });
  }
  if (record.phase === 'committing') {
    return transactionResult(false, 'attempt_in_progress', { replay: true, sideEffectApplied: false, attempt: attemptSnapshot(record) });
  }
  if (record.phase !== 'resolved' || !record.resolution) {
    return transactionResult(false, 'attempt_not_resolved', { replay: false, sideEffectApplied: false, attempt: attemptSnapshot(record) });
  }

  const callback = record.resolution.captureSucceeded ? onSuccess : onFailure;
  if (typeof callback !== 'function') {
    return transactionResult(false, 'invalid_state', { replay: false, sideEffectApplied: false, attempt: attemptSnapshot(record) });
  }
  record.phase = 'committing';
  record.callbackInvocations += 1;
  try {
    const value = callback(attemptSnapshot(record));
    record.commitOutcome = record.resolution.captureSucceeded ? 'success' : 'failure';
    record.commitSummary = commitSummary(value);
    record.phase = 'committed';
    return transactionResult(true, null, { replay: false, sideEffectApplied: true, attempt: attemptSnapshot(record) });
  } catch {
    record.commitOutcome = 'error';
    record.phase = 'commit_failed';
    return transactionResult(false, 'commit_failed', { replay: false, sideEffectApplied: true, attempt: attemptSnapshot(record) });
  }
}

export function cancelCaptureAttempt(ledger, attemptId) {
  const state = ledgerState(ledger);
  const record = state && validAttemptId(attemptId) ? state.attempts.get(attemptId) : null;
  if (!record) return transactionResult(false, 'unknown_attempt', { replay: false, attempt: null });
  if (record.phase === 'cancelled') return transactionResult(true, null, { replay: true, attempt: attemptSnapshot(record) });
  if (record.phase === 'committing') return transactionResult(false, 'attempt_in_progress', { replay: true, attempt: attemptSnapshot(record) });
  if (record.phase === 'committed' || record.phase === 'commit_failed') {
    return transactionResult(false, 'attempt_finalized', { replay: true, attempt: attemptSnapshot(record) });
  }
  record.phase = 'cancelled';
  record.commitOutcome = 'cancelled';
  return transactionResult(true, null, { replay: false, attempt: attemptSnapshot(record) });
}
