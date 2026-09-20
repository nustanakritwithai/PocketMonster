// ขนส่งผลจาก engine โลกโจรสลัดเดิมเท่านั้น ไม่คำนวณ HP หรือรางวัลใน bridge
export const PIRATE_ORIGINAL_WORLD_CONTRACT = 'pirate-original-world/1';
const MESSAGE_TYPES = new Set([
  'world-monster-snapshot', 'world-monster-delta', 'world-monster-attack',
  'world-monster-dead', 'world-monster-respawn',
]);

export function sanitizePirateVitals(value) {
  if (!value || value.contract !== 'pirate-vitals/1' || !Number.isSafeInteger(value.revision)
    || value.revision < 1 || !Number.isFinite(value.serverTimeMs) || value.serverTimeMs < 0) return null;
  for (const field of ['hp', 'maxHp', 'guard', 'guardMax', 'energy', 'maxEnergy', 'mp', 'maxMp', 'hitstunUntil']) {
    if (!Number.isFinite(value[field]) || value[field] < 0 || value[field] > 1e15) return null;
  }
  if (value.hp > value.maxHp || value.guard > value.guardMax || value.energy > value.maxEnergy
    || value.mp > value.maxMp || typeof value.guardBroken !== 'boolean' || typeof value.dead !== 'boolean') return null;
  const result = Object.fromEntries(['contract', 'revision', 'serverTimeMs', 'hp', 'maxHp', 'guard', 'guardMax',
    'guardBroken', 'hitstunUntil', 'energy', 'maxEnergy', 'mp', 'maxMp', 'dead'].map(key => [key, value[key]]));
  if (value.respawn) {
    const respawn = value.respawn;
    if (typeof respawn.spawnId !== 'string' || respawn.spawnId.length > 128
      || typeof respawn.islandId !== 'string' || respawn.islandId.length > 128
      || !Number.isSafeInteger(respawn.atRevision) || respawn.atRevision < 1 || respawn.atRevision > value.revision
      || ['x', 'y', 'z', 'heading'].some(key => !Number.isFinite(respawn[key]) || Math.abs(respawn[key]) > 1e6)) return null;
    result.respawn = Object.fromEntries(['spawnId', 'islandId', 'x', 'y', 'z', 'heading', 'atRevision'].map(key => [key, respawn[key]]));
  }
  return Object.freeze(result);
}

export function sanitizePirateOriginalWorld(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.contract !== PIRATE_ORIGINAL_WORLD_CONTRACT
    || typeof value.viewerId !== 'string' || value.viewerId.length < 1 || value.viewerId.length > 80
    || !Number.isSafeInteger(value.generation) || value.generation < 1
    || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || !Array.isArray(value.messages) || value.messages.length > 512) return null;
  if (value.messages.some(message => !message || typeof message !== 'object'
    || Array.isArray(message) || !MESSAGE_TYPES.has(message.type)
    || !Number.isSafeInteger(message.seq) || message.seq < 1)) return null;
  try {
    const json = JSON.stringify(value.messages);
    if (json.length > 1024 * 1024) return null;
    const vitals = value.vitals == null ? null : sanitizePirateVitals(value.vitals);
    if (value.vitals != null && !vitals) return null;
    return Object.freeze({
      contract: PIRATE_ORIGINAL_WORLD_CONTRACT,
      viewerId: value.viewerId,
      generation: value.generation,
      sequence: value.sequence,
      messages: Object.freeze(JSON.parse(json)),
      ...(vitals ? { vitals } : {}),
    });
  } catch { return null; }
}
