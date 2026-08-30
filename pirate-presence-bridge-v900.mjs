export const PIRATE_PRESENCE_ZONE = 'pirate-fruit';
export const PIRATE_LOCAL_PRESENCE_MESSAGE = 'pocketmonster:pirate-presence-v1';
export const PIRATE_PRESENCE_SNAPSHOT_MESSAGE = 'pocketmonster:pirate-presence-snapshot-v1';

const MAX_REMOTE_PLAYERS = 100;
const MAX_PLAYER_ID_LENGTH = 80;
const MAX_PLAYER_NAME_LENGTH = 32;

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
  return Object.freeze({ x: message.x, z: message.z, dir: message.dir });
}

/**
 * Keep the Server snapshot presentation-only and bounded before crossing into
 * the iframe. Wrong zones and malformed frames are ignored without clearing a
 * valid current snapshot.
 */
export function sanitizePirateWorldSnapshot(payload) {
  if (!isRecord(payload) || payload.zone !== PIRATE_PRESENCE_ZONE) return null;
  if (!Array.isArray(payload.players)) return null;
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
    }));
  }
  return Object.freeze({ zone: PIRATE_PRESENCE_ZONE, players: Object.freeze(players) });
}

export function createPirateSnapshotMessage(snapshot) {
  return Object.freeze({
    type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
    payload: snapshot,
  });
}
