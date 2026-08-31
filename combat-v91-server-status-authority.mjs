import { createDomainCombatProfile } from './combat-v91-adapters.mjs';
import {
  COMBAT_STAT_KEYS,
  fingerprintCombatValue,
  validateCombatProfile,
} from './combat-v91-contract.mjs';
import {
  planCombatStatusTick,
  validateCombatClockSnapshot,
  validateCombatStatusSnapshot,
} from './combat-v91-status.mjs';

export const COMBAT_V91_SERVER_STATUS_AUTHORITY_VERSION = 'combat-v91-server-status-authority/v1';
export const COMBAT_V91_STATUS_TICK_REQUEST_SCHEMA = 'combat-status-tick-request/v9.1';
export const COMBAT_V91_STATUS_TICK_RESPONSE_SCHEMA = 'combat-status-tick-response/v9.1';
export const COMBAT_V91_STATUS_TICK_OUTCOME_SCHEMA = 'combat-status-tick-outcome/v9.1';
export const COMBAT_V91_STATUS_TICK_TRANSACTION_SCHEMA = 'combat-status-tick-transaction/v9.1';

export const COMBAT_V91_SERVER_STATUS_AUTHORITY_POLICY = Object.freeze({
  executionAuthority: 'server_combat_clock',
  profileAuthority: 'pirate_or_pocket_domain_calculator_only',
  hpWriter: 'target_owner_inside_atomic_server_transaction',
  statusWriter: 'target_owner_inside_atomic_server_transaction',
  clockCas: 'exact_snapshot_compare_inside_atomic_server_transaction',
  planner: 'pure_snapshot_transition',
  terminalResponse: 'same_transaction_as_hp_and_status',
  outcomePublication: 'post_commit_terminal_response_or_outbox_only',
  idempotencyKey: 'authorityScope+combatId+requestId',
  networkCreation: false,
  productionWritesEnabled: false,
});

const AUTHORITY_CONTEXT_KEYS = Object.freeze(['principalId', 'sessionId', 'idempotencyScope']);
const PROFILE_SOURCE_KEYS = Object.freeze(['ownerDomain', 'profileInput']);
const REQUEST_KEYS = Object.freeze([
  'schemaVersion', 'authority', 'requestId', 'combatId', 'entityId',
  'clockTick', 'clockStateVersion', 'clockFingerprint', 'fingerprint',
]);
const RESPONSE_KEYS = Object.freeze([
  'schemaVersion', 'authority', 'requestId', 'combatId', 'entityId', 'clockTick',
  'status', 'reason', 'requestFingerprint', 'authoritativeProfile',
  'authoritativeStatusSnapshot', 'combatClock', 'outcome', 'fingerprint',
]);
const OUTCOME_KEYS = Object.freeze([
  'schemaVersion', 'authority', 'publication', 'commitId', 'requestId',
  'combatId', 'entityId', 'ownerDomain', 'clockTick', 'combatTimeSec',
  'scheduledDamage', 'damage', 'damageType', 'ticks', 'expiredStatusIds',
  'hpBefore', 'hpAfter', 'defeated', 'fainted', 'profileStateVersionBefore',
  'profileStateVersionAfter', 'statusStateVersionBefore', 'statusStateVersionAfter',
  'clockStateVersion', 'clockFingerprint', 'planFingerprint', 'fingerprint',
]);
const OUTCOME_TICK_KEYS = Object.freeze([
  'statusId', 'atSec', 'stacks', 'damage', 'sourceInstanceId',
]);
const COMMITTED_RECEIPT_KEYS = Object.freeze([
  'committed', 'commitId', 'authoritativeProfileSource',
  'authoritativeStatusSnapshot', 'authoritativeCombatClock', 'defeated', 'fainted',
]);
const REJECTION_RECEIPT_KEYS = Object.freeze([
  'committed', 'reason', 'authoritativeProfileSource',
  'authoritativeStatusSnapshot', 'authoritativeCombatClock',
]);
const TRANSACTION_DISPOSITIONS = new Set(['committed', 'rejected', 'replayed']);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function contractError(code, cause) {
  const error = new TypeError(code);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

async function loadDependency(loader, value, name) {
  if (typeof loader !== 'function') return result(false, `missing_${name}`);
  try {
    return result(true, null, { value: await loader(value) });
  } catch (error) {
    return result(false, `${name}_failed`, { error });
  }
}

function validateAuthorityContext(input) {
  if (!exactKeys(input, AUTHORITY_CONTEXT_KEYS)
    || AUTHORITY_CONTEXT_KEYS.some(key => !nonEmptyString(input[key]))) {
    return result(false, 'invalid_authority_context');
  }
  return result(true, null, {
    context: Object.freeze(Object.fromEntries(AUTHORITY_CONTEXT_KEYS.map(key => [key, input[key]]))),
  });
}

export function createCombatStatusTickRequest(input = {}) {
  if (!isRecord(input)
    || Object.keys(input).some(key => !REQUEST_KEYS.includes(key))
    || (input.schemaVersion !== undefined && input.schemaVersion !== COMBAT_V91_STATUS_TICK_REQUEST_SCHEMA)
    || input.authority !== 'server'
    || ![input.requestId, input.combatId, input.entityId, input.clockFingerprint].every(nonEmptyString)
    || !Number.isInteger(input.clockTick) || input.clockTick < 0
    || !Number.isInteger(input.clockStateVersion) || input.clockStateVersion < 0) {
    return result(false, 'invalid_status_tick_request');
  }
  const payload = {
    schemaVersion: COMBAT_V91_STATUS_TICK_REQUEST_SCHEMA,
    authority: 'server',
    requestId: input.requestId,
    combatId: input.combatId,
    entityId: input.entityId,
    clockTick: input.clockTick,
    clockStateVersion: input.clockStateVersion,
    clockFingerprint: input.clockFingerprint,
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'status_tick_request_fingerprint_mismatch');
  }
  return result(true, null, { request: deepFreeze({ ...payload, fingerprint }) });
}

