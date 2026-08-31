import { STATUS_CATALOG, statusCatalogEntry } from './status-catalog.mjs';
import { resolveStatusApplication } from './status-resolver.mjs';
import {
  HARD_CC_DR_POLICY,
  applyEncounterStatus,
  advanceEncounterEffects,
  endEncounterEffects,
  isEncounterStatusState,
} from './status-lifecycle.mjs';
import {
  combatStatusDescriptors,
  resolveCombatStatusRuntime,
} from './combat-status-runtime.mjs';
import { resolveActiveSelfStatusModifiers } from './skill-effect-runtime.mjs';
import {
  COMBAT_OWNER_DOMAINS,
  fingerprintCombatValue,
} from './combat-v91-contract.mjs';

export const COMBAT_V91_STATUS_VERSION = 'combat-v91-status/v1';
export const COMBAT_V91_STATUS_SNAPSHOT_SCHEMA = 'combat-status-snapshot/v9.1';
export const COMBAT_V91_COMBAT_CLOCK_SNAPSHOT_SCHEMA = 'combat-clock-snapshot/v9.1';
export const COMBAT_V91_STATUS_TICK_PLAN_SCHEMA = 'combat-status-tick-plan/v9.1';
export const COMBAT_V91_STATUS_AUTHORITY = Object.freeze({
  clientMode: 'prediction_only',
  authoritativeWriter: 'server_or_target_owner',
  tickClock: 'server_combat_clock_snapshot',
  tickPlanner: 'pure_snapshot_transition',
  psychologicalFearOwner: 'World',
  combatFearId: 'ST_FEAR',
});

export const COMBAT_V91_STATUS_IDS = Object.freeze(STATUS_CATALOG.map(status => status.id));

const STATUS_SNAPSHOT_KEYS = Object.freeze([
  'schemaVersion', 'authority', 'combatId', 'entityId', 'ownerDomain',
  'statusStateVersion', 'state', 'fingerprint',
]);
const COMBAT_CLOCK_SNAPSHOT_KEYS = Object.freeze([
  'schemaVersion', 'authority', 'combatId', 'clockTick', 'combatTimeSec',
  'clockStateVersion', 'ended', 'fingerprint',
]);
const STATUS_STATE_KEYS = Object.freeze([
  'encounterId', 'currentTimeSec', 'ended', 'statuses', 'controlDr',
]);
const RUNTIME_STATUS_KEYS = Object.freeze([
  'statusId', 'sourceSkillId', 'sourceLinkId', 'sourceInstanceId', 'stacks',
  'appliedAtSec', 'expiresAtSec', 'nextTickAtSec', 'stackRule', 'category',
]);
const CONTROL_DR_KEYS = Object.freeze([
  'windowStartedAtSec', 'lastAppliedAtSec', 'count', 'history',
]);
const CONTROL_DR_HISTORY_KEYS = Object.freeze(['statusId', 'atSec']);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function canonicalStatusState(input) {
  if (!exactKeys(input, STATUS_STATE_KEYS)
    || !Array.isArray(input.statuses)
    || input.statuses.some(status => !exactKeys(status, RUNTIME_STATUS_KEYS))
    || !exactKeys(input.controlDr, CONTROL_DR_KEYS)
    || !Array.isArray(input.controlDr.history)
    || input.controlDr.history.some(entry => !exactKeys(entry, CONTROL_DR_HISTORY_KEYS))
    || !isEncounterStatusState(input)) return null;
  return {
    encounterId: input.encounterId,
    currentTimeSec: input.currentTimeSec,
    ended: input.ended,
    statuses: input.statuses.map(status => ({
      statusId: status.statusId,
      sourceSkillId: status.sourceSkillId,
      sourceLinkId: status.sourceLinkId,
      sourceInstanceId: status.sourceInstanceId,
      stacks: status.stacks,
      appliedAtSec: status.appliedAtSec,
      expiresAtSec: status.expiresAtSec,
      nextTickAtSec: status.nextTickAtSec,
      stackRule: status.stackRule,
      category: status.category,
    })),
    controlDr: {
      windowStartedAtSec: input.controlDr.windowStartedAtSec,
      lastAppliedAtSec: input.controlDr.lastAppliedAtSec,
      count: input.controlDr.count,
      history: input.controlDr.history.map(entry => ({
        statusId: entry.statusId,
        atSec: entry.atSec,
      })),
    },
  };
}

