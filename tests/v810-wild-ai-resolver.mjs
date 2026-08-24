import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AI_ACTIONS,
  AI_STATES,
  DEFAULT_WILD_AI_PROFILE,
  advanceMonsterAI,
  createMonsterAIState,
  isCanonicalMonsterAIState,
  perceiveMonster,
  resetMonsterAIState,
  resolveWildMonsterAI,
  scoreMonsterTargets,
  settleWildAIIntent,
  validateMonsterAIState,
  validateMonsterAIProfile,
} from '../wild-ai-resolver.mjs';
import { WILD_BOSS_BASIC_AI_POLICY } from '../runtime-policies.mjs';

const encounterId = 'grass:1';
const actorId = 'wild-1';
const self = (overrides = {}) => ({
  id: actorId,
  encounterId,
  alive: true,
  capturing: false,
  engaged: false,
  hp: 100,
  maxHp: 100,
  position: { x: 0, z: 0 },
  home: { x: 0, z: 0 },
  attackReady: true,
  canMove: true,
  canAttack: true,
  forcedRetreat: false,
  ...overrides,
});
const target = (id = 'player', x = 1, z = 0, overrides = {}) => ({
  id,
  encounterId,
  alive: true,
  targetable: true,
  capturing: false,
  position: { x, z },
  recentDamage: 0,
  rolePriority: 0,
  ...overrides,
});
const state = overrides => createMonsterAIState({ actorId, encounterId, ...overrides });
const request = ({
  aiState = state(),
  actor = self(),
  targets = [],
  nowSec = 0,
  dtSec = 0,
  profile = DEFAULT_WILD_AI_PROFILE,
  canEngage = true,
} = {}) => ({
  state: aiState,
  snapshot: { nowSec, dtSec, self: actor, targets, profile },
  canEngage,
});
const resolve = overrides => resolveWildMonsterAI(request(overrides));

assert.deepEqual(AI_STATES, [
  'wander', 'alert', 'chase', 'orbit', 'attack_windup',
  'recover', 'retreat', 'reset', 'fainted',
]);
assert.deepEqual(AI_ACTIONS, ['idle', 'wander', 'move', 'basic_attack', 'reset']);
assert.equal(Object.isFrozen(AI_STATES), true);
assert.equal(Object.isFrozen(AI_ACTIONS), true);
assert.equal(Object.isFrozen(DEFAULT_WILD_AI_PROFILE), true);
assert.equal(DEFAULT_WILD_AI_PROFILE.aggroRadiusM, 4);
assert.equal(DEFAULT_WILD_AI_PROFILE.leashRadiusM, 18);
assert.equal(DEFAULT_WILD_AI_PROFILE.disengageRadiusM, 20);
assert.equal(DEFAULT_WILD_AI_PROFILE.preferredRangeMaxM, 1.25);
assert.equal(DEFAULT_WILD_AI_PROFILE.alertDurationSec, 0.35);
assert.equal(DEFAULT_WILD_AI_PROFILE.windupDurationSec, 0.22);
assert.equal(WILD_BOSS_BASIC_AI_POLICY.windupDurationSec, 0.65);
assert.equal(WILD_BOSS_BASIC_AI_POLICY.basicAttackCooldownSec, 0.85);
assert.equal(Object.isFrozen(WILD_BOSS_BASIC_AI_POLICY), true);
assert.equal(DEFAULT_WILD_AI_PROFILE.threatWeight, 0);
assert.equal(DEFAULT_WILD_AI_PROFILE.rolePriorityWeight, 0);
assert.equal(DEFAULT_WILD_AI_PROFILE.manualSkillSlots, 'never');
assert.equal(DEFAULT_WILD_AI_PROFILE.usesConsumed, 0);
assert.deepEqual(validateMonsterAIProfile(DEFAULT_WILD_AI_PROFILE), { ok: true, issues: [] });
assert.deepEqual(validateMonsterAIProfile({ ...DEFAULT_WILD_AI_PROFILE }), { ok: true, issues: [] });
assert.deepEqual(validateMonsterAIProfile(WILD_BOSS_BASIC_AI_POLICY), { ok: true, issues: [] });
assert.deepEqual(validateMonsterAIProfile({ ...DEFAULT_WILD_AI_PROFILE, id: 'unknown-profile' }), { ok: false, issues: ['invalid_ai_profile'] });
assert.deepEqual(validateMonsterAIProfile({ ...DEFAULT_WILD_AI_PROFILE, threatWeight: 1 }), { ok: false, issues: ['invalid_ai_profile'] });
assert.deepEqual(validateMonsterAIProfile({ ...DEFAULT_WILD_AI_PROFILE, rolePriorityWeight: 1 }), { ok: false, issues: ['invalid_ai_profile'] });

