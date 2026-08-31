import {
  COMBAT_STAT_KEYS,
  createCombatActionDefinition,
  createWorldCombatSnapshot,
  fingerprintCombatValue,
} from './combat-v91-contract.mjs';
import { createDomainCombatProfile } from './combat-v91-adapters.mjs';
import {
  createCombatAuthorityOutcome,
  createCombatAuthorityResponse,
  validateCombatAuthorityResponse,
  validateCombatPredictionEnvelope,
} from './combat-v91-protocol.mjs';
import { COMBAT_V91_RNG_VERSION } from './combat-v91-rng.mjs';
import { resolveCombatV91Proposal } from './combat-v91-rules.mjs';
import { validateCombatStatusSnapshot } from './combat-v91-status.mjs';
import { validateCombatActionStatProjection } from './combat-v91-action-stat-projection.mjs';
import { validateCombatServerDynamicsPermit } from './combat-v91-server-dynamics-permit.mjs';

export const COMBAT_V91_SERVER_AUTHORITY_VERSION = 'combat-v91-server-authority/v3';
export const COMBAT_V91_SERVER_AUTHORITY_POLICY = Object.freeze({
  executionAuthority: 'server',
  profileAuthority: 'domain_calculator_only',
  actionAuthority: 'server_action_permit',
  hpWriter: 'target_owner_inside_atomic_server_transaction',
  statusWriter: 'entity_owner_inside_atomic_server_transaction',
  resourceWriter: 'actor_owner_inside_atomic_server_transaction',
  dynamicsAuthority: 'server_dynamics_permit_inside_atomic_server_transaction',
  supportedDynamicsResolution: 'single_direct_impact',
  actorOccupancyWriter: 'server_cas',
  trustsClientPrediction: false,
  rngAuthority: 'server_world_snapshot_and_one_use_ticket',
  terminalResponse: 'same_transaction_as_owner_state',
  networkCreation: false,
  productionWritesEnabled: false,
  idempotencyKey: 'authorityScope+combatId+intentId',
});

export const COMBAT_V91_ACTION_PERMIT_SCHEMA = 'combat-action-permit/v9.1.2';
export const COMBAT_V91_RNG_TICKET_SCHEMA = 'combat-rng-ticket/v9.1';
export const COMBAT_V91_AUTHORITY_TRANSACTION_SCHEMA = 'combat-authority-transaction/v9.1.2';
export const COMBAT_V91_DYNAMICS_AUTHORITY_SNAPSHOT_SCHEMA =
  'combat-dynamics-authority-snapshot/v9.1.2';
const ACTION_PERMIT_SCHEMA = COMBAT_V91_ACTION_PERMIT_SCHEMA;
const RNG_TICKET_SCHEMA = COMBAT_V91_RNG_TICKET_SCHEMA;
const TRANSACTION_SCHEMA = COMBAT_V91_AUTHORITY_TRANSACTION_SCHEMA;
const TRANSACTION_DISPOSITIONS = new Set(['committed', 'rejected', 'replayed']);
const AUTHORITY_CONTEXT_KEYS = Object.freeze(['principalId', 'sessionId', 'idempotencyScope']);
const PROFILE_SOURCE_KEYS = Object.freeze(['ownerDomain', 'profileInput']);
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const DYNAMICS_AUTHORITY_SNAPSHOT_KEYS = Object.freeze([
  'schemaVersion', 'authority', 'combatId', 'actionSequence', 'actorEntityId',
  'targetEntityId', 'actionId', 'actionFingerprint',
  'actionDynamicsBindingFingerprint', 'sourceProvenanceFingerprint',
  'currentCombatTick', 'dynamicsStateVersion', 'actorOccupancyStateVersion',
  'actorOccupancyLeaseId', 'occupiedUntilCombatTick', 'fingerprint',
]);
const ACTION_PERMIT_KEYS = Object.freeze([
  'schemaVersion', 'authority', 'permitId', 'principalId', 'sessionId',
  'combatId', 'actorEntityId', 'targetEntityId', 'nextActionSequence',
  'action', 'actionStatProjection', 'dynamicsPermit',
  'actorStateVersion', 'actorStateVersionAfter',
  'resourceStateVersion', 'resourceStateVersionAfter', 'entitlementStateVersion',
  'sequenceStateVersion', 'sequenceStateVersionAfter', 'resourceCommitToken',
  'fingerprint',
]);
const RNG_TICKET_KEYS = Object.freeze([
  'schemaVersion', 'authority', 'ticketId', 'rngVersion', 'seed',
  'combatId', 'actorEntityId', 'targetEntityId', 'actionId', 'actionSequence',
  'stateVersion', 'expiresAtWorldTick', 'fingerprint',
]);
const EXECUTION_RECEIPT_KEYS = Object.freeze([
  'actorEntityId', 'actorStateVersionBefore', 'actorStateVersionAfter',
  'resourceStateVersionBefore', 'resourceStateVersionAfter',
  'sequenceStateVersionBefore', 'sequenceStateVersionAfter',
  'committedActionSequence', 'rngTicketId',
  'rngTicketStateVersionBefore', 'rngTicketStateVersionAfter',
  'dynamicsStateVersionBefore', 'dynamicsStateVersionAfter',
  'actorOccupancyStateVersionBefore', 'actorOccupancyStateVersionAfter',
  'dynamicsPermitFingerprint',
  'authoritativeDynamicsEffectReceipt',
]);
const COMMITTED_RECEIPT_KEYS = Object.freeze([
  'committed', 'commitId', 'authoritativeTargetSource',
  'authoritativeStatusSnapshots', 'statusApplied', 'defeated', 'fainted',
  'executionReceipt',
]);
const REJECTION_RECEIPT_KEYS = Object.freeze([
  'committed', 'reason', 'resyncProfileSources', 'authoritativeStatusSnapshots',
]);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function safeVersion(value, { incremented = false } = {}) {
  return Number.isSafeInteger(value) && value >= 0
    && (!incremented || value < Number.MAX_SAFE_INTEGER);
}

function validHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
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
    const loaded = await loader(value);
    return result(true, null, { value: loaded });
  } catch (error) {
    return result(false, `${name}_failed`, { error });
  }
}

function validateAuthorityContext(context) {
  if (!exactKeys(context, AUTHORITY_CONTEXT_KEYS)
    || AUTHORITY_CONTEXT_KEYS.some(key => !nonEmptyString(context[key]))) {
    return result(false, 'invalid_authority_context');
  }
  return result(true, null, {
    context: Object.freeze(Object.fromEntries(AUTHORITY_CONTEXT_KEYS.map(key => [key, context[key]]))),
  });
}

function validateDynamicsAuthoritySnapshot(input, { envelope, actor, target } = {}) {
  if (!exactKeys(input, DYNAMICS_AUTHORITY_SNAPSHOT_KEYS)
    || input.schemaVersion !== COMBAT_V91_DYNAMICS_AUTHORITY_SNAPSHOT_SCHEMA
    || input.authority !== 'server_registry'
    || ![
      input.combatId, input.actorEntityId, input.targetEntityId, input.actionId,
      input.actorOccupancyLeaseId,
    ].every(nonEmptyString)
    || !validHash(input.actionFingerprint)
    || !validHash(input.actionDynamicsBindingFingerprint)
    || !validHash(input.sourceProvenanceFingerprint)
    || !safeVersion(input.actionSequence)
    || !safeVersion(input.currentCombatTick)
    || !safeVersion(input.dynamicsStateVersion, { incremented: true })
    || !safeVersion(input.actorOccupancyStateVersion, { incremented: true })
    || !safeVersion(input.occupiedUntilCombatTick)
    || input.occupiedUntilCombatTick < input.currentCombatTick) {
    return result(false, 'invalid_dynamics_authority_snapshot');
  }
  const payload = Object.fromEntries(DYNAMICS_AUTHORITY_SNAPSHOT_KEYS
    .filter(key => key !== 'fingerprint')
    .map(key => [key, input[key]]));
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== fingerprint) {
    return result(false, 'dynamics_authority_snapshot_fingerprint_mismatch');
  }
  if (input.combatId !== envelope.combatId
    || input.actionSequence !== envelope.actionSequence
    || input.actorEntityId !== actor.entityId
    || input.targetEntityId !== target.entityId
    || input.actionId !== envelope.actionId
    || input.actionFingerprint !== envelope.actionFingerprint) {
    return result(false, 'dynamics_authority_snapshot_binding_mismatch');
  }
  return result(true, null, { snapshot: Object.freeze({ ...payload, fingerprint }) });
}

function profileSourceInvariantPayload(source) {
  const profileInput = { ...source.profileInput };
  if (source.ownerDomain === 'Pocket') {
    delete profileInput.currentHp;
    delete profileInput.stateVersion;
  } else if (source.ownerDomain === 'Pirate') {
    profileInput.currentHpOwnerState = Object.fromEntries(
      Object.entries(profileInput.currentHpOwnerState)
        .filter(([key]) => !['hpCurrent', 'stateVersion', 'fingerprint'].includes(key)),
    );
  }
  return {
    ownerDomain: source.ownerDomain,
    profileInput,
  };
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
    sourceInvariantFingerprint: fingerprintCombatValue(profileSourceInvariantPayload(source)),
    profile: derived.profile,
    provenance: derived.provenance,
  });
}

function validateActionPermit(input, {
  context, envelope, actor, target, dynamicsAuthority,
} = {}) {
  if (!exactKeys(input, ACTION_PERMIT_KEYS)
    || input.schemaVersion !== ACTION_PERMIT_SCHEMA
    || input.authority !== 'server'
    || ![input.permitId, input.principalId, input.sessionId, input.combatId,
      input.actorEntityId, input.targetEntityId, input.resourceCommitToken].every(nonEmptyString)) {
    return result(false, 'invalid_action_permit');
  }
  const actionValidation = createCombatActionDefinition(input.action);
  if (!actionValidation.ok) return result(false, 'invalid_action_permit_action', { cause: actionValidation });
  for (const field of [
    'nextActionSequence', 'actorStateVersion', 'actorStateVersionAfter',
    'resourceStateVersion', 'resourceStateVersionAfter', 'entitlementStateVersion',
    'sequenceStateVersion', 'sequenceStateVersionAfter',
  ]) {
    if (!safeVersion(input[field], {
      incremented: ['resourceStateVersion', 'sequenceStateVersion'].includes(field),
    })) {
      return result(false, 'invalid_action_permit_version', { field });
    }
  }
  if (input.actorStateVersionAfter !== input.actorStateVersion
    || input.resourceStateVersionAfter !== input.resourceStateVersion + 1
    || input.sequenceStateVersionAfter !== input.sequenceStateVersion + 1) {
    return result(false, 'invalid_action_permit_transition');
  }
  const action = actionValidation.action;
  let actionStatProjection = null;
  if (input.actionStatProjection !== null) {
    const expectedSourceStat = action.channel === 'physical' ? 'atk' : 'spAtk';
    const projectionValidation = validateCombatActionStatProjection(input.actionStatProjection, {
      profile: actor,
      action,
      expectedSourceStat,
    });
    if (!projectionValidation.ok) {
      return result(false, 'invalid_action_permit_stat_projection', { cause: projectionValidation });
    }
    actionStatProjection = projectionValidation.projection;
  }
  if (action.hitCount !== 1) {
    return result(false, 'action_dynamics_resolution_unsupported');
  }
  const dynamicsValidation = validateCombatServerDynamicsPermit(input.dynamicsPermit, {
    combatId: input.combatId,
    actionSequence: input.nextActionSequence,
    actorEntityId: input.actorEntityId,
    targetEntityId: input.targetEntityId,
    actionId: action.actionId,
    actionFingerprint: action.fingerprint,
    resourceReservationToken: input.resourceCommitToken,
    actionDynamicsBindingFingerprint: dynamicsAuthority.actionDynamicsBindingFingerprint,
    sourceProvenanceFingerprint: dynamicsAuthority.sourceProvenanceFingerprint,
    currentCombatTick: dynamicsAuthority.currentCombatTick,
    dynamicsStateVersion: dynamicsAuthority.dynamicsStateVersion,
    actorOccupancyStateVersion: dynamicsAuthority.actorOccupancyStateVersion,
    actorOccupancyLeaseId: dynamicsAuthority.actorOccupancyLeaseId,
    occupiedUntilCombatTick: dynamicsAuthority.occupiedUntilCombatTick,
  });
  if (!dynamicsValidation.ok) {
    return result(false, 'invalid_action_permit_dynamics', { cause: dynamicsValidation });
  }
  const dynamicsPermit = dynamicsValidation.permit;
  const payload = {
    schemaVersion: ACTION_PERMIT_SCHEMA,
    authority: 'server',
    permitId: input.permitId,
    principalId: input.principalId,
    sessionId: input.sessionId,
    combatId: input.combatId,
    actorEntityId: input.actorEntityId,
    targetEntityId: input.targetEntityId,
    nextActionSequence: input.nextActionSequence,
    action,
    actionStatProjection,
    dynamicsPermit,
    actorStateVersion: input.actorStateVersion,
    actorStateVersionAfter: input.actorStateVersionAfter,
    resourceStateVersion: input.resourceStateVersion,
    resourceStateVersionAfter: input.resourceStateVersionAfter,
    entitlementStateVersion: input.entitlementStateVersion,
    sequenceStateVersion: input.sequenceStateVersion,
    sequenceStateVersionAfter: input.sequenceStateVersionAfter,
    resourceCommitToken: input.resourceCommitToken,
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== fingerprint) return result(false, 'action_permit_fingerprint_mismatch');
  if (input.principalId !== context.principalId || input.sessionId !== context.sessionId
    || input.combatId !== envelope.combatId
    || input.actorEntityId !== actor.entityId || input.targetEntityId !== target.entityId
    || input.nextActionSequence !== envelope.actionSequence
    || input.actorStateVersion !== actor.stateVersion
    || action.actionId !== envelope.actionId
    || action.definitionVersion !== envelope.actionDefinitionVersion
    || action.fingerprint !== envelope.actionFingerprint) {
    return result(false, 'action_permit_binding_mismatch');
  }
  return result(true, null, { permit: Object.freeze({ ...payload, fingerprint }) });
}

