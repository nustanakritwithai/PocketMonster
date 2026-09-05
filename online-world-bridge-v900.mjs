import {
  sanitizeOnlineWorldPose,
  sanitizeOnlineWorldSnapshot,
} from './world-presence-protocol.mjs?v=2';

export const ONLINE_WORLD_SHELL_KIND = 'monsterlife-online-world-shell-v1';
export const ONLINE_WORLD_SCENE_KIND = 'monsterlife-online-world-scene-v1';

export {
  MAX_REMOTE_PLAYERS,
  MAX_SNAPSHOT_CANDIDATES,
  sanitizeOnlineWorldPose,
  sanitizeOnlineWorldSnapshot,
} from './world-presence-protocol.mjs?v=2';

export function isHostedOnlineWorldScene(windowLike = globalThis.window) {
  try {
    if (!windowLike?.parent || windowLike.parent === windowLike) return false;
    if (windowLike.parent.location.origin !== windowLike.location.origin) return false;
    return windowLike.parent.POCKETMONSTER_ONLINE_SHELL?.kind === ONLINE_WORLD_SHELL_KIND;
  } catch {
    return false;
  }
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