const initialState = state();
assert.ok(initialState);
assert.equal(initialState.state, 'wander');
assert.equal(initialState.targetId, null);
assert.equal(Object.isFrozen(initialState), true);
assert.equal(isCanonicalMonsterAIState(initialState), true);
assert.equal(isCanonicalMonsterAIState(structuredClone(initialState)), false);
assert.deepEqual(validateMonsterAIState(initialState), initialState);
assert.equal(validateMonsterAIState({ actorId, encounterId }), null, 'runtime validator requires the exact state schema');
assert.equal(createMonsterAIState({ actorId: '', encounterId }), null);
assert.equal(createMonsterAIState({ actorId, encounterId, extra: true }), null);
assert.equal(createMonsterAIState({ actorId, encounterId, state: 'skill' }), null);
assert.equal(state({ state: 'attack_windup', targetId: 'player' }), null,
  'windup state requires one canonical pending action');
assert.equal(state({
  state: 'attack_windup', targetId: 'player', nextActionSequence: 2,
  pendingAction: { kind: 'basic_attack', token: 'forged', targetId: 'player', issuedAtSec: null, commandSource: 'wildBasicAI' },
}), null, 'pending token is derived from actor, encounter, and monotonic sequence');
assert.equal(state({
  state: 'attack_windup', targetId: 'player', nextActionSequence: 2,
  pendingAction: { kind: 'basic_attack', token: 'wild-1:grass:1:1', targetId: 'player', issuedAtSec: null, commandSource: 'forged-source' },
}), null, 'pending command source is canonical');
assert.equal(state({
  state: 'wander', targetId: 'player', nextActionSequence: 2,
  pendingAction: { kind: 'basic_attack', token: 'wild-1:grass:1:1', targetId: 'player', issuedAtSec: null, commandSource: 'wildBasicAI' },
}), null, 'pending action exists only during attack windup');
assert.equal(advanceMonsterAI(initialState, -1), null);
assert.equal(advanceMonsterAI(initialState, 0.25).stateElapsedSec, 0.25);
assert.equal(advanceMonsterAI(state({ stateElapsedSec: Number.MAX_VALUE }), Number.MAX_VALUE), null,
  'state time overflow fails closed instead of emitting a non-canonical state');
assert.equal(resetMonsterAIState(state({
  state: 'attack_windup',
  targetId: 'player',
  nextActionSequence: 2,
  pendingAction: {
    kind: 'basic_attack', token: 'wild-1:grass:1:1', targetId: 'player', issuedAtSec: null, commandSource: 'wildBasicAI',
  },
})).nextActionSequence, 2);

const noTarget = resolve();
assert.equal(noTarget.ok, true);
assert.equal(noTarget.action, 'wander');
assert.equal(noTarget.reason, 'no_valid_target');

const notAssigned = resolve({ canEngage: false, targets: [target()] });
assert.equal(notAssigned.action, 'wander');
assert.equal(notAssigned.reason, 'not_engaged');

const lostSlot = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true }),
  targets: [target()],
  canEngage: false,
});
assert.equal(lostSlot.action, 'reset');
assert.equal(lostSlot.reason, 'engagement_slot_lost');
assert.equal(lostSlot.nextState.pendingAction, null);

const resetPending = resolve({
  aiState: state({ state: 'reset' }),
  targets: [target()],
});
assert.equal(resetPending.action, 'reset');
assert.equal(resetPending.reason, 'reset_pending');
assert.equal(resetPending.targetId, null, 'reset state dominates target reacquisition');