function deriveProfileSource(source, { entityId } = {}) {
  if (!exactKeys(source, PROFILE_SOURCE_KEYS)) return result(false, 'invalid_domain_profile_source');
  const derived = createDomainCombatProfile(source);
  if (!derived.ok) return result(false, derived.reason, { cause: derived });
  if (entityId !== undefined && derived.profile.entityId !== entityId) {
    return result(false, 'domain_profile_entity_mismatch');
  }
  if (derived.profile.ownerDomain !== source.ownerDomain) {
    return result(false, 'domain_profile_owner_mismatch');
  }
  return result(true, null, {
    source,
    sourceFingerprint: fingerprintCombatValue(source),
    sourceInvariantFingerprint: fingerprintCombatValue({
      ownerDomain: source.ownerDomain,
      profileInput: Object.fromEntries(Object.entries(source.profileInput)
        .filter(([key]) => key !== 'currentHp' && key !== 'stateVersion')),
    }),
    profile: derived.profile,
  });
}

function profileBasePayload(profile) {
  return {
    schemaVersion: profile.schemaVersion,
    entityId: profile.entityId,
    ownerDomain: profile.ownerDomain,
    entityKind: profile.entityKind,
    level: profile.level,
    types: profile.types,
    stats: Object.fromEntries(COMBAT_STAT_KEYS
      .filter(key => key !== 'hpCurrent')
      .map(key => [key, profile.stats[key]])),
    progressionStateVersion: profile.progressionStateVersion,
    calculationVersion: profile.calculationVersion,
    definitionVersion: profile.definitionVersion,
  };
}

function idempotencyIdentity(context, request) {
  return Object.freeze({
    scope: context.idempotencyScope,
    combatId: request.combatId,
    requestId: request.requestId,
    requestFingerprint: request.fingerprint,
  });
}

