import {
  COMBAT_STAT_KEYS,
  COMBAT_V91_RULES_VERSION,
  fingerprintCombatValue,
  validateCombatProfile,
  validateEffectiveCombatStats,
} from './combat-v91-contract.mjs';
import {
  validateCombatAuthorityResponse,
  validateCombatPredictionEnvelope,
} from './combat-v91-protocol.mjs';
import { validateCombatStatusSnapshot } from './combat-v91-status.mjs';

export {
  COMBAT_RECONCILIATION_STATUSES,
  COMBAT_V91_CALCULATION_VERSION,
  createCombatPredictionEnvelope,
  validateCombatPredictionEnvelope,
} from './combat-v91-protocol.mjs';

export const COMBAT_V91_CLIENT_STORE_VERSION = 'combat-v91-client-store/v1';

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneRecord(record) {
  return Object.fromEntries(Object.entries(record));
}

function canonicalEffectiveStats(stats) {
  return Object.freeze(Object.fromEntries(COMBAT_STAT_KEYS.map(key => [key, stats[key]])));
}

function overlayEffectiveStats(overlay, entityId) {
  if (overlay.actorEntityId === entityId) return overlay.effectiveActorStats;
  if (overlay.targetEntityId === entityId) return overlay.effectiveTargetStats;
  return null;
}

function displayFor(authoritativeBase, effectiveConfirmed, pendingOverlay, authoritativeStatusByEntity) {
  const display = {};
  for (const [entityId, profile] of Object.entries(authoritativeBase)) {
    const pending = Object.values(pendingOverlay)
      .filter(overlay => !overlay.superseded
        && (overlay.actorEntityId === entityId || overlay.targetEntityId === entityId))
      .sort((left, right) => left.actionSequence - right.actionSequence);
    const pendingDamage = pending.reduce((total, overlay) => total
      + (overlay.targetEntityId === entityId ? overlay.totalDamage : 0), 0);
    const confirmedEffective = effectiveConfirmed[entityId] ?? profile.stats;
    const latestEffectiveOverlay = pending[pending.length - 1] ?? null;
    const effective = latestEffectiveOverlay
      ? overlayEffectiveStats(latestEffectiveOverlay, entityId)
      : confirmedEffective;
    const pendingStatusSnapshots = pending
      .map(overlay => overlay.predictedStatusSnapshots.find(snapshot => snapshot.entityId === entityId))
      .filter(Boolean);
    display[entityId] = {
      entityId,
      base: profile.stats,
      confirmedEffective,
      effective,
      effectiveSource: latestEffectiveOverlay ? 'pending_world_status_projection' : 'server_confirmed',
      pending: {
        count: pending.length,
        damage: pendingDamage,
        intentIds: pending.map(overlay => overlay.intentId),
        effectiveIntentId: latestEffectiveOverlay?.intentId ?? null,
        proposedStatuses: pending.flatMap(overlay => overlay.proposedStatuses),
        statusSnapshots: pendingStatusSnapshots,
      },
      statusSnapshot: authoritativeStatusByEntity[entityId],
      stats: {
        ...effective,
        hpCurrent: Math.max(0, effective.hpCurrent - pendingDamage),
      },
    };
  }
  return display;
}

function makeState({
  combatId,
  authoritativeBase,
  effectiveConfirmed,
  pendingOverlay,
  settledByIntent,
  lastServerSequence,
  authoritativeStatusByEntity,
  lastServerSequenceByEntity,
}) {
  return deepFreeze({
    schemaVersion: COMBAT_V91_CLIENT_STORE_VERSION,
    combatId,
    authoritativeBase,
    effectiveConfirmed,
    pendingOverlay,
    displayProjection: displayFor(authoritativeBase, effectiveConfirmed, pendingOverlay, authoritativeStatusByEntity),
    settledByIntent,
    lastServerSequence,
    authoritativeStatusByEntity,
    lastServerSequenceByEntity,
  });
}