const aggroBoundary = resolve({ targets: [target('player', 4, 0)] });
assert.equal(aggroBoundary.nextState.state, 'alert');
assert.equal(aggroBoundary.targetId, 'player');
assert.equal(aggroBoundary.reason, 'target_acquired');
assert.equal(aggroBoundary.action, 'idle');
assert.equal(Object.isFrozen(aggroBoundary), true);
assert.equal(Object.isFrozen(aggroBoundary.nextState), true);
assert.equal(Object.isFrozen(aggroBoundary.transition), true);

const outsideAggro = resolve({ targets: [target('player', 4.000001, 0)] });
assert.equal(outsideAggro.action, 'wander');
assert.equal(outsideAggro.targetId, null);

const provokedOutsideAggro = resolve({
  actor: self({ engaged: true }),
  targets: [target('player', 5, 0)],
});
assert.equal(provokedOutsideAggro.nextState.state, 'alert');
assert.equal(provokedOutsideAggro.reason, 'target_acquired',
  'a ranged hit retains the provoked encounter outside passive aggro range');
const provokedOutsideDisengage = resolve({
  actor: self({ engaged: true }),
  targets: [target('player', 20.000001, 0)],
});
assert.equal(provokedOutsideDisengage.action, 'reset');
assert.equal(provokedOutsideDisengage.reason, 'target_invalid');
const acceptedBossAtPromptEdge = resolve({
  actor: self({ engaged: true }),
  targets: [target('player', 6, 0)],
  profile: WILD_BOSS_BASIC_AI_POLICY,
});
assert.equal(acceptedBossAtPromptEdge.nextState.state, 'alert');
assert.equal(acceptedBossAtPromptEdge.reason, 'target_acquired',
  'accepting a Boss at the 6m prompt edge cannot auto-exit against the 4m passive aggro radius');

const alertPending = resolve({
  aiState: state({ state: 'alert', targetId: 'player' }),
  actor: self({ engaged: true }),
  targets: [target()],
  dtSec: 0.349999,
});
assert.equal(alertPending.reason, 'alert_telegraph');
assert.equal(alertPending.nextState.state, 'alert');

const alertComplete = resolve({
  aiState: state({ state: 'alert', targetId: 'player' }),
  actor: self({ engaged: true }),
  targets: [target()],
  dtSec: 0.35,
});
assert.equal(alertComplete.reason, 'alert_complete');
assert.equal(alertComplete.nextState.state, 'chase');
assert.equal(alertComplete.action, 'idle', 'alert completion never damages in the same decision');

const moving = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true }),
  targets: [target('player', 3, 4)],
});
assert.equal(moving.action, 'move');
assert.equal(moving.reason, 'approach_target');
assert.deepEqual(moving.direction, { x: 0.6, z: 0.8 });
assert.equal(Object.isFrozen(moving.direction), true);

const movementBlocked = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true, canMove: false }),
  targets: [target('player', 2, 0)],
});
assert.equal(movementBlocked.action, 'idle');
assert.equal(movementBlocked.reason, 'movement_blocked_by_status');
assert.equal(movementBlocked.nextState.state, 'chase', 'a movement-only lock must not become an action lock');

const hardActionBlockedOutsideRange = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true, canMove: false, canAttack: false }),
  targets: [target('player', 2, 0)],
});
assert.equal(hardActionBlockedOutsideRange.action, 'idle');
assert.equal(hardActionBlockedOutsideRange.reason, 'action_blocked_by_status');
assert.equal(hardActionBlockedOutsideRange.nextState.state, 'recover');

const forcedRetreat = resolve({
  aiState: state({ state: 'attack_windup', targetId: 'player', nextActionSequence: 2, pendingAction: {
    kind: 'basic_attack', token: 'wild-1:grass:1:1', targetId: 'player', issuedAtSec: null, commandSource: 'wildBasicAI',
  } }),
  actor: self({ engaged: true, canAttack: false, forcedRetreat: true }),
  targets: [target('player', 1, 0)],
});
assert.equal(forcedRetreat.action, 'move');
assert.equal(forcedRetreat.reason, 'forced_retreat');
assert.deepEqual(forcedRetreat.direction, { x: -1, z: 0 });
assert.equal(forcedRetreat.nextState.state, 'retreat');
assert.equal(forcedRetreat.nextState.pendingAction, null);

