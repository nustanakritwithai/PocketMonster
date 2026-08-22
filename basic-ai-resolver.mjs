// PocketMonster V8.1 A35 — deterministic owned-monster Basic AI.
// This resolver intentionally has no dependency on manual skills or Uses.

import { aiProfileEntry } from './ai-profile.mjs';
import { OWNED_BASIC_AI_POLICY } from './runtime-policies.mjs';

const REQUEST_FIELDS = Object.freeze(['actor', 'enemies', 'currentTargetId', 'attackReady']);
const ACTOR_FIELDS = Object.freeze(['id', 'speciesId', 'alive', 'position']);
const TARGET_FIELDS = Object.freeze(['id', 'alive', 'targetable', 'position']);
const POSITION_FIELDS = Object.freeze(['x', 'z']);

function dataRecordSnapshot(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return null;
  const snapshot = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    snapshot[field] = descriptor.value;
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

function positionSnapshot(value) {
  const position = dataRecordSnapshot(value, POSITION_FIELDS);
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  return position;
}

function failure(reason) {
  return Object.freeze({ ok: false, reason, action: 'idle', targetId: null });
}

function validDecision({ reason, targetId, distanceM, profile, extra = {} }) {
  return Object.freeze({
    ok: true,
    reason,
    action: extra.action ?? 'idle',
    targetId,
    distanceM,
    profile,
    commandSource: OWNED_BASIC_AI_POLICY.commandSource,
    usesConsumed: OWNED_BASIC_AI_POLICY.usesConsumed,
    ...extra,
  });
}

function distanceBetween(left, right) {
  return Math.hypot(right.x - left.x, right.z - left.z);
}

function stableIdCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function chooseNearest(actorPosition, candidates) {
  let selected = null;
  let selectedDistance = Infinity;
  for (const candidate of candidates) {
    if (!candidate.alive || !candidate.targetable) continue;
    const distanceM = distanceBetween(actorPosition, candidate.position);
    if (!Number.isFinite(distanceM) || distanceM > OWNED_BASIC_AI_POLICY.acquireRangeM) continue;
    if (distanceM < selectedDistance
      || (distanceM === selectedDistance && selected && stableIdCompare(candidate.id, selected.id) < 0)) {
      selected = candidate;
      selectedDistance = distanceM;
    }
  }
  return selected ? Object.freeze({ target: selected, distanceM: selectedDistance }) : null;
}

function resolveOwnedBasicAiActionInternal(input) {
  const request = dataRecordSnapshot(input, REQUEST_FIELDS);
  if (!request) return failure('invalid_request_shape');
  const actorRecord = dataRecordSnapshot(request.actor, ACTOR_FIELDS);
  const actorPosition = positionSnapshot(actorRecord?.position);
  if (!actorRecord
    || !stableId(actorRecord.id)
    || !stableId(actorRecord.speciesId)
    || typeof actorRecord.alive !== 'boolean'
    || !actorPosition) {
    return failure('invalid_actor');
  }
  const actor = Object.freeze({
    id: actorRecord.id,
    speciesId: actorRecord.speciesId,
    alive: actorRecord.alive,
    position: actorPosition,
  });
  const enemyRecords = dataArraySnapshot(request.enemies);
  if (!enemyRecords) return failure('invalid_enemies');
  if (request.currentTargetId !== null && !stableId(request.currentTargetId)) {
    return failure('invalid_current_target_id');
  }
  if (typeof request.attackReady !== 'boolean') return failure('invalid_attack_ready');

  const profile = aiProfileEntry(actor.speciesId);
  if (!profile) return failure('unknown_ai_profile');

  const byId = new Map();
  const enemies = [];
  for (const candidateInput of enemyRecords) {
    const candidateRecord = dataRecordSnapshot(candidateInput, TARGET_FIELDS);
    const candidatePosition = positionSnapshot(candidateRecord?.position);
    if (!candidateRecord
      || !stableId(candidateRecord.id)
      || typeof candidateRecord.alive !== 'boolean'
      || typeof candidateRecord.targetable !== 'boolean'
      || !candidatePosition) {
      return failure('invalid_target');
    }
    const candidate = Object.freeze({
      id: candidateRecord.id,
      alive: candidateRecord.alive,
      targetable: candidateRecord.targetable,
      position: candidatePosition,
    });
    if (candidate.id === actor.id) return failure('actor_target_id_collision');
    if (byId.has(candidate.id)) return failure('duplicate_target_id');
    byId.set(candidate.id, candidate);
    enemies.push(candidate);
  }
  Object.freeze(enemies);

  if (!actor.alive) {
    return validDecision({ reason: 'actor_unavailable', targetId: null, distanceM: null, profile });
  }

  let selected = null;
  let distanceM = Infinity;
  if (request.currentTargetId !== null) {
    const current = byId.get(request.currentTargetId);
    if (current?.alive && current.targetable) {
      const currentDistance = distanceBetween(actor.position, current.position);
      if (Number.isFinite(currentDistance) && currentDistance <= OWNED_BASIC_AI_POLICY.retainRangeM) {
        selected = current;
        distanceM = currentDistance;
      }
    }
  }

  if (!selected) {
    const nearest = chooseNearest(actor.position, enemies);
    selected = nearest?.target ?? null;
    distanceM = nearest?.distanceM ?? Infinity;
  }

  if (!selected) {
    return validDecision({ reason: 'no_valid_target', targetId: null, distanceM: null, profile });
  }
  if (distanceM > OWNED_BASIC_AI_POLICY.basicAttackRangeM) {
    const direction = Object.freeze({
      x: (selected.position.x - actor.position.x) / distanceM,
      z: (selected.position.z - actor.position.z) / distanceM,
    });
    return validDecision({
      reason: 'approach_target',
      targetId: selected.id,
      distanceM,
      profile,
      extra: { action: 'move', direction },
    });
  }
  if (!request.attackReady) {
    return validDecision({
      reason: 'basic_attack_cooldown',
      targetId: selected.id,
      distanceM,
      profile,
    });
  }
  return validDecision({
    reason: 'basic_attack_ready',
    targetId: selected.id,
    distanceM,
    profile,
    extra: { action: 'basic_attack' },
  });
}

export function resolveOwnedBasicAiAction(request) {
  try {
    return resolveOwnedBasicAiActionInternal(request);
  } catch {
    return failure('invalid_request_shape');
  }
}
