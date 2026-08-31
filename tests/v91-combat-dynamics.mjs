import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  COMBAT_V91_DYNAMICS_CONTRACT_VERSION,
  COMBAT_V91_DYNAMICS_EVENT_TYPES,
  COMBAT_V91_DYNAMICS_TICK_RATE,
  combatDynamicsPhaseAt,
  createCombatDynamicsDefinition,
} from '../combat-v91-dynamics-contract.mjs';
import {
  COMBAT_V91_DYNAMICS_SCHEDULER_VERSION,
  COMBAT_V91_DYNAMICS_TRANSITION_PRIORITY,
  advanceCombatDynamicsSchedule,
  createCombatDynamicsSchedule,
  validateCombatDynamicsState,
} from '../combat-v91-dynamics-scheduler.mjs';
import { fingerprintCombatValue } from '../combat-v91-contract.mjs';

function definitionInput() {
  return {
    actionId: 'pirate:sword:cross-cut',
    definitionVersion: 'pirate-dynamics/cross-cut/v1',
    windupTicks: 2,
    castTicks: 2,
    activeTicks: 4,
    recoveryTicks: 2,
    impactWindows: [
      {
        windowId: 'blade-contact-a',
        opensAtActiveTick: 0,
        closesAtActiveTickExclusive: 2,
        hits: [{ hitOrdinal: 0, atActiveTick: 0, delivery: 'direct' }],
      },
      {
        windowId: 'wave-launch-b',
        opensAtActiveTick: 2,
        closesAtActiveTickExclusive: 4,
        hits: [{ hitOrdinal: 1, atActiveTick: 2, delivery: 'projectile' }],
      },
    ],
    comboWindow: {
      opensAtActionTick: 6,
      closesAtActionTickExclusive: 9,
      acceptsActionTags: ['skill', 'sword'],
    },
    cancelPolicy: {
      windows: [{
        opensAtActionTick: 5,
        closesAtActionTickExclusive: 10,
        reasons: ['combo_chain', 'dodge'],
      }],
    },
    interruptPolicy: {
      allowedPhases: ['windup', 'cast', 'active', 'recovery'],
      allowedReasons: ['damage', 'guard_break', 'scripted'],
      superArmorPhases: ['active'],
    },
    resourceCosts: [
      {
        resourceKey: 'combat_energy',
        amountUnits: 12,
        commitAt: 'active_start',
        refundOnCancel: 'none',
        refundOnInterrupt: 'uncommitted',
      },
      {
        resourceKey: 'mana',
        amountUnits: 30,
        commitAt: 'first_impact',
        refundOnCancel: 'full',
        refundOnInterrupt: 'uncommitted',
      },
      {
        resourceKey: 'skill_charge',
        amountUnits: 1,
        commitAt: 'completion',
        refundOnCancel: 'uncommitted',
        refundOnInterrupt: 'full',
      },
    ],
    projectiles: [{
      projectileId: 'cross-cut-wave',
      profileId: 'pirate-projectile/sword-wave/v1',
      hitOrdinal: 1,
      spawnAtActionTick: 6,
      lifetimeTicks: 120,
      collisionAuthority: 'world',
    }],
    impulses: [
      {
        hitOrdinal: 0,
        profileId: 'pirate-impulse/light-knockback/v1',
        horizontalMilliUnits: 1_200,
        verticalMilliUnits: 0,
        durationTicks: 8,
        authority: 'world',
      },
      {
        hitOrdinal: 1,
        profileId: 'pirate-impulse/wave-push/v1',
        horizontalMilliUnits: 800,
        verticalMilliUnits: 100,
        durationTicks: 6,
        authority: 'world',
      },
    ],
    guard: {
      profileId: 'pirate-guard/cross-cut/v1',
      windows: [
        { opensAtActionTick: 2, closesAtActionTickExclusive: 4 },
        { opensAtActionTick: 7, closesAtActionTickExclusive: 9 },
      ],
      coverageMilliDegrees: 120_000,
      mitigationBasisPoints: 5_000,
      authority: 'combat_resolver',
    },
    movementLocks: [{
      lockId: 'cross-cut-footwork-lock',
      opensAtActionTick: 1,
      closesAtActionTickExclusive: 8,
      movementMultiplierBasisPoints: 2_500,
      authority: 'world_locomotion_owner',
    }],
    hitstopPresentation: {
      activation: 'confirmed_hit',
      durationTicks: 4,
      actorScaleBasisPoints: 0,
      targetScaleBasisPoints: 0,
      authority: 'presentation_only',
    },
  };
}