const attackBlocked = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true, canAttack: false }),
  targets: [target()],
});
assert.equal(attackBlocked.action, 'idle');
assert.equal(attackBlocked.reason, 'attack_blocked_by_status');
assert.equal(attackBlocked.nextState.state, 'recover');

const recoverWhileBlocked = resolve({
  aiState: state({ state: 'recover', targetId: 'player', stateElapsedSec: DEFAULT_WILD_AI_PROFILE.recoverDurationSec }),
  actor: self({ engaged: true, canMove: false, canAttack: false }),
  targets: [target()],
});
assert.equal(recoverWhileBlocked.action, 'idle');
assert.equal(recoverWhileBlocked.reason, 'action_blocked_by_status');
assert.equal(recoverWhileBlocked.nextState.state, 'recover', 'hard action lock must remain in recover until released');

const recoverWhileAttackBlocked = resolve({
  aiState: state({ state: 'recover', targetId: 'player', stateElapsedSec: DEFAULT_WILD_AI_PROFILE.recoverDurationSec }),
  actor: self({ engaged: true, canMove: true, canAttack: false }),
  targets: [target()],
});
assert.equal(recoverWhileAttackBlocked.reason, 'attack_blocked_by_status');
assert.equal(recoverWhileAttackBlocked.nextState.state, 'recover', 'an attack-only lock must also hold recover');

const lockedPendingAction = {
  kind: 'basic_attack', token: `${actorId}:${encounterId}:1`, targetId: 'player',
  issuedAtSec: null, commandSource: 'wildBasicAI',
};
for (const [label, aiState] of [
  ['wander acquisition', state()],
  ['alert pending', state({ state: 'alert', targetId: 'player' })],
  ['alert complete', state({ state: 'alert', targetId: 'player', stateElapsedSec: DEFAULT_WILD_AI_PROFILE.alertDurationSec })],
  ['orbit', state({ state: 'orbit', targetId: 'player' })],
  ['retreat', state({ state: 'retreat', targetId: 'player' })],
  ['windup', state({ state: 'attack_windup', targetId: 'player', nextActionSequence: 2, pendingAction: lockedPendingAction })],
]) {
  const locked = resolve({ aiState, actor: self({ engaged: true, canMove: false, canAttack: false }), targets: [target()] });
  assert.equal(locked.action, 'idle', `${label} cannot emit an action under a hard status lock`);
  assert.equal(locked.reason, 'action_blocked_by_status', `${label} uses the centralized hard-lock reason`);
  assert.equal(locked.nextState.state, 'recover', `${label} transitions to recover under a hard status lock`);
  assert.equal(locked.nextState.pendingAction, null, `${label} clears any pending attack token`);
}

const blockedForcedRetreat = resolve({
  aiState: state({ state: 'alert', targetId: 'player' }),
  actor: self({ engaged: true, canMove: false, canAttack: false, forcedRetreat: true }),
  targets: [target()],
});
assert.equal(blockedForcedRetreat.reason, 'forced_retreat_blocked');
assert.equal(blockedForcedRetreat.nextState.state, 'retreat', 'forced retreat remains higher priority than the hard action lock');
const freshForcedRetreat = resolve({
  aiState: state(), actor: self({ engaged: true, forcedRetreat: true }), targets: [target()],
});
assert.equal(freshForcedRetreat.reason, 'forced_retreat');
assert.equal(freshForcedRetreat.nextState.state, 'retreat');
assert.equal(freshForcedRetreat.targetId, 'player', 'fresh target acquisition cannot mask forced retreat');

const cooldown = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true, attackReady: false }),
  targets: [target()],
});
assert.equal(cooldown.action, 'idle');
assert.equal(cooldown.reason, 'basic_attack_cooldown');
const exhaustedSequence = resolve({
  aiState: state({ state: 'chase', targetId: 'player', nextActionSequence: Number.MAX_SAFE_INTEGER }),
  actor: self({ engaged: true }),
  targets: [target()],
});
assert.equal(exhaustedSequence.ok, false);
assert.equal(exhaustedSequence.reason, 'action_sequence_exhausted');
assert.equal(exhaustedSequence.intent, null);

const windup = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true }),
  targets: [target('player', 1.25, 0)],
});
assert.equal(windup.action, 'idle');
assert.equal(windup.reason, 'basic_attack_windup');
assert.equal(windup.nextState.state, 'attack_windup');
assert.equal(windup.nextState.pendingAction.kind, 'basic_attack');
assert.equal(windup.nextState.nextActionSequence, 2);