export function createCombatV91ClientState({ combatId, profiles = [], statusSnapshots = [] } = {}) {
  if (typeof combatId !== 'string' || combatId.length === 0
    || !Array.isArray(profiles) || !Array.isArray(statusSnapshots)) {
    return result(false, 'invalid_initial_state');
  }
  const authoritativeBase = {};
  const effectiveConfirmed = {};
  const authoritativeStatusByEntity = {};
  const lastServerSequenceByEntity = {};
  for (const profile of profiles) {
    const validation = validateCombatProfile(profile);
    if (!validation.ok) return result(false, 'invalid_initial_profile', { cause: validation });
    if (authoritativeBase[profile.entityId]) return result(false, 'duplicate_entity_id', { entityId: profile.entityId });
    authoritativeBase[profile.entityId] = validation.profile;
    effectiveConfirmed[profile.entityId] = validation.profile.stats;
    lastServerSequenceByEntity[profile.entityId] = Object.freeze({ profile: -1, status: -1 });
  }
  for (const input of statusSnapshots) {
    const validation = validateCombatStatusSnapshot(input, { combatId });
    if (!validation.ok || !authoritativeBase[validation.snapshot.entityId]
      || authoritativeStatusByEntity[validation.snapshot.entityId]) {
      return result(false, 'invalid_initial_status_snapshot', { cause: validation });
    }
    const profile = authoritativeBase[validation.snapshot.entityId];
    if (validation.snapshot.ownerDomain !== profile.ownerDomain) {
      return result(false, 'initial_status_owner_mismatch');
    }
    authoritativeStatusByEntity[validation.snapshot.entityId] = validation.snapshot;
  }
  if (Object.keys(authoritativeStatusByEntity).length !== Object.keys(authoritativeBase).length) {
    return result(false, 'missing_initial_status_snapshot');
  }
  return result(true, null, {
    state: makeState({
      combatId,
      authoritativeBase,
      effectiveConfirmed,
      pendingOverlay: {},
      settledByIntent: {},
      lastServerSequence: -1,
      authoritativeStatusByEntity,
      lastServerSequenceByEntity,
    }),
  });
}

