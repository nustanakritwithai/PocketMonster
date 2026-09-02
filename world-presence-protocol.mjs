// Canonical world presence protocol. One vocabulary, one sanitizer, one self-filter.
// Bridges and renderers may add structural guards, but must not declare a second
// locomotion/combat enum or drop validated action fields.

export const WORLD_PRESENCE_PROTOCOL_VERSION = 'world-presence-protocol/v1';
export const MAX_REMOTE_PLAYERS = 100;
export const MAX_SNAPSHOT_CANDIDATES = 400;
export const MAX_PLAYER_ID_LENGTH = 80;
export const MAX_PLAYER_NAME_LENGTH = 32;
export const ZONE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const LOCOMOTION_VALUES = Object.freeze(['idle', 'walk', 'run', 'swim', 'jump', 'dash']);
export const COMBAT_STATE_VALUES = Object.freeze(['idle', 'attack', 'skill', 'hurt', 'dead', 'guard']);

const LOCOMOTION_SET = new Set(LOCOMOTION_VALUES);
const COMBAT_STATE_SET = new Set(COMBAT_STATE_VALUES);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function safeZone(value) {
  return typeof value === 'string' && ZONE_PATTERN.test(value) ? value : null;
}

export function sanitizeLocomotion(value) {
  return typeof value === 'string' && LOCOMOTION_SET.has(value) ? value : 'idle';
}

export function sanitizeAnimation(value) {
  if (!isRecord(value)) return null;
  const combatState = typeof value.combatState === 'string' && COMBAT_STATE_SET.has(value.combatState)
    ? value.combatState : 'idle';
  const animation = { combatState };
  for (const key of ['onGround', 'dashing']) if (typeof value[key] === 'boolean') animation[key] = value[key];
  for (const key of ['attackProgress', 'hitReactionAngle', 'skillAnimationProgress']) {
    if (isFiniteNumber(value[key])) animation[key] = Math.max(0, Math.min(1, value[key]));
  }
  return Object.freeze(animation);
}

export function sanitizeOnlineWorldPose(value) {
  if (!isRecord(value)) return null;
  const zone = safeZone(value.zone);
  if (!zone || !isFiniteNumber(value.x) || !isFiniteNumber(value.z) || !isFiniteNumber(value.dir)) return null;
  return Object.freeze({
    zone,
    x: value.x,
    z: value.z,
    dir: value.dir,
    locomotion: sanitizeLocomotion(value.locomotion),
    animation: sanitizeAnimation(value.animation),
  });
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
  return Object.freeze({
    id,
    name: typeof candidate.name === 'string'
      ? candidate.name.trim().slice(0, MAX_PLAYER_NAME_LENGTH) || 'ผู้เล่นออนไลน์'
      : 'ผู้เล่นออนไลน์',
    x: candidate.x,
    z: candidate.z,
    dir: isFiniteNumber(candidate.dir) ? candidate.dir : 0,
    locomotion: sanitizeLocomotion(candidate.locomotion),
    animation: sanitizeAnimation(candidate.animation),
  });
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