const windupPending = resolve({
  aiState: windup.nextState,
  actor: self({ engaged: true }),
  targets: [target('player', 1.25, 0)],
  dtSec: 0.219999,
});
assert.equal(windupPending.action, 'idle');
assert.equal(windupPending.reason, 'attack_windup_pending');

const bossWindup = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true }),
  targets: [target('player', 1.25, 0)],
  profile: WILD_BOSS_BASIC_AI_POLICY,
});
const bossWindupPending = resolve({
  aiState: bossWindup.nextState,
  actor: self({ engaged: true }),
  targets: [target('player', 1.25, 0)],
  dtSec: 0.649999,
  profile: WILD_BOSS_BASIC_AI_POLICY,
});
assert.equal(bossWindupPending.action, 'idle');
assert.equal(bossWindupPending.reason, 'attack_windup_pending');
const bossAttackReady = resolve({
  aiState: bossWindup.nextState,
  actor: self({ engaged: true }),
  targets: [target('player', 1.25, 0)],
  dtSec: 0.65,
  profile: WILD_BOSS_BASIC_AI_POLICY,
});
assert.equal(bossAttackReady.action, 'basic_attack');
assert.equal(bossAttackReady.reason, 'basic_attack_ready');

const attackReady = resolve({
  aiState: windup.nextState,
  actor: self({ engaged: true }),
  targets: [target('player', 1.25, 0)],
  nowSec: 10,
  dtSec: 0.22,
});
assert.equal(attackReady.action, 'basic_attack');
assert.equal(attackReady.reason, 'basic_attack_ready');
assert.equal(attackReady.nextState.state, 'attack_windup', 'executor must settle the pending intent');
assert.equal(attackReady.intent.kind, 'basic_attack');
assert.equal(attackReady.intent.actorId, actorId);
assert.equal(attackReady.intent.targetId, 'player');
assert.equal(attackReady.intent.skillId, null);
assert.equal(attackReady.intent.commandSource, 'wildBasicAI');
assert.equal(attackReady.intent.usesConsumed, 0);
assert.equal(attackReady.nextState.pendingAction.issuedAtSec, attackReady.intent.issuedAtSec);
assert.equal(attackReady.nextState.pendingAction.commandSource, attackReady.intent.commandSource);
const futurePending = resolve({
  aiState: state({
    ...windup.nextState,
    pendingAction: { ...windup.nextState.pendingAction, issuedAtSec: 999 },
  }),
  actor: self({ engaged: true }),
  targets: [target()],
  nowSec: 1,
  dtSec: 0.22,
});
assert.equal(futurePending.action, 'idle');
assert.equal(futurePending.reason, 'pending_action_invalid');
assert.equal(futurePending.nextState.pendingAction, null);
assert.equal('slot' in attackReady.intent, false);
assert.equal('currentUses' in attackReady.intent, false);
assert.equal(Object.isFrozen(attackReady.intent), true);

const accepted = settleWildAIIntent(attackReady.nextState, attackReady.intent, true);
assert.equal(accepted.ok, true);
assert.equal(accepted.reason, 'basic_attack_committed');
assert.equal(accepted.nextState.state, 'recover');
assert.equal(accepted.nextState.pendingAction, null);
const rejected = settleWildAIIntent(attackReady.nextState, attackReady.intent, false);
assert.equal(rejected.ok, true);
assert.equal(rejected.reason, 'basic_attack_rejected');
assert.equal(rejected.nextState.state, 'chase');
assert.equal(rejected.nextState.pendingAction, null);
assert.equal(settleWildAIIntent(attackReady.nextState, { ...attackReady.intent, targetId: 'other' }, true).ok, false);
assert.equal(settleWildAIIntent(attackReady.nextState, { ...attackReady.intent, commandSource: 'forged-source' }, true).ok, false);
assert.equal(settleWildAIIntent(attackReady.nextState, { ...attackReady.intent, issuedAtSec: 999 }, true).ok, false);