export function enqueueCombatPrediction(state, { envelope, proposal } = {}) {
  if (!isRecord(state) || state.schemaVersion !== COMBAT_V91_CLIENT_STORE_VERSION) return result(false, 'invalid_state');
  const envelopeValidation = validateCombatPredictionEnvelope(envelope);
  if (!envelopeValidation.ok) return envelopeValidation;
  envelope = envelopeValidation.envelope;
  if (!isRecord(proposal) || proposal.schemaVersion !== 'combat-proposal/v9.1'
    || proposal.rulesVersion !== COMBAT_V91_RULES_VERSION
    || proposal.authority !== 'deterministic_proposal_only'
    || proposal.committed !== false
    || !Number.isFinite(proposal.totalDamage) || proposal.totalDamage < 0
    || !Array.isArray(proposal.proposedStatuses)
    || !Array.isArray(proposal.predictedStatusSnapshots)
    || proposal.predictedResultFingerprint !== envelope.predictedResultFingerprint
    || proposal.predictedCommitFingerprint !== envelope.predictedCommitFingerprint
    || proposal.combatId !== envelope.combatId
    || proposal.actionSequence !== envelope.actionSequence
    || proposal.actorEntityId !== envelope.actorEntityId
    || proposal.targetEntityId !== envelope.targetEntityId
    || proposal.actionId !== envelope.actionId
    || proposal.actionDefinitionVersion !== envelope.actionDefinitionVersion
    || proposal.actionFingerprint !== envelope.actionFingerprint
    || proposal.worldSnapshotTick !== envelope.worldSnapshotTick
    || proposal.worldSnapshotFingerprint !== envelope.worldSnapshotFingerprint
    || proposal.rngVersion !== envelope.rngVersion
    || proposal.rngTicketId !== envelope.rngTicketId
    || proposal.rngTicketStateVersion !== envelope.rngTicketStateVersion
    || proposal.rngStreamFingerprint !== envelope.rngStreamFingerprint
    || proposal.actorStateVersion !== envelope.actorStateVersion
    || proposal.targetStateVersion !== envelope.targetStateVersion
    || proposal.actorStatusStateVersion !== envelope.actorStatusStateVersion
    || proposal.targetStatusStateVersion !== envelope.targetStatusStateVersion
    || proposal.actorProfileFingerprint !== envelope.actorProfileFingerprint
    || proposal.targetProfileFingerprint !== envelope.targetProfileFingerprint
    || proposal.actorStatusFingerprint !== envelope.actorStatusFingerprint
    || proposal.targetStatusFingerprint !== envelope.targetStatusFingerprint) {
    return result(false, 'prediction_envelope_mismatch');
  }
  const { predictedResultFingerprint, ...proposalPayload } = proposal;
  if (fingerprintCombatValue(proposalPayload) !== predictedResultFingerprint) {
    return result(false, 'invalid_prediction_fingerprint');
  }
  if (state.combatId !== envelope.combatId) return result(false, 'combat_id_mismatch');
  if (state.pendingOverlay[envelope.intentId] || state.settledByIntent[envelope.intentId]) return result(false, 'duplicate_intent');
  const actor = state.authoritativeBase[envelope.actorEntityId];
  const target = state.authoritativeBase[envelope.targetEntityId];
  const actorStatus = state.authoritativeStatusByEntity[envelope.actorEntityId];
  const targetStatus = state.authoritativeStatusByEntity[envelope.targetEntityId];
  if (!actor || !target) return result(false, 'unknown_entity');
  const actorEffectiveValidation = validateEffectiveCombatStats(proposal.effectiveActorStats);
  const targetEffectiveValidation = validateEffectiveCombatStats(proposal.effectiveTargetStats);
  if (!actorEffectiveValidation.ok || !targetEffectiveValidation.ok
    || proposal.effectiveActorStats.hpMax !== actor.stats.hpMax
    || proposal.effectiveActorStats.hpCurrent !== actor.stats.hpCurrent
    || proposal.effectiveTargetStats.hpMax !== target.stats.hpMax
    || proposal.effectiveTargetStats.hpCurrent !== target.stats.hpCurrent) {
    return result(false, 'invalid_prediction_effective_stats', {
      actorCause: actorEffectiveValidation,
      targetCause: targetEffectiveValidation,
    });
  }
  if (actor.fingerprint !== envelope.actorProfileFingerprint
    || target.fingerprint !== envelope.targetProfileFingerprint
    || actor.stateVersion !== envelope.actorStateVersion
    || target.stateVersion !== envelope.targetStateVersion) return result(false, 'stale_prediction_profile');
  if (!actorStatus || !targetStatus
    || actorStatus.fingerprint !== envelope.actorStatusFingerprint
    || targetStatus.fingerprint !== envelope.targetStatusFingerprint
    || actorStatus.statusStateVersion !== envelope.actorStatusStateVersion
    || targetStatus.statusStateVersion !== envelope.targetStatusStateVersion) {
    return result(false, 'stale_prediction_status');
  }
  const predictedStatuses = {};
  for (const input of proposal.predictedStatusSnapshots) {
    const validation = validateCombatStatusSnapshot(input, { combatId: state.combatId });
    if (!validation.ok || predictedStatuses[validation.snapshot.entityId]) {
      return result(false, 'invalid_predicted_status_snapshot');
    }
    predictedStatuses[validation.snapshot.entityId] = validation.snapshot;
  }
  if (!predictedStatuses[actor.entityId] || !predictedStatuses[target.entityId]
    || Object.keys(predictedStatuses).length !== 2) return result(false, 'invalid_predicted_status_snapshot');
  const highestPendingSequence = Object.values(state.pendingOverlay)
    .reduce((maximum, overlay) => Math.max(maximum, overlay.actionSequence), state.lastServerSequence);
  if (envelope.actionSequence <= highestPendingSequence) return result(false, 'non_monotonic_action_sequence');
  const pendingOverlay = cloneRecord(state.pendingOverlay);
  pendingOverlay[envelope.intentId] = {
    intentId: envelope.intentId,
    combatId: envelope.combatId,
    actionSequence: envelope.actionSequence,
    actorEntityId: envelope.actorEntityId,
    targetEntityId: envelope.targetEntityId,
    actionId: envelope.actionId,
    actionDefinitionVersion: envelope.actionDefinitionVersion,
    actorOwnerDomain: actor.ownerDomain,
    targetOwnerDomain: target.ownerDomain,
    actorStateVersion: envelope.actorStateVersion,
    targetStateVersion: envelope.targetStateVersion,
    targetHpBefore: target.stats.hpCurrent,
    targetCombatIdentityFingerprint: profileCombatIdentityFingerprint(target),
    actorStatusStateVersion: envelope.actorStatusStateVersion,
    targetStatusStateVersion: envelope.targetStatusStateVersion,
    actorProfileFingerprint: envelope.actorProfileFingerprint,
    targetProfileFingerprint: envelope.targetProfileFingerprint,
    actorStatusFingerprint: envelope.actorStatusFingerprint,
    targetStatusFingerprint: envelope.targetStatusFingerprint,
    rngTicketId: envelope.rngTicketId,
    rngTicketStateVersion: envelope.rngTicketStateVersion,
    effectiveActorStats: canonicalEffectiveStats(proposal.effectiveActorStats),
    effectiveTargetStats: canonicalEffectiveStats(proposal.effectiveTargetStats),
    totalDamage: proposal.totalDamage,
    proposedStatuses: proposal.proposedStatuses,
    predictedStatusSnapshots: proposal.predictedStatusSnapshots,
    predictedResultFingerprint: proposal.predictedResultFingerprint,
    predictedCommitFingerprint: proposal.predictedCommitFingerprint,
    envelopeFingerprint: envelope.envelopeFingerprint,
    superseded: false,
  };
  return result(true, null, {
    state: makeState({ ...state, pendingOverlay }),
  });
}