function validateRngTicket(input, { envelope, action, snapshot } = {}) {
  if (!exactKeys(input, RNG_TICKET_KEYS)
    || input.schemaVersion !== RNG_TICKET_SCHEMA || input.authority !== 'server'
    || ![input.ticketId, input.rngVersion, input.seed, input.combatId,
      input.actorEntityId, input.targetEntityId, input.actionId].every(nonEmptyString)
    || !Number.isInteger(input.actionSequence) || input.actionSequence < 0
    || !Number.isInteger(input.stateVersion) || input.stateVersion < 0
    || !Number.isInteger(input.expiresAtWorldTick) || input.expiresAtWorldTick < 0) {
    return result(false, 'invalid_rng_ticket');
  }
  const payload = {
    schemaVersion: RNG_TICKET_SCHEMA,
    authority: 'server',
    ticketId: input.ticketId,
    rngVersion: input.rngVersion,
    seed: input.seed,
    combatId: input.combatId,
    actorEntityId: input.actorEntityId,
    targetEntityId: input.targetEntityId,
    actionId: input.actionId,
    actionSequence: input.actionSequence,
    stateVersion: input.stateVersion,
    expiresAtWorldTick: input.expiresAtWorldTick,
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== fingerprint) return result(false, 'rng_ticket_fingerprint_mismatch');
  if (input.rngVersion !== COMBAT_V91_RNG_VERSION
    || input.ticketId !== envelope.rngTicketId
    || input.stateVersion !== envelope.rngTicketStateVersion
    || input.combatId !== envelope.combatId
    || input.actorEntityId !== envelope.actorEntityId
    || input.targetEntityId !== envelope.targetEntityId
    || input.actionId !== action.actionId
    || input.actionSequence !== envelope.actionSequence
    || input.expiresAtWorldTick < snapshot.worldSnapshotTick
    || snapshot.rngVersion !== input.rngVersion
    || snapshot.rngSeed !== input.seed
    || snapshot.rngTicketId !== input.ticketId
    || snapshot.rngTicketStateVersion !== input.stateVersion
    || snapshot.rngExpiresAtWorldTick !== input.expiresAtWorldTick) {
    return result(false, 'rng_ticket_binding_mismatch');
  }
  return result(true, null, { ticket: Object.freeze({ ...payload, fingerprint }) });
}

