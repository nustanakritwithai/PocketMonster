// ขนส่งผลจาก engine โลกโจรสลัดเดิมเท่านั้น ไม่คำนวณ HP หรือรางวัลใน bridge
export const PIRATE_ORIGINAL_WORLD_CONTRACT = 'pirate-original-world/1';
const MESSAGE_TYPES = new Set([
  'world-monster-snapshot', 'world-monster-delta', 'world-monster-attack',
  'world-monster-dead', 'world-monster-respawn',
]);

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
    return Object.freeze({
      contract: PIRATE_ORIGINAL_WORLD_CONTRACT,
      viewerId: value.viewerId,
      generation: value.generation,
      sequence: value.sequence,
      messages: Object.freeze(JSON.parse(json)),
    });
  } catch { return null; }
}
