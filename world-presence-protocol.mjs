export function buildWorldPosFrame(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const zone = snapshot.zone;
  const x = Number(snapshot.x);
  const z = Number(snapshot.z);
  const dir = Number(snapshot.dir);
  if (typeof zone !== 'string' || !zone || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(dir)) return null;
  return { type: 'world-pos', zone, x, z, dir };
}

export function worldSnapshotPayload(message) {
  if (!message || message.type !== 'world-snapshot' || !message.payload || typeof message.payload !== 'object') return null;
  return message.payload;
}

export function isRemoteWorldPlayer(item, selfId) {
  if (!item?.id || !Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.z))) return false;
  if (selfId != null && selfId !== '' && String(item.id) === String(selfId)) return false;
  return true;
}

export function selfPresenceId(profile, explicitId) {
  return explicitId || profile?.id || profile?.accountId || profile?.username || null;
}