function authoritativeInputMismatch(envelope, actor, target, action, snapshot, actorStatus, targetStatus) {
  if (actor.entityId !== envelope.actorEntityId || target.entityId !== envelope.targetEntityId) return 'ENTITY_MISMATCH';
  if (actor.stateVersion !== envelope.actorStateVersion || target.stateVersion !== envelope.targetStateVersion) {
    return 'STALE_PROFILE_VERSION';
  }
  if (actor.fingerprint !== envelope.actorProfileFingerprint
    || target.fingerprint !== envelope.targetProfileFingerprint) return 'STALE_PROFILE_FINGERPRINT';
  if (action.actionId !== envelope.actionId
    || action.definitionVersion !== envelope.actionDefinitionVersion
    || action.fingerprint !== envelope.actionFingerprint) return 'ACTION_VERSION_MISMATCH';
  if (snapshot.worldSnapshotTick !== envelope.worldSnapshotTick
    || snapshot.fingerprint !== envelope.worldSnapshotFingerprint) return 'STALE_WORLD_SNAPSHOT';
  if (snapshot.actorEntityId !== actor.entityId || snapshot.targetEntityId !== target.entityId) return 'WORLD_ENTITY_MISMATCH';
  if (snapshot.rngVersion !== envelope.rngVersion
    || snapshot.rngTicketId !== envelope.rngTicketId
    || snapshot.rngTicketStateVersion !== envelope.rngTicketStateVersion) return 'RNG_TICKET_MISMATCH';
  if (actorStatus.statusStateVersion !== envelope.actorStatusStateVersion
    || targetStatus.statusStateVersion !== envelope.targetStatusStateVersion) return 'STALE_STATUS_VERSION';
  if (actorStatus.fingerprint !== envelope.actorStatusFingerprint
    || targetStatus.fingerprint !== envelope.targetStatusFingerprint) return 'STALE_STATUS_FINGERPRINT';
  return null;
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

function validateStatusSnapshotSet(inputs, { combatId, actor, target, expectedByEntity } = {}) {
  if (!Array.isArray(inputs) || inputs.length !== 2) return result(false, 'invalid_committed_status_snapshots');
  const canonical = [];
  const seen = new Set();
  for (const input of inputs) {
    const owner = input?.entityId === actor.entityId ? actor.ownerDomain
      : input?.entityId === target.entityId ? target.ownerDomain
        : undefined;
    const validated = validateCombatStatusSnapshot(input, {
      combatId,
      entityId: input?.entityId,
      ownerDomain: owner,
    });
    if (!validated.ok || owner === undefined || seen.has(validated.snapshot.entityId)) {
      return result(false, 'invalid_committed_status_snapshots', { cause: validated });
    }
    const expected = expectedByEntity?.get(validated.snapshot.entityId);
    if (expected && (validated.snapshot.statusStateVersion !== expected.statusStateVersion
      || validated.snapshot.fingerprint !== expected.fingerprint)) {
      return result(false, 'committed_status_snapshot_mismatch');
    }
    seen.add(validated.snapshot.entityId);
    canonical.push(validated.snapshot);
  }
  if (!seen.has(actor.entityId) || !seen.has(target.entityId)) {
    return result(false, 'missing_committed_status_snapshot');
  }
  return result(true, null, {
    snapshots: Object.freeze([
      canonical.find(snapshot => snapshot.entityId === actor.entityId),
      canonical.find(snapshot => snapshot.entityId === target.entityId),
    ]),
  });
}

function validateExecutionReceipt(receipt, { actor, permit, envelope, ticket } = {}) {
  const dynamicsPermit = permit.dynamicsPermit;
  if (!exactKeys(receipt, EXECUTION_RECEIPT_KEYS)
    || receipt.actorEntityId !== actor.entityId
    || receipt.actorStateVersionBefore !== permit.actorStateVersion
    || receipt.actorStateVersionAfter !== permit.actorStateVersionAfter
    || receipt.resourceStateVersionBefore !== permit.resourceStateVersion
    || receipt.resourceStateVersionAfter !== permit.resourceStateVersionAfter
    || receipt.sequenceStateVersionBefore !== permit.sequenceStateVersion
    || receipt.sequenceStateVersionAfter !== permit.sequenceStateVersionAfter
    || receipt.committedActionSequence !== envelope.actionSequence
    || receipt.rngTicketId !== ticket.ticketId
    || receipt.rngTicketStateVersionBefore !== ticket.stateVersion
    || receipt.rngTicketStateVersionAfter !== ticket.stateVersion + 1
    || receipt.dynamicsStateVersionBefore !== dynamicsPermit.dynamicsStateVersion
    || receipt.dynamicsStateVersionAfter !== dynamicsPermit.dynamicsStateVersionAfter
    || receipt.actorOccupancyStateVersionBefore !== dynamicsPermit.actorOccupancyStateVersion
    || receipt.actorOccupancyStateVersionAfter !== dynamicsPermit.actorOccupancyStateVersionAfter
    || receipt.dynamicsPermitFingerprint !== dynamicsPermit.fingerprint
    || fingerprintCombatValue(receipt.authoritativeDynamicsEffectReceipt)
      !== fingerprintCombatValue(dynamicsPermit.authoritativeEffectReceipt)) {
    return result(false, 'invalid_execution_receipt');
  }
  return result(true, null, { receipt: Object.freeze({ ...receipt }) });
}

function validateCommittedReceipt(receipt, {
  envelope,
  actor,
  target,
  permit,
  ticket,
  proposal,
  actorStatus,
  targetStatus,
  targetSourceInvariantFingerprint,
} = {}) {
  if (!exactKeys(receipt, COMMITTED_RECEIPT_KEYS) || receipt.committed !== true
    || !nonEmptyString(receipt.commitId)
    || typeof receipt.defeated !== 'boolean' || typeof receipt.fainted !== 'boolean') {
    return result(false, 'invalid_atomic_commit_receipt');
  }
  const committedTarget = deriveProfileSource(receipt.authoritativeTargetSource, {
    entityId: target.entityId,
  });
  if (!committedTarget.ok) return result(false, 'invalid_committed_profile_source', { cause: committedTarget });
  const profile = committedTarget.profile;
  if (committedTarget.sourceInvariantFingerprint !== targetSourceInvariantFingerprint
    || fingerprintCombatValue(profileBasePayload(profile)) !== fingerprintCombatValue(profileBasePayload(target))
    || profile.stats.hpCurrent !== proposal.predictedHp
    || profile.stateVersion !== proposal.targetStateVersionAfter) {
    return result(false, 'committed_profile_invariant_mismatch');
  }
  const expectedStatuses = new Map(proposal.predictedStatusSnapshots
    .map(snapshot => [snapshot.entityId, snapshot]));
  const statuses = validateStatusSnapshotSet(receipt.authoritativeStatusSnapshots, {
    combatId: envelope.combatId,
    actor,
    target,
    expectedByEntity: expectedStatuses,
  });
  if (!statuses.ok) return statuses;
  if (!Array.isArray(receipt.statusApplied)
    || fingerprintCombatValue(receipt.statusApplied) !== fingerprintCombatValue(proposal.predictedStatusApplied)) {
    return result(false, 'committed_status_projection_mismatch');
  }
  const beforeStatuses = new Map([
    [actor.entityId, actorStatus],
    [target.entityId, targetStatus],
  ]);
  for (const transition of proposal.predictedStatusTransitions) {
    const before = beforeStatuses.get(transition.entityId);
    const after = statuses.snapshots.find(snapshot => snapshot.entityId === transition.entityId);
    if (!before || !after
      || transition.statusStateVersionBefore !== before.statusStateVersion
      || transition.statusFingerprintBefore !== before.fingerprint
      || transition.statusStateVersionAfter !== after.statusStateVersion
      || transition.statusFingerprintAfter !== after.fingerprint) {
      return result(false, 'committed_status_transition_mismatch');
    }
  }
  const execution = validateExecutionReceipt(receipt.executionReceipt, {
    actor,
    permit,
    envelope,
    ticket,
  });
  if (!execution.ok) return execution;
  const hpZero = profile.stats.hpCurrent === 0;
  const expectedFainted = hpZero && profile.entityKind === 'Monster';
  const expectedDefeated = hpZero && profile.entityKind !== 'Monster';
  if (receipt.defeated !== expectedDefeated || receipt.fainted !== expectedFainted) {
    return result(false, 'invalid_defeat_commit');
  }

  const commitPayload = {
    schemaVersion: 'combat-commit-projection/v9.1',
    combatId: envelope.combatId,
    actionSequence: envelope.actionSequence,
    actorEntityId: actor.entityId,
    targetEntityId: target.entityId,
    hpBefore: target.stats.hpCurrent,
    hpAfter: profile.stats.hpCurrent,
    targetStateVersionBefore: target.stateVersion,
    targetStateVersionAfter: profile.stateVersion,
    statusSnapshots: statuses.snapshots.map(snapshot => ({
      entityId: snapshot.entityId,
      statusStateVersion: snapshot.statusStateVersion,
      fingerprint: snapshot.fingerprint,
    })),
    statusApplied: receipt.statusApplied,
  };
  const authoritativeCommitFingerprint = fingerprintCombatValue(commitPayload);
  if (authoritativeCommitFingerprint !== proposal.predictedCommitFingerprint) {
    return result(false, 'authoritative_commit_fingerprint_mismatch');
  }
  return result(true, null, {
    commitId: receipt.commitId,
    profile,
    statuses: statuses.snapshots,
    statusApplied: Object.freeze(receipt.statusApplied.map(status => Object.freeze({ ...status }))),
    statusTransitions: proposal.predictedStatusTransitions,
    defeated: receipt.defeated,
    fainted: receipt.fainted,
    executionReceipt: execution.receipt,
    authoritativeCommitFingerprint,
  });
}

function canonicalResyncProfiles(sources = []) {
  if (!Array.isArray(sources)) return result(false, 'invalid_rejection_resync_sources');
  const profiles = [];
  const seen = new Set();
  for (const source of sources) {
    const derived = deriveProfileSource(source);
    if (!derived.ok || seen.has(derived.profile.entityId)) {
      return result(false, 'invalid_rejection_resync_sources', { cause: derived });
    }
    seen.add(derived.profile.entityId);
    profiles.push(derived.profile);
  }
  return result(true, null, { profiles: Object.freeze(profiles) });
}

function createRejectionResponse(envelope, reason, {
  resyncProfileSources = [],
  authoritativeStatusSnapshots = [],
} = {}) {
  const profiles = canonicalResyncProfiles(resyncProfileSources);
  if (!profiles.ok) return profiles;
  const created = createCombatAuthorityResponse({
    intentId: envelope.intentId,
    combatId: envelope.combatId,
    actionSequence: envelope.actionSequence,
    actorEntityId: envelope.actorEntityId,
    targetEntityId: envelope.targetEntityId,
    actionId: envelope.actionId,
    actionDefinitionVersion: envelope.actionDefinitionVersion,
    status: 'rejected',
    reason,
    requestEnvelopeFingerprint: envelope.envelopeFingerprint,
    clientPredictedResultFingerprint: envelope.predictedResultFingerprint,
    clientPredictedCommitFingerprint: envelope.predictedCommitFingerprint,
    resyncProfiles: profiles.profiles,
    authoritativeStatusSnapshots,
  });
  if (!created.ok) return result(false, 'rejection_contract_failure', { cause: created });
  return result(true, null, { response: created.response });
}

function idempotencyIdentity(context, envelope) {
  return Object.freeze({
    scope: context.idempotencyScope,
    combatId: envelope.combatId,
    intentId: envelope.intentId,
    requestEnvelopeFingerprint: envelope.envelopeFingerprint,
  });
}

function validateResponseIdentity(response, envelope) {
  return response.requestEnvelopeFingerprint === envelope.envelopeFingerprint
    && response.intentId === envelope.intentId
    && response.combatId === envelope.combatId
    && response.actionSequence === envelope.actionSequence
    && response.actorEntityId === envelope.actorEntityId
    && response.targetEntityId === envelope.targetEntityId
    && response.actionId === envelope.actionId
    && response.actionDefinitionVersion === envelope.actionDefinitionVersion;
}

async function settleAtomic(command, finalize, transactCombatIntent, envelope) {
  if (typeof transactCombatIntent !== 'function') return result(false, 'missing_atomic_combat_transaction');
  let settled;
  try {
    settled = await transactCombatIntent(Object.freeze(command), finalize);
  } catch (error) {
    return result(false, 'atomic_combat_transaction_failed', { error });
  }
  if (!isRecord(settled) || settled.atomic !== true
    || !TRANSACTION_DISPOSITIONS.has(settled.disposition)
    || !exactKeys(settled, ['atomic', 'disposition', 'response'])) {
    return result(false, 'invalid_atomic_transaction_result');
  }
  const response = validateCombatAuthorityResponse(settled.response);
  if (!response.ok || !validateResponseIdentity(response.response, envelope)) {
    return result(false, 'invalid_atomic_terminal_response', { cause: response });
  }
  if ((settled.disposition === 'committed' && !response.response.committed)
    || (settled.disposition === 'rejected' && response.response.status !== 'rejected')) {
    return result(false, 'atomic_disposition_mismatch');
  }
  const replay = settled.disposition === 'replayed';
  const reason = replay
    ? 'IDEMPOTENT_REPLAY'
    : response.response.status === 'rejected'
      ? response.response.reason
      : response.response.status;
  return result(true, reason, { response: response.response, replay });
}

async function settleRejection({
  context,
  envelope,
  reason,
  transactCombatIntent,
  resyncProfileSources = [],
  authoritativeStatusSnapshots = [],
} = {}) {
  const rejectionReceipt = Object.freeze({
    committed: false,
    reason,
    resyncProfileSources,
    authoritativeStatusSnapshots,
  });
  const command = {
    schemaVersion: TRANSACTION_SCHEMA,
    authority: 'server',
    mode: 'reject',
    idempotency: idempotencyIdentity(context, envelope),
    rejectionReceipt,
  };
  return settleAtomic(command, receipt => {
    if (!exactKeys(receipt, REJECTION_RECEIPT_KEYS) || receipt.committed !== false
      || !nonEmptyString(receipt.reason)) throw contractError('invalid_atomic_rejection_receipt');
    const created = createRejectionResponse(envelope, receipt.reason, receipt);
    if (!created.ok) throw contractError(created.reason, created.cause);
    return created.response;
  }, transactCombatIntent, envelope);
}

/**
 * Transport-neutral V3 authority boundary. All irreversible writes are delegated
 * to transactCombatIntent, which must CAS every expected version, invoke finalize
 * before durability, and persist the returned terminal response in the same
 * transaction as HP/status/resource/sequence/RNG-ticket state.
 */
export async function executeCombatV91AuthorityV3({ envelope, authorityContext } = {}, {
  readTerminalResponse,
  loadProfileSource,
  authorizeAction,
  loadActionDynamicsAuthority,
  loadWorldSnapshot,
  loadStatusSnapshot,
  loadRngTicket,
  transactCombatIntent,
} = {}) {
  const contextValidation = validateAuthorityContext(authorityContext);
  if (!contextValidation.ok) return contextValidation;
  const context = contextValidation.context;
  const envelopeValidation = validateCombatPredictionEnvelope(envelope);
  if (!envelopeValidation.ok) return result(false, envelopeValidation.reason, { cause: envelopeValidation });
  envelope = envelopeValidation.envelope;

  const identity = idempotencyIdentity(context, envelope);
  const replayLookup = await loadDependency(readTerminalResponse, identity, 'terminal_response_read');
  if (!replayLookup.ok) return replayLookup;
  if (replayLookup.value != null) {
    const replay = validateCombatAuthorityResponse(replayLookup.value);
    if (!replay.ok || !validateResponseIdentity(replay.response, envelope)) {
      return result(false, 'IDEMPOTENCY_CONFLICT', { cause: replay });
    }
    return result(true, 'IDEMPOTENT_REPLAY', { response: replay.response, replay: true });
  }

  const [actorLoaded, targetLoaded] = await Promise.all([
    loadDependency(loadProfileSource, {
      authorityContext: context,
      combatId: envelope.combatId,
      entityId: envelope.actorEntityId,
      role: 'actor',
    }, 'actor_profile_source'),
    loadDependency(loadProfileSource, {
      authorityContext: context,
      combatId: envelope.combatId,
      entityId: envelope.targetEntityId,
      role: 'target',
    }, 'target_profile_source'),
  ]);
  if (!actorLoaded.ok) return actorLoaded;
  if (!targetLoaded.ok) return targetLoaded;
  const actorDerived = deriveProfileSource(actorLoaded.value, { entityId: envelope.actorEntityId });
  const targetDerived = deriveProfileSource(targetLoaded.value, { entityId: envelope.targetEntityId });
  if (!actorDerived.ok || !targetDerived.ok) {
    return settleRejection({
      context,
      envelope,
      reason: !actorDerived.ok ? `ACTOR_PROFILE_${actorDerived.reason.toUpperCase()}`
        : `TARGET_PROFILE_${targetDerived.reason.toUpperCase()}`,
      transactCombatIntent,
    });
  }
  const actor = actorDerived.profile;
  const target = targetDerived.profile;
  const profileSources = [actorDerived.source, targetDerived.source];

  const authorization = await loadDependency(authorizeAction, {
    authorityContext: context,
    combatId: envelope.combatId,
    actorProfile: actor,
    targetProfile: target,
    actionId: envelope.actionId,
    actionSequence: envelope.actionSequence,
    actionFingerprint: envelope.actionFingerprint,
    requestedWorldSnapshotTick: envelope.worldSnapshotTick,
  }, 'action_authorization');
  if (!authorization.ok) return authorization;
  if (!isRecord(authorization.value) || typeof authorization.value.authorized !== 'boolean') {
    return result(false, 'invalid_action_authorization');
  }
  if (!authorization.value.authorized) {
    if (!exactKeys(authorization.value, ['authorized', 'reason'])
      || !nonEmptyString(authorization.value.reason)) return result(false, 'invalid_action_authorization');
    return settleRejection({
      context,
      envelope,
      reason: authorization.value.reason,
      transactCombatIntent,
      resyncProfileSources: profileSources,
    });
  }
  if (!exactKeys(authorization.value, ['authorized', 'permit'])) {
    return result(false, 'invalid_action_authorization');
  }
  const dynamicsAuthorityLoaded = await loadDependency(loadActionDynamicsAuthority, {
    authorityContext: context,
    combatId: envelope.combatId,
    actionSequence: envelope.actionSequence,
    actorEntityId: actor.entityId,
    targetEntityId: target.entityId,
    actionId: envelope.actionId,
    actionFingerprint: envelope.actionFingerprint,
  }, 'action_dynamics_authority');
  if (!dynamicsAuthorityLoaded.ok) return dynamicsAuthorityLoaded;
  const dynamicsAuthorityValidation = validateDynamicsAuthoritySnapshot(
    dynamicsAuthorityLoaded.value,
    { envelope, actor, target },
  );
  if (!dynamicsAuthorityValidation.ok) {
    return settleRejection({
      context,
      envelope,
      reason: dynamicsAuthorityValidation.reason.toUpperCase(),
      transactCombatIntent,
      resyncProfileSources: profileSources,
    });
  }
  const dynamicsAuthority = dynamicsAuthorityValidation.snapshot;
  const permitValidation = validateActionPermit(authorization.value.permit, {
    context,
    envelope,
    actor,
    target,
    dynamicsAuthority,
  });
  if (!permitValidation.ok) {
    return settleRejection({
      context,
      envelope,
      reason: permitValidation.reason.toUpperCase(),
      transactCombatIntent,
      resyncProfileSources: profileSources,
    });
  }
  const permit = permitValidation.permit;
  const action = permit.action;

  const [worldLoaded, actorStatusLoaded, targetStatusLoaded, ticketLoaded] = await Promise.all([
    loadDependency(loadWorldSnapshot, {
      authorityContext: context,
      combatId: envelope.combatId,
      actorEntityId: actor.entityId,
      targetEntityId: target.entityId,
      action,
      permitId: permit.permitId,
      requestedTick: envelope.worldSnapshotTick,
      rngTicketId: envelope.rngTicketId,
    }, 'world_snapshot'),
    loadDependency(loadStatusSnapshot, {
      authorityContext: context,
      combatId: envelope.combatId,
      entityId: actor.entityId,
      ownerDomain: actor.ownerDomain,
    }, 'actor_status_snapshot'),
    loadDependency(loadStatusSnapshot, {
      authorityContext: context,
      combatId: envelope.combatId,
      entityId: target.entityId,
      ownerDomain: target.ownerDomain,
    }, 'target_status_snapshot'),
    loadDependency(loadRngTicket, {
      authorityContext: context,
      combatId: envelope.combatId,
      ticketId: envelope.rngTicketId,
      actorEntityId: actor.entityId,
      targetEntityId: target.entityId,
      actionId: action.actionId,
      actionSequence: envelope.actionSequence,
    }, 'rng_ticket'),
  ]);
  for (const loaded of [worldLoaded, actorStatusLoaded, targetStatusLoaded, ticketLoaded]) {
    if (!loaded.ok) return loaded;
  }
  const worldValidation = createWorldCombatSnapshot(worldLoaded.value);
  const actorStatusValidation = validateCombatStatusSnapshot(actorStatusLoaded.value, {
    combatId: envelope.combatId,
    entityId: actor.entityId,
    ownerDomain: actor.ownerDomain,
  });
  const targetStatusValidation = validateCombatStatusSnapshot(targetStatusLoaded.value, {
    combatId: envelope.combatId,
    entityId: target.entityId,
    ownerDomain: target.ownerDomain,
  });
  if (!worldValidation.ok) return result(false, 'invalid_authoritative_world', { cause: worldValidation });
  if (!actorStatusValidation.ok) return result(false, 'invalid_authoritative_actor_status', { cause: actorStatusValidation });
  if (!targetStatusValidation.ok) return result(false, 'invalid_authoritative_target_status', { cause: targetStatusValidation });
  const worldSnapshot = worldValidation.snapshot;
  const actorStatus = actorStatusValidation.snapshot;
  const targetStatus = targetStatusValidation.snapshot;
  const ticketValidation = validateRngTicket(ticketLoaded.value, {
    envelope,
    action,
    snapshot: worldSnapshot,
  });
  if (!ticketValidation.ok) {
    return settleRejection({
      context,
      envelope,
      reason: ticketValidation.reason.toUpperCase(),
      transactCombatIntent,
      resyncProfileSources: profileSources,
      authoritativeStatusSnapshots: [actorStatus, targetStatus],
    });
  }
  const ticket = ticketValidation.ticket;
  const mismatch = authoritativeInputMismatch(
    envelope,
    actor,
    target,
    action,
    worldSnapshot,
    actorStatus,
    targetStatus,
  );
  if (mismatch) {
    return settleRejection({
      context,
      envelope,
      reason: mismatch,
      transactCombatIntent,
      resyncProfileSources: profileSources,
      authoritativeStatusSnapshots: [actorStatus, targetStatus],
    });
  }

  const resolved = resolveCombatV91Proposal({
    combatId: envelope.combatId,
    actionSequence: envelope.actionSequence,
    attacker: actor,
    target,
    action,
    actionStatProjection: permit.actionStatProjection,
    worldSnapshot,
    attackerStatusSnapshot: actorStatus,
    targetStatusSnapshot: targetStatus,
  });
  if (!resolved.ok) {
    return settleRejection({
      context,
      envelope,
      reason: `RULES_${resolved.reason.toUpperCase()}`,
      transactCombatIntent,
      resyncProfileSources: profileSources,
      authoritativeStatusSnapshots: [actorStatus, targetStatus],
    });
  }
  const proposal = resolved.proposal;
  if (proposal.rngVersion !== envelope.rngVersion
    || proposal.rngTicketId !== envelope.rngTicketId
    || proposal.rngTicketStateVersion !== envelope.rngTicketStateVersion
    || proposal.rngStreamFingerprint !== envelope.rngStreamFingerprint) {
    return settleRejection({
      context,
      envelope,
      reason: 'RNG_STREAM_MISMATCH',
      transactCombatIntent,
      resyncProfileSources: profileSources,
      authoritativeStatusSnapshots: [actorStatus, targetStatus],
    });
  }

  const rejectionFallback = Object.freeze({
    committed: false,
    reason: 'ATOMIC_CAS_REJECTED',
    resyncProfileSources: profileSources,
    authoritativeStatusSnapshots: [actorStatus, targetStatus],
  });
  const command = {
    schemaVersion: TRANSACTION_SCHEMA,
    authority: 'server',
    mode: 'apply',
    idempotency: identity,
    expected: Object.freeze({
      actorProfileStateVersion: actor.stateVersion,
      targetProfileStateVersion: target.stateVersion,
      actorProfileSourceFingerprint: actorDerived.sourceFingerprint,
      targetProfileSourceFingerprint: targetDerived.sourceFingerprint,
      actorStatusStateVersion: actorStatus.statusStateVersion,
      targetStatusStateVersion: targetStatus.statusStateVersion,
      actorStatusFingerprint: actorStatus.fingerprint,
      targetStatusFingerprint: targetStatus.fingerprint,
      actionPermitFingerprint: permit.fingerprint,
      dynamicsPermitFingerprint: permit.dynamicsPermit.fingerprint,
      dynamicsAuthorityFingerprint: dynamicsAuthority.fingerprint,
      combatDynamicsStateVersion: permit.dynamicsPermit.dynamicsStateVersion,
      actorOccupancyStateVersion: permit.dynamicsPermit.actorOccupancyStateVersion,
      actorResourceStateVersion: permit.resourceStateVersion,
      actionEntitlementStateVersion: permit.entitlementStateVersion,
      combatSequenceStateVersion: permit.sequenceStateVersion,
      worldSnapshotFingerprint: worldSnapshot.fingerprint,
      rngTicketId: ticket.ticketId,
      rngTicketStateVersion: ticket.stateVersion,
    }),
    actorProfile: actor,
    targetProfile: target,
    actionPermit: permit,
    dynamicsAuthoritySnapshot: dynamicsAuthority,
    worldSnapshot,
    actorStatusSnapshot: actorStatus,
    targetStatusSnapshot: targetStatus,
    rngTicket: ticket,
    serverProposal: proposal,
    mutation: Object.freeze({
      targetHpBefore: target.stats.hpCurrent,
      targetHpAfter: proposal.predictedHp,
      targetStateVersionAfter: proposal.targetStateVersionAfter,
      authoritativeStatusSnapshots: proposal.predictedStatusSnapshots,
      statusApplied: proposal.predictedStatusApplied,
      resourceCommitToken: permit.resourceCommitToken,
      dynamicsStateVersionAfter: permit.dynamicsPermit.dynamicsStateVersionAfter,
      actorOccupancyStateVersionAfter: permit.dynamicsPermit.actorOccupancyStateVersionAfter,
      committedActionSequence: envelope.actionSequence,
    }),
    rejectionFallback,
  };

  return settleAtomic(command, receipt => {
    if (isRecord(receipt) && receipt.committed === false) {
      if (!exactKeys(receipt, REJECTION_RECEIPT_KEYS) || !nonEmptyString(receipt.reason)) {
        throw contractError('invalid_atomic_rejection_receipt');
      }
      const rejected = createRejectionResponse(envelope, receipt.reason, receipt);
      if (!rejected.ok) throw contractError(rejected.reason, rejected.cause);
      return rejected.response;
    }
    const committed = validateCommittedReceipt(receipt, {
      envelope,
      actor,
      target,
      permit,
      ticket,
      proposal,
      actorStatus,
      targetStatus,
      targetSourceInvariantFingerprint: targetDerived.sourceInvariantFingerprint,
    });
    if (!committed.ok) throw contractError(committed.reason, committed.cause);
    const outcome = createCombatAuthorityOutcome({
      combatId: envelope.combatId,
      intentId: envelope.intentId,
      actionSequence: envelope.actionSequence,
      attackerId: actor.entityId,
      targetId: target.entityId,
      sourceDomain: actor.ownerDomain,
      abilityId: action.actionId,
      damage: proposal.totalDamage,
      damageType: `${action.channel}:${action.element ?? 'Neutral'}`,
      statusApplied: committed.statusApplied,
      statusTransitions: committed.statusTransitions,
      hpBefore: target.stats.hpCurrent,
      hpAfter: committed.profile.stats.hpCurrent,
      defeated: committed.defeated,
      fainted: committed.fainted,
      stateVersionBefore: target.stateVersion,
      stateVersionAfter: committed.profile.stateVersion,
      commitId: committed.commitId,
      serverProposalFingerprint: proposal.predictedResultFingerprint,
      authoritativeCommitFingerprint: committed.authoritativeCommitFingerprint,
    });
    if (!outcome.ok) throw contractError('invalid_committed_outcome', outcome);
    const reconciliationStatus = proposal.predictedResultFingerprint === envelope.predictedResultFingerprint
      && committed.authoritativeCommitFingerprint === envelope.predictedCommitFingerprint
      ? 'confirmed'
      : 'corrected';
    const effectiveConfirmed = Object.fromEntries(COMBAT_STAT_KEYS.map(key => [
      key,
      key === 'hpCurrent' ? committed.profile.stats.hpCurrent : proposal.effectiveTargetStats[key],
    ]));
    const response = createCombatAuthorityResponse({
      intentId: envelope.intentId,
      combatId: envelope.combatId,
      actionSequence: envelope.actionSequence,
      actorEntityId: actor.entityId,
      targetEntityId: target.entityId,
      actionId: action.actionId,
      actionDefinitionVersion: action.definitionVersion,
      status: reconciliationStatus,
      requestEnvelopeFingerprint: envelope.envelopeFingerprint,
      clientPredictedResultFingerprint: envelope.predictedResultFingerprint,
      clientPredictedCommitFingerprint: envelope.predictedCommitFingerprint,
      serverProposalFingerprint: proposal.predictedResultFingerprint,
      authoritativeCommitFingerprint: committed.authoritativeCommitFingerprint,
      authoritativeProfile: committed.profile,
      resyncProfiles: [],
      effectiveConfirmed,
      authoritativeStatusSnapshots: committed.statuses,
      authoritativeOutcome: outcome.outcome,
      executionReceipt: committed.executionReceipt,
    });
    if (!response.ok) throw contractError('authority_response_contract_failure', response);
    return response.response;
  }, transactCombatIntent, envelope);
}

// V2 remains a compatibility alias while all new integration code pins V3.
export const executeCombatV91AuthorityV2 = executeCombatV91AuthorityV3;
export const executeCombatV91Authority = executeCombatV91AuthorityV3;
