/** V9 combined channel: 3 worlds. Control panels (human/throw) live in control-panels-v900.mjs. */
export const COMBINED_VERSION = '9.0.0-combined';
export const COMBINED_WORLD_COUNT = 3;

export const COMBINED_WORLDS = Object.freeze([
  Object.freeze({
    id: 'pocket-monster',
    label: 'เกมเดิม',
    title: 'Pocket Monster',
    detail: 'โหมดปาจับมอน • ตัวละคร Pirate Fruit ใช้แผงจับมอนเท่านั้น ไม่ใช้แผงโจมตี',
    runtime: './game-v800.js?v=810',
  }),
  Object.freeze({
    id: 'pirate-fruit',
    label: 'Pirate Fruit',
    title: 'เกาะโจรสลัดภาษาบล็อก',
    detail: 'โลก Pirate Fruit ใช้ภาษาบล็อกและ asset engine ของ Pocket • โหมดปาใช้ระบบจับมอนของเกมเดิม',
    runtime: './boot-pirate-fruit-v900.mjs?v=900',
  }),
  Object.freeze({
    id: 'living-world',
    label: 'โลกกลาง',
    title: 'World Layer',
    detail: 'ชั้นโลกกลาง (World) • พรีเซนต์เท่านั้น ยังไม่เป็น authority ของดาเมจ/HP',
    runtime: './world-living-v900.mjs?v=900',
  }),
]);

export function worldById(id) {
  return COMBINED_WORLDS.find(world => world.id === id) || null;
}

export function worldIdFromLocation(locationLike = globalThis.location) {
  const id = new URL(locationLike.href).searchParams.get('world');
  return worldById(id)?.id || null;
}
