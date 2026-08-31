import assert from 'node:assert/strict';
import {
  combatClientProjection,
  combatClientStatusSnapshot,
  createCombatPredictionEnvelope,
  createCombatV91ClientState,
  enqueueCombatPrediction,
  reconcileCombatPrediction,
} from '../combat-v91-client-store.mjs';
import {
  TEST_RNG_SEEDS,
  TEST_STATS,
  fixtureAction,
  fixtureAuthorityResponse,
  fixtureCombat,
  fixtureExecutionReceipt,
  fixturePrediction,
  fixtureProfile,
  fixtureProposal,
  fixtureRejectedResponse,
  fixtureWorld,
} from './v91-combat-fixtures.mjs';

function initialState(fixture, extraFixtures = []) {
  const fixtures = [fixture, ...extraFixtures];
  const profiles = [];
  const statusSnapshots = [];
  const seen = new Set();
  for (const current of fixtures) {
    for (const [profile, snapshot] of [
      [current.actor, current.actorStatus],
      [current.target, current.targetStatus],
    ]) {
      if (seen.has(profile.entityId)) continue;
      seen.add(profile.entityId);
      profiles.push(profile);
      statusSnapshots.push(snapshot);
    }
  }
  const created = createCombatV91ClientState({
    combatId: fixture.combatId,
    profiles,
    statusSnapshots,
  });
  assert.equal(created.ok, true, created.reason);
  return created.state;
}

function enqueue(state, prediction) {
  const queued = enqueueCombatPrediction(state, {
    envelope: prediction.envelope,
    proposal: prediction.proposal,
  });
  assert.equal(queued.ok, true, queued.reason);
  return queued.state;
}

function fixtureFromState(state, template, {
  action = template.action,
  tick,
  seed = TEST_RNG_SEEDS.alpha,
} = {}) {
  const actor = state.authoritativeBase[template.actor.entityId];
  const target = state.authoritativeBase[template.target.entityId];
  return fixtureCombat({
    combatId: template.combatId,
    actor,
    target,
    actorStatus: state.authoritativeStatusByEntity[actor.entityId],
    targetStatus: state.authoritativeStatusByEntity[target.entityId],
    action,
    world: fixtureWorld({ actor, target, tick, seed }),
  });
}

const combatId = 'combat:store:base';
const base = fixtureCombat({
  combatId,
  actor: fixtureProfile({
    entityId: 'human:store:actor', ownerDomain: 'Pirate', entityKind: 'Human',
    stats: { ...TEST_STATS, hpMax: 180, hpCurrent: 180 },
  }),
  target: fixtureProfile({
    entityId: 'monster:store:target', ownerDomain: 'Pocket', entityKind: 'Monster',
    stats: { ...TEST_STATS, hpMax: 260, hpCurrent: 260 }, stateVersion: 3,
  }),
  action: fixtureAction({ actionId: 'shared:store-hit', power: 45 }),
  seed: TEST_RNG_SEEDS.alpha,
});

assert.equal(createCombatV91ClientState({
  combatId,
  profiles: [base.actor, base.target],
  statusSnapshots: [base.actorStatus],
}).reason, 'missing_initial_status_snapshot', 'every combatant needs an authoritative status snapshot');

const initial = initialState(base);
assert.equal(combatClientProjection(initial, base.target.entityId).stats.hpCurrent, 260);
assert.equal(combatClientStatusSnapshot(initial, base.actor.entityId).fingerprint, base.actorStatus.fingerprint);
assert.equal(Object.isFrozen(initial), true);

const firstPrediction = fixturePrediction(base, { actionSequence: 1, intentId: 'intent:store:1' });
const firstQueued = enqueue(initial, firstPrediction);
assert.equal(firstQueued.authoritativeBase[base.target.entityId].stats.hpCurrent, 260,
  'prediction cannot write authoritative HP');
assert.equal(firstQueued.authoritativeStatusByEntity[base.actor.entityId].fingerprint,
  base.actorStatus.fingerprint, 'prediction cannot write authoritative status');
assert.equal(combatClientProjection(firstQueued, base.target.entityId).stats.hpCurrent,
  260 - firstPrediction.proposal.totalDamage);
assert.deepEqual(combatClientProjection(firstQueued, base.target.entityId).pending.intentIds,
  ['intent:store:1']);