function componentDisposition(current, incoming, lastSequence, actionSequence, versionField) {
  if (!current) return 'conflict';
  if (actionSequence < lastSequence || incoming[versionField] < current[versionField]) return 'stale';
  if (incoming[versionField] === current[versionField] && incoming.fingerprint !== current.fingerprint) {
    return 'conflict';
  }
  return 'apply';
}

function setComponentSequence(sequenceByEntity, entityId, component, actionSequence) {
  const current = sequenceByEntity[entityId] ?? { profile: -1, status: -1 };
  sequenceByEntity[entityId] = Object.freeze({
    ...current,
    [component]: Math.max(current[component] ?? -1, actionSequence),
  });
}

function profileCombatIdentityMatches(before, after) {
  if (!before || !after) return false;
  for (const field of [
    'schemaVersion', 'entityId', 'ownerDomain', 'entityKind', 'level',
    'progressionStateVersion', 'calculationVersion', 'definitionVersion',
  ]) if (before[field] !== after[field]) return false;
  if (fingerprintCombatValue(before.types) !== fingerprintCombatValue(after.types)) return false;
  return COMBAT_STAT_KEYS.every(key => key === 'hpCurrent' || before.stats[key] === after.stats[key]);
}

function profileCombatIdentityFingerprint(profile) {
  return fingerprintCombatValue({
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
  });
}

function supersedeInvalidPending({
  pendingOverlay,
  authoritativeBase,
  authoritativeStatusByEntity,
  responseFingerprint,
}) {
  for (const [intentId, overlay] of Object.entries(pendingOverlay)) {
    const actor = authoritativeBase[overlay.actorEntityId];
    const target = authoritativeBase[overlay.targetEntityId];
    const actorStatus = authoritativeStatusByEntity[overlay.actorEntityId];
    const targetStatus = authoritativeStatusByEntity[overlay.targetEntityId];
    if (actor?.fingerprint === overlay.actorProfileFingerprint
      && target?.fingerprint === overlay.targetProfileFingerprint
      && actorStatus?.fingerprint === overlay.actorStatusFingerprint
      && targetStatus?.fingerprint === overlay.targetStatusFingerprint) continue;
    pendingOverlay[intentId] = Object.freeze({
      ...overlay,
      superseded: true,
      supersededByResponseFingerprint: responseFingerprint,
    });
  }
}