function createSchedule(definition) {
  const created = createCombatDynamicsSchedule({
    combatId: 'combat:shared:001',
    actionSequence: 17,
    actorEntityId: 'human:pirate:001',
    targetEntityId: 'monster:pocket:009',
    startTick: 100,
    definition,
  });
  assert.equal(created.ok, true);
  return created.state;
}

function advance(state, definition, throughTick, transitionRequests = []) {
  const advanced = advanceCombatDynamicsSchedule({
    state,
    definition,
    throughTick,
    transitionRequests,
  });
  assert.equal(advanced.ok, true, advanced.reason);
  return advanced;
}

function refingerprintState(state) {
  const { fingerprint: _fingerprint, ...payload } = state;
  return { ...payload, fingerprint: fingerprintCombatValue(payload) };
}

assert.equal(COMBAT_V91_DYNAMICS_CONTRACT_VERSION, 'combat-v91-dynamics-contract/v1');
assert.equal(COMBAT_V91_DYNAMICS_SCHEDULER_VERSION, 'combat-v91-fixed-tick-scheduler/v2');
assert.deepEqual(COMBAT_V91_DYNAMICS_TRANSITION_PRIORITY, { interrupt: 0, cancel: 1 });
assert.equal(COMBAT_V91_DYNAMICS_TICK_RATE, 60);
assert.deepEqual(COMBAT_V91_DYNAMICS_EVENT_TYPES, [
  'action.started', 'phase.entered', 'phase.exited',
  'impact_window.opened', 'impact_window.closed', 'impact.requested',
  'projectile.spawn_requested', 'guard_window.opened', 'guard_window.closed',
  'movement_lock.opened', 'movement_lock.closed',
  'combo_window.opened', 'combo_window.closed', 'resource.reserve_requested',
  'resource.commit_requested', 'resource.refund_requested', 'transition.rejected',
  'action.cancelled', 'action.interrupted', 'action.completed',
]);

const definitionResult = createCombatDynamicsDefinition(definitionInput());
assert.equal(definitionResult.ok, true, definitionResult.reason);
const definition = definitionResult.definition;
assert.equal(Object.isFrozen(definition), true);
assert.equal(Object.isFrozen(definition.impactWindows[0].hits[0]), true);
assert.equal(definition.hitCount, 2);
assert.deepEqual(definition.timeline, {
  windupStartTick: 0,
  castStartTick: 2,
  activeStartTick: 4,
  recoveryStartTick: 8,
  completionTick: 10,
});
assert.equal(combatDynamicsPhaseAt(definition, -1), 'scheduled');
assert.equal(combatDynamicsPhaseAt(definition, 0), 'windup');
assert.equal(combatDynamicsPhaseAt(definition, 2), 'cast');
assert.equal(combatDynamicsPhaseAt(definition, 4), 'active');
assert.equal(combatDynamicsPhaseAt(definition, 8), 'recovery');
assert.equal(combatDynamicsPhaseAt(definition, 10), 'completed');
assert.equal(createCombatDynamicsDefinition({ ...definition }).definition.fingerprint, definition.fingerprint);