export function createCombatStatusSnapshot(input = {}) {
  if (!isRecord(input)
    || Object.keys(input).some(key => !STATUS_SNAPSHOT_KEYS.includes(key))
    || (input.schemaVersion !== undefined && input.schemaVersion !== COMBAT_V91_STATUS_SNAPSHOT_SCHEMA)
    || input.authority !== 'server'
    || typeof input.combatId !== 'string' || !input.combatId
    || typeof input.entityId !== 'string' || !input.entityId
    || !COMBAT_OWNER_DOMAINS.includes(input.ownerDomain)
    || !Number.isInteger(input.statusStateVersion) || input.statusStateVersion < 0) {
    return result(false, 'invalid_status_snapshot');
  }
  const state = canonicalStatusState(input.state);
  if (!state || state.encounterId !== input.combatId) return result(false, 'invalid_status_snapshot');
  const payload = {
    schemaVersion: COMBAT_V91_STATUS_SNAPSHOT_SCHEMA,
    authority: 'server',
    combatId: input.combatId,
    entityId: input.entityId,
    ownerDomain: input.ownerDomain,
    statusStateVersion: input.statusStateVersion,
    state,
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'status_snapshot_fingerprint_mismatch');
  }
  return result(true, null, { snapshot: deepFreeze({ ...payload, fingerprint }) });
}

export function validateCombatStatusSnapshot(snapshot, expected = {}) {
  if (!exactKeys(snapshot, STATUS_SNAPSHOT_KEYS)) return result(false, 'invalid_status_snapshot_shape');
  const created = createCombatStatusSnapshot(snapshot);
  if (!created.ok) return created;
  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && created.snapshot[field] !== value) {
      return result(false, 'status_snapshot_mismatch', { field });
    }
  }
  return result(true, null, { snapshot: created.snapshot });
}

export function createCombatClockSnapshot(input = {}) {
  if (!isRecord(input)
    || Object.keys(input).some(key => !COMBAT_CLOCK_SNAPSHOT_KEYS.includes(key))
    || (input.schemaVersion !== undefined
      && input.schemaVersion !== COMBAT_V91_COMBAT_CLOCK_SNAPSHOT_SCHEMA)
    || input.authority !== 'server'
    || typeof input.combatId !== 'string' || !input.combatId
    || !Number.isInteger(input.clockTick) || input.clockTick < 0
    || !Number.isFinite(input.combatTimeSec) || input.combatTimeSec < 0
    || !Number.isInteger(input.clockStateVersion) || input.clockStateVersion < 0
    || typeof input.ended !== 'boolean') {
    return result(false, 'invalid_combat_clock_snapshot');
  }
  const payload = {
    schemaVersion: COMBAT_V91_COMBAT_CLOCK_SNAPSHOT_SCHEMA,
    authority: 'server',
    combatId: input.combatId,
    clockTick: input.clockTick,
    combatTimeSec: input.combatTimeSec,
    clockStateVersion: input.clockStateVersion,
    ended: input.ended,
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'combat_clock_snapshot_fingerprint_mismatch');
  }
  return result(true, null, { snapshot: deepFreeze({ ...payload, fingerprint }) });
}

