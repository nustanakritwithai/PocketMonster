import { GROUND_REPEAT, paintGroundGrid, paintSkyGradient } from '../blocky-ground.mjs';
import { PIRATE_PLAYER_PALETTE } from '../providers/pirate-fruit-player.mjs';

/** Same pirate-fruit world, Pocket blocky presentation. Not a new hunt stage. */
export const PIRATE_FRUIT_ZONE = 'pirate-fruit';
export const PIRATE_FRUIT_GROUND_COLOR = 0xc2a36b;
export const PIRATE_FRUIT_SKY_COLOR = 0x4f9ec9;
export const PIRATE_FRUIT_GROUND_TYPE = 'pirate';
export const PIRATE_FRUIT_SURFACE_STYLE = 'four-side-block-v1';
export const PIRATE_FRUIT_GROUND_STYLE = 'blocky-ground-v1';

export const PIRATE_FRUIT_SCENE_BOUNDS = Object.freeze({
  minX: -12.4, maxX: 12.4, minZ: -8.2, maxZ: 17.2,
});

export const PIRATE_FRUIT_PORTALS = Object.freeze({
  pocketMonster: Object.freeze({
    name: 'pocket-monster-world-portal',
    world: 'pocket-monster',
    panel: 'throw',
    source: 'pirate-fruit-portal',
    x: 7,
    z: 15,
    triggerRadius: 2.25,
    accent: 0x38bdf8,
    label: 'เกมเดิม • Pocket Monster',
  }),
  livingWorld: Object.freeze({
    name: 'living-world-pirate-fruit-portal',
    world: 'living-world',
    panel: 'human',
    source: 'pirate-fruit-living-portal',
    x: -7,
    z: 15,
    triggerRadius: 2.25,
    accent: 0xfb923c,
    label: 'โลกกลาง • Living World',
  }),
});

export const PIRATE_FRUIT_SCENE_CHARACTERS = Object.freeze([
  Object.freeze({
    id: 'character.human.blocky-bighead.v1',
    role: 'keeper',
    appearanceId: 'appearance.human.keeper-green.v1',
    x: -3.4,
    z: 4.6,
    yaw: 0.4,
    name: 'pirate-fruit:keeper',
  }),
  Object.freeze({
    id: 'character.human.blocky-bighead.v1',
    role: 'merchant',
    appearanceId: 'appearance.human.merchant-brown.v1',
    x: 2.6,
    z: 6.2,
    yaw: -0.8,
    name: 'pirate-fruit:merchant',
  }),
  Object.freeze({
    id: 'character.human.blocky-bighead.v1',
    role: 'trainer',
    appearanceId: 'appearance.human.trainer-blue.v1',
    x: -1.2,
    z: 8.4,
    yaw: 3.0,
    name: 'pirate-fruit:trainer',
  }),
]);

export const PIRATE_FRUIT_SCENE_MONSTERS = Object.freeze([
  Object.freeze({
    id: 'monster.slime.aquapuff.bighead.v1',
    role: 'wild',
    x: 3.4,
    z: 10.6,
    name: 'pirate-fruit:monster-aquapuff',
  }),
  Object.freeze({
    id: 'monster.mossbun.mossbun.bighead.v1',
    role: 'wild',
    x: -5.2,
    z: 2.8,
    name: 'pirate-fruit:monster-mossbun',
  }),
  Object.freeze({
    id: 'monster.plainpup.normalooze.bighead.v1',
    role: 'wild',
    x: 1.1,
    z: 3.4,
    name: 'pirate-fruit:monster-plainpup',
  }),
  Object.freeze({
    id: 'monster.flameling.flameling.bighead.v1',
    role: 'wild',
    x: 5.0,
    z: 5.2,
    name: 'pirate-fruit:monster-flameling',
  }),
]);

export const PIRATE_FRUIT_REMOTE_APPEARANCES = Object.freeze([
  'appearance.human.player-orange.v1',
  'appearance.human.keeper-green.v1',
  'appearance.human.merchant-brown.v1',
  'appearance.human.trainer-blue.v1',
]);

const WOOD = 0x8b5a2b;
const POST = 0x5b3a1a;
const CRATE = 0x92400e;
const CRATE_DARK = 0x78350f;
const ROCK = 0x6b5344;
const ROCK_DARK = 0x4b3a2f;
const WATER = 0x1d4e89;
const WATER_DEEP = 0x163e6b;
const LEAF = 0x18753a;
const LEAF_DARK = 0x166534;
const LAMP = 0xffe08a;