const invalidCases = [
  [{ ...definitionInput(), windupTicks: 1.5 }, 'invalid_phase_ticks'],
  [{ ...definitionInput(), clientDt: 1 / 60 }, 'unknown_dynamics_field'],
  [{
    ...definitionInput(),
    impactWindows: [{
      windowId: 'gap', opensAtActiveTick: 0, closesAtActiveTickExclusive: 2,
      hits: [{ hitOrdinal: 1, atActiveTick: 0, delivery: 'direct' }],
    }],
    projectiles: [],
    impulses: [],
  }, 'non_contiguous_hit_ordinals'],
  [{
    ...definitionInput(),
    projectiles: [{
      ...definitionInput().projectiles[0],
      spawnAtActionTick: 5,
    }],
  }, 'invalid_projectile'],
  [{
    ...definitionInput(),
    impulses: [{ ...definitionInput().impulses[0], authority: 'client' }],
  }, 'invalid_impulse'],
  [{
    ...definitionInput(),
    guard: { ...definitionInput().guard, authority: 'world' },
  }, 'invalid_guard'],
  [{
    ...definitionInput(),
    movementLocks: [{
      ...definitionInput().movementLocks[0],
      movementMultiplierBasisPoints: 10_001,
    }],
  }, 'invalid_movement_lock'],
  [{
    ...definitionInput(),
    movementLocks: [
      definitionInput().movementLocks[0],
      {
        ...definitionInput().movementLocks[0],
        lockId: 'overlapping-footwork-lock',
        opensAtActionTick: 2,
      },
    ],
  }, 'overlapping_movement_locks'],
  [{
    ...definitionInput(),
    hitstopPresentation: { ...definitionInput().hitstopPresentation, authority: 'combat_clock' },
  }, 'invalid_hitstop_presentation'],
  [{
    ...definitionInput(),
    resourceCosts: [{
      resourceKey: 'mana', amountUnits: 1, commitAt: 'first_impact',
      refundOnCancel: 'all', refundOnInterrupt: 'none',
    }],
  }, 'invalid_resource_cost'],
];
for (const [candidate, expectedReason] of invalidCases) {
  assert.equal(createCombatDynamicsDefinition(candidate).reason, expectedReason);
}

const directStart = createSchedule(definition);
const direct = advance(directStart, definition, 500);
assert.equal(direct.state.phase, 'completed');
assert.equal(direct.state.lastProcessedTick, 110, 'scheduler stops on canonical completion tick');
assert.deepEqual(direct.state.emittedHitOrdinals, [0, 1]);
assert.equal(validateCombatDynamicsState(direct.state, definition).ok, true);
assert.equal(Object.isFrozen(direct.events), true);
assert.equal(direct.events.every(event => Object.isFrozen(event) && Object.isFrozen(event.payload)), true);

const phaseEvents = direct.events
  .filter(event => event.type === 'phase.entered' || event.type === 'phase.exited')
  .map(event => [event.tick, event.type, event.payload.phase, event.payload.reason ?? null]);
assert.deepEqual(phaseEvents, [
  [100, 'phase.entered', 'windup', null],
  [102, 'phase.exited', 'windup', 'timeline'],
  [102, 'phase.entered', 'cast', null],
  [104, 'phase.exited', 'cast', 'timeline'],
  [104, 'phase.entered', 'active', null],
  [108, 'phase.exited', 'active', 'timeline'],
  [108, 'phase.entered', 'recovery', null],
  [110, 'phase.exited', 'recovery', 'timeline'],
]);

const hitEvents = direct.events.filter(event => (
  event.type === 'impact.requested' || event.type === 'projectile.spawn_requested'
));
assert.deepEqual(hitEvents.map(event => [event.tick, event.type, event.payload.hitOrdinal]), [
  [104, 'impact.requested', 0],
  [106, 'projectile.spawn_requested', 1],
]);
assert.equal(new Set(hitEvents.map(event => event.payload.idempotencyKey)).size, 2);
assert.equal(hitEvents[0].payload.impulseCandidate.authority, 'world');
assert.equal(hitEvents[1].payload.projectile.collisionAuthority, 'world');
assert.equal(hitEvents.every(event => (
  event.payload.hitstopPresentation.authority === 'presentation_only'
  && event.payload.hitstopPresentation.activation === 'confirmed_hit'
)), true, 'hitstop is only an authoritative-hit presentation hint');
assert.equal(direct.events.some(event => event.type.includes('hitstop')), false,
  'scheduler never pauses a combat or world clock for hitstop');

const movementLockEvents = direct.events
  .filter(event => event.type.startsWith('movement_lock.'));
