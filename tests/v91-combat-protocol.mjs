import assert from 'node:assert/strict';
import {
  COMBAT_V91_AUTHORITY_RESPONSE_SCHEMA,
  COMBAT_V91_OUTCOME_SCHEMA,
  COMBAT_V91_PREDICTION_SCHEMA,
  createCombatAuthorityOutcome,
  createCombatAuthorityResponse,
  validateCombatAuthorityOutcome,
  validateCombatAuthorityResponse,
  validateCombatPredictionEnvelope,
} from '../combat-v91-protocol.mjs';
import {
  TEST_RNG_SEEDS,
  fixtureAction,
  fixtureAuthorityResponse,
  fixtureCombat,
  fixturePrediction,
  fixtureProfile,
  fixtureProposal,
  fixtureRejectedResponse,
  fixtureWorld,
} from './v91-combat-fixtures.mjs';

const actor = fixtureProfile({
  entityId: 'human:protocol', ownerDomain: 'Pirate', entityKind: 'Human', types: ['Normal'], stateVersion: 2,
});
const target = fixtureProfile({
  entityId: 'monster:protocol', ownerDomain: 'Pocket', entityKind: 'Monster', types: ['Normal'],
  stateVersion: 4,
});
const action = fixtureAction({
  actionId: 'shared:protocol-status', power: 0,
  statusApplications: [
    { linkId: 'SL_0001', target: 'actor' },
    { linkId: 'SL_0005', target: 'target' },
  ],
});
const fixture = fixtureCombat({
  combatId: 'combat:protocol', actor, target, action, seed: TEST_RNG_SEEDS.alpha,
});
const prediction = fixturePrediction(fixture, { actionSequence: 7, intentId: 'intent:protocol:7' });
const { envelope, proposal } = prediction;

assert.equal(envelope.schemaVersion, COMBAT_V91_PREDICTION_SCHEMA);
assert.equal(envelope.actorStatusStateVersion, fixture.actorStatus.statusStateVersion);
assert.equal(envelope.targetStatusStateVersion, fixture.targetStatus.statusStateVersion);
assert.equal(envelope.actorStatusFingerprint, fixture.actorStatus.fingerprint);
assert.equal(envelope.targetStatusFingerprint, fixture.targetStatus.fingerprint);
assert.equal(envelope.rngVersion, fixture.world.rngVersion);
assert.equal(envelope.rngTicketId, fixture.world.rngTicketId);
assert.equal(envelope.rngTicketStateVersion, fixture.world.rngTicketStateVersion);
assert.equal(envelope.rngStreamFingerprint, proposal.rngStreamFingerprint);
assert.equal(envelope.predictedCommitFingerprint, proposal.predictedCommitFingerprint);
assert.equal(validateCombatPredictionEnvelope(envelope).ok, true);
assert.equal(Object.isFrozen(envelope), true);
assert.equal(validateCombatPredictionEnvelope({
  ...envelope, targetStatusStateVersion: envelope.targetStatusStateVersion + 1,
}).reason, 'invalid_envelope_fingerprint');
assert.equal(validateCombatPredictionEnvelope({ ...envelope, rngVersion: 'Math.random' }).reason,
  'envelope_version_mismatch');

const committed = fixtureAuthorityResponse(prediction);
assert.equal(committed.outcome.schemaVersion, COMBAT_V91_OUTCOME_SCHEMA);
assert.equal(committed.outcome.damage, 0, 'status-only outcome does not fabricate HP damage');
assert.equal(committed.outcome.stateVersionAfter, committed.outcome.stateVersionBefore,
  'status-only transition owns a separate version from HP');
assert.equal(committed.outcome.statusTransitions.length, 2);
assert.deepEqual(committed.outcome.statusTransitions.map(transition => transition.ownerDomain), ['Pirate', 'Pocket']);
assert.deepEqual(committed.outcome.statusApplied, committed.outcome.statusTransitions.flatMap(transition =>
  transition.attempts.filter(attempt => attempt.applied)
    .map(attempt => ({ statusId: attempt.statusId, targetEntityId: attempt.targetEntityId }))));
assert.equal(validateCombatAuthorityOutcome(committed.outcome).ok, true);