function acceptedResponseBindingError(response, pending) {
  const outcome = response.authoritativeOutcome;
  const receipt = response.executionReceipt;
  if (outcome.stateVersionBefore !== pending.targetStateVersion
    || outcome.hpBefore !== pending.targetHpBefore
    || outcome.sourceDomain !== pending.actorOwnerDomain
    || profileCombatIdentityFingerprint(response.authoritativeProfile)
      !== pending.targetCombatIdentityFingerprint) return 'authoritative_commit_binding_mismatch';
  if (receipt.actorStateVersionBefore !== pending.actorStateVersion
    || receipt.rngTicketId !== pending.rngTicketId
    || receipt.rngTicketStateVersionBefore !== pending.rngTicketStateVersion) {
    return 'execution_receipt_binding_mismatch';
  }
  const expectedStatuses = new Map([
    [pending.actorEntityId, {
      ownerDomain: pending.actorOwnerDomain,
      stateVersion: pending.actorStatusStateVersion,
      fingerprint: pending.actorStatusFingerprint,
    }],
    [pending.targetEntityId, {
      ownerDomain: pending.targetOwnerDomain,
      stateVersion: pending.targetStatusStateVersion,
      fingerprint: pending.targetStatusFingerprint,
    }],
  ]);
  for (const transition of outcome.statusTransitions) {
    const expected = expectedStatuses.get(transition.entityId);
    if (!expected || transition.ownerDomain !== expected.ownerDomain
      || transition.statusStateVersionBefore !== expected.stateVersion
      || transition.statusFingerprintBefore !== expected.fingerprint) {
      return 'status_transition_binding_mismatch';
    }
  }
  for (const snapshot of response.authoritativeStatusSnapshots) {
    const expected = expectedStatuses.get(snapshot.entityId);
    if (!expected || snapshot.ownerDomain !== expected.ownerDomain) {
      return 'authoritative_status_owner_mismatch';
    }
  }
  return null;
}