assert.deepEqual(movementLockEvents.map(event => [
  event.tick,
  event.type,
  event.payload.lockId,
  event.payload.movementMultiplierBasisPoints ?? null,
  event.payload.reason ?? null,
]), [
  [101, 'movement_lock.opened', 'cross-cut-footwork-lock', 2_500, null],
  [108, 'movement_lock.closed', 'cross-cut-footwork-lock', null, 'timeline'],
]);
assert.equal(movementLockEvents.every(event => (
  event.authority === 'proposal_only'
  && event.payload.authority === 'world_locomotion_owner_commit_required'
)), true, 'movement timing is only a bounded proposal for the locomotion owner');

const resourceEvents = direct.events
  .filter(event => event.type.startsWith('resource.'))
  .map(event => [event.tick, event.type, event.payload.resourceKey]);
assert.deepEqual(resourceEvents, [
  [100, 'resource.reserve_requested', 'combat_energy'],
  [100, 'resource.reserve_requested', 'mana'],
  [100, 'resource.reserve_requested', 'skill_charge'],
  [104, 'resource.commit_requested', 'combat_energy'],
  [104, 'resource.commit_requested', 'mana'],
  [110, 'resource.commit_requested', 'skill_charge'],
]);

assert.deepEqual(direct.events.filter(event => event.tick === 104).map(event => (
  event.type === 'resource.commit_requested'
    ? `${event.type}:${event.payload.resourceKey}`
    : event.type
)), [
  'guard_window.closed',
  'phase.exited',
  'phase.entered',
  'impact_window.opened',
  'resource.commit_requested:combat_energy',
  'resource.commit_requested:mana',
  'impact.requested',
], 'same-tick order is close -> phase transition -> open -> commit -> impact');

const zeroPhaseResult = createCombatDynamicsDefinition({
  ...definitionInput(),
  windupTicks: 0,
  castTicks: 0,
  recoveryTicks: 0,
  comboWindow: null,
  cancelPolicy: { windows: [{
    opensAtActionTick: 0,
    closesAtActionTickExclusive: 4,
    reasons: ['dodge'],
  }] },
  guard: null,
  movementLocks: [{
    lockId: 'zero-phase-lock',
    opensAtActionTick: 0,
    closesAtActionTickExclusive: 4,
    movementMultiplierBasisPoints: 0,
    authority: 'world_locomotion_owner',
  }],
  projectiles: [{
    ...definitionInput().projectiles[0],
    spawnAtActionTick: 2,
  }],
});
assert.equal(zeroPhaseResult.ok, true, zeroPhaseResult.reason);
const zeroPhaseDefinition = zeroPhaseResult.definition;
assert.deepEqual(zeroPhaseDefinition.timeline, {
  windupStartTick: 0,
  castStartTick: 0,
  activeStartTick: 0,
  recoveryStartTick: 4,
  completionTick: 4,
});
const zeroPhaseStart = createSchedule(zeroPhaseDefinition);
const zeroPhase = advance(zeroPhaseStart, zeroPhaseDefinition, 104);
assert.equal(zeroPhase.state.phase, 'completed');
assert.deepEqual(zeroPhase.events.filter(event => event.type.startsWith('phase.')).map(event => (
  [event.tick, event.type, event.payload.phase]
)), [
  [100, 'phase.entered', 'active'],
  [104, 'phase.exited', 'active'],
], 'zero-length phases are skipped without phantom enter/exit events');
assert.deepEqual(zeroPhase.events.slice(0, 10).map(event => (
  event.type === 'resource.reserve_requested' || event.type === 'resource.commit_requested'
    ? `${event.type}:${event.payload.resourceKey}`
    : event.type
)), [
  'action.started',
  'resource.reserve_requested:combat_energy',
  'resource.reserve_requested:mana',
  'resource.reserve_requested:skill_charge',
  'phase.entered',
  'impact_window.opened',
  'movement_lock.opened',
  'resource.commit_requested:combat_energy',
  'resource.commit_requested:mana',
  'impact.requested',
]);

