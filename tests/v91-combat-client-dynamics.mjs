import assert from 'node:assert/strict';
import { createAuthoritativeDynamicsEffectReceipt } from '../combat-v91-authoritative-dynamics-effect.mjs';
import { createCombatV91Client } from '../combat-v91-entry.mjs';
import {
  fixtureAction,
  fixtureAuthorityResponse,
  fixtureCombat,
  fixtureExecutionReceipt,
} from './v91-combat-fixtures.mjs';

const SOURCE_PROVENANCE_FINGERPRINT = 'a'.repeat(64);

function directDynamics(action) {
  return {
    actionId: action.actionId,
    definitionVersion: 'pirate-dynamics/client-gate/v1',
    windupTicks: 1,
    castTicks: 1,
    activeTicks: 1,
    recoveryTicks: 1,
    impactWindows: [{
      windowId: 'direct-contact',
      opensAtActiveTick: 0,
      closesAtActiveTickExclusive: 1,
      hits: [{ hitOrdinal: 0, atActiveTick: 0, delivery: 'direct' }],
    }],
    comboWindow: null,
    cancelPolicy: { windows: [] },
    interruptPolicy: {
      allowedPhases: ['windup', 'cast', 'active', 'recovery'],
      allowedReasons: ['damage'],
      superArmorPhases: [],
    },
    resourceCosts: [],
    projectiles: [],
    impulses: [{
      hitOrdinal: 0,
      profileId: 'pirate-impulse/client-gate/v1',
      horizontalMilliUnits: 500,
      verticalMilliUnits: 0,
      durationTicks: 4,
      authority: 'world',
    }],
    guard: null,
    movementLocks: [{
      lockId: 'pirate-client-gate-lock',
      opensAtActionTick: 0,
      closesAtActionTickExclusive: 3,
      movementMultiplierBasisPoints: 0,
      authority: 'world_locomotion_owner',
    }],
    hitstopPresentation: {
      activation: 'confirmed_hit',
      durationTicks: 2,
      actorScaleBasisPoints: 0,
      targetScaleBasisPoints: 0,
      authority: 'presentation_only',
    },
  };
}

const fixture = fixtureCombat({ combatId: 'combat:client-dynamics' });
const created = createCombatV91Client({
  combatId: fixture.combatId,
  profiles: [fixture.actor, fixture.target],
  statusSnapshots: [fixture.actorStatus, fixture.targetStatus],
});
assert.equal(created.ok, true, created.reason);
const { client } = created;
assert.equal(client.policy.actionDynamics,
  'bound_fixed_60hz_client_proposal_plus_server_permit');
assert.equal(client.policy.scheduledPredictionGate, 'mandatory_single_direct_impact');
assert.equal(client.policy.multiHitResolution, 'fail_closed_until_per_impact_protocol');

const scheduled = client.scheduleAction({
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  startTick: 100,
  bindingVersion: 'pirate-action-timing/client-gate/v1',
  sourceProvenanceFingerprint: SOURCE_PROVENANCE_FINGERPRINT,
  action: fixture.action,
  dynamics: directDynamics(fixture.action),
});
assert.equal(scheduled.ok, true, scheduled.reason);
assert.equal(scheduled.dynamics.binding.actionFingerprint, fixture.action.fingerprint);
assert.equal(scheduled.dynamics.availableImpactKeys.length, 0);
assert.equal(client.scheduleAction({
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  startTick: 100,
  bindingVersion: 'duplicate/v1',
  sourceProvenanceFingerprint: SOURCE_PROVENANCE_FINGERPRINT,
  action: fixture.action,
  dynamics: directDynamics(fixture.action),
}).reason, 'duplicate_action_schedule');

const command = {
  intentId: 'intent:client-dynamics',
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  action: fixture.action,
  worldSnapshot: fixture.world,
};
assert.equal(client.predict(command).reason, 'action_impact_not_reached',
  'a scheduled action cannot predict damage during windup/cast');

