import assert from 'node:assert/strict';
import { STATUS_CATALOG, statusCatalogEntry } from '../status-catalog.mjs';
import { applyEncounterStatus, createEncounterStatusState } from '../status-lifecycle.mjs';
import {
  COMBAT_V91_STATUS_AUTHORITY,
  COMBAT_V91_STATUS_IDS,
  COMBAT_V91_STATUS_VERSION,
  advancePredictedCombatStatus,
  applyPredictedCombatStatus,
  combatStatusStackCount,
  createCombatStatusProjection,
  createCombatStatusSnapshot,
  planCombatStatusSnapshot,
  proposeCombatStatusApplication,
  validateCombatStatusSnapshot,
} from '../combat-v91-status.mjs';
import { fixtureProfile, fixtureStatusSnapshot } from './v91-combat-fixtures.mjs';

assert.equal(COMBAT_V91_STATUS_VERSION, 'combat-v91-status/v1');
assert.equal(COMBAT_V91_STATUS_IDS.length, 26);
assert.deepEqual(COMBAT_V91_STATUS_IDS, STATUS_CATALOG.map(status => status.id));
assert.equal(COMBAT_V91_STATUS_AUTHORITY.authoritativeWriter, 'server_or_target_owner');

function stateWith(statusId, encounterId = `v91:${statusId}`) {
  const definition = statusCatalogEntry(statusId);
  const base = createEncounterStatusState({ encounterId, nowSec: 0 });
  const applied = applyEncounterStatus(base, {
    statusId, stacks: 1, durationSec: definition.baseDurationSec, sourceInstanceId: 'v91-test',
  }, { nowSec: 0 });
  assert.equal(applied.ok, true);
  return applied.state;
}

for (const definition of STATUS_CATALOG) {
  const projection = createCombatStatusProjection(stateWith(definition.id));
  assert.equal(projection.ok, true, `${definition.id} projects through the shared lifecycle`);
  assert.deepEqual(projection.projection.activeStatusIds, [definition.id]);
  assert.equal(projection.projection.descriptors[0].statusId, definition.id);
  assert.equal(projection.projection.authority, 'prediction_only');
  assert.equal(Object.isFrozen(projection.projection), true);
}

const fear = createCombatStatusProjection(stateWith('ST_FEAR'));
assert.equal(fear.projection.control.forcedRetreat, true);
assert.equal(fear.projection.psychologicalFear, null, 'Combat Fear cannot fabricate World psychology');

const combatId = 'combat:status-snapshot';
const target = fixtureProfile({
  entityId: 'monster:status-target', ownerDomain: 'Pocket', entityKind: 'Monster', types: ['Normal'],
});
const blankSnapshot = fixtureStatusSnapshot({ combatId, profile: target });
assert.equal(validateCombatStatusSnapshot(blankSnapshot, {
  combatId, entityId: target.entityId, ownerDomain: 'Pocket',
}).ok, true);
assert.equal(Object.isFrozen(blankSnapshot.state), true);
const mutableInputState = structuredClone(createEncounterStatusState({ encounterId: combatId, nowSec: 0 }));
assert.equal(Object.isFrozen(mutableInputState), false);
const clonedSnapshot = createCombatStatusSnapshot({
  authority: 'server', combatId, entityId: target.entityId, ownerDomain: target.ownerDomain,
  statusStateVersion: 0, state: mutableInputState,
});
assert.equal(clonedSnapshot.ok, true);
assert.notEqual(clonedSnapshot.snapshot.state, mutableInputState, 'snapshot owns a canonical clone');
assert.equal(Object.isFrozen(mutableInputState), false, 'valid mutable input is never frozen by validation');
mutableInputState.currentTimeSec = 99;
assert.equal(clonedSnapshot.snapshot.state.currentTimeSec, 0, 'later caller mutation cannot alter snapshot truth');
assert.equal(createCombatStatusSnapshot({
  authority: 'server', combatId, entityId: target.entityId, ownerDomain: target.ownerDomain,
  statusStateVersion: 0,
  state: { ...blankSnapshot.state, controlDr: { ...blankSnapshot.state.controlDr, debug: true } },
}).reason, 'invalid_status_snapshot', 'nested unknown fields are rejected');
assert.equal(validateCombatStatusSnapshot({ ...blankSnapshot, debug: true }).reason, 'invalid_status_snapshot_shape');
assert.equal(createCombatStatusSnapshot({ ...blankSnapshot, fingerprint: '0'.repeat(64) }).reason,
  'status_snapshot_fingerprint_mismatch');
assert.equal(validateCombatStatusSnapshot(blankSnapshot, { ownerDomain: 'Pirate' }).reason, 'status_snapshot_mismatch');

