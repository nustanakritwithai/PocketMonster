/** Island geography shared with live Pirate Fruit Online. Presence pose is parked. */

export const PIRATE_FRUIT_LIVE_ORIGIN = 'https://pirate-fruit-u555.onrender.com';
export const PIRATE_FRUIT_MAP_SOURCE_COMMIT = '4df5721de8bdb20c28e53b6a8c933616e132c96d';
export const PIRATE_FRUIT_PRESENCE_ZONE = 'pirate-fruit';

/** Flip to true when WORLD_STATE uses the iframe island pose instead of origin. */
export const PIRATE_FRUIT_PRESENCE_USES_IFRAME_POSE = false;

export const PIRATE_FRUIT_ISLAND_LAYOUT_OFFSETS = Object.freeze({
  'starter-island': Object.freeze({ x: 0, z: 0 }),
  'mist-jungle': Object.freeze({ x: 0, z: -80 }),
  'sunscar-desert': Object.freeze({ x: 190, z: -165 }),
  'azure-frost': Object.freeze({ x: 465, z: -100 }),
  'tempest-sky': Object.freeze({ x: 555, z: 120 }),
  'ember-volcano': Object.freeze({ x: 455, z: 400 }),
});

export const PIRATE_FRUIT_ISLAND_CENTERS = Object.freeze({
  'starter-island': Object.freeze({ x: 0, z: 0, radius: 60 }),
  'mist-jungle': Object.freeze({ x: 170, z: -120, radius: 54 }),
  'sunscar-desert': Object.freeze({ x: 360, z: -40, radius: 56 }),
  'azure-frost': Object.freeze({ x: 500, z: 110, radius: 58 }),
  'tempest-sky': Object.freeze({ x: 430, z: 330, radius: 60 }),
  'ember-volcano': Object.freeze({ x: 220, z: 470, radius: 62 }),
});

export const PIRATE_FRUIT_LAYOUT_OFFSET_NEEDLE =
  '"starter-island":{x:0,z:0},"mist-jungle":{x:0,z:-80},"sunscar-desert":{x:190,z:-165},"azure-frost":{x:465,z:-100},"tempest-sky":{x:555,z:120},"ember-volcano":{x:455,z:400}';

export function parkedPirateFruitPresencePose() {
  return Object.freeze({ x: 0, z: 0 });
}