const beforeImpact = client.advanceAction({ actionSequence: 1, throughTick: 101 });
assert.equal(beforeImpact.ok, true, beforeImpact.reason);
assert.equal(beforeImpact.events.some(event => event.type === 'impact.requested'), false);
assert.equal(client.predict(command).reason, 'action_impact_not_reached');

const atImpact = client.advanceAction({ actionSequence: 1, throughTick: 102 });
assert.equal(atImpact.ok, true, atImpact.reason);
const impact = atImpact.events.find(event => event.type === 'impact.requested');
assert.ok(impact);
assert.equal(impact.authority, 'proposal_only');
assert.equal(impact.payload.impulseCandidate.authority, 'world');
assert.equal(impact.payload.hitstopPresentation.authority, 'presentation_only');
assert.deepEqual(atImpact.dynamics.availableImpactKeys, [impact.payload.idempotencyKey]);

assert.equal(client.predict({
  ...command,
  actorEntityId: fixture.target.entityId,
  targetEntityId: fixture.actor.entityId,
  dynamicsImpactKey: impact.payload.idempotencyKey,
}).reason, 'action_dynamics_entity_binding_mismatch',
'an impact key cannot be replayed with swapped actor/target ownership');

assert.equal(client.predict({ ...command, dynamicsImpactKey: 'forged' }).reason,
  'action_impact_not_reached');
const predicted = client.predict({
  ...command,
  dynamicsImpactKey: impact.payload.idempotencyKey,
});
assert.equal(predicted.ok, true, predicted.reason);
assert.equal(predicted.proposal.committed, false);
assert.equal(client.getState().authoritativeBase[fixture.target.entityId].stats.hpCurrent,
  fixture.target.stats.hpCurrent, 'fixed-tick impact still cannot commit HP on the Client');
assert.equal(client.predict({
  ...command,
  intentId: 'intent:duplicate-impact',
  dynamicsImpactKey: impact.payload.idempotencyKey,
}).reason, 'action_prediction_already_enqueued');

const authoritativeEffect = createAuthoritativeDynamicsEffectReceipt({
  authority: 'server',
  combatId: fixture.combatId,
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  actionId: fixture.action.actionId,
  actionDynamicsBindingFingerprint: scheduled.dynamics.binding.fingerprint,
  sourceProvenanceFingerprint: SOURCE_PROVENANCE_FINGERPRINT,
  hitOrdinal: 0,
  impactCombatTick: impact.tick,
  impulse: {
    profileId: 'server-registry-impulse/v1',
    horizontalMilliUnits: 250,
    verticalMilliUnits: 0,
    durationTicks: 3,
    authority: 'world',
  },
  hitstopPresentation: {
    activation: 'confirmed_hit',
    durationTicks: 1,
    actorScaleBasisPoints: 0,
    targetScaleBasisPoints: 0,
    authority: 'presentation_only',
  },
});
assert.equal(authoritativeEffect.ok, true, authoritativeEffect.reason);
const authority = fixtureAuthorityResponse({
  fixture,
  proposal: predicted.proposal,
  envelope: predicted.envelope,
}, {
  executionReceipt: fixtureExecutionReceipt({
    fixture,
    proposal: predicted.proposal,
    authoritativeDynamicsEffectReceipt: authoritativeEffect.receipt,
  }),
});
const reconciled = client.reconcile(authority.response);
assert.equal(reconciled.ok, true, reconciled.reason);
assert.deepEqual(reconciled.confirmedDynamicsEffects.map(effect => effect.type), [
  'world.impulse_commit_requested',
  'presentation.hitstop_requested',
]);
assert.equal(reconciled.confirmedDynamicsEffects[0].authoritativeOutcomeFingerprint,
  authority.outcome.outcomeFingerprint,
'knockback is released only after the authoritative hit outcome');
assert.equal(reconciled.confirmedDynamicsEffects[0].impulse.horizontalMilliUnits, 250,
  'the Client releases the Server receipt value, never its local impulse candidate');
assert.equal(reconciled.dynamicsEffectsDisposition, 'authoritative_effect_applied');
assert.deepEqual(client.reconcile(authority.response).confirmedDynamicsEffects, [],
'replayed reconciliation cannot emit motion/presentation effects twice');