export function validateCombatClockSnapshot(snapshot, expected = {}) {
  if (!exactKeys(snapshot, COMBAT_CLOCK_SNAPSHOT_KEYS)) {
    return result(false, 'invalid_combat_clock_snapshot_shape');
  }
  const created = createCombatClockSnapshot(snapshot);
  if (!created.ok) return created;
  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && created.snapshot[field] !== value) {
      return result(false, 'combat_clock_snapshot_mismatch', { field });
    }
  }
  return result(true, null, { snapshot: created.snapshot });
}

export function combatStatusStackCount(statusState, statusId, { nowSec = statusState?.currentTimeSec } = {}) {
  if (!isEncounterStatusState(statusState) || !statusCatalogEntry(statusId)
    || !Number.isFinite(nowSec) || nowSec < statusState.currentTimeSec) return null;
  return statusState.statuses.find(status => status.statusId === statusId
    && status.appliedAtSec <= nowSec && status.expiresAtSec > nowSec)?.stacks ?? 0;
}

export function createCombatStatusProjection(statusState, {
  nowSec = statusState?.currentTimeSec,
  incomingType = null,
} = {}) {
  if (!isEncounterStatusState(statusState) || statusState.ended) return result(false, 'invalid_status_state');
  const control = resolveCombatStatusRuntime(statusState, { nowSec });
  if (!control.ok) return result(false, control.reason);
  const modifiers = resolveActiveSelfStatusModifiers(statusState, { nowSec, incomingType });
  if (!modifiers.ok) return result(false, modifiers.reason);
  const descriptors = combatStatusDescriptors(statusState, { nowSec });
  return result(true, null, {
    projection: deepFreeze({
      version: COMBAT_V91_STATUS_VERSION,
      authority: COMBAT_V91_STATUS_AUTHORITY.clientMode,
      encounterId: statusState.encounterId,
      atSec: nowSec,
      activeStatusIds: [...control.activeStatusIds],
      descriptors: descriptors.map(descriptor => ({ ...descriptor, channels: [...descriptor.channels] })),
      control: { ...control },
      modifiers: { ...modifiers },
      psychologicalFear: null,
    }),
  });
}

export function proposeCombatStatusApplication({
  linkId,
  targetTypes = [],
  currentStacks = 0,
  targetResistance = 0,
} = {}, { rng } = {}) {
  if (!Number.isFinite(targetResistance) || targetResistance < 0 || targetResistance > 1) {
    return result(false, 'invalid_target_resistance');
  }
  const proposal = resolveStatusApplication({
    linkId,
    targetTypes,
    currentStacks,
    extraResistancePct: targetResistance * 100,
  }, { rng });
  if (!proposal.ok) return result(false, proposal.reason, { detail: proposal, rngDraws: proposal.rngDraws ?? 0 });
  return result(true, proposal.reason, {
    authority: COMBAT_V91_STATUS_AUTHORITY.clientMode,
    committed: false,
    applied: proposal.applied,
    proposedStatus: proposal.proposedStatus ? Object.freeze({
      ...proposal.proposedStatus,
      stacks: proposal.proposedStatus.stackRule === 'AddStackAndRefresh'
        ? proposal.link.potencyStacks
        : proposal.proposedStatus.stacks,
    }) : null,
    expectedStacks: proposal.nextStacks,
    statusId: proposal.statusId,
    finalChance: proposal.finalChancePct / 100,
    roll: proposal.roll,
    rngDraws: proposal.rngDraws,
  });
}