// World-owned modifiers are visible through the pending effective projection only.
const worldActor = fixtureProfile({
  entityId: 'human:store:world-modified', ownerDomain: 'Pirate', entityKind: 'Human',
  stats: { ...TEST_STATS, hpMax: 190, hpCurrent: 190 },
});
const worldTarget = fixtureProfile({
  entityId: 'monster:store:world-target', ownerDomain: 'Pocket', entityKind: 'Monster',
});
const worldCombat = fixtureCombat({
  combatId: 'combat:store:world-projection',
  actor: worldActor,
  target: worldTarget,
  world: fixtureWorld({
    actor: worldActor,
    target: worldTarget,
    actorMultipliers: { atk: 0.5, spd: 0.75 },
  }),
});
const worldInitial = initialState(worldCombat);
const worldBaseFingerprint = worldInitial.authoritativeBase[worldActor.entityId].fingerprint;
const worldPrediction = fixturePrediction(worldCombat, {
  actionSequence: 1,
  intentId: 'intent:store:world-projection',
});
const worldQueued = enqueue(worldInitial, worldPrediction);
const worldActorProjection = combatClientProjection(worldQueued, worldActor.entityId);
assert.equal(worldActorProjection.base.atk, TEST_STATS.atk);
assert.equal(worldActorProjection.effective.atk, TEST_STATS.atk * 0.5);
assert.equal(worldActorProjection.effective.spd, TEST_STATS.spd * 0.75);
assert.equal(worldActorProjection.stats.atk, TEST_STATS.atk * 0.5);
assert.equal(worldActorProjection.effectiveSource, 'pending_world_status_projection');
assert.equal(worldActorProjection.pending.count, 1);
assert.equal(worldQueued.authoritativeBase[worldActor.entityId].fingerprint, worldBaseFingerprint,
  'World effective projection cannot rewrite Pirate Base Stats');
assert.equal(worldQueued.authoritativeBase[worldActor.entityId].stats.atk, TEST_STATS.atk);

const firstAuthority = fixtureAuthorityResponse(firstPrediction);
const firstConfirmed = reconcileCombatPrediction(firstQueued, firstAuthority.response);
assert.equal(firstConfirmed.ok, true, firstConfirmed.reason);
assert.equal(firstConfirmed.reason, 'confirmed');
assert.equal(firstConfirmed.state.pendingOverlay['intent:store:1'], undefined);
assert.equal(firstConfirmed.state.authoritativeBase[base.target.entityId].fingerprint,
  firstAuthority.authoritativeProfile.fingerprint);
assert.equal(firstConfirmed.state.authoritativeStatusByEntity[base.actor.entityId].fingerprint,
  firstPrediction.proposal.predictedStatusSnapshots[0].fingerprint);
assert.equal(firstConfirmed.state.lastServerSequenceByEntity[base.target.entityId].profile, 1);
assert.equal(firstConfirmed.state.lastServerSequenceByEntity[base.actor.entityId].status, 1);
const duplicate = reconcileCombatPrediction(firstConfirmed.state, firstAuthority.response);
assert.equal(duplicate.ok, true);
assert.equal(duplicate.reason, 'already_settled');
assert.equal(duplicate.state, firstConfirmed.state, 'duplicate authority response is idempotent');

// A different Server seed is a correction, and its profile/status snapshots replace prediction only after commit.
const secondFixture = fixtureFromState(firstConfirmed.state, base, {
  tick: 51, seed: TEST_RNG_SEEDS.beta,
});
const secondPrediction = fixturePrediction(secondFixture, {
  actionSequence: 2, intentId: 'intent:store:2',
});
const secondQueued = enqueue(firstConfirmed.state, secondPrediction);
const serverFixture = fixtureCombat({
  ...secondFixture,
  world: fixtureWorld({
    actor: secondFixture.actor,
    target: secondFixture.target,
    tick: 51,
    seed: TEST_RNG_SEEDS.gamma,
  }),
});
const serverProposal = fixtureProposal(serverFixture, { actionSequence: 2 });
assert.notEqual(serverProposal.predictedResultFingerprint, secondPrediction.proposal.predictedResultFingerprint);
const correction = fixtureAuthorityResponse(secondPrediction, { serverProposal });
assert.equal(correction.response.status, 'corrected');
const corrected = reconcileCombatPrediction(secondQueued, correction.response);
assert.equal(corrected.ok, true, corrected.reason);
assert.equal(corrected.reason, 'corrected');
assert.equal(corrected.state.authoritativeBase[base.target.entityId].fingerprint,
  correction.authoritativeProfile.fingerprint);
