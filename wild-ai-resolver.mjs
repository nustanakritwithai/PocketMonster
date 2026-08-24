// PocketMonster V8.10 — pure deterministic Wild Monster AI resolver.
//
// This module reads plain snapshots and returns plain decisions. It never
// mutates HP, positions, cooldowns, inventory, save data, DOM, or Three.js
// objects. Runtime code must materialize and revalidate every emitted intent.

import { WILD_BASIC_AI_POLICY, WILD_BOSS_BASIC_AI_POLICY } from './runtime-policies.mjs';

export const AI_STATES = Object.freeze([
  'wander',
  'alert',
  'chase',
  'orbit',
  'attack_windup',
  'recover',
  'retreat',
  'reset',
  'fainted',
]);

export const AI_ACTIONS = Object.freeze([
  'idle',
  'wander',
  'move',
  'basic_attack',
  'reset',
]);

const AI_STATE_SET = new Set(AI_STATES);
const CANONICAL_AI_STATES = new WeakSet();
const PROFILE_FIELDS = Object.freeze([
  'id',
  'preferredRangeMinM',
  'preferredRangeMaxM',
  'aggroRadiusM',
  'leashRadiusM',
  'disengageRadiusM',
  'retargetCooldownSec',
  'targetSwitchMargin',
  'currentTargetBonus',
  'distanceWeight',
  'threatWeight',
  'rolePriorityWeight',
  'alertDurationSec',
  'windupDurationSec',
  'recoverDurationSec',
  'basicAttackCooldownSec',
  'bossAttackCooldownSec',
  'commandSource',
  'manualSkillSlots',
  'usesConsumed',
]);
const STATE_FIELDS = Object.freeze([
  'actorId',
  'encounterId',
  'state',
  'targetId',
  'stateElapsedSec',
  'retargetRemainingSec',
  'nextActionSequence',
  'pendingAction',
]);
const PENDING_ACTION_FIELDS = Object.freeze([
  'kind',
  'token',
  'targetId',
  'issuedAtSec',
  'commandSource',
]);
const SNAPSHOT_FIELDS = Object.freeze(['nowSec', 'dtSec', 'self', 'targets', 'profile']);
const SELF_FIELDS = Object.freeze([
  'id',
  'encounterId',
  'alive',
  'capturing',
  'engaged',
  'hp',
  'maxHp',
  'position',
  'home',
  'attackReady',
  'canMove',
  'canAttack',
  'forcedRetreat',
]);
const TARGET_FIELDS = Object.freeze([
  'id',
  'encounterId',
  'alive',
  'targetable',
  'capturing',
  'position',
  'recentDamage',
  'rolePriority',
]);
const POSITION_FIELDS = Object.freeze(['x', 'z']);
const PERCEPTION_REQUEST_FIELDS = Object.freeze(['self', 'targets', 'profile']);
const SCORE_REQUEST_FIELDS = Object.freeze([
  'self',
  'targets',
  'currentTargetId',
  'profile',
  'retargetAllowed',
]);
const RESOLVE_REQUEST_FIELDS = Object.freeze(['state', 'snapshot', 'canEngage']);
const INTENT_FIELDS = Object.freeze([
  'kind',
  'actorId',
  'targetId',
  'encounterId',
  'skillId',
  'actionToken',
  'issuedAtSec',
  'reason',
  'commandSource',
  'usesConsumed',
]);

function dataRecordSnapshot(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return null;
  const snapshot = Object.create(null);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    snapshot[field] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function optionalDataRecordSnapshot(value, allowedFields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !allowedFields.includes(key))) return null;
  const snapshot = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function dataArraySnapshot(value) {
  if (!Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || !keys.includes('length')) return null;
  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const field = String(index);
    if (!keys.includes(field)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    snapshot.push(descriptor.value);
  }
  return Object.freeze(snapshot);
}