export function planCombatStatusSnapshot(snapshot, applications = [], { nowSec } = {}) {
  const validated = validateCombatStatusSnapshot(snapshot);
  if (!validated.ok || !Array.isArray(applications)
    || !Number.isFinite(nowSec) || nowSec !== validated.snapshot.state.currentTimeSec) {
    return result(false, 'invalid_status_transition_input');
  }
  let state = validated.snapshot.state;
  const attempts = [];
  const applicationIndexes = new Set();
  for (let applicationIndex = 0; applicationIndex < applications.length; applicationIndex += 1) {
    const application = applications[applicationIndex];
    const sourceApplicationIndex = application?.applicationIndex ?? applicationIndex;
    if (!isRecord(application) || application.targetEntityId !== snapshot.entityId
      || typeof application.linkId !== 'string' || typeof application.statusId !== 'string'
      || typeof application.applied !== 'boolean'
      || !Number.isInteger(sourceApplicationIndex) || sourceApplicationIndex < 0
      || applicationIndexes.has(sourceApplicationIndex)) {
      return result(false, 'invalid_status_transition_application');
    }
    applicationIndexes.add(sourceApplicationIndex);
    if (!application.applied) {
      attempts.push(Object.freeze({
        applicationIndex: sourceApplicationIndex,
        linkId: application.linkId,
        statusId: application.statusId,
        targetEntityId: application.targetEntityId,
        applied: false,
        reason: application.reason ?? 'chance_miss',
        stacksAfter: combatStatusStackCount(state, application.statusId),
        appliedDurationSec: null,
        removedStatusIds: Object.freeze([]),
        interaction: null,
      }));
      continue;
    }
    const applied = applyEncounterStatus(state, application.proposedStatus, { nowSec });
    if (!applied.ok) return result(false, 'status_transition_failed', { cause: applied });
    state = applied.state;
    attempts.push(Object.freeze({
      applicationIndex: sourceApplicationIndex,
      linkId: application.linkId,
      statusId: application.statusId,
      targetEntityId: application.targetEntityId,
      applied: applied.applied,
      reason: applied.reason,
      stacksAfter: combatStatusStackCount(state, application.statusId),
      appliedDurationSec: applied.appliedDurationSec,
      removedStatusIds: applied.removedStatusIds,
      interaction: applied.interaction,
    }));
  }
  const changed = fingerprintCombatValue(state) !== fingerprintCombatValue(validated.snapshot.state);
  const next = createCombatStatusSnapshot({
    ...validated.snapshot,
    state,
    statusStateVersion: validated.snapshot.statusStateVersion + (changed ? 1 : 0),
    fingerprint: undefined,
  });
  if (!next.ok) return next;
  return result(true, null, {
    changed,
    before: validated.snapshot,
    after: next.snapshot,
    attempts: Object.freeze(attempts),
    statusApplied: Object.freeze(attempts
      .filter(attempt => attempt.applied)
      .map(attempt => Object.freeze({ statusId: attempt.statusId, targetEntityId: attempt.targetEntityId }))),
  });
}

export function applyPredictedCombatStatus(statusState, proposedStatus, { nowSec } = {}) {
  if (!isEncounterStatusState(statusState)) return result(false, 'invalid_status_state');
  const applied = applyEncounterStatus(statusState, proposedStatus, { nowSec });
  if (!applied.ok) return result(false, applied.reason, { detail: applied });
  return result(true, applied.reason, {
    authority: COMBAT_V91_STATUS_AUTHORITY.clientMode,
    committed: false,
    applied: applied.applied,
    predictedState: applied.state,
    removedStatusIds: applied.removedStatusIds,
    interaction: applied.interaction,
    ccDr: applied.ccDr,
  });
}

export function advancePredictedCombatStatus(statusState, { toSec, targetHp, targetMaxHp } = {}) {
  if (!isEncounterStatusState(statusState)) return result(false, 'invalid_status_state');
  const advanced = advanceEncounterEffects(statusState, { toSec, targetHp, targetMaxHp });
  if (!advanced.ok) return result(false, advanced.reason, { detail: advanced });
  return result(true, advanced.reason, {
    authority: COMBAT_V91_STATUS_AUTHORITY.clientMode,
    committed: false,
    predictedState: advanced.state,
    predictedDamage: advanced.damage,
    predictedHp: advanced.targetHp,
    predictedFainted: advanced.fainted,
    ticks: advanced.ticks,
  });
}