const appliedAttempt = committed.outcome.statusTransitions
  .flatMap(transition => transition.attempts)
  .find(attempt => attempt.applied);
assert.ok(appliedAttempt, 'fixture has at least the guaranteed positive self-buff');
assert.equal(createCombatAuthorityOutcome({
  ...committed.outcome, statusApplied: [],
}).reason, 'invalid_outcome_status_projection', 'statusApplied must be the exact derived projection');
const transitionWithExtraAttemptField = committed.outcome.statusTransitions.map((transition, index) => index === 0 ? {
  ...transition,
  attempts: transition.attempts.map((attempt, attemptIndex) => attemptIndex === 0
    ? { ...attempt, debug: true }
    : attempt),
} : transition);
assert.equal(createCombatAuthorityOutcome({
  ...committed.outcome, statusTransitions: transitionWithExtraAttemptField,
}).reason, 'invalid_outcome_status_attempt');
const invalidVersionTransitions = committed.outcome.statusTransitions.map((transition, index) => index === 0
  ? { ...transition, changed: false }
  : transition);
assert.equal(createCombatAuthorityOutcome({
  ...committed.outcome, statusTransitions: invalidVersionTransitions,
}).reason, 'invalid_outcome_status_version');

assert.equal(committed.response.schemaVersion, COMBAT_V91_AUTHORITY_RESPONSE_SCHEMA);
assert.equal(committed.response.status, 'confirmed');
assert.equal(committed.response.authority, 'server');
assert.equal(committed.response.committed, true);
assert.equal(committed.response.serverProposalFingerprint, proposal.predictedResultFingerprint);
assert.equal(committed.response.authoritativeCommitFingerprint, proposal.predictedCommitFingerprint);
assert.equal(committed.response.authoritativeStatusSnapshots.length, 2);
assert.equal(validateCombatAuthorityResponse(JSON.parse(JSON.stringify(committed.response))).ok, true,
  'response survives transport serialization');

assert.equal(createCombatAuthorityResponse({
  ...committed.response,
  authoritativeStatusSnapshots: [committed.response.authoritativeStatusSnapshots[0]],
}).reason, 'missing_authoritative_status_snapshot');
assert.equal(createCombatAuthorityResponse({
  ...committed.response,
  authoritativeCommitFingerprint: 'a'.repeat(64),
}).reason, 'authority_response_mismatch');
assert.equal(createCombatAuthorityResponse({
  ...committed.response,
  executionReceipt: {
    ...committed.response.executionReceipt,
    resourceStateVersionAfter: committed.response.executionReceipt.resourceStateVersionBefore,
  },
}).reason, 'invalid_execution_receipt_version');

const betaWorld = fixtureWorld({
  actor, target, tick: fixture.world.worldSnapshotTick, seed: TEST_RNG_SEEDS.beta,
});
const betaProposal = fixtureProposal(fixtureCombat({
  combatId: fixture.combatId, actor, target, action, actorStatus: fixture.actorStatus,
  targetStatus: fixture.targetStatus, world: betaWorld,
}), { actionSequence: 7 });
const corrected = fixtureAuthorityResponse(prediction, { serverProposal: betaProposal });
assert.equal(corrected.response.status, 'corrected');
assert.notEqual(corrected.response.serverProposalFingerprint, envelope.predictedResultFingerprint);
assert.equal(validateCombatAuthorityResponse(corrected.response).ok, true);

const rejected = fixtureRejectedResponse(prediction, {
  reason: 'STALE_STATUS_SNAPSHOT',
  resyncProfiles: [actor, target],
  authoritativeStatusSnapshots: [fixture.actorStatus, fixture.targetStatus],
});
assert.equal(rejected.status, 'rejected');
assert.equal(rejected.committed, false);
assert.equal(rejected.authoritativeProfile, null);
assert.equal(rejected.resyncProfiles.length, 2);
assert.equal(rejected.authoritativeStatusSnapshots.length, 2);
assert.equal(validateCombatAuthorityResponse(rejected).ok, true);

console.log('V9.1 combat protocol: PASS (status snapshots/transitions, commit fingerprint, receipt, resync)');