function stableId(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function stableIdCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function positionSnapshot(value) {
  const position = dataRecordSnapshot(value, POSITION_FIELDS);
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  return Object.freeze({ x: position.x, z: position.z });
}

function distanceBetween(left, right) {
  return Math.hypot(right.x - left.x, right.z - left.z);
}

function profileSnapshot(input) {
  const profile = dataRecordSnapshot(input, PROFILE_FIELDS);
  if (!profile || !stableId(profile.id)
    || !stableId(profile.commandSource)
    || profile.manualSkillSlots !== 'never'
    || profile.usesConsumed !== 0) return null;
  const canonical = profile.id === WILD_BASIC_AI_POLICY.id
    ? WILD_BASIC_AI_POLICY
    : profile.id === WILD_BOSS_BASIC_AI_POLICY.id
      ? WILD_BOSS_BASIC_AI_POLICY
      : null;
  if (!canonical
    || PROFILE_FIELDS.some(field => field !== 'id' && profile[field] !== canonical[field])) return null;
  for (const field of [
    'preferredRangeMinM',
    'preferredRangeMaxM',
    'aggroRadiusM',
    'leashRadiusM',
    'disengageRadiusM',
    'retargetCooldownSec',
    'targetSwitchMargin',
    'currentTargetBonus',
    'distanceWeight',
    'threatWeight',
    'rolePriorityWeight',
    'alertDurationSec',
    'windupDurationSec',
    'recoverDurationSec',
    'basicAttackCooldownSec',
    'bossAttackCooldownSec',
  ]) {
    if (!Number.isFinite(profile[field]) || profile[field] < 0) return null;
  }
  if (profile.preferredRangeMinM > profile.preferredRangeMaxM
    || profile.preferredRangeMaxM > profile.aggroRadiusM
    || profile.aggroRadiusM > profile.leashRadiusM
    || profile.leashRadiusM > profile.disengageRadiusM
    || profile.retargetCooldownSec <= 0
    || profile.alertDurationSec <= 0
    || profile.windupDurationSec <= 0
    || profile.basicAttackCooldownSec <= 0
    || profile.bossAttackCooldownSec <= 0) return null;
  return Object.freeze({ ...profile });
}

function pendingActionSnapshot(input) {
  if (input === null) return null;
  const pending = dataRecordSnapshot(input, PENDING_ACTION_FIELDS);
  if (!pending
    || pending.kind !== 'basic_attack'
    || !stableId(pending.token)
    || !stableId(pending.targetId)
    || pending.issuedAtSec !== null
      && (!Number.isFinite(pending.issuedAtSec) || pending.issuedAtSec < 0)
    || pending.commandSource !== WILD_BASIC_AI_POLICY.commandSource) return undefined;
  return Object.freeze({ ...pending });
}

function stateSnapshot(input) {
  const state = dataRecordSnapshot(input, STATE_FIELDS);
  const pendingAction = pendingActionSnapshot(state?.pendingAction);
  if (!state
    || !stableId(state.actorId)
    || !stableId(state.encounterId)
    || !AI_STATE_SET.has(state.state)
    || state.targetId !== null && !stableId(state.targetId)
    || !Number.isFinite(state.stateElapsedSec) || state.stateElapsedSec < 0
    || !Number.isFinite(state.retargetRemainingSec) || state.retargetRemainingSec < 0
    || !Number.isSafeInteger(state.nextActionSequence) || state.nextActionSequence < 1
    || pendingAction === undefined
    || pendingAction !== null && state.targetId !== pendingAction.targetId
    || (state.state === 'attack_windup') !== (pendingAction !== null)
    || pendingAction !== null && (
      state.nextActionSequence < 2
      || pendingAction.targetId === state.actorId
      || pendingAction.token !== `${state.actorId}:${state.encounterId}:${state.nextActionSequence - 1}`
    )) return null;
  const canonical = Object.freeze({
    actorId: state.actorId,
    encounterId: state.encounterId,
    state: state.state,
    targetId: state.targetId,
    stateElapsedSec: state.stateElapsedSec,
    retargetRemainingSec: state.retargetRemainingSec,
    nextActionSequence: state.nextActionSequence,
    pendingAction,
  });
  CANONICAL_AI_STATES.add(canonical);
  return canonical;
}

function selfSnapshot(input) {
  const self = dataRecordSnapshot(input, SELF_FIELDS);
  const position = positionSnapshot(self?.position);
  const home = positionSnapshot(self?.home);
  if (!self
    || !stableId(self.id)
    || !stableId(self.encounterId)
    || typeof self.alive !== 'boolean'
    || typeof self.capturing !== 'boolean'
    || typeof self.engaged !== 'boolean'
    || !Number.isFinite(self.hp)
    || !Number.isFinite(self.maxHp) || self.maxHp <= 0
    || self.hp < 0 || self.hp > self.maxHp
    || typeof self.attackReady !== 'boolean'
    || typeof self.canMove !== 'boolean'
    || typeof self.canAttack !== 'boolean'
    || typeof self.forcedRetreat !== 'boolean'
    || !position
    || !home) return null;
  return Object.freeze({
    id: self.id,
    encounterId: self.encounterId,
    alive: self.alive,
    capturing: self.capturing,
    engaged: self.engaged,
    hp: self.hp,
    maxHp: self.maxHp,
    position,
    home,
    attackReady: self.attackReady,
    canMove: self.canMove,
    canAttack: self.canAttack,
    forcedRetreat: self.forcedRetreat,
  });
}

function targetSnapshots(input, actorId) {
  const records = dataArraySnapshot(input);
  if (!records) return null;
  const ids = new Set();
  const targets = [];
  for (const candidateInput of records) {
    const candidate = dataRecordSnapshot(candidateInput, TARGET_FIELDS);
    const position = positionSnapshot(candidate?.position);
    if (!candidate
      || !stableId(candidate.id)
      || !stableId(candidate.encounterId)
      || candidate.id === actorId
      || ids.has(candidate.id)
      || typeof candidate.alive !== 'boolean'
      || typeof candidate.targetable !== 'boolean'
      || typeof candidate.capturing !== 'boolean'
      || !Number.isFinite(candidate.recentDamage) || candidate.recentDamage < 0
      || !Number.isFinite(candidate.rolePriority)
      || !position) return null;
    ids.add(candidate.id);
    targets.push(Object.freeze({
      id: candidate.id,
      encounterId: candidate.encounterId,
      alive: candidate.alive,
      targetable: candidate.targetable,
      capturing: candidate.capturing,
      position,
      recentDamage: candidate.recentDamage,
      rolePriority: candidate.rolePriority,
    }));
  }
  return Object.freeze(targets);
}

function snapshotContract(input) {
  const snapshot = dataRecordSnapshot(input, SNAPSHOT_FIELDS);
  const self = selfSnapshot(snapshot?.self);
  const targets = self ? targetSnapshots(snapshot?.targets, self.id) : null;
  const profile = profileSnapshot(snapshot?.profile);
  if (!snapshot
    || !Number.isFinite(snapshot.nowSec) || snapshot.nowSec < 0
    || !Number.isFinite(snapshot.dtSec) || snapshot.dtSec < 0
    || !self
    || !targets
    || !profile) return null;
  return Object.freeze({
    nowSec: snapshot.nowSec,
    dtSec: snapshot.dtSec,
    self,
    targets,
    profile,
  });
}

function intentSnapshot(input) {
  const intent = dataRecordSnapshot(input, INTENT_FIELDS);
  if (!intent
    || intent.kind !== 'basic_attack'
    || !stableId(intent.actorId)
    || !stableId(intent.targetId)
    || !stableId(intent.encounterId)
    || intent.skillId !== null
    || !stableId(intent.actionToken)
    || !Number.isFinite(intent.issuedAtSec) || intent.issuedAtSec < 0
    || intent.reason !== 'target_in_basic_range'
    || intent.commandSource !== WILD_BASIC_AI_POLICY.commandSource
    || intent.usesConsumed !== 0) return null;
  return Object.freeze({ ...intent });
}

function failure(reason) {
  return Object.freeze({
    ok: false,
    reason,
    action: 'idle',
    targetId: null,
    direction: null,
    intent: null,
    transition: null,
    nextState: null,
  });
}

function transitionState(state, toState, reason, overrides = {}) {
  const targetId = Object.prototype.hasOwnProperty.call(overrides, 'targetId')
    ? overrides.targetId
    : state.targetId;
  const pendingAction = Object.prototype.hasOwnProperty.call(overrides, 'pendingAction')
    ? overrides.pendingAction
    : state.pendingAction;
  return Object.freeze({
    actorId: state.actorId,
    encounterId: state.encounterId,
    state: toState,
    targetId,
    stateElapsedSec: 0,
    retargetRemainingSec: Object.prototype.hasOwnProperty.call(overrides, 'retargetRemainingSec')
      ? overrides.retargetRemainingSec
      : state.retargetRemainingSec,
    nextActionSequence: Object.prototype.hasOwnProperty.call(overrides, 'nextActionSequence')
      ? overrides.nextActionSequence
      : state.nextActionSequence,
    pendingAction,
    transitionReason: reason,
  });
}

function stripTransitionReason(state) {
  return Object.freeze({
    actorId: state.actorId,
    encounterId: state.encounterId,
    state: state.state,
    targetId: state.targetId,
    stateElapsedSec: state.stateElapsedSec,
    retargetRemainingSec: state.retargetRemainingSec,
    nextActionSequence: state.nextActionSequence,
    pendingAction: state.pendingAction,
  });
}

function decision({
  previousState,
  nextState,
  action = 'idle',
  targetId = nextState.targetId,
  direction = null,
  intent = null,
  reason,
}) {
  const canonicalNext = stripTransitionReason(nextState);
  const transition = previousState.state === canonicalNext.state
    ? null
    : Object.freeze({
      fromState: previousState.state,
      toState: canonicalNext.state,
      targetId: canonicalNext.targetId,
      reason,
    });
  return Object.freeze({
    ok: true,
    reason,
    action,
    targetId,
    direction: direction ? Object.freeze({ ...direction }) : null,
    intent: intent ? Object.freeze({ ...intent }) : null,
    transition,
    nextState: canonicalNext,
  });
}

export function validateMonsterAIProfile(input) {
  try {
    const profile = profileSnapshot(input);
    return Object.freeze({
      ok: profile !== null,
      issues: Object.freeze(profile ? [] : ['invalid_ai_profile']),
    });
  } catch {
    return Object.freeze({ ok: false, issues: Object.freeze(['invalid_ai_profile']) });
  }
}

export function createMonsterAIState(input = {}) {
  try {
    const fields = Object.freeze([
      'actorId',
      'encounterId',
      'state',
      'targetId',
      'stateElapsedSec',
      'retargetRemainingSec',
      'nextActionSequence',
      'pendingAction',
    ]);
    const record = optionalDataRecordSnapshot(input, fields);
    if (!record || !stableId(record.actorId) || !stableId(record.encounterId)) return null;
    const state = {
      actorId: record.actorId,
      encounterId: record.encounterId,
      state: record.state ?? 'wander',
      targetId: record.targetId ?? null,
      stateElapsedSec: record.stateElapsedSec ?? 0,
      retargetRemainingSec: record.retargetRemainingSec ?? 0,
      nextActionSequence: record.nextActionSequence ?? 1,
      pendingAction: record.pendingAction ?? null,
    };
    return stateSnapshot(state);
  } catch {
    return null;
  }
}

export function validateMonsterAIState(input) {
  try {
    return stateSnapshot(input);
  } catch {
    return null;
  }
}

export function isCanonicalMonsterAIState(input) {
  return !!input && typeof input === 'object' && CANONICAL_AI_STATES.has(input);
}

export function resetMonsterAIState(input) {
  try {
    const state = stateSnapshot(input);
    if (!state) return null;
    return Object.freeze({
      actorId: state.actorId,
      encounterId: state.encounterId,
      state: 'wander',
      targetId: null,
      stateElapsedSec: 0,
      retargetRemainingSec: 0,
      nextActionSequence: state.nextActionSequence,
      pendingAction: null,
    });
  } catch {
    return null;
  }
}

export function advanceMonsterAI(input, dtSec) {
  try {
    const state = stateSnapshot(input);
    if (!state || !Number.isFinite(dtSec) || dtSec < 0) return null;
    const stateElapsedSec = state.stateElapsedSec + dtSec;
    const retargetRemainingSec = Math.max(0, state.retargetRemainingSec - dtSec);
    if (!Number.isFinite(stateElapsedSec) || !Number.isFinite(retargetRemainingSec)) return null;
    return Object.freeze({
      ...state,
      stateElapsedSec,
      retargetRemainingSec,
    });
  } catch {
    return null;
  }
}

export function settleWildAIIntent(stateInput, intentInput, accepted) {
  try {
    const state = stateSnapshot(stateInput);
    const intent = intentSnapshot(intentInput);
    if (!state
      || !intent
      || typeof accepted !== 'boolean'
      || state.state !== 'attack_windup'
      || !state.pendingAction
      || state.actorId !== intent.actorId
      || state.encounterId !== intent.encounterId
      || state.targetId !== intent.targetId
      || state.pendingAction.targetId !== intent.targetId
      || state.pendingAction.token !== intent.actionToken
      || state.pendingAction.issuedAtSec !== intent.issuedAtSec
      || state.pendingAction.commandSource !== intent.commandSource) {
      return Object.freeze({ ok: false, reason: 'invalid_intent_settlement', nextState: null });
    }
    const reason = accepted ? 'basic_attack_committed' : 'basic_attack_rejected';
    const settled = transitionState(state, accepted ? 'recover' : 'chase', reason, {
      pendingAction: null,
    });
    return Object.freeze({
      ok: true,
      reason,
      nextState: stripTransitionReason(settled),
    });
  } catch {
    return Object.freeze({ ok: false, reason: 'invalid_intent_settlement', nextState: null });
  }
}

function perceiveCanonical(self, targets, profile) {
  const visibleTargets = [];
  const validTargets = [];
  let nearestTarget = null;
  for (const target of targets) {
    const distanceM = distanceBetween(self.position, target.position);
    const visible = Object.freeze({ ...target, distanceM });
    visibleTargets.push(visible);
    const valid = target.encounterId === self.encounterId
      && target.alive
      && target.targetable
      && !target.capturing
      && distanceM <= profile.disengageRadiusM;
    if (!valid) continue;
    validTargets.push(visible);
    if (!nearestTarget
      || distanceM < nearestTarget.distanceM
      || distanceM === nearestTarget.distanceM
        && stableIdCompare(target.id, nearestTarget.id) < 0) nearestTarget = visible;
  }
  return Object.freeze({
    visibleTargets: Object.freeze(visibleTargets),
    validTargets: Object.freeze(validTargets),
    nearestTarget,
    homeDistanceM: distanceBetween(self.position, self.home),
    canAct: self.alive && !self.capturing && (self.canMove || self.canAttack),
    canMove: self.alive && !self.capturing && self.canMove,
    canAttack: self.alive && !self.capturing && self.canAttack,
  });
}

export function perceiveMonster(input = {}) {
  try {
    const request = dataRecordSnapshot(input, PERCEPTION_REQUEST_FIELDS);
    const self = selfSnapshot(request?.self);
    const targets = self ? targetSnapshots(request?.targets, self.id) : null;
    const profile = profileSnapshot(request?.profile);
    if (!request || !self || !targets || !profile) {
      return Object.freeze({ ok: false, reason: 'invalid_perception_request' });
    }
    return Object.freeze({ ok: true, ...perceiveCanonical(self, targets, profile) });
  } catch {
    return Object.freeze({ ok: false, reason: 'invalid_perception_request' });
  }
}

function scoredCandidate(target, currentTargetId, profile) {
  const distanceScore = (1 - Math.min(1, target.distanceM / profile.disengageRadiusM))
    * profile.distanceWeight;
  const threatScore = target.recentDamage * profile.threatWeight;
  const rolePriority = target.rolePriority * profile.rolePriorityWeight;
  const currentTargetBonus = target.id === currentTargetId ? profile.currentTargetBonus : 0;
  return Object.freeze({
    id: target.id,
    distanceM: target.distanceM,
    score: distanceScore + threatScore + rolePriority + currentTargetBonus,
  });
}

function scoreCanonicalTargets(perception, currentTargetId, profile, retargetAllowed, selfEngaged = false) {
  const current = currentTargetId === null
    ? null
    : perception.validTargets.find(target => target.id === currentTargetId) ?? null;
  if (current && !retargetAllowed) {
    return Object.freeze({
      targetId: current.id,
      reason: 'retarget_locked',
      candidates: Object.freeze([scoredCandidate(current, currentTargetId, profile)]),
    });
  }
  const acquisitionRadiusM = selfEngaged ? profile.disengageRadiusM : profile.aggroRadiusM;
  const scored = perception.validTargets
    .filter(target => target.id === currentTargetId || target.distanceM <= acquisitionRadiusM)
    .map(target => scoredCandidate(target, currentTargetId, profile))
    .sort((left, right) => right.score - left.score || stableIdCompare(left.id, right.id));
  const best = scored[0] ?? null;
  if (!best) {
    return Object.freeze({ targetId: null, reason: 'no_valid_target', candidates: Object.freeze(scored) });
  }
  if (current && best.id !== current.id) {
    const currentScore = scored.find(candidate => candidate.id === current.id)
      ?? scoredCandidate(current, currentTargetId, profile);
    if (best.score < currentScore.score + profile.targetSwitchMargin) {
      return Object.freeze({
        targetId: current.id,
        reason: 'target_hysteresis',
        candidates: Object.freeze(scored),
      });
    }
  }
  return Object.freeze({
    targetId: best.id,
    reason: best.id === currentTargetId ? 'current_target_best' : 'best_target',
    candidates: Object.freeze(scored),
  });
}

export function scoreMonsterTargets(input = {}) {
  try {
    const request = dataRecordSnapshot(input, SCORE_REQUEST_FIELDS);
    const self = selfSnapshot(request?.self);
    const targets = self ? targetSnapshots(request?.targets, self.id) : null;
    const profile = profileSnapshot(request?.profile);
    if (!request
      || !self
      || !targets
      || !profile
      || request.currentTargetId !== null && !stableId(request.currentTargetId)
      || typeof request.retargetAllowed !== 'boolean') {
      return Object.freeze({ ok: false, reason: 'invalid_score_request', targetId: null });
    }
    const perception = perceiveCanonical(self, targets, profile);
    return Object.freeze({
      ok: true,
      ...scoreCanonicalTargets(
        perception,
        request.currentTargetId,
        profile,
        request.retargetAllowed,
        self.engaged,
      ),
    });
  } catch {
    return Object.freeze({ ok: false, reason: 'invalid_score_request', targetId: null });
  }
}

function targetById(perception, targetId) {
  return perception.validTargets.find(target => target.id === targetId) ?? null;
}

function moveDirection(self, target) {
  if (!target || target.distanceM <= Number.EPSILON) return Object.freeze({ x: 0, z: 0 });
  return Object.freeze({
    x: (target.position.x - self.position.x) / target.distanceM,
    z: (target.position.z - self.position.z) / target.distanceM,
  });
}

function retreatDirection(self, target) {
  const toward = moveDirection(self, target);
  if (toward.x === 0 && toward.z === 0) return Object.freeze({ x: 0, z: -1 });
  return Object.freeze({
    x: toward.x === 0 ? 0 : -toward.x,
    z: toward.z === 0 ? 0 : -toward.z,
  });
}

function resetDecision(previousState, advancedState, reason) {
  const nextState = transitionState(advancedState, 'reset', reason, {
    targetId: null,
    pendingAction: null,
  });
  return decision({ previousState, nextState, action: 'reset', targetId: null, reason });
}

function chaseDecision(previousState, advancedState, snapshot, target) {
  const { self, profile } = snapshot;
  if (target.distanceM > profile.preferredRangeMaxM) {
    if (!self.canMove) {
      return decision({
        previousState,
        nextState: advancedState,
        reason: 'movement_blocked_by_status',
      });
    }
    return decision({
      previousState,
      nextState: advancedState,
      action: 'move',
      targetId: target.id,
      direction: moveDirection(self, target),
      reason: 'approach_target',
    });
  }
  if (!self.canAttack) {
    const nextState = transitionState(advancedState, 'recover', 'attack_blocked_by_status', {
      pendingAction: null,
    });
    return decision({
      previousState,
      nextState,
      targetId: target.id,
      reason: 'attack_blocked_by_status',
    });
  }
  if (!self.attackReady) {
    return decision({
      previousState,
      nextState: advancedState,
      reason: 'basic_attack_cooldown',
    });
  }
  if (advancedState.nextActionSequence >= Number.MAX_SAFE_INTEGER) {
    return failure('action_sequence_exhausted');
  }
  const actionToken = `${self.id}:${self.encounterId}:${advancedState.nextActionSequence}`;
  const pendingAction = Object.freeze({
    kind: 'basic_attack',
    token: actionToken,
    targetId: target.id,
    issuedAtSec: null,
    commandSource: profile.commandSource,
  });
  const nextState = transitionState(advancedState, 'attack_windup', 'basic_attack_windup', {
    pendingAction,
    nextActionSequence: advancedState.nextActionSequence + 1,
  });
  return decision({ previousState, nextState, targetId: target.id, reason: 'basic_attack_windup' });
}

function chooseCanonicalAction(previousState, advancedState, snapshot, perception, canEngage) {
  const { self, profile } = snapshot;
  if (!self.alive || self.hp <= 0) {
    const nextState = transitionState(advancedState, 'fainted', 'actor_fainted', {
      targetId: null,
      pendingAction: null,
    });
    return decision({ previousState, nextState, targetId: null, reason: 'actor_fainted' });
  }
  if (self.capturing) {
    const nextState = transitionState(advancedState, 'recover', 'actor_capturing', {
      targetId: null,
      pendingAction: null,
    });
    return decision({ previousState, nextState, targetId: null, reason: 'actor_capturing' });
  }
  if (advancedState.state === 'reset') {
    return resetDecision(previousState, advancedState, 'reset_pending');
  }
  if (perception.homeDistanceM > profile.leashRadiusM) {
    return resetDecision(previousState, advancedState, 'outside_leash');
  }
  if (!canEngage) {
    if (self.engaged || advancedState.targetId !== null || advancedState.state !== 'wander') {
      return resetDecision(previousState, advancedState, 'engagement_slot_lost');
    }
    return decision({
      previousState,
      nextState: advancedState,
      action: 'wander',
      targetId: null,
      reason: 'not_engaged',
    });
  }

  const scored = scoreCanonicalTargets(
    perception,
    advancedState.targetId,
    profile,
    advancedState.retargetRemainingSec <= 0,
    self.engaged,
  );
  if (scored.targetId === null) {
    if (self.engaged || advancedState.targetId !== null) {
      return resetDecision(previousState, advancedState, 'target_invalid');
    }
    return decision({
      previousState,
      nextState: advancedState,
      action: 'wander',
      targetId: null,
      reason: 'no_valid_target',
    });
  }
  const target = targetById(perception, scored.targetId);
  if (!target) return resetDecision(previousState, advancedState, 'target_invalid');

  if (target.distanceM > profile.disengageRadiusM) {
    return resetDecision(previousState, advancedState, 'target_outside_disengage');
  }

  if (self.forcedRetreat) {
    const nextState = transitionState(advancedState, 'retreat', 'forced_retreat', {
      targetId: target.id,
      pendingAction: null,
      retargetRemainingSec: advancedState.targetId === target.id
        ? advancedState.retargetRemainingSec
        : profile.retargetCooldownSec,
    });
    if (!self.canMove) {
      return decision({
        previousState,
        nextState,
        targetId: target.id,
        reason: 'forced_retreat_blocked',
      });
    }
    return decision({
      previousState,
      nextState,
      action: 'move',
      targetId: target.id,
      direction: retreatDirection(self, target),
      reason: 'forced_retreat',
    });
  }

  if (!self.canMove && !self.canAttack) {
    const nextState = advancedState.state === 'recover' && advancedState.pendingAction === null
      ? advancedState
      : transitionState(advancedState, 'recover', 'action_blocked_by_status', {
        targetId: target.id,
        pendingAction: null,
        retargetRemainingSec: advancedState.targetId === target.id
          ? advancedState.retargetRemainingSec
          : profile.retargetCooldownSec,
      });
    return decision({
      previousState,
      nextState,
      targetId: target.id,
      reason: 'action_blocked_by_status',
    });
  }

  if (advancedState.targetId !== target.id || advancedState.state === 'wander' || advancedState.state === 'fainted') {
    const nextState = transitionState(advancedState, 'alert', 'target_acquired', {
      targetId: target.id,
      pendingAction: null,
      retargetRemainingSec: profile.retargetCooldownSec,
    });
    return decision({ previousState, nextState, targetId: target.id, reason: 'target_acquired' });
  }

  if (advancedState.state === 'alert') {
    if (advancedState.stateElapsedSec < profile.alertDurationSec) {
      return decision({
        previousState,
        nextState: advancedState,
        targetId: target.id,
        reason: 'alert_telegraph',
      });
    }
    const nextState = transitionState(advancedState, 'chase', 'alert_complete', {
      pendingAction: null,
    });
    return decision({ previousState, nextState, targetId: target.id, reason: 'alert_complete' });
  }

  if (advancedState.state === 'attack_windup') {
    const pending = advancedState.pendingAction;
    if (!pending || pending.targetId !== target.id
      || pending.issuedAtSec !== null && pending.issuedAtSec > snapshot.nowSec) {
      const nextState = transitionState(advancedState, 'recover', 'pending_action_invalid', {
        pendingAction: null,
      });
      return decision({ previousState, nextState, targetId: target.id, reason: 'pending_action_invalid' });
    }
    if (!self.canAttack) {
      const nextState = transitionState(advancedState, 'recover', 'windup_cancelled_status', {
        pendingAction: null,
      });
      return decision({ previousState, nextState, targetId: target.id, reason: 'windup_cancelled_status' });
    }
    if (target.distanceM > profile.preferredRangeMaxM) {
      const nextState = transitionState(advancedState, 'chase', 'windup_cancelled_range', {
        pendingAction: null,
      });
      return decision({ previousState, nextState, targetId: target.id, reason: 'windup_cancelled_range' });
    }
    if (advancedState.stateElapsedSec < profile.windupDurationSec) {
      return decision({
        previousState,
        nextState: advancedState,
        targetId: target.id,
        reason: 'attack_windup_pending',
      });
    }
    const issuedAtSec = pending.issuedAtSec ?? snapshot.nowSec;
    const issuedPending = pending.issuedAtSec === null
      ? Object.freeze({ ...pending, issuedAtSec })
      : pending;
    const issuedState = issuedPending === pending
      ? advancedState
      : Object.freeze({ ...advancedState, pendingAction: issuedPending });
    const intent = Object.freeze({
      kind: 'basic_attack',
      actorId: self.id,
      targetId: target.id,
      encounterId: self.encounterId,
      skillId: null,
      actionToken: pending.token,
      issuedAtSec,
      reason: 'target_in_basic_range',
      commandSource: pending.commandSource,
      usesConsumed: profile.usesConsumed,
    });
    return decision({
      previousState,
      nextState: issuedState,
      action: 'basic_attack',
      targetId: target.id,
      intent,
      reason: 'basic_attack_ready',
    });
  }

  if (advancedState.state === 'recover') {
    if (!self.canAttack) {
      return decision({
        previousState,
        nextState: advancedState,
        targetId: target.id,
        reason: 'attack_blocked_by_status',
      });
    }
    if (advancedState.stateElapsedSec < profile.recoverDurationSec) {
      return decision({
        previousState,
        nextState: advancedState,
        targetId: target.id,
        reason: 'recovering',
      });
    }
    const nextState = transitionState(advancedState, 'chase', 'recovery_complete', {
      pendingAction: null,
    });
    return decision({ previousState, nextState, targetId: target.id, reason: 'recovery_complete' });
  }

  if (advancedState.state === 'orbit'
    || advancedState.state === 'retreat') {
    const nextState = transitionState(advancedState, 'chase', 'compatibility_melee_fallback', {
      pendingAction: null,
    });
    return decision({ previousState, nextState, targetId: target.id, reason: 'compatibility_melee_fallback' });
  }

  return chaseDecision(previousState, advancedState, snapshot, target);
}

export function chooseMonsterAction(input = {}) {
  try {
    const request = dataRecordSnapshot(input, RESOLVE_REQUEST_FIELDS);
    const state = stateSnapshot(request?.state);
    const snapshot = snapshotContract(request?.snapshot);
    if (!request
      || !state
      || !snapshot
      || typeof request.canEngage !== 'boolean'
      || state.actorId !== snapshot.self.id
      || state.encounterId !== snapshot.self.encounterId) return failure('invalid_ai_request');
    const advancedState = advanceMonsterAI(state, snapshot.dtSec);
    if (!advancedState) return failure('invalid_ai_state');
    const perception = perceiveCanonical(snapshot.self, snapshot.targets, snapshot.profile);
    return chooseCanonicalAction(state, advancedState, snapshot, perception, request.canEngage);
  } catch {
    return failure('invalid_ai_request');
  }
}

export function resolveWildMonsterAI(input = {}) {
  return chooseMonsterAction(input);
}

export const DEFAULT_WILD_AI_PROFILE = WILD_BASIC_AI_POLICY;