function createStatusTickOutcome({ request, profileBefore, profileAfter, clock, plan, commitId,
  defeated, fainted }) {
  const payload = {
    schemaVersion: COMBAT_V91_STATUS_TICK_OUTCOME_SCHEMA,
    authority: 'server',
    publication: 'post_commit_only',
    commitId,
    requestId: request.requestId,
    combatId: request.combatId,
    entityId: request.entityId,
    ownerDomain: profileBefore.ownerDomain,
    clockTick: clock.clockTick,
    combatTimeSec: clock.combatTimeSec,
    scheduledDamage: plan.scheduledDamage,
    damage: plan.appliedDamage,
    damageType: 'shared.status_dot',
    ticks: plan.ticks.map(tick => ({ ...tick })),
    expiredStatusIds: [...plan.expiredStatusIds],
    hpBefore: profileBefore.stats.hpCurrent,
    hpAfter: profileAfter.stats.hpCurrent,
    defeated,
    fainted,
    profileStateVersionBefore: profileBefore.stateVersion,
    profileStateVersionAfter: profileAfter.stateVersion,
    statusStateVersionBefore: plan.statusStateVersionBefore,
    statusStateVersionAfter: plan.statusStateVersionAfter,
    clockStateVersion: clock.clockStateVersion,
    clockFingerprint: clock.fingerprint,
    planFingerprint: plan.fingerprint,
  };
  return deepFreeze({ ...payload, fingerprint: fingerprintCombatValue(payload) });
}

function validateStatusTickOutcome(input) {
  if (!exactKeys(input, OUTCOME_KEYS)) return result(false, 'invalid_status_tick_outcome_shape');
  const { fingerprint, ...payload } = input;
  if (payload.schemaVersion !== COMBAT_V91_STATUS_TICK_OUTCOME_SCHEMA
    || payload.authority !== 'server' || payload.publication !== 'post_commit_only'
    || ![payload.commitId, payload.requestId, payload.combatId, payload.entityId,
      payload.ownerDomain, payload.damageType, payload.clockFingerprint,
      payload.planFingerprint].every(nonEmptyString)
    || !Number.isInteger(payload.clockTick) || payload.clockTick < 0
    || !Number.isFinite(payload.combatTimeSec) || payload.combatTimeSec < 0
    || !Number.isFinite(payload.scheduledDamage) || payload.scheduledDamage < 0
    || !Number.isFinite(payload.damage) || payload.damage < 0
    || payload.scheduledDamage < payload.damage
    || !Number.isFinite(payload.hpBefore) || !Number.isFinite(payload.hpAfter)
    || payload.hpAfter < 0
    || payload.hpBefore < payload.hpAfter || payload.damage !== payload.hpBefore - payload.hpAfter
    || typeof payload.defeated !== 'boolean' || typeof payload.fainted !== 'boolean'
    || !Array.isArray(payload.ticks) || !Array.isArray(payload.expiredStatusIds)
    || payload.ticks.some(tick => !exactKeys(tick, OUTCOME_TICK_KEYS)
      || !nonEmptyString(tick.statusId)
      || !Number.isFinite(tick.atSec) || tick.atSec < 0
      || !Number.isInteger(tick.stacks) || tick.stacks < 1
      || !Number.isFinite(tick.damage) || tick.damage < 0
      || !(tick.sourceInstanceId === null || typeof tick.sourceInstanceId === 'string'))
    || payload.expiredStatusIds.some(statusId => !nonEmptyString(statusId))
    || new Set(payload.expiredStatusIds).size !== payload.expiredStatusIds.length
    || payload.damageType !== 'shared.status_dot'
    || payload.defeated && payload.fainted
    || !['profileStateVersionBefore', 'profileStateVersionAfter',
      'statusStateVersionBefore', 'statusStateVersionAfter', 'clockStateVersion']
      .every(field => Number.isInteger(payload[field]) && payload[field] >= 0)
    || fingerprintCombatValue(payload) !== fingerprint) {
    return result(false, 'invalid_status_tick_outcome');
  }
  return result(true, null, { outcome: deepFreeze(structuredClone(input)) });
}