assert.equal(corrected.state.effectiveConfirmed[base.target.entityId].hpCurrent,
  correction.authoritativeProfile.stats.hpCurrent);

// Rejection may carry authoritative resync status; it removes the overlay and applies only Server truth.
const thirdFixture = fixtureFromState(corrected.state, base, { tick: 52, seed: TEST_RNG_SEEDS.alpha });
const thirdPrediction = fixturePrediction(thirdFixture, {
  actionSequence: 3, intentId: 'intent:store:3',
});
const thirdQueued = enqueue(corrected.state, thirdPrediction);
const resyncAction = fixtureAction({
  actionId: 'shared:store-resync-buff', power: 0,
  statusApplications: [{ linkId: 'SL_0001', target: 'actor' }],
});
const resyncFixture = fixtureFromState(corrected.state, base, {
  action: resyncAction, tick: 53, seed: TEST_RNG_SEEDS.alpha,
});
const resyncProposal = fixtureProposal(resyncFixture, { actionSequence: 3 });
const rejectedResponse = fixtureRejectedResponse(thirdPrediction, {
  reason: 'STALE_WORLD_SNAPSHOT',
  authoritativeStatusSnapshots: resyncProposal.predictedStatusSnapshots,
});
const rejected = reconcileCombatPrediction(thirdQueued, rejectedResponse);
assert.equal(rejected.ok, true, rejected.reason);
assert.equal(rejected.reason, 'server_rejected');
assert.equal(rejected.state.pendingOverlay['intent:store:3'], undefined);
assert.equal(rejected.state.authoritativeBase[base.target.entityId].fingerprint,
  corrected.state.authoritativeBase[base.target.entityId].fingerprint,
  'rejection without profile resync cannot change HP');
assert.equal(rejected.state.authoritativeStatusByEntity[base.actor.entityId].statusStateVersion, 1);
assert.deepEqual(rejected.state.authoritativeStatusByEntity[base.actor.entityId].state.statuses
  .map(status => status.statusId), ['ST_ATK_UP']);
const retryFixture = fixtureFromState(rejected.state, base, {
  tick: 54, seed: TEST_RNG_SEEDS.beta,
});
const retryPrediction = fixturePrediction(retryFixture, {
  actionSequence: 3, intentId: 'intent:store:3-retry',
});
assert.equal(enqueueCombatPrediction(rejected.state, retryPrediction).ok, true,
  'a rejected command does not consume the authoritative action sequence');

// Status-only self-buff commits actor status while target HP/profile version stay unchanged.
const buffCombat = fixtureCombat({
  combatId: 'combat:store:self-buff',
  actor: fixtureProfile({
    entityId: 'human:store:buffer', ownerDomain: 'Pirate', entityKind: 'Human',
  }),
  target: fixtureProfile({
    entityId: 'monster:store:buff-target', ownerDomain: 'Pocket', entityKind: 'Monster',
  }),
  action: fixtureAction({
    actionId: 'shared:store-self-buff', power: 0,
    statusApplications: [{ linkId: 'SL_0001', target: 'actor' }],
  }),
});
const buffInitial = initialState(buffCombat);
const buffPrediction = fixturePrediction(buffCombat, {
  actionSequence: 1, intentId: 'intent:store:buff',
});
assert.equal(buffPrediction.proposal.totalDamage, 0);
assert.equal(buffPrediction.proposal.targetStateVersionAfter, buffCombat.target.stateVersion);
assert.equal(buffPrediction.proposal.predictedStatusTransitions[0].changed, true);
assert.equal(buffPrediction.proposal.predictedStatusTransitions[1].changed, false);
const buffQueued = enqueue(buffInitial, buffPrediction);
const pendingActorStatus = combatClientProjection(buffQueued, buffCombat.actor.entityId)
  .pending.statusSnapshots.at(-1);