const rangeCancelled = resolve({
  aiState: windup.nextState,
  actor: self({ engaged: true }),
  targets: [target('player', 1.250001, 0)],
  dtSec: 0.22,
});
assert.equal(rangeCancelled.action, 'idle');
assert.equal(rangeCancelled.reason, 'windup_cancelled_range');
assert.equal(rangeCancelled.nextState.state, 'chase');
assert.equal(rangeCancelled.nextState.pendingAction, null);

const statusCancelled = resolve({
  aiState: windup.nextState,
  actor: self({ engaged: true, canAttack: false }),
  targets: [target()],
  dtSec: 0.22,
});
assert.equal(statusCancelled.reason, 'windup_cancelled_status');
assert.equal(statusCancelled.nextState.state, 'recover');

const targetDied = resolve({
  aiState: windup.nextState,
  actor: self({ engaged: true }),
  targets: [target('player', 1, 0, { alive: false })],
  dtSec: 0.22,
});
assert.equal(targetDied.action, 'reset');
assert.equal(targetDied.reason, 'target_invalid');
assert.equal(targetDied.intent, null);

const targetChanged = resolve({
  aiState: windup.nextState,
  actor: self({ engaged: true }),
  targets: [
    target('player', 1, 0, { alive: false }),
    target('owned-2', 1, 0),
  ],
  dtSec: 0.22,
});
assert.equal(targetChanged.action, 'idle');
assert.equal(targetChanged.reason, 'target_acquired');
assert.equal(targetChanged.targetId, 'owned-2');
assert.equal(targetChanged.nextState.state, 'alert');
assert.equal(targetChanged.nextState.pendingAction, null);

const leashBoundary = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true, position: { x: 18, z: 0 } }),
  targets: [target('player', 18, 0)],
});
assert.notEqual(leashBoundary.action, 'reset');
const outsideLeash = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true, position: { x: 18.000001, z: 0 } }),
  targets: [target('player', 18.000001, 0)],
});
assert.equal(outsideLeash.action, 'reset');
assert.equal(outsideLeash.reason, 'outside_leash');

const disengageBoundary = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true }),
  targets: [target('player', 20, 0)],
});
assert.notEqual(disengageBoundary.action, 'reset');
const outsideDisengage = resolve({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true }),
  targets: [target('player', 20.000001, 0)],
});
assert.equal(outsideDisengage.action, 'reset');
assert.equal(outsideDisengage.reason, 'target_invalid');

const capturing = resolve({
  aiState: windup.nextState,
  actor: self({ engaged: true, capturing: true }),
  targets: [target()],
});
assert.equal(capturing.action, 'idle');
assert.equal(capturing.reason, 'actor_capturing');
assert.equal(capturing.nextState.pendingAction, null);
const fainted = resolve({ actor: self({ alive: false, hp: 0 }) });
assert.equal(fainted.nextState.state, 'fainted');
assert.equal(fainted.reason, 'actor_fainted');

const tie = resolve({
  targets: [target('target-b', 3, 4), target('target-a', -3, -4)],
});
assert.equal(tie.targetId, null, 'targets outside aggro are not acquired despite equal score');
const aggroTie = resolve({
  targets: [target('target-b', 0, 4), target('target-a', 0, -4)],
});
assert.equal(aggroTie.targetId, 'target-a');
const reverseAggroTie = resolve({
  targets: [target('target-a', 0, -4), target('target-b', 0, 4)],
});
assert.equal(reverseAggroTie.targetId, 'target-a');

const retainLocked = resolve({
  aiState: state({
    state: 'chase',
    targetId: 'current',
    retargetRemainingSec: 1,
  }),
  actor: self({ engaged: true }),
  targets: [target('current', 19, 0), target('near', 1, 0)],
});
assert.equal(retainLocked.targetId, 'current');
const switchedAfterLock = resolve({
  aiState: state({ state: 'chase', targetId: 'current' }),
  actor: self({ engaged: true }),
  targets: [target('current', 19, 0), target('near', 1, 0)],
});
assert.equal(switchedAfterLock.targetId, 'near');
assert.equal(switchedAfterLock.nextState.state, 'alert');

const perception = perceiveMonster({
  self: self(),
  targets: [target('same-encounter', 1, 0), target('other-encounter', 1, 0, { encounterId: 'other:1' })],
  profile: DEFAULT_WILD_AI_PROFILE,
});
assert.equal(perception.ok, true);
assert.equal(perception.visibleTargets.length, 2);
assert.deepEqual(perception.validTargets.map(entry => entry.id), ['same-encounter']);
assert.equal(Object.isFrozen(perception.validTargets), true);