function createStatusTickResponse({ request, status, reason = null, profile = null,
  statusSnapshot = null, combatClock = null, outcome = null }) {
  const payload = {
    schemaVersion: COMBAT_V91_STATUS_TICK_RESPONSE_SCHEMA,
    authority: 'server',
    requestId: request.requestId,
    combatId: request.combatId,
    entityId: request.entityId,
    clockTick: request.clockTick,
    status,
    reason,
    requestFingerprint: request.fingerprint,
    authoritativeProfile: profile,
    authoritativeStatusSnapshot: statusSnapshot,
    combatClock,
    outcome,
  };
  return deepFreeze({ ...payload, fingerprint: fingerprintCombatValue(payload) });
}

export function validateCombatStatusTickResponse(input) {
  if (!exactKeys(input, RESPONSE_KEYS)) return result(false, 'invalid_status_tick_response_shape');
  const { fingerprint, ...payload } = input;
  if (payload.schemaVersion !== COMBAT_V91_STATUS_TICK_RESPONSE_SCHEMA
    || payload.authority !== 'server'
    || ![payload.requestId, payload.combatId, payload.entityId,
      payload.requestFingerprint].every(nonEmptyString)
    || !Number.isInteger(payload.clockTick) || payload.clockTick < 0
    || !['committed', 'rejected'].includes(payload.status)
    || fingerprintCombatValue(payload) !== fingerprint) {
    return result(false, 'invalid_status_tick_response');
  }
  if (payload.status === 'committed') {
    const profile = validateCombatProfile(payload.authoritativeProfile, { entityId: payload.entityId });
    const statusSnapshot = validateCombatStatusSnapshot(payload.authoritativeStatusSnapshot, {
      combatId: payload.combatId,
      entityId: payload.entityId,
      ownerDomain: profile.profile?.ownerDomain,
    });
    const clock = validateCombatClockSnapshot(payload.combatClock, {
      combatId: payload.combatId,
      clockTick: payload.clockTick,
    });
    const outcome = validateStatusTickOutcome(payload.outcome);
    if (payload.reason !== null || !profile.ok || !statusSnapshot.ok || !clock.ok || !outcome.ok
      || outcome.outcome.entityId !== profile.profile.entityId
      || outcome.outcome.ownerDomain !== profile.profile.ownerDomain
      || outcome.outcome.requestId !== payload.requestId
      || outcome.outcome.combatId !== payload.combatId
      || outcome.outcome.clockTick !== payload.clockTick
      || outcome.outcome.clockStateVersion !== clock.snapshot.clockStateVersion
      || outcome.outcome.clockFingerprint !== clock.snapshot.fingerprint
      || outcome.outcome.hpAfter !== profile.profile.stats.hpCurrent
      || outcome.outcome.profileStateVersionAfter !== profile.profile.stateVersion
      || outcome.outcome.statusStateVersionAfter !== statusSnapshot.snapshot.statusStateVersion
      || outcome.outcome.fainted !== (profile.profile.stats.hpCurrent === 0
        && profile.profile.entityKind === 'Monster')
      || outcome.outcome.defeated !== (profile.profile.stats.hpCurrent === 0
        && profile.profile.entityKind !== 'Monster')) {
      return result(false, 'invalid_committed_status_tick_response');
    }
  } else {
    const profile = validateCombatProfile(payload.authoritativeProfile, { entityId: payload.entityId });
    const statusSnapshot = validateCombatStatusSnapshot(payload.authoritativeStatusSnapshot, {
      combatId: payload.combatId,
      entityId: payload.entityId,
      ownerDomain: profile.profile?.ownerDomain,
    });
    const clock = validateCombatClockSnapshot(payload.combatClock, { combatId: payload.combatId });
    if (!nonEmptyString(payload.reason) || payload.outcome !== null
      || !profile.ok || !statusSnapshot.ok || !clock.ok) {
      return result(false, 'invalid_rejected_status_tick_response');
    }
  }
  return result(true, null, { response: deepFreeze(structuredClone(input)) });
}

function validateResponseIdentity(response, request) {
  return response.requestId === request.requestId
    && response.combatId === request.combatId
    && response.entityId === request.entityId
    && response.clockTick === request.clockTick
    && response.requestFingerprint === request.fingerprint;
}