export function makePirateFruitGroundImage() {
  return paintGroundGrid(PIRATE_FRUIT_GROUND_COLOR, PIRATE_FRUIT_GROUND_TYPE);
}

export function makePirateFruitSkyImage() {
  return paintSkyGradient(PIRATE_FRUIT_SKY_COLOR);
}

function addBox(THREE, box, material, parent, w, h, d, color, x, y, z, name, extra = {}) {
  const mesh = new THREE.Mesh(box(w, h, d), material(color, extra.rough ?? 0.86, extra.metal ?? 0.04));
  mesh.position.set(x, y, z);
  mesh.castShadow = extra.cast !== false;
  mesh.receiveShadow = extra.receive !== false;
  if (name) mesh.name = name;
  mesh.userData.part = extra.part || name;
  mesh.userData.surfaceStyle = PIRATE_FRUIT_SURFACE_STYLE;
  parent.add(mesh);
  return mesh;
}

function makePalm(THREE, box, material, parent, x, z, scale = 1, name = 'pirate-fruit:palm') {
  const group = new THREE.Group();
  group.name = name;
  addBox(THREE, box, material, group, 0.18 * scale, 1.7 * scale, 0.18 * scale, POST, 0, 0.85 * scale, 0, 'pirate-fruit:wood');
  addBox(THREE, box, material, group, 1.15 * scale, 0.22 * scale, 0.42 * scale, LEAF, 0, 1.72 * scale, 0, 'pirate-fruit:leaf');
  addBox(THREE, box, material, group, 0.42 * scale, 0.22 * scale, 1.15 * scale, 0x15803d, 0, 1.72 * scale, 0, 'pirate-fruit:leaf');
  addBox(THREE, box, material, group, 0.55 * scale, 0.28 * scale, 0.55 * scale, LEAF_DARK, 0, 1.92 * scale, 0, 'pirate-fruit:leaf');
  group.position.set(x, 0, z);
  parent.add(group);
  return group;
}

function makeRock(THREE, box, material, parent, x, z, scale = 1, name = 'pirate-fruit:rock') {
  const group = new THREE.Group();
  group.name = name;
  addBox(THREE, box, material, group, 0.86 * scale, 0.42 * scale, 0.70 * scale, ROCK, 0, 0.21 * scale, 0, 'pirate-fruit:rock');
  addBox(THREE, box, material, group, 0.48 * scale, 0.28 * scale, 0.40 * scale, ROCK_DARK, 0.18 * scale, 0.38 * scale, -0.06 * scale, 'pirate-fruit:rock');
  group.position.set(x, 0, z);
  parent.add(group);
  return group;
}

function makeFence(THREE, box, material, parent, x, z, yaw, length = 2.4, name = 'pirate-fruit:fence') {
  const group = new THREE.Group();
  group.name = name;
  const posts = Math.max(2, Math.round(length / 0.8) + 1);
  const start = -length / 2;
  for (let i = 0; i < posts; i++) {
    const px = start + (length * i) / (posts - 1);
    addBox(THREE, box, material, group, 0.12, 0.92, 0.12, POST, px, 0.46, 0, 'pirate-fruit:fence-post');
  }
  addBox(THREE, box, material, group, length + 0.08, 0.10, 0.08, WOOD, 0, 0.38, 0, 'pirate-fruit:fence-rail');
  addBox(THREE, box, material, group, length + 0.08, 0.10, 0.08, WOOD, 0, 0.68, 0, 'pirate-fruit:fence-rail');
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  parent.add(group);
  return group;
}

function makeLantern(THREE, box, material, parent, x, z, name = 'pirate-fruit:lantern') {
  const group = new THREE.Group();
  group.name = name;
  addBox(THREE, box, material, group, 0.16, 1.28, 0.16, POST, 0, 0.64, 0, 'pirate-fruit:lantern-post');
  addBox(THREE, box, material, group, 0.28, 0.28, 0.28, LAMP, 0, 1.42, 0, 'pirate-fruit:lantern-light', { rough: 0.28, metal: 0.08 });
  addBox(THREE, box, material, group, 0.34, 0.06, 0.34, PIRATE_PLAYER_PALETTE.brass, 0, 1.60, 0, 'pirate-fruit:lantern-cap', { rough: 0.35, metal: 0.55 });
  group.position.set(x, 0, z);
  parent.add(group);
  return group;
}