const foreignFixture = fixtureCombat({ combatId: 'combat:client-dynamics-foreign-effect' });
const foreignClient = createCombatV91Client({
  combatId: foreignFixture.combatId,
  profiles: [foreignFixture.actor, foreignFixture.target],
  statusSnapshots: [foreignFixture.actorStatus, foreignFixture.targetStatus],
}).client;
const foreignScheduled = foreignClient.scheduleAction({
  actionSequence: 1,
  actorEntityId: foreignFixture.actor.entityId,
  targetEntityId: foreignFixture.target.entityId,
  startTick: 0,
  bindingVersion: 'pirate-action-timing/foreign-effect/v1',
  sourceProvenanceFingerprint: 'f'.repeat(64),
  action: foreignFixture.action,
  dynamics: directDynamics(foreignFixture.action),
});
assert.equal(foreignScheduled.ok, true, foreignScheduled.reason);
const foreignAdvanced = foreignClient.advanceAction({ actionSequence: 1, throughTick: 2 });
const foreignImpact = foreignAdvanced.events.find(event => event.type === 'impact.requested');
const foreignPredicted = foreignClient.predict({
  intentId: 'intent:foreign-authoritative-effect',
  actionSequence: 1,
  actorEntityId: foreignFixture.actor.entityId,
  targetEntityId: foreignFixture.target.entityId,
  action: foreignFixture.action,
  dynamicsImpactKey: foreignImpact.payload.idempotencyKey,
  worldSnapshot: foreignFixture.world,
});
assert.equal(foreignPredicted.ok, true, foreignPredicted.reason);
const foreignEffect = createAuthoritativeDynamicsEffectReceipt({
  authority: 'server',
  combatId: foreignFixture.combatId,
  actionSequence: 1,
  actorEntityId: foreignFixture.actor.entityId,
  targetEntityId: foreignFixture.target.entityId,
  actionId: foreignFixture.action.actionId,
  actionDynamicsBindingFingerprint: 'b'.repeat(64),
  sourceProvenanceFingerprint: 'f'.repeat(64),
  hitOrdinal: 0,
  impactCombatTick: foreignImpact.tick,
  impulse: {
    profileId: 'foreign-impulse/v1',
    horizontalMilliUnits: 1_000_000,
    verticalMilliUnits: 1_000_000,
    durationTicks: 3_600,
    authority: 'world',
  },
  hitstopPresentation: null,
});
assert.equal(foreignEffect.ok, true, foreignEffect.reason);
const foreignAuthority = fixtureAuthorityResponse({
  fixture: foreignFixture,
  proposal: foreignPredicted.proposal,
  envelope: foreignPredicted.envelope,
}, {
  executionReceipt: fixtureExecutionReceipt({
    fixture: foreignFixture,
    proposal: foreignPredicted.proposal,
    authoritativeDynamicsEffectReceipt: foreignEffect.receipt,
  }),
});
const foreignReconciled = foreignClient.reconcile(foreignAuthority.response);
assert.deepEqual(foreignReconciled.confirmedDynamicsEffects, [],
  'a Server effect receipt for another action/dynamics binding cannot release knockback');
assert.equal(foreignReconciled.dynamicsEffectsDisposition,
  'authoritative_effect_binding_mismatch');

const read = client.readActionDynamics(1);
assert.equal(read.ok, true);
assert.equal(read.dynamics.predictionEnqueued, true);
assert.equal(read.dynamics.consumedImpactKey, impact.payload.idempotencyKey);
assert.deepEqual(read.dynamics.availableImpactKeys, []);
assert.equal(client.readActionDynamics(2).reason, 'unknown_action_schedule');
assert.equal(client.advanceAction({ actionSequence: 2, throughTick: 100 }).reason,
  'unknown_action_schedule');