async function settleAtomic(command, finalize, transactCombatStatusTick, request) {
  if (typeof transactCombatStatusTick !== 'function') {
    return result(false, 'missing_atomic_status_tick_transaction');
  }
  let settled;
  try {
    settled = await transactCombatStatusTick(Object.freeze(command), finalize);
  } catch (error) {
    return result(false, 'atomic_status_tick_transaction_failed', { error });
  }
  if (!exactKeys(settled, ['atomic', 'disposition', 'response']) || settled.atomic !== true
    || !TRANSACTION_DISPOSITIONS.has(settled.disposition)) {
    return result(false, 'invalid_atomic_status_tick_result');
  }
  const response = validateCombatStatusTickResponse(settled.response);
  if (!response.ok || !validateResponseIdentity(response.response, request)) {
    return result(false, 'invalid_atomic_status_tick_terminal_response', { cause: response });
  }
  if ((settled.disposition === 'committed' && response.response.status !== 'committed')
    || (settled.disposition === 'rejected' && response.response.status !== 'rejected')) {
    return result(false, 'atomic_status_tick_disposition_mismatch');
  }
  return result(true, settled.disposition === 'replayed'
    ? 'IDEMPOTENT_REPLAY'
    : response.response.reason, {
    response: response.response,
    replay: settled.disposition === 'replayed',
  });
}

function rejectionReceipt(profileSource, statusSnapshot, combatClock, reason) {
  return Object.freeze({
    committed: false,
    reason,
    authoritativeProfileSource: profileSource,
    authoritativeStatusSnapshot: statusSnapshot,
    authoritativeCombatClock: combatClock,
  });
}

function finalizeRejection(request, receipt) {
  if (!exactKeys(receipt, REJECTION_RECEIPT_KEYS) || receipt.committed !== false
    || !nonEmptyString(receipt.reason)) throw contractError('invalid_status_tick_rejection_receipt');
  const profile = deriveProfileSource(receipt.authoritativeProfileSource, { entityId: request.entityId });
  const status = validateCombatStatusSnapshot(receipt.authoritativeStatusSnapshot, {
    combatId: request.combatId,
    entityId: request.entityId,
    ownerDomain: profile.profile?.ownerDomain,
  });
  const clock = validateCombatClockSnapshot(receipt.authoritativeCombatClock, {
    combatId: request.combatId,
  });
  if (!profile.ok || !status.ok || !clock.ok) {
    throw contractError('invalid_status_tick_rejection_resync');
  }
  return createStatusTickResponse({
    request,
    status: 'rejected',
    reason: receipt.reason,
    profile: profile.profile,
    statusSnapshot: status.snapshot,
    combatClock: clock.snapshot,
  });
}

async function settleRejection({ context, request, profileSource, statusSnapshot, combatClock,
  reason, transactCombatStatusTick }) {
  const receipt = rejectionReceipt(profileSource, statusSnapshot, combatClock, reason);
  return settleAtomic({
    schemaVersion: COMBAT_V91_STATUS_TICK_TRANSACTION_SCHEMA,
    authority: 'server',
    mode: 'reject',
    idempotency: idempotencyIdentity(context, request),
    rejectionReceipt: receipt,
  }, value => finalizeRejection(request, value), transactCombatStatusTick, request);
}

