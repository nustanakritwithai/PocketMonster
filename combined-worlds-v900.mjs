/** V9 combined channel: 3 worlds. Control panels (human/throw) live in control-panels-v900.mjs. */
export const COMBINED_VERSION = '9.0.0-combined';
export const COMBINED_WORLD_COUNT = 3;
export const DEFAULT_COMBINED_WORLD = 'pirate-fruit';

export const COMBINED_WORLD_LINKS = Object.freeze([
  Object.freeze({
    id: 'pirate-to-pocket-monster',
    from: 'pirate-fruit',
    to: 'pocket-monster',
    label: 'เกมเดิม • Pocket Monster',
    kind: 'world-link',
  }),
  Object.freeze({
    id: 'pocket-monster-to-pirate',
    from: 'pocket-monster',
    to: 'pirate-fruit',
    label: 'Pirate Fruit',
    kind: 'world-link',
  }),
  Object.freeze({
    id: 'pirate-to-living-world',
    from: 'pirate-fruit',
    to: 'living-world',
    label: 'Living World',
    kind: 'world-link',
  }),
  Object.freeze({
    id: 'living-world-to-pirate',
    from: 'living-world',
    to: 'pirate-fruit',
    label: 'Pirate Fruit',
    kind: 'world-link',
  }),
]);

export const COMBINED_WORLDS = Object.freeze([
  Object.freeze({
    id: 'pocket-monster',
    label: 'เกมเดิม',
    title: 'Pocket Monster',
    detail: 'โหมดปาจับมอน • ตัวละคร Pirate Fruit ใช้แผงจับมอนเท่านั้น ไม่ใช้แผงโจมตี',
    runtime: './game-v800.js?v=814',
  }),
  Object.freeze({
    id: 'pirate-fruit',
    label: 'Pirate Fruit',
    title: 'Pirate Fruit',
    detail: 'โลก Pirate Fruit จริงจากไคลเอนต์ offline • วาปเชื่อมเข้าเกมเดิม',
    runtime: './boot-pirate-fruit-v900.mjs?v=907',
  }),
  Object.freeze({
    id: 'living-world',
    label: 'โลกกลาง',
    title: 'World Layer',
    detail: 'ชั้นโลกกลาง (World) • พรีเซนต์เท่านั้น ยังไม่เป็น authority ของดาเมจ/HP',
    runtime: './world-living-v900.mjs?v=902',
  }),
]);

export function worldById(id) {
  return COMBINED_WORLDS.find(world => world.id === id) || null;
}

export function worldIdFromLocation(locationLike = globalThis.location) {
  const id = new URL(locationLike.href).searchParams.get('world');
  return worldById(id)?.id || null;
}

export function resolveCombinedWorld(locationLike = globalThis.location) {
  return worldIdFromLocation(locationLike) || DEFAULT_COMBINED_WORLD;
}

export function combinedWorldLinksFrom(worldId) {
  return COMBINED_WORLD_LINKS.filter(link => link.from === worldId);
}
