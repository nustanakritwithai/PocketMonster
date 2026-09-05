import {
  PRESENCE_COORDINATE_LIMIT,
  sanitizeAnimation,
  sanitizeLocomotion,
  sanitizeOnlineWorldSnapshot,
} from './world-presence-protocol.mjs';

export const PIRATE_PRESENCE_ZONE = 'pirate-fruit';
export const PIRATE_LOCAL_PRESENCE_MESSAGE = 'pocketmonster:pirate-presence-v1';
export const PIRATE_PRESENCE_SNAPSHOT_MESSAGE = 'pocketmonster:pirate-presence-snapshot-v1';
export const PIRATE_PRESENCE_STATUS_MESSAGE = 'pocketmonster:pirate-presence-status-v1';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Accept an actual local pose from the mounted Pirate Fruit iframe only. */
export function sanitizePirateLocalPresence(message) {
  if (!isRecord(message) || message.type !== PIRATE_LOCAL_PRESENCE_MESSAGE) return null;
  if (message.zone !== PIRATE_PRESENCE_ZONE) return null;
  if (!isFiniteNumber(message.x) || !isFiniteNumber(message.z) || !isFiniteNumber(message.dir)) return null;
  const pose = {
    x: message.x,
    z: message.z,
    dir: message.dir,
    locomotion: sanitizeLocomotion(message.locomotion),
    animation: sanitizeAnimation(message.animation),
  };
  if (isFiniteNumber(message.y)) {
    pose.y = Math.max(-PRESENCE_COORDINATE_LIMIT, Math.min(PRESENCE_COORDINATE_LIMIT, message.y));
  }
  return Object.freeze(pose);
}

/**
 * Keep the Server snapshot presentation-only and bounded before crossing into
 * the iframe. Vocabulary and player sanitizers live on the protocol.
 */
export function sanitizePirateWorldSnapshot(payload) {
  return sanitizeOnlineWorldSnapshot(payload, PIRATE_PRESENCE_ZONE);
}

export function createPirateSnapshotMessage(snapshot) {
  return Object.freeze({
    type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
    payload: snapshot,
  });
}

export function createPiratePresenceStatusMessage(connected) {
  return Object.freeze({
    type: PIRATE_PRESENCE_STATUS_MESSAGE,
    zone: PIRATE_PRESENCE_ZONE,
    connected: connected === true,
  });
}