const mismatchedFixture = fixtureCombat({ combatId: 'combat:client-dynamics-mismatch' });
const mismatchedClient = createCombatV91Client({
  combatId: mismatchedFixture.combatId,
  profiles: [mismatchedFixture.actor, mismatchedFixture.target],
  statusSnapshots: [mismatchedFixture.actorStatus, mismatchedFixture.targetStatus],
}).client;
assert.equal(mismatchedClient.predict({
  intentId: 'intent:missing-schedule',
  actionSequence: 1,
  actorEntityId: mismatchedFixture.actor.entityId,
  targetEntityId: mismatchedFixture.target.entityId,
  action: mismatchedFixture.action,
  worldSnapshot: mismatchedFixture.world,
}).reason, 'action_schedule_required',
'the live client cannot bypass timing by omitting a schedule');
assert.equal(mismatchedClient.scheduleAction({
  actionSequence: 1,
  actorEntityId: mismatchedFixture.actor.entityId,
  targetEntityId: mismatchedFixture.target.entityId,
  startTick: 0,
  bindingVersion: 'pirate-action-timing/mismatch/v1',
  sourceProvenanceFingerprint: SOURCE_PROVENANCE_FINGERPRINT,
  action: mismatchedFixture.action,
  dynamics: directDynamics(mismatchedFixture.action),
}).ok, true);
assert.equal(mismatchedClient.scheduleAction({
  actionSequence: 2,
  actorEntityId: mismatchedFixture.actor.entityId,
  targetEntityId: mismatchedFixture.target.entityId,
  startTick: 0,
  bindingVersion: 'pirate-action-timing/overlap/v1',
  sourceProvenanceFingerprint: SOURCE_PROVENANCE_FINGERPRINT,
  action: mismatchedFixture.action,
  dynamics: directDynamics(mismatchedFixture.action),
}).reason, 'actor_action_in_progress');
assert.equal(mismatchedClient.predict({
  intentId: 'intent:mismatched-action',
  actionSequence: 1,
  actorEntityId: mismatchedFixture.actor.entityId,
  targetEntityId: mismatchedFixture.target.entityId,
  action: { ...mismatchedFixture.action, power: mismatchedFixture.action.power + 1 },
  worldSnapshot: mismatchedFixture.world,
}).reason, 'action_dynamics_binding_mismatch');

const multiFixture = fixtureCombat({
  combatId: 'combat:client-dynamics-multi',
  action: fixtureAction({ actionId: 'pirate:multi:unsupported', hitCount: 2 }),
});
const multiClient = createCombatV91Client({
  combatId: multiFixture.combatId,
  profiles: [multiFixture.actor, multiFixture.target],
  statusSnapshots: [multiFixture.actorStatus, multiFixture.targetStatus],
}).client;
const multiDynamics = {
  ...directDynamics(multiFixture.action),
  activeTicks: 2,
  impactWindows: [{
    windowId: 'multi-contact',
    opensAtActiveTick: 0,
    closesAtActiveTickExclusive: 2,
    hits: [
      { hitOrdinal: 0, atActiveTick: 0, delivery: 'direct' },
      { hitOrdinal: 1, atActiveTick: 1, delivery: 'direct' },
    ],
  }],
  impulses: [],
  movementLocks: [{
    lockId: 'multi-lock',
    opensAtActionTick: 0,
    closesAtActionTickExclusive: 4,
    movementMultiplierBasisPoints: 0,
    authority: 'world_locomotion_owner',
  }],
};
assert.equal(multiClient.scheduleAction({
  actionSequence: 1,
  actorEntityId: multiFixture.actor.entityId,
  targetEntityId: multiFixture.target.entityId,
  startTick: 0,
  bindingVersion: 'pirate-action-timing/multi/v1',
  sourceProvenanceFingerprint: SOURCE_PROVENANCE_FINGERPRINT,
  action: multiFixture.action,
  dynamics: multiDynamics,
}).reason, 'action_dynamics_resolution_unsupported',
'multi-hit remains fail-closed until per-impact server transactions exist');

console.log('V9.1.2 Client dynamics gate: PASS (mandatory entity-bound direct impact, no Client HP commit)');