function validateCommittedReceipt(receipt, { request, sourceBefore, profileBefore,
  statusBefore, clock, plan }) {
  if (!exactKeys(receipt, COMMITTED_RECEIPT_KEYS) || receipt.committed !== true
    || !nonEmptyString(receipt.commitId)
    || typeof receipt.defeated !== 'boolean' || typeof receipt.fainted !== 'boolean') {
    return result(false, 'invalid_status_tick_commit_receipt');
  }
  const committed = deriveProfileSource(receipt.authoritativeProfileSource, {
    entityId: profileBefore.entityId,
  });
  if (!committed.ok
    || committed.sourceInvariantFingerprint !== sourceBefore.sourceInvariantFingerprint
    || fingerprintCombatValue(profileBasePayload(committed.profile))
      !== fingerprintCombatValue(profileBasePayload(profileBefore))
    || committed.profile.stats.hpCurrent !== plan.hpAfter
    || committed.profile.stateVersion !== profileBefore.stateVersion + (plan.appliedDamage > 0 ? 1 : 0)) {
    return result(false, 'status_tick_profile_invariant_mismatch');
  }
  const status = validateCombatStatusSnapshot(receipt.authoritativeStatusSnapshot, {
    combatId: request.combatId,
    entityId: request.entityId,
    ownerDomain: profileBefore.ownerDomain,
  });
  if (!status.ok || status.snapshot.statusStateVersion !== plan.statusStateVersionAfter
    || status.snapshot.fingerprint !== plan.statusFingerprintAfter
    || statusBefore.fingerprint !== plan.statusFingerprintBefore) {
    return result(false, 'status_tick_status_commit_mismatch');
  }
  const committedClock = validateCombatClockSnapshot(receipt.authoritativeCombatClock, {
    combatId: request.combatId,
    clockTick: request.clockTick,
    clockStateVersion: request.clockStateVersion,
  });
  if (!committedClock.ok || committedClock.snapshot.fingerprint !== clock.fingerprint) {
    return result(false, 'status_tick_clock_commit_mismatch');
  }
  const hpZero = committed.profile.stats.hpCurrent === 0;
  const expectedFainted = hpZero && committed.profile.entityKind === 'Monster';
  const expectedDefeated = hpZero && committed.profile.entityKind !== 'Monster';
  if (receipt.fainted !== expectedFainted || receipt.defeated !== expectedDefeated) {
    return result(false, 'invalid_status_tick_defeat_commit');
  }
  return result(true, null, {
    commitId: receipt.commitId,
    profile: committed.profile,
    statusSnapshot: status.snapshot,
    combatClock: committedClock.snapshot,
    defeated: receipt.defeated,
    fainted: receipt.fainted,
  });
}

/**
 * Transport-neutral authoritative status tick boundary. The transaction adapter
 * must compare every expected fingerprint/version, let the profile owner update
 * hpCurrent/stateVersion, replace the status snapshot, invoke finalize before
 * durability, and persist its terminal response/outbox in the same transaction.
 */
