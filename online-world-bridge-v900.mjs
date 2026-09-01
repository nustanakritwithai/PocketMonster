export const ONLINE_WORLD_SHELL_KIND = 'monsterlife-online-world-shell-v1';
export const ONLINE_WORLD_SCENE_KIND = 'monsterlife-online-world-scene-v1';

const MAX_REMOTE_PLAYERS = 100;
export const MAX_SNAPSHOT_CANDIDATES = 400;
const MAX_PLAYER_ID_LENGTH = 80;
const MAX_PLAYER_NAME_LENGTH = 32;
const ZONE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LOCOMOTION_VALUES = new Set(['idle', 'walk', 'run', 'swim', 'jump', 'dash']);
const COMBAT_STATE_VALUES = new Set(['idle', 'attack', 'skill', 'hurt', 'dead', 'guard']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeZone(value) {
  return typeof value === 'string' && ZONE_PATTERN.test(value) ? value : null;
}

function sanitizeLocomotion(value) {
  return typeof value === 'string' && LOCOMOTION_VALUES.has(value) ? value : 'idle';
}

function sanitizeAnimation(value) {
  if (!isRecord(value)) return null;
  const combatState = typeof value.combatState === 'string' && COMBAT_STATE_VALUES.has(value.combatState)
    ? value.combatState : 'idle';
  const animation = { combatState };
  for (const key of ['onGround', 'dashing']) if (typeof value[key] === 'boolean') animation[key] = value[key];
  for (const key of ['attackProgress', 'hitReactionAngle', 'skillAnimationProgress']) {
    if (isFiniteNumber(value[key])) animation[key] = Math.max(0, Math.min(1, value[key]));
  }
  return Object.freeze(animation);
}

export function isHostedOnlineWorldScene(windowLike = globalThis.window) {
  try {
    if (!windowLike?.parent || windowLike.parent === windowLike) return false;
    if (windowLike.parent.location.origin !== windowLike.location.origin) return false;
    return windowLike.parent.POCKETMONSTER_ONLINE_SHELL?.kind === ONLINE_WORLD_SHELL_KIND;
  } catch {
    return false;
  }
}

export function sanitizeOnlineWorldPose(value) {
  if (!isRecord(value)) return null;
  const zone = safeZone(value.zone);
  if (!zone || !isFiniteNumber(value.x) || !isFiniteNumber(value.z) || !isFiniteNumber(value.dir)) return null;
  return Object.freeze({ zone, x: value.x, z: value.z, dir: value.dir, locomotion: sanitizeLocomotion(value.locomotion), animation: sanitizeAnimation(value.animation) });
}

export function sanitizeOnlineWorldSnapshot(payload, expectedZone) {
  if (!isRecord(payload) || !Array.isArray(payload.players)) return null;
  const zone = safeZone(payload.zone);
  if (!zone || zone !== expectedZone) return null;
  if (payload.players.length > MAX_SNAPSHOT_CANDIDATES) return null;
  const players = [];
  const seen = new Set();
  for (const candidate of payload.players) {
    if (players.length >= MAX_REMOTE_PLAYERS) break;
    if (!isRecord(candidate)) continue;
    const id = typeof candidate.id === 'string'
      ? candidate.id.trim().slice(0, MAX_PLAYER_ID_LENGTH)
      : '';
    if (!id || seen.has(id) || !isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.z)) continue;
    seen.add(id);
    players.push(Object.freeze({
      id,
      name: typeof candidate.name === 'string'
        ? candidate.name.trim().slice(0, MAX_PLAYER_NAME_LENGTH) || 'ผู้เล่นออนไลน์'
        : 'ผู้เล่นออนไลน์',
      x: candidate.x,
      z: candidate.z,
      dir: isFiniteNumber(candidate.dir) ? candidate.dir : 0,
      locomotion: sanitizeLocomotion(candidate.locomotion),
      animation: sanitizeAnimation(candidate.animation),
    }));
  }
  return Object.freeze({ zone, players: Object.freeze(players) });
}

export function createOnlineScenePresenceBridge({ getSceneWindow } = {}) {
  let activeZone = null;
  let scenePresenceReady = false;
  let forwardedConnected = null;
  let acceptedSnapshots = 0;

  function sceneWindow() {
    try { return getSceneWindow?.() || null; } catch { return null; }
  }

  function forwardStatus(connected) {
    const next = connected === true;
    if (forwardedConnected === next) return;
    forwardedConnected = next;
    const target = sceneWindow();
    if (!target) return;
    try {
      target.POCKETMONSTER_WORLD_SOCKET_CONNECTED = next;
      target.dispatchEvent?.(new target.CustomEvent('pocketmonster:world-socket-status', {
        detail: { connected: next },
      }));
    } catch {}
  }

  function clearScenePresence(zone = activeZone) {
    const target = sceneWindow();
    if (!zone || typeof target?.POCKETMONSTER_WORLD_PRESENCE !== 'function') return;
    try {
      target.POCKETMONSTER_WORLD_PRESENCE(Object.freeze({
        zone,
        players: Object.freeze([]),
      }));
    } catch {}
  }

  function reset() {
    const previousZone = activeZone;
    clearScenePresence(previousZone);
    activeZone = null;
    scenePresenceReady = false;
    forwardedConnected = null;
    forwardStatus(false);
  }

  function readPose() {
    const target = sceneWindow();
    let pose = null;
    try { pose = sanitizeOnlineWorldPose(target?.POCKETMONSTER_WORLD_STATE?.()); } catch { pose = null; }
    if (!pose) return null;
    if (activeZone && activeZone !== pose.zone) {
      scenePresenceReady = false;
      forwardedConnected = null;
      clearScenePresence(pose.zone);
      forwardStatus(false);
    }
    activeZone = pose.zone;
    return pose;
  }

  function acceptSnapshot(payload) {
    const pose = readPose();
    if (!pose) return false;
    const snapshot = sanitizeOnlineWorldSnapshot(payload, pose.zone);
    if (!snapshot) return false;
    const target = sceneWindow();
    if (typeof target?.POCKETMONSTER_WORLD_PRESENCE !== 'function') return false;
    try { target.POCKETMONSTER_WORLD_PRESENCE(snapshot); } catch { return false; }
    acceptedSnapshots += 1;
    scenePresenceReady = true;
    forwardStatus(true);
    return true;
  }

  function setTransportConnected(connected) {
    if (connected !== true) {
      scenePresenceReady = false;
      clearScenePresence();
      forwardStatus(false);
      return;
    }
    if (scenePresenceReady) forwardStatus(true);
  }

  function diagnostics() {
    return Object.freeze({ activeZone, scenePresenceReady, acceptedSnapshots });
  }

  return Object.freeze({ readPose, acceptSnapshot, setTransportConnected, reset, diagnostics });
}
