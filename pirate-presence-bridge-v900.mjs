import {
  PRESENCE_COORDINATE_LIMIT,
  sanitizeAnimation,
  sanitizePresentation,
  sanitizeVisual,
  sanitizeLocomotion,
  sanitizeOnlineWorldPose,
  sanitizeOnlineWorldSnapshot,
  centralAuthorityOwnsZone,
} from './world-presence-protocol.mjs?v=4';

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
  if (message.presentation !== undefined) {
    const presentation = sanitizePresentation(message.presentation);
    if (presentation) pose.presentation = presentation;
  }
  if (message.visual !== undefined) {
    const visual = sanitizeVisual(message.visual, { maxEvents: 32 });
    if (visual) pose.visual = visual;
  }
  if (message.actors !== undefined) {
    const actorPose = sanitizeOnlineWorldPose({ ...message, zone: PIRATE_PRESENCE_ZONE });
    if (!actorPose || actorPose.actors === undefined) return null;
    pose.actors = actorPose.actors;
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

export function pirateCentralAuthorityOwnsZone(capability, zone = PIRATE_PRESENCE_ZONE) {
  return centralAuthorityOwnsZone(capability, zone);
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

/** Advance one-shot visual ages while preserving the current projectile phase. */
export function advancePirateSnapshotVisualAge(snapshot, elapsedMs) {
  const elapsed = Math.max(0, Number.isFinite(Number(elapsedMs)) ? Number(elapsedMs) : 0);
  if (!isRecord(snapshot) || !Array.isArray(snapshot.players)) return snapshot;
  const players = snapshot.players.map(player => {
    if (!player?.visual) return player;
    const events = Array.isArray(player.visual.events)
      ? player.visual.events
        .map(event => ({ ...event, ageMs: Math.round(event.ageMs + elapsed) }))
        .filter(event => event.ageMs <= 3000)
      : [];
    const projectiles = Array.isArray(player.visual.projectiles)
      ? player.visual.projectiles.flatMap(projectile => {
        const remainingMs = projectile.remainingMs - elapsed;
        if (remainingMs <= 0) return [];
        const dt = Math.min(elapsed / 1000, .25);
        const position = {
          x: Math.max(-PRESENCE_COORDINATE_LIMIT, Math.min(PRESENCE_COORDINATE_LIMIT, projectile.position.x + projectile.velocity.x * dt)),
          y: Math.max(-PRESENCE_COORDINATE_LIMIT, Math.min(PRESENCE_COORDINATE_LIMIT, projectile.position.y + projectile.velocity.y * dt)),
          z: Math.max(-PRESENCE_COORDINATE_LIMIT, Math.min(PRESENCE_COORDINATE_LIMIT, projectile.position.z + projectile.velocity.z * dt)),
        };
        const phase = projectile.lifeFraction >= 1
          ? 1
          : Math.max(0, Math.min(1, projectile.lifeFraction * remainingMs / Math.max(1, projectile.remainingMs)));
        return [{ ...projectile, position, elapsed: Math.min(120, projectile.elapsed + dt), lifeFraction: phase, remainingMs }];
      })
      : [];
    return { ...player, visual: { ...player.visual, events, projectiles } };
  });
  return Object.freeze({ ...snapshot, players: Object.freeze(players) });
}