assert.equal(pendingActorStatus.statusStateVersion, 1);
assert.deepEqual(pendingActorStatus.state.statuses.map(status => status.statusId), ['ST_ATK_UP']);
assert.equal(combatClientStatusSnapshot(buffQueued, buffCombat.actor.entityId).statusStateVersion, 0,
  'pending self-buff remains an overlay');
const buffAuthority = fixtureAuthorityResponse(buffPrediction);
const buffConfirmed = reconcileCombatPrediction(buffQueued, buffAuthority.response);
assert.equal(buffConfirmed.ok, true, buffConfirmed.reason);
assert.equal(buffConfirmed.state.authoritativeBase[buffCombat.target.entityId].fingerprint,
  buffCombat.target.fingerprint, 'status-only commit does not manufacture an HP/profile write');
assert.equal(combatClientStatusSnapshot(buffConfirmed.state, buffCombat.actor.entityId).statusStateVersion, 1);
assert.deepEqual(combatClientStatusSnapshot(buffConfirmed.state, buffCombat.actor.entityId).state.statuses
  .map(status => status.statusId), ['ST_ATK_UP']);

// Older responses are judged per entity/component, not by an unrelated global action sequence.
const reorderCombatId = 'combat:store:reorder';
const pairOne = fixtureCombat({
  combatId: reorderCombatId,
  actor: fixtureProfile({
    entityId: 'human:reorder:a', ownerDomain: 'Pirate', entityKind: 'Human',
  }),
  target: fixtureProfile({
    entityId: 'monster:reorder:b', ownerDomain: 'Pocket', entityKind: 'Monster',
  }),
  action: fixtureAction({ actionId: 'shared:reorder:one' }),
  tick: 71,
});
const pairTwo = fixtureCombat({
  combatId: reorderCombatId,
  actor: fixtureProfile({
    entityId: 'human:reorder:c', ownerDomain: 'Pirate', entityKind: 'Human',
  }),
  target: fixtureProfile({
    entityId: 'monster:reorder:d', ownerDomain: 'Pocket', entityKind: 'Monster',
  }),
  action: fixtureAction({ actionId: 'shared:reorder:two' }),
  tick: 72,
});
let reorderState = initialState(pairOne, [pairTwo]);
const pairOnePrediction = fixturePrediction(pairOne, {
  actionSequence: 1, intentId: 'intent:reorder:one',
});
const pairTwoPrediction = fixturePrediction(pairTwo, {
  actionSequence: 2, intentId: 'intent:reorder:two',
});
reorderState = enqueue(reorderState, pairOnePrediction);
reorderState = enqueue(reorderState, pairTwoPrediction);
const pairTwoAuthority = fixtureAuthorityResponse(pairTwoPrediction);
const newerUnrelated = reconcileCombatPrediction(reorderState, pairTwoAuthority.response);
assert.equal(newerUnrelated.ok, true, newerUnrelated.reason);
assert.equal(newerUnrelated.state.pendingOverlay['intent:reorder:one'].superseded, false,
  'an unrelated pair cannot supersede a valid prediction');
const pairOneAuthority = fixtureAuthorityResponse(pairOnePrediction);
const olderIndependent = reconcileCombatPrediction(newerUnrelated.state, pairOneAuthority.response);
assert.equal(olderIndependent.ok, true, olderIndependent.reason);
assert.equal(olderIndependent.staleComponentsOnly, false,
  'older global sequence still applies to entities untouched by the newer response');
assert.equal(olderIndependent.state.authoritativeBase[pairOne.target.entityId].fingerprint,
  pairOneAuthority.authoritativeProfile.fingerprint);
assert.equal(olderIndependent.state.lastServerSequenceByEntity[pairOne.target.entityId].profile, 1);
assert.equal(olderIndependent.state.lastServerSequenceByEntity[pairTwo.target.entityId].profile, 2);