export function reconcileCombatPrediction(state, response = {}) {
  if (!isRecord(state) || state.schemaVersion !== COMBAT_V91_CLIENT_STORE_VERSION) return result(false, 'invalid_state');
  const responseValidation = validateCombatAuthorityResponse(response);
  if (!responseValidation.ok) return result(false, 'invalid_response', { state, cause: responseValidation });
  response = responseValidation.response;
  const settled = state.settledByIntent[response.intentId];
  if (settled) {
    if (settled.actionSequence === response.actionSequence
      && settled.status === response.status
      && settled.responseFingerprint === response.responseFingerprint) {
      return result(true, 'already_settled', { state, response });
    }
    return result(false, 'settled_response_mismatch', { state });
  }
  const pending = state.pendingOverlay[response.intentId];
  if (!pending) return result(false, 'unknown_intent', { state });
  if (response.combatId !== state.combatId || response.combatId !== pending.combatId
    || response.actionSequence !== pending.actionSequence
    || response.actorEntityId !== pending.actorEntityId
    || response.targetEntityId !== pending.targetEntityId
    || response.actionId !== pending.actionId
    || response.actionDefinitionVersion !== pending.actionDefinitionVersion
    || response.requestEnvelopeFingerprint !== pending.envelopeFingerprint
    || response.clientPredictedResultFingerprint !== pending.predictedResultFingerprint
    || response.clientPredictedCommitFingerprint !== pending.predictedCommitFingerprint) {
    return result(false, 'response_identity_mismatch', { state });
  }
  if (response.status !== 'rejected') {
    const bindingError = acceptedResponseBindingError(response, pending);
    if (bindingError) return result(false, bindingError, { state });
  }
  const pendingOverlay = cloneRecord(state.pendingOverlay);
  delete pendingOverlay[pending.intentId];
  const authoritativeBase = cloneRecord(state.authoritativeBase);
  const effectiveConfirmed = cloneRecord(state.effectiveConfirmed);
  const authoritativeStatusByEntity = cloneRecord(state.authoritativeStatusByEntity);
  const lastServerSequenceByEntity = cloneRecord(state.lastServerSequenceByEntity);
  const settledByIntent = cloneRecord(state.settledByIntent);
  settledByIntent[pending.intentId] = {
    intentId: pending.intentId,
    actionSequence: pending.actionSequence,
    status: response.status,
    reason: response.status === 'rejected' ? response.reason : null,
    responseFingerprint: response.responseFingerprint,
  };

  if (response.status === 'rejected') {
    for (const profile of response.resyncProfiles) {
      const current = authoritativeBase[profile.entityId];
      const last = lastServerSequenceByEntity[profile.entityId]?.profile ?? -1;
      const disposition = componentDisposition(current, profile, last, response.actionSequence, 'stateVersion');
      if (disposition === 'conflict') return result(false, 'resync_profile_conflict', { state });
      if (disposition === 'apply') {
        authoritativeBase[profile.entityId] = profile;
        effectiveConfirmed[profile.entityId] = profile.stats;
        setComponentSequence(lastServerSequenceByEntity, profile.entityId, 'profile', response.actionSequence);
      }
    }
    for (const snapshot of response.authoritativeStatusSnapshots) {
      const current = authoritativeStatusByEntity[snapshot.entityId];
      const profile = authoritativeBase[snapshot.entityId];
      if (!profile || snapshot.ownerDomain !== profile.ownerDomain) {
        return result(false, 'resync_status_owner_mismatch', { state });
      }
      const last = lastServerSequenceByEntity[snapshot.entityId]?.status ?? -1;
      const disposition = componentDisposition(current, snapshot, last, response.actionSequence, 'statusStateVersion');
      if (disposition === 'conflict') return result(false, 'resync_status_conflict', { state });
      if (disposition === 'apply') {
        authoritativeStatusByEntity[snapshot.entityId] = snapshot;
        setComponentSequence(lastServerSequenceByEntity, snapshot.entityId, 'status', response.actionSequence);
      }
    }
    supersedeInvalidPending({
      pendingOverlay, authoritativeBase, authoritativeStatusByEntity,
      responseFingerprint: response.responseFingerprint,
    });
    return result(true, 'server_rejected', {
      state: makeState({
        ...state,
        authoritativeBase,
        effectiveConfirmed,
        authoritativeStatusByEntity,
        lastServerSequenceByEntity,
        pendingOverlay,
        settledByIntent,
        lastServerSequence: state.lastServerSequence,
      }),
      response,
    });
  }

  const profile = response.authoritativeProfile;
  if (profile.entityId !== pending.targetEntityId) return result(false, 'authoritative_entity_mismatch', { state });
  const previous = authoritativeBase[profile.entityId];
  const profileLastSequence = lastServerSequenceByEntity[profile.entityId]?.profile ?? -1;
  const profileDisposition = componentDisposition(
    previous, profile, profileLastSequence, response.actionSequence, 'stateVersion',
  );
  if (profileDisposition === 'conflict') return result(false, 'authoritative_profile_conflict', { state });
  if (profileDisposition === 'apply') {
    if (response.authoritativeOutcome.stateVersionBefore !== pending.targetStateVersion
      || !profileCombatIdentityMatches(previous, profile)) {
      return result(false, 'authoritative_profile_invariant_failed', { state });
    }
    authoritativeBase[profile.entityId] = profile;
    effectiveConfirmed[profile.entityId] = Object.freeze(Object.fromEntries(
      COMBAT_STAT_KEYS.map(key => [key, response.effectiveConfirmed[key]]),
    ));
    setComponentSequence(lastServerSequenceByEntity, profile.entityId, 'profile', response.actionSequence);
  }
  let appliedComponent = profileDisposition === 'apply';
  for (const snapshot of response.authoritativeStatusSnapshots) {
    const current = authoritativeStatusByEntity[snapshot.entityId];
    const last = lastServerSequenceByEntity[snapshot.entityId]?.status ?? -1;
    const disposition = componentDisposition(current, snapshot, last, response.actionSequence, 'statusStateVersion');
    if (disposition === 'conflict') return result(false, 'authoritative_status_conflict', { state });
    if (disposition === 'apply') {
      authoritativeStatusByEntity[snapshot.entityId] = snapshot;
      setComponentSequence(lastServerSequenceByEntity, snapshot.entityId, 'status', response.actionSequence);
      appliedComponent = true;
    }
  }
  supersedeInvalidPending({
    pendingOverlay, authoritativeBase, authoritativeStatusByEntity,
    responseFingerprint: response.responseFingerprint,
  });
  return result(true, response.status, {
    state: makeState({
      ...state,
      authoritativeBase,
      effectiveConfirmed,
      authoritativeStatusByEntity,
      lastServerSequenceByEntity,
      pendingOverlay,
      settledByIntent,
      lastServerSequence: Math.max(state.lastServerSequence, response.actionSequence),
    }),
    staleComponentsOnly: !appliedComponent,
    response,
  });
}

export function combatClientProjection(state, entityId) {
  if (!isRecord(state) || state.schemaVersion !== COMBAT_V91_CLIENT_STORE_VERSION) return null;
  return state.displayProjection[entityId] ?? null;
}

export function combatClientStatusSnapshot(state, entityId) {
  if (!isRecord(state) || state.schemaVersion !== COMBAT_V91_CLIENT_STORE_VERSION) return null;
  return state.authoritativeStatusByEntity[entityId] ?? null;
}