/**
 * Pure, transport-neutral status transition driven only by immutable snapshots.
 * It deliberately does not mutate HP or status storage. The server authority
 * must CAS the profile/status/clock inputs and let the target owner commit the
 * returned projection atomically before publishing an outcome.
 */
export function planCombatStatusTick(statusSnapshot, {
  combatClock,
  targetHp,
  targetMaxHp,
} = {}) {
  const statusValidation = validateCombatStatusSnapshot(statusSnapshot);
  if (!statusValidation.ok) return result(false, statusValidation.reason, { cause: statusValidation });
  const clockValidation = validateCombatClockSnapshot(combatClock, {
    combatId: statusValidation.snapshot.combatId,
  });
  if (!clockValidation.ok) return result(false, clockValidation.reason, { cause: clockValidation });
  const before = statusValidation.snapshot;
  const clock = clockValidation.snapshot;
  if (!Number.isFinite(targetHp) || !Number.isFinite(targetMaxHp)
    || targetMaxHp <= 0 || targetHp < 0 || targetHp > targetMaxHp
    || before.state.currentTimeSec > clock.combatTimeSec
    || before.state.ended) {
    return result(false, 'invalid_status_tick_input');
  }
  const advanced = advanceEncounterEffects(before.state, {
    toSec: clock.combatTimeSec,
    targetHp,
    targetMaxHp,
  });
  if (!advanced.ok) return result(false, advanced.reason, { cause: advanced });
  const state = clock.ended
    ? endEncounterEffects(advanced.state, { nowSec: clock.combatTimeSec })
    : advanced.state;
  const beforeStatusIds = new Set(before.state.statuses.map(status => status.statusId));
  const afterStatusIds = new Set(state.statuses.map(status => status.statusId));
  const expiredStatusIds = Object.freeze([...beforeStatusIds]
    .filter(statusId => !afterStatusIds.has(statusId)));
  const statusChanged = fingerprintCombatValue(state) !== fingerprintCombatValue(before.state);
  const next = createCombatStatusSnapshot({
    ...before,
    state,
    statusStateVersion: before.statusStateVersion + (statusChanged ? 1 : 0),
    fingerprint: undefined,
  });
  if (!next.ok) return next;
  const appliedDamage = targetHp - advanced.targetHp;
  const payload = {
    schemaVersion: COMBAT_V91_STATUS_TICK_PLAN_SCHEMA,
    combatId: before.combatId,
    entityId: before.entityId,
    ownerDomain: before.ownerDomain,
    clockTick: clock.clockTick,
    combatTimeSec: clock.combatTimeSec,
    clockStateVersion: clock.clockStateVersion,
    clockFingerprint: clock.fingerprint,
    hpBefore: targetHp,
    hpAfter: advanced.targetHp,
    scheduledDamage: advanced.damage,
    appliedDamage,
    statusStateVersionBefore: before.statusStateVersion,
    statusStateVersionAfter: next.snapshot.statusStateVersion,
    statusFingerprintBefore: before.fingerprint,
    statusFingerprintAfter: next.snapshot.fingerprint,
    expiredStatusIds,
    ticks: advanced.ticks.map(tick => Object.freeze({ ...tick })),
    before,
    after: next.snapshot,
  };
  return result(true, null, {
    plan: deepFreeze({ ...payload, fingerprint: fingerprintCombatValue(payload) }),
  });
}

if (COMBAT_V91_STATUS_IDS.length !== 26 || new Set(COMBAT_V91_STATUS_IDS).size !== 26) {
  throw new TypeError('Combat V9.1 requires the reviewed 26-status registry');
}
if (HARD_CC_DR_POLICY.windowSec !== 6
  || HARD_CC_DR_POLICY.minimumDurationSec !== 0.25
  || HARD_CC_DR_POLICY.durationMultipliers.join(',') !== '1,0.65,0.4') {
  throw new TypeError('Combat V9.1 hard-CC DR parity mismatch');
}