const zeroTickCancelled = advance(zeroPhaseStart, zeroPhaseDefinition, 100, [{
  requestId: 'cancel-on-first-active-tick',
  authoritySequence: 1,
  type: 'cancel',
  atTick: 100,
  reason: 'dodge',
}]);
assert.equal(zeroTickCancelled.state.phase, 'cancelled');
assert.deepEqual(zeroTickCancelled.state.emittedHitOrdinals, []);
assert.equal(zeroTickCancelled.events.some(event => event.type === 'impact.requested'), false,
  'an accepted terminal transition wins before an impact scheduled on the same tick');
assert.deepEqual(zeroTickCancelled.events.filter(event => (
  event.type === 'impact_window.closed' || event.type === 'movement_lock.closed'
)).map(event => [event.type, event.payload.reason]), [
  ['impact_window.closed', 'cancelled'],
  ['movement_lock.closed', 'cancelled'],
]);

let incrementalState = createSchedule(definition);
const incrementalEvents = [];
for (let tick = 100; tick <= 110; tick += 1) {
  const tickResult = advance(incrementalState, definition, tick);
  incrementalState = tickResult.state;
  incrementalEvents.push(...tickResult.events);
}
assert.deepEqual(incrementalEvents, direct.events,
  'one-tick stepping and catch-up stepping produce the same canonical event stream');
assert.deepEqual(incrementalState, direct.state,
  'one-tick stepping and catch-up stepping produce the same fixed-tick state');
const repeatedCompletion = advance(direct.state, definition, 999);
assert.deepEqual(repeatedCompletion.state, direct.state);
assert.deepEqual(repeatedCompletion.events, []);
const afterTerminalRequest = advanceCombatDynamicsSchedule({
  state: direct.state,
  definition,
  throughTick: 999,
  transitionRequests: [{
    requestId: 'late-cancel', authoritySequence: 2,
    type: 'cancel', atTick: 109, reason: 'dodge',
  }],
});
assert.equal(afterTerminalRequest.reason, 'stale_transition_request');

assert.equal(createCombatDynamicsSchedule({
  combatId: 'combat:overflow',
  actionSequence: 1,
  actorEntityId: 'human:overflow',
  startTick: Number.MAX_SAFE_INTEGER,
  definition,
}).reason, 'invalid_schedule_identity');

const invalidCancelStart = createSchedule(definition);
const invalidCancel = advance(invalidCancelStart, definition, 104, [{
  requestId: 'cancel-too-early', authoritySequence: 3,
  type: 'cancel', atTick: 103, reason: 'dodge',
}]);
assert.equal(invalidCancel.state.phase, 'active');
assert.deepEqual(invalidCancel.state.emittedHitOrdinals, [0]);
assert.equal(invalidCancel.events.find(event => event.type === 'transition.rejected')?.payload.reason,
  'cancel_not_allowed');
assert.equal(validateCombatDynamicsState(invalidCancel.state, definition).ok, true);

const cancelStart = createSchedule(definition);
const cancelled = advance(cancelStart, definition, 109, [{
  requestId: 'cancel-before-wave', authoritySequence: 4,
  type: 'cancel', atTick: 105, reason: 'dodge',
}]);
assert.equal(cancelled.state.phase, 'cancelled');
assert.equal(cancelled.state.lastProcessedTick, 105);
assert.deepEqual(cancelled.state.emittedHitOrdinals, [0],
  'termination is evaluated before an impact on the same or later fixed tick');
assert.equal(cancelled.events.some(event => event.type === 'projectile.spawn_requested'), false);
const cancelRefunds = cancelled.events
  .filter(event => event.type === 'resource.refund_requested')
  .map(event => [event.payload.resourceKey, event.payload.policy]);
assert.deepEqual(cancelRefunds, [['mana', 'full'], ['skill_charge', 'uncommitted']]);
assert.equal(cancelled.events.find(event => event.type === 'action.cancelled')?.payload.requestId,
  'cancel-before-wave');
assert.equal(validateCombatDynamicsState(cancelled.state, definition).ok, true);