function makePortal(THREE, box, material, parent, spec) {
  const group = new THREE.Group();
  group.name = spec.name;
  group.userData.presentationOnly = true;
  group.userData.combatAuthority = false;
  group.userData.destination = spec.world;
  group.userData.panel = spec.panel;
  group.userData.source = spec.source;
  group.userData.triggerRadius = spec.triggerRadius;
  addBox(THREE, box, material, group, 0.36, 2.6, 0.36, PIRATE_PLAYER_PALETTE.coat, -1.15, 1.3, 0, `${spec.name}:pillar`);
  addBox(THREE, box, material, group, 0.36, 2.6, 0.36, PIRATE_PLAYER_PALETTE.coat, 1.15, 1.3, 0, `${spec.name}:pillar`);
  addBox(THREE, box, material, group, 2.7, 0.34, 0.42, PIRATE_PLAYER_PALETTE.trim, 0, 2.68, 0, `${spec.name}:lintel`);
  addBox(THREE, box, material, group, 1.7, 2.1, 0.10, spec.accent, 0, 1.35, 0.02, `${spec.name}:gate`, { rough: 0.22, metal: 0.12, cast: false });
  addBox(THREE, box, material, group, 2.2, 0.16, 0.9, POST, 0, 0.08, 0, `${spec.name}:step`, { cast: false });
  group.position.set(spec.x, 0, spec.z);
  parent.add(group);
  return group;
}