const scored = scoreMonsterTargets({
  self: self(),
  targets: [target('b', 3, 0), target('a', 3, 0)],
  currentTargetId: null,
  profile: DEFAULT_WILD_AI_PROFILE,
  retargetAllowed: true,
});
assert.equal(scored.ok, true);
assert.equal(scored.targetId, 'a');
assert.equal(Object.isFrozen(scored.candidates), true);
const threatNeutral = scoreMonsterTargets({
  self: self(),
  targets: [target('near', 1, 0), target('threat', 3, 0, { recentDamage: Number.MAX_SAFE_INTEGER })],
  currentTargetId: null,
  profile: DEFAULT_WILD_AI_PROFILE,
  retargetAllowed: true,
});
assert.equal(threatNeutral.targetId, 'near', 'threat metadata stays neutral while its locked weight is zero');
const roleNeutral = scoreMonsterTargets({
  self: self(),
  targets: [target('near', 1, 0), target('role', 3, 0, { rolePriority: Number.MAX_SAFE_INTEGER })],
  currentTargetId: null,
  profile: DEFAULT_WILD_AI_PROFILE,
  retargetAllowed: true,
});
assert.equal(roleNeutral.targetId, 'near', 'role metadata stays neutral while its locked weight is zero');
const hysteresisRetained = scoreMonsterTargets({
  self: self(),
  targets: [target('current', 9, 0), target('new', 0, 0)],
  currentTargetId: 'current',
  profile: DEFAULT_WILD_AI_PROFILE,
  retargetAllowed: true,
});
assert.equal(hysteresisRetained.targetId, 'current');
assert.equal(hysteresisRetained.reason, 'target_hysteresis');
const hysteresisBoundary = scoreMonsterTargets({
  self: self(),
  targets: [target('current', 10, 0), target('new', 0, 0)],
  currentTargetId: 'current',
  profile: DEFAULT_WILD_AI_PROFILE,
  retargetAllowed: true,
});
assert.equal(hysteresisBoundary.targetId, 'new', 'a challenger exactly at the margin may switch');
assert.equal(hysteresisBoundary.reason, 'best_target');

const invalidProfile = { ...DEFAULT_WILD_AI_PROFILE, threatWeight: Number.NaN };
assert.equal(validateMonsterAIProfile(invalidProfile).ok, false);
assert.equal(resolve({ profile: invalidProfile }).ok, false);
assert.equal(resolve({ profile: { ...DEFAULT_WILD_AI_PROFILE, extra: true } }).ok, false);

const deterministicRequest = request({
  aiState: state({ state: 'chase', targetId: 'player' }),
  actor: self({ engaged: true }),
  targets: [target('player', 3, 4)],
  nowSec: 4,
  dtSec: 0.05,
});
const before = structuredClone(deterministicRequest);
assert.deepEqual(resolveWildMonsterAI(deterministicRequest), resolveWildMonsterAI(deterministicRequest));
assert.deepEqual(deterministicRequest, before, 'pure resolver does not mutate caller input');
const resolverSource = fs.readFileSync(new URL('../wild-ai-resolver.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(resolverSource, /Math\.random|Date\.now|\bwindow\b|\bdocument\b|\bTHREE\b/,
  'pure resolver remains deterministic and browser-independent');

const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('hostile input'); } });
assert.doesNotThrow(() => resolveWildMonsterAI(hostile));
assert.equal(resolveWildMonsterAI(hostile).ok, false);
assert.equal(resolveWildMonsterAI({ ...request(), extra: true }).reason, 'invalid_ai_request');
assert.equal(resolveWildMonsterAI(request({ actor: self({ position: { x: Infinity, z: 0 } }) })).ok, false);
assert.equal(resolveWildMonsterAI(request({
  targets: [target('duplicate'), target('duplicate', 2, 0)],
})).ok, false);
assert.equal(resolveWildMonsterAI(request({ targets: [target(actorId)] })).ok, false);

console.log('V8.10 AI-1 pure Wild AI resolver: PASS');
