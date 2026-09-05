// Canonical world presence protocol. One vocabulary, one sanitizer, one self-filter.
// Bridges and renderers may add structural guards, but must not declare a second
// locomotion/combat enum or drop validated action fields.

export const WORLD_PRESENCE_PROTOCOL_VERSION = 'world-presence-protocol/v2';
export const MAX_REMOTE_PLAYERS = 100;
export const MAX_SNAPSHOT_CANDIDATES = 400;
export const MAX_PLAYER_ID_LENGTH = 80;
export const MAX_PLAYER_NAME_LENGTH = 32;
export const ZONE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const PRESENCE_COORDINATE_LIMIT = 10000;
export const LOCOMOTION_VALUES = Object.freeze(['idle', 'walk', 'run', 'swim']);
export const COMBAT_STATE_VALUES = Object.freeze([
  'idle', 'attack1', 'attack2', 'attack3', 'attack4', 'casting', 'blocking',
  'stunned', 'knockback', 'knockdown', 'dead',
]);
export const ANIMATION_CATEGORY_VALUES = Object.freeze(['style', 'sword', 'gun', 'fruit', 'utility']);
export const SKILL_ANIMATION_TYPE_VALUES = Object.freeze([
  'projectile', 'beam', 'aoe', 'ground', 'dash', 'flurry', 'buff', 'summon', 'homing', 'teleport',
]);
export const ACTION_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const MAX_ACTION_SEQUENCE = 2147483647;
export const MIN_ACTION_DURATION_MS = 80;
export const MAX_ACTION_DURATION_MS = 5000;

const LOCOMOTION_SET = new Set(LOCOMOTION_VALUES);
const COMBAT_STATE_SET = new Set(COMBAT_STATE_VALUES);
const ANIMATION_CATEGORY_SET = new Set(ANIMATION_CATEGORY_VALUES);
const SKILL_ANIMATION_TYPE_SET = new Set(SKILL_ANIMATION_TYPE_VALUES);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function optionalBoundedNumber(value, minimum, maximum) {
  return isFiniteNumber(value) ? clamp(value, minimum, maximum) : undefined;
}

function optionalBoundedInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}

function optionalClampedInteger(value, minimum, maximum) {
  return isFiniteNumber(value) ? clamp(Math.floor(value), minimum, maximum) : undefined;
}

export function safeZone(value) {
  return typeof value === 'string' && ZONE_PATTERN.test(value) ? value : null;
}

export function sanitizeLocomotion(value) {
  return typeof value === 'string' && LOCOMOTION_SET.has(value) ? value : 'idle';
}

export function sanitizeAnimation(value) {
  if (!isRecord(value)) return null;
  if (typeof value.combatState !== 'string' || !COMBAT_STATE_SET.has(value.combatState)) return null;
  if (typeof value.category !== 'string' || !ANIMATION_CATEGORY_SET.has(value.category)) return null;
  const animation = {
    combatState: value.combatState,
    category: value.category,
    onGround: typeof value.onGround === 'boolean' ? value.onGround : true,
    dashing: typeof value.dashing === 'boolean' ? value.dashing : false,
    verticalVelocity: isFiniteNumber(value.verticalVelocity) ? clamp(value.verticalVelocity, -100, 100) : 0,
  };
  const attackProgress = optionalBoundedNumber(value.attackProgress, 0, 1);
  const hitReactionId = optionalClampedInteger(value.hitReactionId, 0, 2147483647);
  const hitReactionAngle = optionalBoundedNumber(value.hitReactionAngle, -Math.PI, Math.PI);
  const skillAnimationProgress = optionalBoundedNumber(value.skillAnimationProgress, 0, 1);
  const skillAnimationReleaseProgress = optionalBoundedNumber(value.skillAnimationReleaseProgress, 0, 1);
  const skillAnimationVariant = optionalClampedInteger(value.skillAnimationVariant, 0, 16);
  if (attackProgress !== undefined) animation.attackProgress = attackProgress;
  if (hitReactionId !== undefined) animation.hitReactionId = hitReactionId;
  if (hitReactionAngle !== undefined) animation.hitReactionAngle = hitReactionAngle;
  if (skillAnimationProgress !== undefined) animation.skillAnimationProgress = skillAnimationProgress;
  if (skillAnimationReleaseProgress !== undefined) animation.skillAnimationReleaseProgress = skillAnimationReleaseProgress;
  if (typeof value.skillAnimationType === 'string' && SKILL_ANIMATION_TYPE_SET.has(value.skillAnimationType)) {
    animation.skillAnimationType = value.skillAnimationType;
  }
  if (skillAnimationVariant !== undefined) animation.skillAnimationVariant = skillAnimationVariant;
  if (typeof value.skillAnimationUltimate === 'boolean') animation.skillAnimationUltimate = value.skillAnimationUltimate;
  if (typeof value.skillAnimationCategory === 'string' && ANIMATION_CATEGORY_SET.has(value.skillAnimationCategory)) {
    animation.skillAnimationCategory = value.skillAnimationCategory;
  }

  const actionSessionId = typeof value.actionSessionId === 'string' && ACTION_SESSION_ID_PATTERN.test(value.actionSessionId)
    ? value.actionSessionId : undefined;
  const actionSequence = optionalBoundedInteger(value.actionSequence, 1, MAX_ACTION_SEQUENCE);
  const actionDurationMs = optionalBoundedInteger(value.actionDurationMs, MIN_ACTION_DURATION_MS, MAX_ACTION_DURATION_MS);
  if (actionSessionId !== undefined && actionSequence !== undefined && actionDurationMs !== undefined) {
    animation.actionSessionId = actionSessionId;
    animation.actionSequence = actionSequence;
    animation.actionDurationMs = actionDurationMs;
  }
  return Object.freeze(animation);
}