const interruptedStart = createSchedule(definition);
const interrupted = advance(interruptedStart, definition, 109, [
  {
    requestId: 'z-normal-stagger', authoritySequence: 5,
    type: 'interrupt', atTick: 105, reason: 'damage',
  },
  {
    requestId: 'a-guard-break', authoritySequence: 6,
    type: 'interrupt', atTick: 105, reason: 'guard_break',
  },
]);
assert.equal(interrupted.state.phase, 'interrupted');
assert.equal(interrupted.events.find(event => event.type === 'transition.rejected')?.payload.reason,
  'super_armor');
assert.equal(interrupted.events.find(event => event.type === 'transition.rejected')
  ?.payload.authoritySequence, 5,
  'authoritative sequence, not a lexically earlier requestId, orders equal-tick interrupts');
assert.equal(interrupted.events.find(event => event.type === 'action.interrupted')?.payload.requestId,
  'a-guard-break');
assert.equal(interrupted.events.find(event => event.type === 'action.interrupted')
  ?.payload.authoritySequence, 6);
assert.deepEqual(interrupted.events
  .filter(event => event.type === 'resource.refund_requested')
  .map(event => event.payload.resourceKey), ['skill_charge']);
assert.equal(validateCombatDynamicsState(interrupted.state, definition).ok, true);

function sameTickPriorityOutcome(cancelRequestId, interruptRequestId) {
  const priorityStart = createSchedule(definition);
  const priorityResult = advance(priorityStart, definition, 109, [
    {
      requestId: cancelRequestId, authoritySequence: 20,
      type: 'cancel', atTick: 105, reason: 'dodge',
    },
    {
      requestId: interruptRequestId, authoritySequence: 20,
      type: 'interrupt', atTick: 105, reason: 'guard_break',
    },
  ]);
  return {
    phase: priorityResult.state.phase,
    terminalReason: priorityResult.state.terminal.reason,
    acceptedType: priorityResult.events.find(event => (
      event.type === 'action.cancelled' || event.type === 'action.interrupted'
    ))?.type,
    acceptedAuthoritySequence: priorityResult.events.find(event => (
      event.type === 'action.cancelled' || event.type === 'action.interrupted'
    ))?.payload.authoritySequence,
    rejectedType: priorityResult.events.find(event => event.type === 'transition.rejected')
      ?.payload.transitionType,
    rejectedReason: priorityResult.events.find(event => event.type === 'transition.rejected')
      ?.payload.reason,
    refundedResources: priorityResult.events
      .filter(event => event.type === 'resource.refund_requested')
      .map(event => event.payload.resourceKey),
  };
}

const interruptPriorityWithEarlyCancelId = sameTickPriorityOutcome(
  'a-cancel-request',
  'z-interrupt-request',
);
const interruptPriorityWithLateCancelId = sameTickPriorityOutcome(
  'z-cancel-request',
  'a-interrupt-request',
);
assert.deepEqual(interruptPriorityWithEarlyCancelId, interruptPriorityWithLateCancelId,
  'requestId spelling cannot change an equal-tick transition outcome');
assert.deepEqual(interruptPriorityWithEarlyCancelId, {
  phase: 'interrupted',
  terminalReason: 'guard_break',
  acceptedType: 'action.interrupted',
  acceptedAuthoritySequence: 20,
  rejectedType: 'cancel',
  rejectedReason: 'action_terminal',
  refundedResources: ['skill_charge'],
}, 'fixed priority resolves an equal authoritative sequence before request identity');

const duplicateRaw = advanceCombatDynamicsSchedule({
  state: createSchedule(definition),
  definition,
  throughTick: 105,
  transitionRequests: [
    {
      requestId: 'duplicate', authoritySequence: 7,
      type: 'cancel', atTick: 105, reason: 'dodge',
    },
    {
      requestId: 'duplicate', authoritySequence: 7,
      type: 'cancel', atTick: 105, reason: 'dodge',
    },
  ],
});
assert.equal(duplicateRaw.reason, 'invalid_transition_request');

const missingAuthoritySequence = advanceCombatDynamicsSchedule({
  state: createSchedule(definition),
  definition,
  throughTick: 105,
  transitionRequests: [{
    requestId: 'missing-authority-sequence', type: 'cancel', atTick: 105, reason: 'dodge',
  }],
});
assert.equal(missingAuthoritySequence.reason, 'invalid_transition_request');

