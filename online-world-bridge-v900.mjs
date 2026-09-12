import {
  sanitizeOnlineWorldPose,
  sanitizeOnlineWorldSnapshot,
} from './world-presence-protocol.mjs?v=5';

export const ONLINE_WORLD_SHELL_KIND = 'monsterlife-online-world-shell-v1';
export const ONLINE_WORLD_SCENE_KIND = 'monsterlife-online-world-scene-v1';

export {
  MAX_REMOTE_PLAYERS,
  MAX_SNAPSHOT_CANDIDATES,
  sanitizeOnlineWorldPose,
  sanitizeOnlineWorldSnapshot,
} from './world-presence-protocol.mjs?v=5';

export function isHostedOnlineWorldScene(windowLike = globalThis.window) {
  try {
    if (!windowLike?.parent || windowLike.parent === windowLike) return false;
    if (windowLike.parent.location.origin !== windowLike.location.origin) return false;
    return windowLike.parent.POCKETMONSTER_ONLINE_SHELL?.kind === ONLINE_WORLD_SHELL_KIND;
  } catch {
    return false;
  }
}

export function createOnlineScenePresenceBridge({ getSceneWindow, now = Date.now } = {}) {
  let activeZone = null;
  let scenePresenceReady = false;
  let forwardedConnected = null;
  let acceptedSnapshots = 0;
  let lastAcceptedAt = null;
  let routeGenerationHighWater = null;

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
    const receive = target?.POCKETMONSTER_SCENE_PRESENCE?.accept || target?.POCKETMONSTER_WORLD_PRESENCE;
    if (!zone || typeof receive !== 'function') return;
    try {
      receive.call(target, Object.freeze({
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
    lastAcceptedAt = null;
    forwardedConnected = null;
    forwardStatus(false);
  }

  function readPose() {
    const target = sceneWindow();
    let pose = null;
    try {
      const read = target?.POCKETMONSTER_SCENE_PRESENCE?.state || target?.POCKETMONSTER_WORLD_STATE;
      // Pirate's native producer carries the validated monster-intents
      // extension (including an empty list). Preserve it for aim reads while
      // keeping the protocol sanitizer as the structural gate.
      pose = sanitizeOnlineWorldPose(read?.call(target), { allowMonsterIntents: true });
    } catch { pose = null; }
    if (!pose) { scenePresenceReady = false; lastAcceptedAt = null; return null; }
    if (activeZone && activeZone !== pose.zone) {
      scenePresenceReady = false;
      lastAcceptedAt = null;
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
    if (snapshot.generation !== undefined) {
      if (routeGenerationHighWater !== null && snapshot.generation < routeGenerationHighWater) return false;
      routeGenerationHighWater = snapshot.generation;
    }
    const target = sceneWindow();
    const receive = target?.POCKETMONSTER_SCENE_PRESENCE?.accept || target?.POCKETMONSTER_WORLD_PRESENCE;
    if (typeof receive !== 'function') return false;
    try { if (receive.call(target, snapshot) === false) return false; } catch { return false; }
    acceptedSnapshots += 1;
    scenePresenceReady = true;
    lastAcceptedAt = now();
    forwardStatus(true);
    return true;
  }

  function setTransportConnected(connected) {
    if (connected !== true) {
      routeGenerationHighWater = null;
      scenePresenceReady = false;
      lastAcceptedAt = null;
      clearScenePresence();
      forwardStatus(false);
      return;
    }
    if (scenePresenceReady) forwardStatus(true);
  }

  function diagnostics() {
    return Object.freeze({ activeZone, scenePresenceReady, acceptedSnapshots, routeGenerationHighWater, lastAcceptedAt });
  }

  function isReady(zone) {
    const pose = readPose();
    const age = lastAcceptedAt === null ? Infinity : now() - lastAcceptedAt;
    return Boolean(pose && pose.zone === zone && scenePresenceReady && age >= 0 && age < 15000);
  }

  return Object.freeze({ readPose, acceptSnapshot, setTransportConnected, reset, diagnostics, isReady });
}