export function sanitizeOnlineWorldPose(value) {
  if (!isRecord(value)) return null;
  const zone = safeZone(value.zone);
  if (!zone || !isFiniteNumber(value.x) || !isFiniteNumber(value.z) || !isFiniteNumber(value.dir)) return null;
  const pose = {
    zone,
    x: value.x,
    z: value.z,
    dir: value.dir,
    locomotion: sanitizeLocomotion(value.locomotion),
    animation: sanitizeAnimation(value.animation),
  };
  if (isFiniteNumber(value.y)) pose.y = clamp(value.y, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT);
  return Object.freeze(pose);
}

export function buildWorldPosFrame(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const dir = snapshot.dir === undefined ? 0 : snapshot.dir;
  return sanitizeOnlineWorldPose({ ...snapshot, dir });
}

export function sanitizePresencePlayer(candidate, seen = null) {
  if (!isRecord(candidate)) return null;
  const id = typeof candidate.id === 'string'
    ? candidate.id.trim().slice(0, MAX_PLAYER_ID_LENGTH)
    : '';
  if (!id || (seen && seen.has(id)) || !isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.z)) return null;
  if (seen) seen.add(id);
  const player = {
    id,
    name: typeof candidate.name === 'string'
      ? candidate.name.trim().slice(0, MAX_PLAYER_NAME_LENGTH) || 'ผู้เล่นออนไลน์'
      : 'ผู้เล่นออนไลน์',
    x: candidate.x,
    z: candidate.z,
    dir: isFiniteNumber(candidate.dir) ? candidate.dir : 0,
    locomotion: sanitizeLocomotion(candidate.locomotion),
    animation: sanitizeAnimation(candidate.animation),
  };
  if (isFiniteNumber(candidate.y)) player.y = clamp(candidate.y, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT);
  return Object.freeze(player);
}

export function sanitizeOnlineWorldSnapshot(payload, expectedZone) {
  if (!isRecord(payload) || !Array.isArray(payload.players)) return null;
  const zone = safeZone(payload.zone);
  if (!zone) return null;
  if (expectedZone !== undefined && zone !== expectedZone) return null;
  if (payload.players.length > MAX_SNAPSHOT_CANDIDATES) return null;
  const players = [];
  const seen = new Set();
  for (const candidate of payload.players) {
    if (players.length >= MAX_REMOTE_PLAYERS) break;
    const player = sanitizePresencePlayer(candidate, seen);
    if (player) players.push(player);
  }
  return Object.freeze({ zone, players: Object.freeze(players) });
}

export function worldSnapshotPayload(message) {
  if (!message || message.type !== 'world-snapshot') return null;
  return sanitizeOnlineWorldSnapshot(message.payload);
}

export function isRemoteWorldPlayer(item, selfId) {
  if (!item?.id || !isFiniteNumber(item.x) || !isFiniteNumber(item.z)) return false;
  if (selfId != null && selfId !== '' && String(item.id).toLowerCase() === String(selfId).toLowerCase()) return false;
  return true;
}

export function filterRemotePlayers(players, selfId) {
  if (!Array.isArray(players)) return [];
  return players.filter(item => isRemoteWorldPlayer(item, selfId));
}

export function selfPresenceId(profile, explicitId) {
  return explicitId || profile?.id || profile?.accountId || profile?.username || null;
}

export function currentSelfPresenceId() {
  if (typeof window === 'undefined') return null;
  return selfPresenceId(window.POCKETMONSTER_AUTH_PROFILE_BRIDGE?.profile, window.POCKETMONSTER_SELF_PRESENCE_ID);
}