// For the same entities, seq=2 wins and a late seq=1 settles without rolling components back.
const samePair = fixtureCombat({
  combatId: 'combat:store:same-pair',
  actor: fixtureProfile({
    entityId: 'human:reorder:same', ownerDomain: 'Pirate', entityKind: 'Human',
  }),
  target: fixtureProfile({
    entityId: 'monster:reorder:same', ownerDomain: 'Pocket', entityKind: 'Monster',
    stats: { ...TEST_STATS, hpMax: 300, hpCurrent: 300 },
  }),
  action: fixtureAction({ actionId: 'shared:reorder:same' }),
  tick: 81,
});
let sameState = initialState(samePair);
const sameOne = fixturePrediction(samePair, { actionSequence: 1, intentId: 'intent:same:1' });
const sameTwo = fixturePrediction(samePair, { actionSequence: 2, intentId: 'intent:same:2' });
sameState = enqueue(sameState, sameOne);
sameState = enqueue(sameState, sameTwo);
const sameTwoAuthority = fixtureAuthorityResponse(sameTwo);
const sameNewer = reconcileCombatPrediction(sameState, sameTwoAuthority.response);
assert.equal(sameNewer.ok, true, sameNewer.reason);
assert.equal(sameNewer.state.pendingOverlay['intent:same:1'].superseded, true);
const sameOneAuthority = fixtureAuthorityResponse(sameOne);
const sameOlder = reconcileCombatPrediction(sameNewer.state, sameOneAuthority.response);
assert.equal(sameOlder.ok, true, sameOlder.reason);
assert.equal(sameOlder.reason, 'confirmed');
assert.equal(sameOlder.staleComponentsOnly, true);
assert.equal(sameOlder.state.authoritativeBase[samePair.target.entityId].fingerprint,
  sameTwoAuthority.authoritativeProfile.fingerprint,
  'late same-entity response cannot roll profile back');
assert.equal(sameOlder.state.authoritativeStatusByEntity[samePair.actor.entityId].fingerprint,
  sameTwo.proposal.predictedStatusSnapshots[0].fingerprint,
  'late same-entity response cannot roll status back');

// Tampered proposal/envelope fields are rejected before they enter the store.
const tamperInitial = initialState(base);
const tamperPrediction = fixturePrediction(base, {
  actionSequence: 1, intentId: 'intent:tamper',
});
assert.equal(createCombatPredictionEnvelope({
  intentId: 'intent:tampered-result',
  proposal: { ...tamperPrediction.proposal, totalDamage: tamperPrediction.proposal.totalDamage + 1 },
}).reason, 'invalid_prediction_fingerprint');
assert.equal(enqueueCombatPrediction(tamperInitial, {
  envelope: { ...tamperPrediction.envelope, envelopeFingerprint: '0'.repeat(64) },
  proposal: tamperPrediction.proposal,
}).reason, 'invalid_envelope_fingerprint');
assert.equal(enqueueCombatPrediction(tamperInitial, {
  envelope: tamperPrediction.envelope,
  proposal: { ...tamperPrediction.proposal, targetStatusFingerprint: '0'.repeat(64) },
}).reason, 'prediction_envelope_mismatch');

const wrongTicketReceipt = {
  ...fixtureExecutionReceipt({ fixture: base, proposal: tamperPrediction.proposal }),
  rngTicketId: 'rng:another-ticket',
};
const wrongTicketResponse = fixtureAuthorityResponse(tamperPrediction, {
  executionReceipt: wrongTicketReceipt,
});
assert.equal(reconcileCombatPrediction(
  enqueue(tamperInitial, tamperPrediction),
  wrongTicketResponse.response,
).reason, 'execution_receipt_binding_mismatch',
'a validly signed response for another RNG ticket cannot settle this prediction');

const corruptedProfile = fixtureProfile({
  entityId: base.target.entityId,
  ownerDomain: base.target.ownerDomain,
  entityKind: base.target.entityKind,
  level: base.target.level,
  types: base.target.types,
  stats: {
    ...base.target.stats,
    hpCurrent: tamperPrediction.proposal.predictedHp,
    atk: base.target.stats.atk + 1,
  },
  progressionStateVersion: base.target.progressionStateVersion,
  calculationVersion: base.target.calculationVersion,
  definitionVersion: base.target.definitionVersion,
  stateVersion: tamperPrediction.proposal.targetStateVersionAfter,
});
const corruptedProfileResponse = fixtureAuthorityResponse(tamperPrediction, {
  authoritativeProfile: corruptedProfile,
});
assert.equal(reconcileCombatPrediction(
  enqueue(tamperInitial, tamperPrediction),
  corruptedProfileResponse.response,
).reason, 'authoritative_commit_binding_mismatch',
'an HP commit response cannot smuggle a Base Stat mutation');

console.log('V9.1 client store: PASS (status authority, correction/reject, per-entity reorder)');