const guaranteedBurn = proposeCombatStatusApplication({
  linkId: 'SL_0005', targetTypes: ['Normal'], currentStacks: 0, targetResistance: 0,
}, { rng: () => 0 });
assert.equal(guaranteedBurn.ok, true);
assert.equal(guaranteedBurn.applied, true);
assert.equal(guaranteedBurn.committed, false);
assert.equal(guaranteedBurn.proposedStatus.statusId, 'ST_BURN');
const burnApplication = {
  linkId: 'SL_0005', targetEntityId: target.entityId, applied: guaranteedBurn.applied,
  reason: guaranteedBurn.reason, statusId: guaranteedBurn.statusId,
  proposedStatus: guaranteedBurn.proposedStatus,
};
const burnPlan = planCombatStatusSnapshot(blankSnapshot, [burnApplication], { nowSec: 0 });
assert.equal(burnPlan.ok, true);
assert.equal(burnPlan.changed, true);
assert.equal(burnPlan.before.statusStateVersion, 0);
assert.equal(burnPlan.after.statusStateVersion, 1);
assert.notEqual(burnPlan.before.fingerprint, burnPlan.after.fingerprint);
assert.deepEqual(burnPlan.statusApplied, [{ statusId: 'ST_BURN', targetEntityId: target.entityId }]);
assert.deepEqual(burnPlan.attempts.map(attempt => ({
  applicationIndex: attempt.applicationIndex,
  applied: attempt.applied,
  stacksAfter: attempt.stacksAfter,
})), [{ applicationIndex: 0, applied: true, stacksAfter: 1 }]);
assert.equal(blankSnapshot.state.statuses.length, 0, 'planning never mutates the authoritative snapshot');

const predicted = applyPredictedCombatStatus(blankSnapshot.state, guaranteedBurn.proposedStatus, { nowSec: 0 });
assert.equal(predicted.ok, true);
assert.equal(predicted.committed, false);
assert.equal(predicted.predictedState.statuses.length, 1);
const burnTick = advancePredictedCombatStatus(predicted.predictedState, {
  toSec: 1, targetHp: 100, targetMaxHp: 100,
});
assert.equal(burnTick.ok, true);
assert.equal(burnTick.predictedDamage, 1.5);
assert.equal(burnTick.predictedHp, 98.5);
assert.equal(combatStatusStackCount(predicted.predictedState, 'ST_BURN'), 1);

// Regression: resolver returns potency for lifecycle input, not total next stacks.
const poisonDefinition = statusCatalogEntry('ST_POISON');
const poisonBase = applyEncounterStatus(
  createEncounterStatusState({ encounterId: combatId, nowSec: 0 }),
  { statusId: 'ST_POISON', stacks: 1, durationSec: poisonDefinition.baseDurationSec, sourceInstanceId: 'first' },
  { nowSec: 0 },
).state;
const poisonSnapshot = fixtureStatusSnapshot({
  combatId, profile: target, state: poisonBase, statusStateVersion: 4,
});
const poison = proposeCombatStatusApplication({
  linkId: 'SL_0038', targetTypes: ['Normal'], currentStacks: 1, targetResistance: 0,
}, { rng: () => 0 });
assert.equal(poison.ok, true);
assert.equal(poison.expectedStacks, 2);
assert.equal(poison.proposedStatus.stacks, 1, 'lifecycle receives potency, not already-accumulated stacks');
const poisonPlan = planCombatStatusSnapshot(poisonSnapshot, [{
  linkId: 'SL_0038', targetEntityId: target.entityId, applied: poison.applied,
  reason: poison.reason, statusId: poison.statusId, proposedStatus: poison.proposedStatus,
}], { nowSec: 0 });
assert.equal(poisonPlan.ok, true);
assert.equal(poisonPlan.attempts[0].stacksAfter, 2, 'one existing + one potency becomes exactly two');

const actor = fixtureProfile({ entityId: 'human:self-buff', ownerDomain: 'Pirate', entityKind: 'Human' });
const actorSnapshot = fixtureStatusSnapshot({ combatId, profile: actor });
const atkUp = proposeCombatStatusApplication({
  linkId: 'SL_0001', targetTypes: [], currentStacks: 0, targetResistance: 0,
}, { rng: () => { throw new Error('positive self-buff must not draw RNG'); } });
const selfPlan = planCombatStatusSnapshot(actorSnapshot, [{
  linkId: 'SL_0001', targetEntityId: actor.entityId, applied: atkUp.applied,
  reason: atkUp.reason, statusId: atkUp.statusId, proposedStatus: atkUp.proposedStatus,
}], { nowSec: 0 });
assert.equal(selfPlan.ok, true);
assert.deepEqual(selfPlan.after.state.statuses.map(status => status.statusId), ['ST_ATK_UP']);
assert.equal(selfPlan.after.ownerDomain, 'Pirate');

const noStatusPlan = planCombatStatusSnapshot(blankSnapshot, [], { nowSec: 0 });
assert.equal(noStatusPlan.ok, true);
assert.equal(noStatusPlan.changed, false);
assert.equal(noStatusPlan.after.fingerprint, blankSnapshot.fingerprint);
assert.equal(planCombatStatusSnapshot(blankSnapshot, [], { nowSec: 1 }).reason,
  'invalid_status_transition_input', 'unsettled CombatClock is rejected');
assert.equal(combatStatusStackCount(predicted.predictedState, 'ST_UNKNOWN'), null);
assert.equal(proposeCombatStatusApplication({
  linkId: 'SL_0005', targetTypes: ['Normal'], targetResistance: 1.1,
}, { rng: () => 0 }).reason, 'invalid_target_resistance');
const fireImmune = proposeCombatStatusApplication({
  linkId: 'SL_0005', targetTypes: ['Fire'], currentStacks: 0, targetResistance: 0,
}, { rng: () => { throw new Error('immune path must not draw RNG'); } });
assert.equal(fireImmune.applied, false);
assert.equal(fireImmune.reason, 'type_immune');
assert.equal(fireImmune.rngDraws, 0);

console.log('V9.1 combat status: PASS (snapshots, lifecycle transitions, self-buff, stack regression)');