const duplicateAuthoritySequence = advanceCombatDynamicsSchedule({
  state: createSchedule(definition),
  definition,
  throughTick: 105,
  transitionRequests: [
    {
      requestId: 'first-authority-collision', authoritySequence: 30,
      type: 'cancel', atTick: 105, reason: 'dodge',
    },
    {
      requestId: 'second-authority-collision', authoritySequence: 30,
      type: 'cancel', atTick: 105, reason: 'combo_chain',
    },
  ],
});
assert.equal(duplicateAuthoritySequence.reason, 'duplicate_transition_authority_sequence');

const tooManyTransitions = advanceCombatDynamicsSchedule({
  state: createSchedule(definition),
  definition,
  throughTick: 104,
  transitionRequests: Array.from({ length: 65 }, (_, index) => ({
    requestId: `bounded-request-${String(index).padStart(2, '0')}`,
    authoritySequence: 100 + index,
    type: 'cancel',
    atTick: 103,
    reason: 'dodge',
  })),
});
assert.equal(tooManyTransitions.reason, 'invalid_transition_requests');

const replayedRequest = advance(cancelStart, definition, 109, [{
  requestId: 'cancel-before-wave', authoritySequence: 4,
  type: 'cancel', atTick: 105, reason: 'dodge',
}]);
assert.deepEqual(replayedRequest, cancelled, 'same snapshot plus command replays byte-for-byte deterministically');

const tamperedState = {
  ...directStart,
  eventSequence: 1,
};
assert.equal(validateCombatDynamicsState(tamperedState, definition).reason, 'event_sequence_mismatch');
assert.equal(direct.events.every((event, index) => event.eventSequence === index), true,
  'eventSequence is contiguous across the complete canonical stream');
assert.equal(direct.state.eventSequence, direct.events.length);

const throughStart = advance(directStart, definition, 100).state;
const resourceTimelineForgery = refingerprintState({
  ...throughStart,
  resourceProgress: throughStart.resourceProgress.map(progress => (
    progress.resourceKey === 'skill_charge'
      ? { ...progress, commitRequested: true }
      : progress
  )),
});
assert.equal(validateCombatDynamicsState(resourceTimelineForgery, definition).reason,
  'resource_progress_timeline_mismatch');

const eventSequenceForgery = refingerprintState({
  ...throughStart,
  eventSequence: throughStart.eventSequence + 1,
});
assert.equal(validateCombatDynamicsState(eventSequenceForgery, definition).reason,
  'event_sequence_mismatch');

const earlyCompletionForgery = refingerprintState({
  ...throughStart,
  phase: 'completed',
  terminal: { type: 'completed', reason: 'timeline', requestId: null, atTick: 100 },
});
assert.equal(validateCombatDynamicsState(earlyCompletionForgery, definition).reason,
  'invalid_terminal_state');

const orphanTerminalRequest = refingerprintState({
  ...cancelled.state,
  processedRequestIds: [],
  eventSequence: cancelled.state.eventSequence - 1,
});
assert.equal(validateCombatDynamicsState(orphanTerminalRequest, definition).reason,
  'invalid_terminal_state');

for (const event of direct.events) {
  const serialized = JSON.stringify(event.payload);
  assert.doesNotMatch(serialized, /"(?:hp|damage|worldPosition|position)"\s*:/i,
    'dynamics events contain no HP, damage, or position write payload');
}

const contractSource = fs.readFileSync(new URL('../combat-v91-dynamics-contract.mjs', import.meta.url), 'utf8');
const schedulerSource = fs.readFileSync(new URL('../combat-v91-dynamics-scheduler.mjs', import.meta.url), 'utf8');
for (const source of [contractSource, schedulerSource]) {
  assert.doesNotMatch(source, /Date\.now|new Date|Math\.random|performance\.now|requestAnimationFrame|setTimeout/);
  assert.doesNotMatch(source, /\b(?:clientDt|dtSec|deltaTime)\b/,
    'the scheduler accepts authoritative integer ticks, never client frame delta');
}

console.log('V9.1 Shared Combat Dynamics: PASS (fixed ticks, canonical phases, idempotent hits)');
