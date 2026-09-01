// Shared world presence protocol guards (defense-in-depth). The server already
// relays sanitized snapshots and excludes each recipient from their own view;
// these guards validate outbound frames before they reach the socket and filter
// inbound snapshots once, at the single online ingress, before any world
// renderer consumes them.

export const WORLD_PRESENCE_PROTOCOL_VERSION = 'world-presence-protocol/v1';

export function buildWorldPosFrame(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const zone = snapshot.zone;
  const x = snapshot.x;
  const z = snapshot.z;
  if (typeof zone !== 'string' || !zone) return null;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const dir = snapshot.dir === undefined ? 0 : snapshot.dir;
  if (!Number.isFinite(dir)) return null;
  return Object.freeze({ zone, x, z, dir });
}

export function worldSnapshotPayload(message) {
  if (!message || message.type !== 'world-snapshot') return null;
  const payload = message.payload;
  if (!payload || typeof payload !== 'object' || typeof payload.zone !== 'string' || !Array.isArray(payload.players)) return null;
  return payload;
}

export function isRemoteWorldPlayer(item, selfId) {
  if (!item?.id || !Number.isFinite(item.x) || !Number.isFinite(item.z)) return false;
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