function makePortalLabel(THREE, spec) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = 'rgba(15,23,42,.88)';
  ctx.strokeStyle = `#${spec.accent.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(7, 7, 626, 130, 34);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.label, 320, 72);
  const texture = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  label.name = `${spec.name}:label`;
  label.position.set(spec.x, 3.35, spec.z);
  label.scale.set(5.0, 1.12, 1);
  label.renderOrder = 100;
  return label;
}

export function buildPirateFruitWorld({
  THREE,
  box,
  material,
  groundTexture,
} = {}) {
  if (!THREE?.Group || typeof box !== 'function' || typeof material !== 'function') {
    throw new Error('pirate-fruit scene needs THREE, box(), and material()');
  }

  const root = new THREE.Group();
  root.name = 'pirate-fruit:world';
  root.userData.zone = PIRATE_FRUIT_ZONE;
  root.userData.surfaceStyle = PIRATE_FRUIT_SURFACE_STYLE;
  root.userData.groundStyle = PIRATE_FRUIT_GROUND_STYLE;
  root.userData.presentationOnly = true;
  root.userData.combatAuthority = false;

  const groundMat = groundTexture
    ? new THREE.MeshStandardMaterial({ map: groundTexture, color: 0xffffff, roughness: 1 })
    : material(PIRATE_FRUIT_GROUND_COLOR, 1, 0);
  const ground = THREE.PlaneGeometry
    ? new THREE.Mesh(new THREE.PlaneGeometry(90, 90), groundMat)
    : new THREE.Mesh(box(90, 0.08, 90), groundMat);
  ground.name = 'pirate-fruit:ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.groundStyle = PIRATE_FRUIT_GROUND_STYLE;
  root.add(ground);

  addBox(THREE, box, material, root, 46, 0.18, 18, WATER, 0, -0.22, 16.4, 'pirate-fruit:water', { cast: false, rough: 0.18, metal: 0.22 });
  addBox(THREE, box, material, root, 18, 0.16, 28, WATER_DEEP, -16.4, -0.24, 4, 'pirate-fruit:water', { cast: false, rough: 0.2, metal: 0.2 });
  addBox(THREE, box, material, root, 18, 0.16, 28, WATER_DEEP, 16.4, -0.24, 4, 'pirate-fruit:water', { cast: false, rough: 0.2, metal: 0.2 });

  addBox(THREE, box, material, root, 3.4, 0.16, 11.2, WOOD, 0, 0.08, 7.4, 'pirate-fruit:dock');
  addBox(THREE, box, material, root, 0.22, 1.15, 0.22, POST, -1.55, 0.58, 2.6, 'pirate-fruit:pier-post');
  addBox(THREE, box, material, root, 0.22, 1.15, 0.22, POST, 1.55, 0.58, 2.6, 'pirate-fruit:pier-post');
  addBox(THREE, box, material, root, 0.22, 1.15, 0.22, POST, -1.55, 0.58, 8.8, 'pirate-fruit:pier-post');
  addBox(THREE, box, material, root, 0.22, 1.15, 0.22, POST, 1.55, 0.58, 8.8, 'pirate-fruit:pier-post');
  addBox(THREE, box, material, root, 0.72, 0.55, 0.72, CRATE, 1.7, 0.34, 5.4, 'pirate-fruit:wood');
  addBox(THREE, box, material, root, 0.72, 0.55, 0.72, CRATE_DARK, 1.7, 0.90, 5.4, 'pirate-fruit:wood');
  addBox(THREE, box, material, root, 0.46, 0.52, 0.46, PIRATE_PLAYER_PALETTE.trim, -1.7, 0.30, 6.1, 'pirate-fruit:wood');
  addBox(THREE, box, material, root, 0.70, 0.40, 0.46, WOOD, 2.4, 0.24, 7.6, 'pirate-fruit:wood');

  const hut = new THREE.Group();
  hut.name = 'pirate-fruit:hut';
  addBox(THREE, box, material, hut, 2.5, 1.46, 2.1, PIRATE_PLAYER_PALETTE.coat, 0, 0.73, 0, 'pirate-fruit:hut-wall');
  addBox(THREE, box, material, hut, 2.8, 0.24, 2.4, PIRATE_PLAYER_PALETTE.trim, 0, 1.54, 0, 'pirate-fruit:hut-roof');
  addBox(THREE, box, material, hut, 0.48, 0.78, 0.08, PIRATE_PLAYER_PALETTE.leather, 0, 0.44, -1.08, 'pirate-fruit:hut-door');
  hut.position.set(-3.6, 0, 4.2);
  root.add(hut);

  const mast = new THREE.Group();
  mast.name = 'pirate-fruit:mast';
  addBox(THREE, box, material, mast, 0.18, 3.4, 0.18, POST, 0, 1.7, 0, 'pirate-fruit:wood');
  addBox(THREE, box, material, mast, 1.2, 0.58, 0.08, PIRATE_PLAYER_PALETTE.trim, 0.62, 2.7, 0, 'pirate-fruit:flag');
  mast.position.set(4.2, 0, 4.8);
  root.add(mast);

  makePalm(THREE, box, material, root, -5.4, 1.6, 1.15);
  makePalm(THREE, box, material, root, 5.6, 1.1, 0.95);
  makePalm(THREE, box, material, root, -6.2, 7.4, 1.05);
  makePalm(THREE, box, material, root, 6.0, 8.2, 0.88);
  makePalm(THREE, box, material, root, -2.8, -2.6, 1.2);
  makePalm(THREE, box, material, root, 3.2, -3.4, 0.9);

  makeRock(THREE, box, material, root, -7.2, 9.4, 1.15);
  makeRock(THREE, box, material, root, 8.1, 9.8, 0.9);
  makeRock(THREE, box, material, root, -8.4, 0.6, 1.05);
  makeRock(THREE, box, material, root, 7.6, -1.2, 0.85);
  makeRock(THREE, box, material, root, 0.8, -4.8, 1.2);

  makeFence(THREE, box, material, root, -4.6, 11.6, 0.18, 3.2);
  makeFence(THREE, box, material, root, 4.8, 11.8, -0.16, 3.2);
  makeFence(THREE, box, material, root, -8.6, 5.4, 1.2, 2.6);
  makeFence(THREE, box, material, root, 8.8, 5.8, -1.15, 2.6);

  const lanterns = [
    makeLantern(THREE, box, material, root, -2.2, 9.6),
    makeLantern(THREE, box, material, root, 2.2, 9.6),
    makeLantern(THREE, box, material, root, -5.8, 13.4),
    makeLantern(THREE, box, material, root, 5.8, 13.4),
    makeLantern(THREE, box, material, root, 0, 1.2),
  ];

  const portals = [
    makePortal(THREE, box, material, root, PIRATE_FRUIT_PORTALS.pocketMonster),
    makePortal(THREE, box, material, root, PIRATE_FRUIT_PORTALS.livingWorld),
  ];
  for (const spec of Object.values(PIRATE_FRUIT_PORTALS)) {
    const label = makePortalLabel(THREE, spec);
    if (label) root.add(label);
  }

  return {
    root,
    ground,
    portals,
    lanterns,
    groundRepeat: GROUND_REPEAT,
  };
}

export function attachPirateFruitLights(THREE, scene, lanterns = [], { shadows = true } = {}) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x42643d, 1.45));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.05);
  sun.position.set(9, 18, 8);
  sun.castShadow = shadows;
  scene.add(sun);
  for (const lantern of lanterns) {
    const light = new THREE.PointLight(0xffcc66, 1.15, 8, 2);
    light.position.copy(lantern.position);
    light.position.y = 1.45;
    scene.add(light);
  }
  return sun;
}