export async function executeCombatV91StatusTickAuthority({ request, authorityContext } = {}, {
  readTerminalResponse,
  loadProfileSource,
  loadStatusSnapshot,
  loadCombatClock,
  transactCombatStatusTick,
} = {}) {
  const contextValidation = validateAuthorityContext(authorityContext);
  if (!contextValidation.ok) return contextValidation;
  const requestValidation = createCombatStatusTickRequest(request);
  if (!requestValidation.ok) return requestValidation;
  const context = contextValidation.context;
  request = requestValidation.request;
  const identity = idempotencyIdentity(context, request);

  const terminal = await loadDependency(readTerminalResponse, identity, 'status_tick_terminal_response_read');
  if (!terminal.ok) return terminal;
  if (terminal.value != null) {
    const replay = validateCombatStatusTickResponse(terminal.value);
    if (!replay.ok || !validateResponseIdentity(replay.response, request)) {
      return result(false, 'IDEMPOTENCY_CONFLICT', { cause: replay });
    }
    return result(true, 'IDEMPOTENT_REPLAY', { response: replay.response, replay: true });
  }

  const [profileLoaded, statusLoaded, clockLoaded] = await Promise.all([
    loadDependency(loadProfileSource, {
      authorityContext: context,
      combatId: request.combatId,
      entityId: request.entityId,
    }, 'status_tick_profile_source'),
    loadDependency(loadStatusSnapshot, {
      authorityContext: context,
      combatId: request.combatId,
      entityId: request.entityId,
    }, 'status_tick_status_snapshot'),
    loadDependency(loadCombatClock, {
      authorityContext: context,
      combatId: request.combatId,
      requestedClockTick: request.clockTick,
    }, 'status_tick_combat_clock'),
  ]);
  for (const loaded of [profileLoaded, statusLoaded, clockLoaded]) if (!loaded.ok) return loaded;

  const source = deriveProfileSource(profileLoaded.value, { entityId: request.entityId });
  if (!source.ok) return result(false, source.reason, { cause: source });
  const profile = source.profile;
  const status = validateCombatStatusSnapshot(statusLoaded.value, {
    combatId: request.combatId,
    entityId: request.entityId,
    ownerDomain: profile.ownerDomain,
  });
  const clock = validateCombatClockSnapshot(clockLoaded.value, { combatId: request.combatId });
  if (!status.ok) return result(false, 'invalid_authoritative_status_snapshot', { cause: status });
  if (!clock.ok) return result(false, 'invalid_authoritative_combat_clock', { cause: clock });

  if (clock.snapshot.clockTick !== request.clockTick
    || clock.snapshot.clockStateVersion !== request.clockStateVersion
    || clock.snapshot.fingerprint !== request.clockFingerprint) {
    return settleRejection({
      context,
      request,
      profileSource: source.source,
      statusSnapshot: status.snapshot,
      combatClock: clock.snapshot,
      reason: 'STALE_COMBAT_CLOCK',
      transactCombatStatusTick,
    });
  }
  const planned = planCombatStatusTick(status.snapshot, {
    combatClock: clock.snapshot,
    targetHp: profile.stats.hpCurrent,
    targetMaxHp: profile.stats.hpMax,
  });
  if (!planned.ok) {
    return settleRejection({
      context,
      request,
      profileSource: source.source,
      statusSnapshot: status.snapshot,
      combatClock: clock.snapshot,
      reason: `STATUS_PLAN_${planned.reason.toUpperCase()}`,
      transactCombatStatusTick,
    });
  }
  const plan = planned.plan;
  const rejectionFallback = rejectionReceipt(
    source.source,
    status.snapshot,
    clock.snapshot,
    'ATOMIC_CAS_REJECTED',
  );
  const command = {
    schemaVersion: COMBAT_V91_STATUS_TICK_TRANSACTION_SCHEMA,
    authority: 'server',
    mode: 'apply',
    idempotency: identity,
    expected: Object.freeze({
      profileStateVersion: profile.stateVersion,
      profileSourceFingerprint: source.sourceFingerprint,
      statusStateVersion: status.snapshot.statusStateVersion,
      statusFingerprint: status.snapshot.fingerprint,
      combatClockStateVersion: clock.snapshot.clockStateVersion,
      combatClockFingerprint: clock.snapshot.fingerprint,
    }),
    profileOwnerDomain: profile.ownerDomain,
    profileSource: source.source,
    profile,
    statusSnapshot: status.snapshot,
    combatClock: clock.snapshot,
    plan,
    mutation: Object.freeze({
      hpBefore: profile.stats.hpCurrent,
      hpAfter: plan.hpAfter,
      profileStateVersionAfter: profile.stateVersion + (plan.appliedDamage > 0 ? 1 : 0),
      authoritativeStatusSnapshot: plan.after,
    }),
    rejectionFallback,
  };

  return settleAtomic(command, receipt => {
    if (isRecord(receipt) && receipt.committed === false) {
      return finalizeRejection(request, receipt);
    }
    const committed = validateCommittedReceipt(receipt, {
      request,
      sourceBefore: source,
      profileBefore: profile,
      statusBefore: status.snapshot,
      clock: clock.snapshot,
      plan,
    });
    if (!committed.ok) throw contractError(committed.reason, committed.cause);
    const outcome = createStatusTickOutcome({
      request,
      profileBefore: profile,
      profileAfter: committed.profile,
      clock: committed.combatClock,
      plan,
      commitId: committed.commitId,
      defeated: committed.defeated,
      fainted: committed.fainted,
    });
    return createStatusTickResponse({
      request,
      status: 'committed',
      profile: committed.profile,
      statusSnapshot: committed.statusSnapshot,
      combatClock: committed.combatClock,
      outcome,
    });
  }, transactCombatStatusTick, request);
}
