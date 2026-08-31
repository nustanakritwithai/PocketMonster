import {
  COMBAT_OWNER_DOMAINS,
  COMBAT_STAT_KEYS,
  COMBAT_V91_RULES_VERSION,
  fingerprintCombatValue,
  validateCombatProfile,
  validateEffectiveCombatStats,
} from './combat-v91-contract.mjs';
import { COMBAT_V91_RNG_VERSION } from './combat-v91-rng.mjs';
import { validateCombatStatusSnapshot } from './combat-v91-status.mjs';

export const COMBAT_V91_CALCULATION_VERSION = 'combat-v91-calculation/v1';
export const COMBAT_V91_PREDICTION_SCHEMA = 'combat-prediction-envelope/v9.1';
export const COMBAT_V91_OUTCOME_SCHEMA = 'combat-outcome/v9.1';
export const COMBAT_V91_AUTHORITY_RESPONSE_SCHEMA = 'combat-authority-response/v9.1';
export const COMBAT_RECONCILIATION_STATUSES = Object.freeze(['confirmed', 'corrected', 'rejected']);

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PREDICTION_KEYS = Object.freeze([
  'schemaVersion',
  'intentId',
  'combatId',
  'actionSequence',
  'actorEntityId',
  'targetEntityId',
  'combatRulesVersion',
  'calculationVersion',
  'actionId',
  'actionDefinitionVersion',
  'worldSnapshotTick',
  'actorStateVersion',
  'targetStateVersion',
  'actorStatusStateVersion',
  'targetStatusStateVersion',
  'actorProfileFingerprint',
  'targetProfileFingerprint',
  'actorStatusFingerprint',
  'targetStatusFingerprint',
  'actionFingerprint',
  'worldSnapshotFingerprint',
  'rngVersion',
  'rngTicketId',
  'rngTicketStateVersion',
  'rngStreamFingerprint',
  'predictedResultFingerprint',
  'predictedCommitFingerprint',
  'envelopeFingerprint',
]);
const OUTCOME_KEYS = Object.freeze([
  'schemaVersion',
  'authority',
  'committed',
  'combatId',
  'intentId',
  'actionSequence',
  'attackerId',
  'targetId',
  'sourceDomain',
  'abilityId',
  'damage',
  'damageType',
  'statusApplied',
  'statusTransitions',
  'hpBefore',
  'hpAfter',
  'defeated',
  'fainted',
  'stateVersionBefore',
  'stateVersionAfter',
  'commitId',
  'serverProposalFingerprint',
  'authoritativeCommitFingerprint',
  'outcomeFingerprint',
]);
const RESPONSE_KEYS = Object.freeze([
  'schemaVersion',
  'authority',
  'committed',
  'intentId',
  'combatId',
  'actionSequence',
  'actorEntityId',
  'targetEntityId',
  'actionId',
  'actionDefinitionVersion',
  'status',
  'reason',
  'requestEnvelopeFingerprint',
  'clientPredictedResultFingerprint',
  'clientPredictedCommitFingerprint',
  'serverProposalFingerprint',
  'authoritativeCommitFingerprint',
  'authoritativeProfile',
  'resyncProfiles',
  'effectiveConfirmed',
  'authoritativeStatusSnapshots',
  'authoritativeOutcome',
  'executionReceipt',
  'responseFingerprint',
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

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function fingerprintPayload(value, fingerprintKey) {
  const payload = { ...value };
  delete payload[fingerprintKey];
  return fingerprintCombatValue(payload);
}

function validateProposal(proposal) {
  if (!isRecord(proposal)
    || proposal.schemaVersion !== 'combat-proposal/v9.1'
    || proposal.rulesVersion !== COMBAT_V91_RULES_VERSION
    || proposal.authority !== 'deterministic_proposal_only'
    || proposal.committed !== false
    || !validHash(proposal.predictedResultFingerprint)
    || !validHash(proposal.predictedCommitFingerprint)) return result(false, 'invalid_prediction');
  if (fingerprintPayload(proposal, 'predictedResultFingerprint') !== proposal.predictedResultFingerprint) {
    return result(false, 'invalid_prediction_fingerprint');
  }
  return result(true, null);
}

export function createCombatPredictionEnvelope({ intentId, proposal } = {}) {
  if (!nonEmptyString(intentId)) return result(false, 'invalid_prediction');
  const proposalValidation = validateProposal(proposal);
  if (!proposalValidation.ok) return proposalValidation;
  const payload = {
    schemaVersion: COMBAT_V91_PREDICTION_SCHEMA,
    intentId,
    combatId: proposal.combatId,
    actionSequence: proposal.actionSequence,
    actorEntityId: proposal.actorEntityId,
    targetEntityId: proposal.targetEntityId,
    combatRulesVersion: COMBAT_V91_RULES_VERSION,
    calculationVersion: COMBAT_V91_CALCULATION_VERSION,
    actionId: proposal.actionId,
    actionDefinitionVersion: proposal.actionDefinitionVersion,
    worldSnapshotTick: proposal.worldSnapshotTick,
    actorStateVersion: proposal.actorStateVersion,
    targetStateVersion: proposal.targetStateVersion,
    actorStatusStateVersion: proposal.actorStatusStateVersion,
    targetStatusStateVersion: proposal.targetStatusStateVersion,
    actorProfileFingerprint: proposal.actorProfileFingerprint,
    targetProfileFingerprint: proposal.targetProfileFingerprint,
    actorStatusFingerprint: proposal.actorStatusFingerprint,
    targetStatusFingerprint: proposal.targetStatusFingerprint,
    actionFingerprint: proposal.actionFingerprint,
    worldSnapshotFingerprint: proposal.worldSnapshotFingerprint,
    rngVersion: proposal.rngVersion,
    rngTicketId: proposal.rngTicketId,
    rngTicketStateVersion: proposal.rngTicketStateVersion,
    rngStreamFingerprint: proposal.rngStreamFingerprint,
    predictedResultFingerprint: proposal.predictedResultFingerprint,
    predictedCommitFingerprint: proposal.predictedCommitFingerprint,
  };
  return result(true, null, {
    envelope: deepFreeze({ ...payload, envelopeFingerprint: fingerprintCombatValue(payload) }),
  });
}

export function validateCombatPredictionEnvelope(envelope) {
  if (!exactKeys(envelope, PREDICTION_KEYS)) return result(false, 'invalid_envelope_shape');
  const identityFields = ['intentId', 'combatId', 'actorEntityId', 'targetEntityId', 'actionId', 'actionDefinitionVersion', 'rngTicketId'];
  if (identityFields.some(field => !nonEmptyString(envelope[field]))) return result(false, 'invalid_envelope_identity');
  if (envelope.schemaVersion !== COMBAT_V91_PREDICTION_SCHEMA
    || envelope.combatRulesVersion !== COMBAT_V91_RULES_VERSION
    || envelope.calculationVersion !== COMBAT_V91_CALCULATION_VERSION
    || envelope.rngVersion !== COMBAT_V91_RNG_VERSION) return result(false, 'envelope_version_mismatch');
  if (!Number.isInteger(envelope.actionSequence) || envelope.actionSequence < 0
    || !Number.isInteger(envelope.worldSnapshotTick) || envelope.worldSnapshotTick < 0
    || !Number.isInteger(envelope.actorStateVersion) || envelope.actorStateVersion < 0
    || !Number.isInteger(envelope.targetStateVersion) || envelope.targetStateVersion < 0
    || !Number.isInteger(envelope.actorStatusStateVersion) || envelope.actorStatusStateVersion < 0
    || !Number.isInteger(envelope.targetStatusStateVersion) || envelope.targetStatusStateVersion < 0) {
    return result(false, 'invalid_envelope_sequence');
  }
  if (!Number.isInteger(envelope.rngTicketStateVersion) || envelope.rngTicketStateVersion < 0) {
    return result(false, 'invalid_envelope_rng_ticket');
  }
  for (const field of [
    'actorProfileFingerprint', 'targetProfileFingerprint', 'actorStatusFingerprint',
    'targetStatusFingerprint', 'actionFingerprint',
    'worldSnapshotFingerprint', 'rngStreamFingerprint', 'predictedResultFingerprint',
    'predictedCommitFingerprint', 'envelopeFingerprint',
  ]) {
    if (!validHash(envelope[field])) return result(false, 'invalid_envelope_fingerprint', { field });
  }
  if (fingerprintPayload(envelope, 'envelopeFingerprint') !== envelope.envelopeFingerprint) {
    return result(false, 'invalid_envelope_fingerprint', { field: 'envelopeFingerprint' });
  }
  return result(true, null, { envelope: deepFreeze({ ...envelope }) });
}

function validateStatusTransitions(statusTransitions, statusApplied) {
  if (!Array.isArray(statusTransitions) || !Array.isArray(statusApplied)) {
    return result(false, 'invalid_outcome_status');
  }
  const transitions = [];
  const appliedAttempts = [];
  const entities = new Set();
  const globalApplicationIndexes = new Set();
  for (const transition of statusTransitions) {
    if (!exactKeys(transition, [
      'entityId', 'ownerDomain', 'statusStateVersionBefore', 'statusStateVersionAfter',
      'statusFingerprintBefore', 'statusFingerprintAfter', 'changed', 'attempts',
    ]) || !nonEmptyString(transition.entityId) || !COMBAT_OWNER_DOMAINS.includes(transition.ownerDomain)
      || entities.has(transition.entityId)
      || !Number.isInteger(transition.statusStateVersionBefore) || transition.statusStateVersionBefore < 0
      || !Number.isInteger(transition.statusStateVersionAfter)
      || !validHash(transition.statusFingerprintBefore) || !validHash(transition.statusFingerprintAfter)
      || typeof transition.changed !== 'boolean' || !Array.isArray(transition.attempts)) {
      return result(false, 'invalid_outcome_status_transition');
    }
    if (transition.changed
      ? transition.statusStateVersionAfter !== transition.statusStateVersionBefore + 1
        || transition.statusFingerprintAfter === transition.statusFingerprintBefore
      : transition.statusStateVersionAfter !== transition.statusStateVersionBefore
        || transition.statusFingerprintAfter !== transition.statusFingerprintBefore) {
      return result(false, 'invalid_outcome_status_version');
    }
    entities.add(transition.entityId);
    const attempts = [];
    const indexes = new Set();
    for (const attempt of transition.attempts) {
      if (!exactKeys(attempt, [
        'applicationIndex', 'linkId', 'statusId', 'targetEntityId', 'applied', 'reason',
        'stacksAfter', 'appliedDurationSec', 'removedStatusIds', 'interaction',
      ]) || !Number.isInteger(attempt.applicationIndex) || attempt.applicationIndex < 0
        || indexes.has(attempt.applicationIndex) || globalApplicationIndexes.has(attempt.applicationIndex)
        || !nonEmptyString(attempt.linkId)
        || !nonEmptyString(attempt.statusId) || attempt.targetEntityId !== transition.entityId
        || typeof attempt.applied !== 'boolean'
        || !(attempt.reason === null || nonEmptyString(attempt.reason))
        || !Number.isInteger(attempt.stacksAfter) || attempt.stacksAfter < 0
        || !(attempt.appliedDurationSec === null
          || Number.isFinite(attempt.appliedDurationSec) && attempt.appliedDurationSec > 0)
        || !Array.isArray(attempt.removedStatusIds)
        || attempt.removedStatusIds.some(statusId => !nonEmptyString(statusId))
        || !(attempt.interaction === null || nonEmptyString(attempt.interaction))) {
        return result(false, 'invalid_outcome_status_attempt');
      }
      indexes.add(attempt.applicationIndex);
      globalApplicationIndexes.add(attempt.applicationIndex);
      const canonicalAttempt = {
        ...attempt,
        removedStatusIds: [...attempt.removedStatusIds],
      };
      attempts.push(canonicalAttempt);
      if (attempt.applied) appliedAttempts.push({
        applicationIndex: attempt.applicationIndex,
        statusId: attempt.statusId,
        targetEntityId: attempt.targetEntityId,
      });
    }
    transitions.push({ ...transition, attempts });
  }
  const appliedProjection = appliedAttempts
    .sort((left, right) => left.applicationIndex - right.applicationIndex)
    .map(({ statusId, targetEntityId }) => ({ statusId, targetEntityId }));
  if (statusApplied.some(status => !exactKeys(status, ['statusId', 'targetEntityId'])
      || !nonEmptyString(status.statusId) || !nonEmptyString(status.targetEntityId))
    || fingerprintCombatValue(statusApplied) !== fingerprintCombatValue(appliedProjection)) {
    return result(false, 'invalid_outcome_status_projection');
  }
  return result(true, null, {
    statusTransitions: transitions,
    statusApplied: appliedProjection,
  });
}

export function createCombatAuthorityOutcome(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_outcome');
  for (const field of ['combatId', 'intentId', 'attackerId', 'targetId', 'sourceDomain', 'abilityId', 'damageType', 'commitId']) {
    if (!nonEmptyString(input[field])) return result(false, 'invalid_outcome_identity', { field });
  }
  if (!COMBAT_OWNER_DOMAINS.includes(input.sourceDomain)) return result(false, 'invalid_outcome_source_domain');
  if (!Number.isInteger(input.actionSequence) || input.actionSequence < 0
    || !Number.isFinite(input.damage) || input.damage < 0
    || !Number.isFinite(input.hpBefore) || input.hpBefore < 0
    || !Number.isFinite(input.hpAfter) || input.hpAfter < 0 || input.hpAfter > input.hpBefore
    || !Number.isInteger(input.stateVersionBefore) || input.stateVersionBefore < 0
    || !Number.isInteger(input.stateVersionAfter) || input.stateVersionAfter < input.stateVersionBefore
    || typeof input.defeated !== 'boolean' || typeof input.fainted !== 'boolean'
    || (input.defeated && input.fainted)
    || !validHash(input.serverProposalFingerprint)
    || !validHash(input.authoritativeCommitFingerprint)) return result(false, 'invalid_outcome_state');
  if (Math.max(0, input.hpBefore - input.damage) !== input.hpAfter) return result(false, 'outcome_hp_mismatch');
  const statuses = validateStatusTransitions(input.statusTransitions, input.statusApplied);
  if (!statuses.ok) return statuses;
  const transitionEntities = new Set(statuses.statusTransitions.map(transition => transition.entityId));
  if (transitionEntities.size !== 2
    || !transitionEntities.has(input.attackerId) || !transitionEntities.has(input.targetId)) {
    return result(false, 'invalid_outcome_status_entities');
  }
  if ((input.damage > 0 || input.defeated || input.fainted)
    && input.stateVersionAfter <= input.stateVersionBefore) return result(false, 'outcome_state_version_not_advanced');
  const payload = {
    schemaVersion: COMBAT_V91_OUTCOME_SCHEMA,
    authority: 'server',
    committed: true,
    combatId: input.combatId,
    intentId: input.intentId,
    actionSequence: input.actionSequence,
    attackerId: input.attackerId,
    targetId: input.targetId,
    sourceDomain: input.sourceDomain,
    abilityId: input.abilityId,
    damage: input.damage,
    damageType: input.damageType,
    statusApplied: statuses.statusApplied,
    statusTransitions: statuses.statusTransitions,
    hpBefore: input.hpBefore,
    hpAfter: input.hpAfter,
    defeated: input.defeated,
    fainted: input.fainted,
    stateVersionBefore: input.stateVersionBefore,
    stateVersionAfter: input.stateVersionAfter,
    commitId: input.commitId,
    serverProposalFingerprint: input.serverProposalFingerprint,
    authoritativeCommitFingerprint: input.authoritativeCommitFingerprint,
  };
  return result(true, null, {
    outcome: deepFreeze({ ...payload, outcomeFingerprint: fingerprintCombatValue(payload) }),
  });
}

export function validateCombatAuthorityOutcome(outcome) {
  if (!exactKeys(outcome, OUTCOME_KEYS)) return result(false, 'invalid_outcome_shape');
  const created = createCombatAuthorityOutcome(outcome);
  if (!created.ok) return created;
  if (created.outcome.outcomeFingerprint !== outcome.outcomeFingerprint) return result(false, 'invalid_outcome_fingerprint');
  return result(true, null, { outcome: created.outcome });
}

function validatedProfileArray(profiles) {
  if (!Array.isArray(profiles)) return result(false, 'invalid_resync_profiles');
  const canonical = [];
  const seen = new Set();
  for (const input of profiles) {
    const profile = validateCombatProfile(input);
    if (!profile.ok || seen.has(profile.profile.entityId)) return result(false, 'invalid_resync_profiles');
    seen.add(profile.profile.entityId);
    canonical.push(profile.profile);
  }
  return result(true, null, { profiles: canonical });
}

function validatedStatusSnapshotArray(snapshots, { combatId, requiredEntityIds = [] } = {}) {
  if (!Array.isArray(snapshots)) return result(false, 'invalid_authoritative_status_snapshots');
  const canonical = [];
  const seen = new Set();
  for (const input of snapshots) {
    const snapshot = validateCombatStatusSnapshot(input, { combatId });
    if (!snapshot.ok || seen.has(snapshot.snapshot.entityId)) {
      return result(false, 'invalid_authoritative_status_snapshots');
    }
    seen.add(snapshot.snapshot.entityId);
    canonical.push(snapshot.snapshot);
  }
  if (requiredEntityIds.some(entityId => !seen.has(entityId))
    || seen.size !== new Set(requiredEntityIds).size && requiredEntityIds.length > 0) {
    return result(false, 'missing_authoritative_status_snapshot');
  }
  return result(true, null, { snapshots: canonical });
}

function validatedExecutionReceipt(receipt, { actorEntityId, actionSequence } = {}) {
  if (!exactKeys(receipt, [
    'actorEntityId', 'actorStateVersionBefore', 'actorStateVersionAfter',
    'resourceStateVersionBefore', 'resourceStateVersionAfter',
    'sequenceStateVersionBefore', 'sequenceStateVersionAfter',
    'committedActionSequence', 'rngTicketId',
    'rngTicketStateVersionBefore', 'rngTicketStateVersionAfter',
  ]) || receipt.actorEntityId !== actorEntityId || !nonEmptyString(receipt.rngTicketId)
    || receipt.committedActionSequence !== actionSequence) return result(false, 'invalid_execution_receipt');
  for (const field of [
    'actorStateVersionBefore', 'actorStateVersionAfter', 'resourceStateVersionBefore',
    'resourceStateVersionAfter', 'sequenceStateVersionBefore', 'sequenceStateVersionAfter',
    'rngTicketStateVersionBefore', 'rngTicketStateVersionAfter',
  ]) if (!Number.isInteger(receipt[field]) || receipt[field] < 0) return result(false, 'invalid_execution_receipt');
  if (receipt.actorStateVersionAfter < receipt.actorStateVersionBefore
    || receipt.resourceStateVersionAfter !== receipt.resourceStateVersionBefore + 1
    || receipt.sequenceStateVersionAfter !== receipt.sequenceStateVersionBefore + 1
    || receipt.rngTicketStateVersionAfter !== receipt.rngTicketStateVersionBefore + 1) {
    return result(false, 'invalid_execution_receipt_version');
  }
  return result(true, null, { receipt: { ...receipt } });
}

export function createCombatAuthorityResponse(input = {}) {
  if (!isRecord(input) || !COMBAT_RECONCILIATION_STATUSES.includes(input.status)
    || !nonEmptyString(input.intentId) || !nonEmptyString(input.combatId)
    || !nonEmptyString(input.actorEntityId) || !nonEmptyString(input.targetEntityId)
    || !nonEmptyString(input.actionId) || !nonEmptyString(input.actionDefinitionVersion)
    || !Number.isInteger(input.actionSequence) || input.actionSequence < 0
    || !validHash(input.requestEnvelopeFingerprint)
    || !validHash(input.clientPredictedResultFingerprint)
    || !validHash(input.clientPredictedCommitFingerprint)) return result(false, 'invalid_authority_response');
  const rejected = input.status === 'rejected';
  let authoritativeProfile = null;
  let effectiveConfirmed = null;
  let authoritativeOutcome = null;
  let serverProposalFingerprint = null;
  let authoritativeCommitFingerprint = null;
  let authoritativeStatusSnapshots = [];
  let resyncProfiles = [];
  let executionReceipt = null;
  if (rejected) {
    if (!nonEmptyString(input.reason)) return result(false, 'invalid_rejection_reason');
    const resync = validatedProfileArray(input.resyncProfiles ?? []);
    if (!resync.ok) return resync;
    const statuses = validatedStatusSnapshotArray(input.authoritativeStatusSnapshots ?? [], {
      combatId: input.combatId,
    });
    if (!statuses.ok) return statuses;
    resyncProfiles = resync.profiles;
    authoritativeStatusSnapshots = statuses.snapshots;
  } else {
    if (input.reason != null || Array.isArray(input.resyncProfiles) && input.resyncProfiles.length > 0) {
      return result(false, 'invalid_committed_response_shape');
    }
    const profile = validateCombatProfile(input.authoritativeProfile);
    if (!profile.ok) return result(false, 'invalid_authoritative_profile', { cause: profile });
    const effective = input.effectiveConfirmed ?? profile.profile.stats;
    const effectiveValidation = validateEffectiveCombatStats(effective);
    if (!effectiveValidation.ok) return result(false, 'invalid_effective_stats', { cause: effectiveValidation });
    const outcome = validateCombatAuthorityOutcome(input.authoritativeOutcome);
    if (!outcome.ok) return result(false, 'invalid_authoritative_outcome', { cause: outcome });
    const statuses = validatedStatusSnapshotArray(input.authoritativeStatusSnapshots, {
      combatId: input.combatId,
      requiredEntityIds: [input.actorEntityId, input.targetEntityId],
    });
    if (!statuses.ok) return statuses;
    const receipt = validatedExecutionReceipt(input.executionReceipt, {
      actorEntityId: input.actorEntityId,
      actionSequence: input.actionSequence,
    });
    if (!receipt.ok) return receipt;
    if (!validHash(input.serverProposalFingerprint) || !validHash(input.authoritativeCommitFingerprint)
      || outcome.outcome.serverProposalFingerprint !== input.serverProposalFingerprint
      || outcome.outcome.authoritativeCommitFingerprint !== input.authoritativeCommitFingerprint
      || outcome.outcome.targetId !== profile.profile.entityId
      || outcome.outcome.targetId !== input.targetEntityId
      || outcome.outcome.attackerId !== input.actorEntityId
      || outcome.outcome.abilityId !== input.actionId
      || outcome.outcome.combatId !== input.combatId
      || outcome.outcome.intentId !== input.intentId
      || outcome.outcome.actionSequence !== input.actionSequence
      || outcome.outcome.hpAfter !== profile.profile.stats.hpCurrent
      || outcome.outcome.stateVersionAfter !== profile.profile.stateVersion) {
      return result(false, 'authority_response_mismatch');
    }
    for (const transition of outcome.outcome.statusTransitions) {
      const snapshot = statuses.snapshots.find(candidate => candidate.entityId === transition.entityId);
      if (!snapshot || snapshot.ownerDomain !== transition.ownerDomain
        || snapshot.statusStateVersion !== transition.statusStateVersionAfter
        || snapshot.fingerprint !== transition.statusFingerprintAfter) {
        return result(false, 'authority_status_response_mismatch');
      }
    }
    const matchesPrediction = input.serverProposalFingerprint === input.clientPredictedResultFingerprint
      && input.authoritativeCommitFingerprint === input.clientPredictedCommitFingerprint;
    if ((input.status === 'confirmed') !== matchesPrediction) return result(false, 'invalid_reconciliation_status');
    authoritativeProfile = profile.profile;
    effectiveConfirmed = Object.freeze(Object.fromEntries(COMBAT_STAT_KEYS.map(key => [key, effective[key]])));
    authoritativeOutcome = outcome.outcome;
    authoritativeStatusSnapshots = statuses.snapshots;
    serverProposalFingerprint = input.serverProposalFingerprint;
    authoritativeCommitFingerprint = input.authoritativeCommitFingerprint;
    executionReceipt = receipt.receipt;
  }
  const payload = {
    schemaVersion: COMBAT_V91_AUTHORITY_RESPONSE_SCHEMA,
    authority: 'server',
    committed: !rejected,
    intentId: input.intentId,
    combatId: input.combatId,
    actionSequence: input.actionSequence,
    actorEntityId: input.actorEntityId,
    targetEntityId: input.targetEntityId,
    actionId: input.actionId,
    actionDefinitionVersion: input.actionDefinitionVersion,
    status: input.status,
    reason: rejected ? input.reason : null,
    requestEnvelopeFingerprint: input.requestEnvelopeFingerprint,
    clientPredictedResultFingerprint: input.clientPredictedResultFingerprint,
    clientPredictedCommitFingerprint: input.clientPredictedCommitFingerprint,
    serverProposalFingerprint,
    authoritativeCommitFingerprint,
    authoritativeProfile,
    resyncProfiles,
    effectiveConfirmed,
    authoritativeStatusSnapshots,
    authoritativeOutcome,
    executionReceipt,
  };
  return result(true, null, {
    response: deepFreeze({ ...payload, responseFingerprint: fingerprintCombatValue(payload) }),
  });
}

export function validateCombatAuthorityResponse(response) {
  if (!exactKeys(response, RESPONSE_KEYS)) return result(false, 'invalid_response_shape');
  if (response.schemaVersion !== COMBAT_V91_AUTHORITY_RESPONSE_SCHEMA
    || response.authority !== 'server'
    || typeof response.committed !== 'boolean'
    || !validHash(response.responseFingerprint)) return result(false, 'invalid_response_contract');
  const created = createCombatAuthorityResponse(response);
  if (!created.ok) return created;
  if (created.response.responseFingerprint !== response.responseFingerprint) return result(false, 'invalid_response_fingerprint');
  return result(true, null, { response: created.response });
}
