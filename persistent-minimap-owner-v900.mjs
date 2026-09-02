import {
  createUnifiedMinimapStore,
  projectMinimapFrame,
} from './unified-minimap-v900.mjs';
import {
  PIRATE_FRUIT_ISLAND_CENTERS,
  PIRATE_FRUIT_ISLAND_LAYOUT_OFFSETS,
} from './pirate-fruit-island-map-v900.mjs';

export const PERSISTENT_MINIMAP_OWNER_KIND = 'pocketmonster:persistent-minimap-owner-v2';
export const PIRATE_FRUIT_MINIMAP_NEAR_PADDING = 18;
export const PIRATE_FRUIT_MINIMAP_LOCAL_SCALE = 1.3;
const STYLE_HREF = new URL('./unified-minimap-mobile-v900.css?v=2', import.meta.url).href;
const OWNER_KEY = '__POCKETMONSTER_PERSISTENT_MINIMAP_OWNER__';
const MAP_RASTER_SIZE = 160;
const SEA_LEVEL = 0;
const BASE_TERRAIN = -0.9;

const ISLAND_META = Object.freeze({
  'starter-island': Object.freeze({ name: 'เกาะเริ่มต้น', theme: 'starter' }),
  'mist-jungle': Object.freeze({ name: 'เกาะพงไพรหมอก', theme: 'jungle' }),
  'sunscar-desert': Object.freeze({ name: 'เกาะทะเลทรายสุริยะ', theme: 'desert' }),
  'azure-frost': Object.freeze({ name: 'เกาะเหมันต์คราม', theme: 'frost' }),
  'tempest-sky': Object.freeze({ name: 'เกาะนภาวายุ', theme: 'tempest' }),
  'ember-volcano': Object.freeze({ name: 'เกาะภูผาอัคคี', theme: 'volcano' }),
});

const PIRATE_ISLANDS = Object.freeze(Object.entries(PIRATE_FRUIT_ISLAND_CENTERS).map(([id, island]) => Object.freeze({
  id,
  name: ISLAND_META[id]?.name || id,
  theme: ISLAND_META[id]?.theme || 'starter',
  x: island.x,
  z: island.z,
  radius: island.radius,
})));

export const PIRATE_FRUIT_MINIMAP_BOUNDS = Object.freeze({
  minX: Math.min(...PIRATE_ISLANDS.map(island => island.x - island.radius)),
  maxX: Math.max(...PIRATE_ISLANDS.map(island => island.x + island.radius)),
  minZ: Math.min(...PIRATE_ISLANDS.map(island => island.z - island.radius)),
  maxZ: Math.max(...PIRATE_ISLANDS.map(island => island.z + island.radius)),
});

function translatedPoi(islandId, poi) {
  const offset = PIRATE_FRUIT_ISLAND_LAYOUT_OFFSETS[islandId] || { x: 0, z: 0 };
  return Object.freeze({
    ...poi,
    islandId,
    x: poi.x + offset.x,
    z: poi.z + offset.z,
  });
}

// Ported from the legacy Pirate Fruit minimap POI catalog. These are map
// presentation coordinates only; gameplay/world ownership remains unchanged.
export const PIRATE_FRUIT_MINIMAP_POIS = Object.freeze([
  translatedPoi('starter-island', { id: 'starter-village', name: 'หมู่บ้านโจรสลัด', icon: '◆', x: 0, z: 8 }),
  translatedPoi('starter-island', { id: 'starter-harbor', name: 'ท่าเรือ', icon: '⚓', x: 0, z: -31 }),
  translatedPoi('starter-island', { id: 'training-beach', name: 'หาดฝึกฝน', icon: '⚔', x: -31, z: -8 }),
  translatedPoi('starter-island', { id: 'fruit-grove', name: 'สวนผลไม้ลึกลับ', icon: '●', x: 29, z: 10 }),
  translatedPoi('starter-island', { id: 'hill-shrine', name: 'ศาลาบนเนิน', icon: '▲', x: 0, z: 31 }),

  translatedPoi('mist-jungle', { id: 'mist-jungle-camp', name: 'ค่ายนักสำรวจ', icon: '◆', x: 153, z: -40 }),
  translatedPoi('mist-jungle', { id: 'mist-jungle-harbor', name: 'ท่าเรือพงไพรหมอก', icon: '⚓', x: 137, z: -40 }),
  translatedPoi('mist-jungle', { id: 'jungle-bandit-camp', name: 'ค่ายโจรป่า', icon: '⚔', x: 170, z: -58 }),
  translatedPoi('mist-jungle', { id: 'ancient-ruins', name: 'ซากวิหารโบราณ', icon: '▦', x: 179, z: -31 }),
  translatedPoi('mist-jungle', { id: 'guardian-terrace', name: 'ลานผู้พิทักษ์', icon: '◇', x: 192, z: -45 }),
  translatedPoi('mist-jungle', { id: 'venom-ape-arena', name: 'ถ้ำวานรพิษ', icon: '▲', x: 190, z: -18 }),

  translatedPoi('sunscar-desert', { id: 'sunscar-caravan-city', name: 'นครคาราวานสุริยะ', icon: '◆', x: 170, z: 100 }),
  translatedPoi('sunscar-desert', { id: 'sunscar-desert-harbor', name: 'ท่าเรือทะเลทรายสุริยะ', icon: '⚓', x: 170, z: 94 }),
  translatedPoi('sunscar-desert', { id: 'sunscar-oasis', name: 'โอเอซิสกระจกฟ้า', icon: '●', x: 154, z: 120 }),
  translatedPoi('sunscar-desert', { id: 'sunscar-raider-camp', name: 'ค่ายโจรทะเลทราย', icon: '⚔', x: 148, z: 142 }),
  translatedPoi('sunscar-desert', { id: 'sunscar-quarry', name: 'เหมืองโกเลมทราย', icon: '◇', x: 191, z: 141 }),
  translatedPoi('sunscar-desert', { id: 'sunscar-pyramid', name: 'พีระมิดสุริยะ', icon: '▲', x: 170, z: 157 }),

  translatedPoi('azure-frost', { id: 'azure-frost-village', name: 'หมู่บ้านนักล่าเหมันต์', icon: '◆', x: 59, z: 201 }),
  translatedPoi('azure-frost', { id: 'azure-frost-harbor', name: 'ท่าเรือเหมันต์คราม', icon: '⚓', x: 66, z: 190 }),
  translatedPoi('azure-frost', { id: 'azure-frozen-lake', name: 'ทะเลสาบกระจกเยือกแข็ง', icon: '●', x: 29, z: 195 }),
  translatedPoi('azure-frost', { id: 'azure-raider-camp', name: 'ค่ายโจรน้ำแข็ง', icon: '⚔', x: 11, z: 218 }),
  translatedPoi('azure-frost', { id: 'azure-crystal-mine', name: 'เหมืองคริสตัลคราม', icon: '◇', x: 47, z: 236 }),
  translatedPoi('azure-frost', { id: 'azure-frost-citadel', name: 'ป้อมราชันน้ำแข็ง', icon: '▲', x: 20, z: 249 }),

  translatedPoi('tempest-sky', { id: 'tempest-cliff-village', name: 'หมู่บ้านหน้าผานภา', icon: '◆', x: -96, z: 210 }),
  translatedPoi('tempest-sky', { id: 'tempest-sky-harbor', name: 'ท่าเรือนภาวายุ', icon: '⚓', x: -99, z: 210 }),
  translatedPoi('tempest-sky', { id: 'tempest-cloud-garden', name: 'สวนเมฆลอย', icon: '●', x: -124, z: 190 }),
  translatedPoi('tempest-sky', { id: 'tempest-raider-camp', name: 'ค่ายโจรเวหา', icon: '⚔', x: -145, z: 207 }),
  translatedPoi('tempest-sky', { id: 'tempest-storm-forge', name: 'โรงตีผลึกพายุ', icon: '◇', x: -124, z: 232 }),
  translatedPoi('tempest-sky', { id: 'tempest-sky-temple', name: 'วิหารเจ้าแห่งพายุ', icon: '▲', x: -153, z: 241 }),

  translatedPoi('ember-volcano', { id: 'ember-forge-village', name: 'หมู่บ้านช่างตีอัคคี', icon: '◆', x: -218, z: 100 }),
  translatedPoi('ember-volcano', { id: 'ember-volcano-harbor', name: 'ท่าเรือภูผาอัคคี', icon: '⚓', x: -212, z: 112 }),
  translatedPoi('ember-volcano', { id: 'ember-lava-fields', name: 'ทุ่งลาวาเดือด', icon: '●', x: -255, z: 98 }),
  translatedPoi('ember-volcano', { id: 'ember-cultist-camp', name: 'ป้อมลัทธิเถ้าถ่าน', icon: '⚔', x: -270, z: 72 }),
  translatedPoi('ember-volcano', { id: 'ember-obsidian-mine', name: 'เหมืองออบซิเดียน', icon: '◇', x: -214, z: 56 }),
  translatedPoi('ember-volcano', { id: 'ember-titan-caldera', name: 'ปล่องไททันแมกมา', icon: '▲', x: -235, z: 70 }),
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value, min, max) {
  if (value <= min) return 0;
  if (value >= max) return 1;
  const t = (value - min) / (max - min);
  return t * t * (3 - 2 * t);
}

function islandById(id) {
  return PIRATE_ISLANDS.find(island => island.id === id) || null;
}

function islandAt(x, z, padding = 0) {
  return PIRATE_ISLANDS.find(island => Math.hypot(x - island.x, z - island.z) <= island.radius + padding) || null;
}

function nearestIsland(x, z) {
  return PIRATE_ISLANDS.reduce((best, island) => {
    if (!best) return island;
    return Math.hypot(x - island.x, z - island.z) < Math.hypot(x - best.x, z - best.z) ? island : best;
  }, null);
}

function islandHeight(island, x, z) {
  const dx = x - island.x;
  const dz = z - island.z;
  const distance = Math.hypot(dx, dz);
  const normalized = clamp(1 - distance / island.radius, 0, 1);
  const falloff = normalized * normalized * (3 - 2 * normalized);
  if (island.id === 'starter-island') {
    const noise = Math.sin(x * 0.15) * Math.cos(z * 0.12) * 1.1
      + Math.sin(x * 0.05 + z * 0.07) * 1.6
      + Math.cos(x * 0.03 - z * 0.05) * 0.9;
    return falloff * (3.2 + noise) + BASE_TERRAIN;
  }
  if (island.id === 'mist-jungle') {
    const noise = Math.sin(dx * 0.13) * Math.cos(dz * 0.1) * 1.25
      + Math.sin(dx * 0.055 + dz * 0.075) * 1.5
      + Math.cos(dx * 0.045 - dz * 0.035) * 0.8;
    return falloff * (4.5 + noise) + BASE_TERRAIN;
  }
  if (island.id === 'sunscar-desert') {
    const noise = Math.sin(dx * 0.11) * Math.cos(dz * 0.09) * 0.75
      + Math.sin(dx * 0.045 + dz * 0.065) * 1.1
      + Math.cos(dx * 0.03 - dz * 0.05) * 0.65;
    return falloff * (4.2 + noise) + Math.sin((dx + dz) * 0.18) * 0.22 * falloff + BASE_TERRAIN;
  }
  if (island.id === 'azure-frost') {
    const noise = Math.sin(dx * 0.105) * Math.cos(dz * 0.082) * 0.9
      + Math.sin(dx * 0.042 + dz * 0.061) * 1.35
      + Math.cos(dx * 0.033 - dz * 0.052) * 0.82;
    return falloff * (4.35 + noise + smoothstep(dz, 8, 38) * 1.25) + BASE_TERRAIN;
  }
  if (island.id === 'tempest-sky') {
    const noise = Math.sin(dx * 0.095) * Math.cos(dz * 0.078) * 1.05
      + Math.sin(dx * 0.038 + dz * 0.057) * 1.4
      + Math.cos(dx * 0.03 - dz * 0.046) * 0.9;
    return falloff * (5.15 + noise + smoothstep(normalized, 0.42, 0.76) * 1.45) + BASE_TERRAIN;
  }
  const noise = Math.sin(dx * 0.108) * Math.cos(dz * 0.086) * 1.15
    + Math.sin(dx * 0.047 + dz * 0.063) * 1.42
    + Math.cos(dx * 0.036 - dz * 0.052) * 0.92;
  const ridge = smoothstep(normalized, 0.24, 0.82) * 3.1;
  const crater = Math.exp(-(distance * distance) / (2 * 8.5 * 8.5)) * 2.2;
  return falloff * (4.75 + noise + ridge - crater) + BASE_TERRAIN;
}

function terrainHeightAt(x, z) {
  let height = BASE_TERRAIN;
  for (const island of PIRATE_ISLANDS) height = Math.max(height, islandHeight(island, x, z));
  return height;
}

function terrainColor(x, z) {
  const height = terrainHeightAt(x, z);
  const island = islandAt(x, z);
  if (height < SEA_LEVEL - 0.4) return [23, 74, 105];
  if (height < SEA_LEVEL + 0.05) return [46, 110, 148];
  if (island?.id === 'sunscar-desert' && height < 3.5) {
    const t = clamp(height / 3.5, 0, 1);
    return [222 - t * 27, 190 - t * 35, 132 - t * 27];
  }
  if (island?.id === 'sunscar-desert') return [154, 125, 91];
  if (island?.id === 'azure-frost' && height < 3.8) {
    const t = clamp(height / 3.8, 0, 1);
    return [221 - t * 34, 239 - t * 31, 243 - t * 24];
  }
  if (island?.id === 'azure-frost') return [128, 157, 169];
  if (island?.id === 'tempest-sky' && height < 4.2) {
    const t = clamp(height / 4.2, 0, 1);
    return [190 - t * 38, 211 - t * 35, 210 - t * 28];
  }
  if (island?.id === 'tempest-sky') return [119, 137, 154];
  if (island?.id === 'ember-volcano' && height < 4.4) {
    const t = clamp(height / 4.4, 0, 1);
    return [112 - t * 35, 83 - t * 27, 70 - t * 20];
  }
  if (island?.id === 'ember-volcano') return [62, 48, 49];
  if (height < 0.7) return [222, 205, 158];
  if (height < 3.4) {
    const t = (height - 0.7) / 2.7;
    return [96 - t * 25, 148 - t * 30, 74 - t * 18];
  }
  return [124, 132, 121];
}

function oceanOverview() {
  const minX = PIRATE_FRUIT_MINIMAP_BOUNDS.minX;
  const maxX = PIRATE_FRUIT_MINIMAP_BOUNDS.maxX;
  const minZ = PIRATE_FRUIT_MINIMAP_BOUNDS.minZ;
  const maxZ = PIRATE_FRUIT_MINIMAP_BOUNDS.maxZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const radius = Math.max(...PIRATE_ISLANDS.map(island => (
    Math.hypot(island.x - centerX, island.z - centerZ) + island.radius
  ))) * 1.08;
  return Object.freeze({
    id: 'ocean-overview',
    label: `ทะเล ${PIRATE_ISLANDS.length} เกาะ`,
    scale: 'far',
    islandId: '',
    centerX,
    centerZ,
    radius,
  });
}

export const PIRATE_FRUIT_MINIMAP_OCEAN_VIEW = oceanOverview();

export function pirateFruitMinimapView(pose = null, zoomMode = 'auto') {
  const x = Number.isFinite(pose?.x) ? pose.x : 0;
  const z = Number.isFinite(pose?.z) ? pose.z : 0;
  const normalizedMode = ['auto', 'near', 'far'].includes(zoomMode) ? zoomMode : 'auto';
  if (normalizedMode === 'far') return PIRATE_FRUIT_MINIMAP_OCEAN_VIEW;
  const island = normalizedMode === 'near'
    ? (islandAt(x, z, PIRATE_FRUIT_MINIMAP_NEAR_PADDING) || nearestIsland(x, z))
    : islandAt(x, z, PIRATE_FRUIT_MINIMAP_NEAR_PADDING);
  if (!island) return PIRATE_FRUIT_MINIMAP_OCEAN_VIEW;
  return Object.freeze({
    id: island.id,
    label: island.name,
    scale: 'near',
    islandId: island.id,
    centerX: island.x,
    centerZ: island.z,
    radius: island.radius * PIRATE_FRUIT_MINIMAP_LOCAL_SCALE,
  });
}

function headingDegrees(dir) {
  return typeof dir === 'number' && Number.isFinite(dir) ? dir * 180 / Math.PI : 0;
}

function safePose(pose) {
  if (!pose || typeof pose !== 'object') return null;
  if (!Number.isFinite(pose.x) || !Number.isFinite(pose.z)) return null;
  return Object.freeze({ x: pose.x, z: pose.z, heading: headingDegrees(pose.dir) });
}

function boundsForView(view) {
  return Object.freeze({
    minX: view.centerX - view.radius,
    maxX: view.centerX + view.radius,
    minZ: view.centerZ - view.radius,
    maxZ: view.centerZ + view.radius,
  });
}

function poisForView(view) {
  const candidates = view.scale === 'far'
    ? PIRATE_FRUIT_MINIMAP_POIS.filter(poi => ['⚓', '◆', '▲'].includes(poi.icon))
    : PIRATE_FRUIT_MINIMAP_POIS.filter(poi => poi.islandId === view.islandId);
  return candidates.map(poi => Object.freeze({
    id: `poi-${poi.id}`,
    kind: 'static-poi',
    x: poi.x,
    z: poi.z,
  }));
}

export function pirateFruitMinimapFrame(pose = null, zoomMode = 'auto') {
  const view = pirateFruitMinimapView(pose, zoomMode);
  const projected = projectMinimapFrame({
    bounds: boundsForView(view),
    markers: poisForView(view),
    player: safePose(pose),
  });
  return Object.freeze({
    ...projected,
    mapView: Object.freeze({
      id: view.id,
      label: view.label,
      scale: view.scale,
      centerX: view.centerX,
      centerZ: view.centerZ,
      radius: view.radius,
    }),
  });
}

function worldIdFrom(windowLike, pose) {
  if (pose?.zone === 'pirate-fruit') return 'pirate-fruit';
  try {
    return new URL(windowLike.location.href).searchParams.get('world') || 'pirate-fruit';
  } catch {
    return 'pirate-fruit';
  }
}

function installMobileVisibilityStyles(documentLike) {
  if (!documentLike?.head || documentLike.querySelector?.('link[data-persistent-minimap-mobile]')) return;
  const link = documentLike.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  link.dataset.persistentMinimapMobile = 'true';
  documentLike.head.append(link);
}

function renderBackgroundCanvas(documentLike, view) {
  const canvas = documentLike?.createElement?.('canvas');
  if (!canvas) return null;
  canvas.width = MAP_RASTER_SIZE;
  canvas.height = MAP_RASTER_SIZE;
  canvas.className = 'mmorpg-minimap-map-image';
  const ctx = canvas.getContext?.('2d');
  if (!ctx?.createImageData || !ctx?.putImageData) return null;
  const image = ctx.createImageData(MAP_RASTER_SIZE, MAP_RASTER_SIZE);
  for (let row = 0; row < MAP_RASTER_SIZE; row += 1) {
    for (let col = 0; col < MAP_RASTER_SIZE; col += 1) {
      const x = view.centerX + (col / (MAP_RASTER_SIZE - 1) * 2 - 1) * view.radius;
      const z = view.centerZ + (row / (MAP_RASTER_SIZE - 1) * 2 - 1) * view.radius;
      const color = terrainColor(x, z);
      const index = (row * MAP_RASTER_SIZE + col) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 235;
    }
  }
  ctx.putImageData(image, 0, 0);

  const pois = view.scale === 'far'
    ? PIRATE_FRUIT_MINIMAP_POIS.filter(poi => ['⚓', '◆', '▲'].includes(poi.icon))
    : PIRATE_FRUIT_MINIMAP_POIS.filter(poi => poi.islandId === view.islandId);
  for (const poi of pois) {
    const px = ((poi.x - view.centerX) / view.radius * 0.5 + 0.5) * MAP_RASTER_SIZE;
    const pz = ((poi.z - view.centerZ) / view.radius * 0.5 + 0.5) * MAP_RASTER_SIZE;
    if (px < -6 || px > MAP_RASTER_SIZE + 6 || pz < -6 || pz > MAP_RASTER_SIZE + 6) continue;
    ctx.beginPath();
    ctx.arc(px, pz, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,216,105,.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(35,27,15,.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#302415';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(poi.icon, px, pz + 0.3);
  }

  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('N', MAP_RASTER_SIZE / 2, 13);
  ctx.fillStyle = 'rgba(4,20,27,.72)';
  ctx.fillRect(MAP_RASTER_SIZE * 0.18, MAP_RASTER_SIZE - 19, MAP_RASTER_SIZE * 0.64, 14);
  ctx.fillStyle = '#e9f8ed';
  ctx.font = 'bold 7px sans-serif';
  ctx.fillText(view.label, MAP_RASTER_SIZE / 2, MAP_RASTER_SIZE - 9);
  return canvas;
}

export function createPersistentMinimapOwner({
  windowLike = globalThis.window,
  documentLike = globalThis.document,
  intervalMs = 125,
} = {}) {
  if (!windowLike) throw new TypeError('persistent minimap owner requires windowLike');
  const store = createUnifiedMinimapStore();
  const backgrounds = new Map();
  let timer = 0;
  let stopped = false;
  let zoomMode = 'auto';
  let lastView = PIRATE_FRUIT_MINIMAP_OCEAN_VIEW;

  function readPose() {
    try { return windowLike.POCKETMONSTER_WORLD_STATE?.() || null; } catch { return null; }
  }

  function decorateMap(view = lastView) {
    const map = documentLike?.getElementById?.('mmorpgMinimap');
    if (!map || store.snapshot()?.available !== true || !view) return false;
    map.dataset.mapView = view.id;
    map.dataset.mapScale = view.scale === 'near' ? 'ใกล้' : 'ไกล';
    map.dataset.mapLabel = view.label;
    map.setAttribute?.('aria-label', `Minimap ${view.label} ระยะ${view.scale === 'near' ? 'ใกล้' : 'ไกล'}`);
    let canvas = backgrounds.get(view.id) || null;
    if (!canvas) {
      canvas = renderBackgroundCanvas(documentLike, view);
      if (canvas) backgrounds.set(view.id, canvas);
    }
    if (canvas) map.prepend?.(canvas);
    return Boolean(canvas);
  }

  function setZoomMode(nextMode) {
    const normalized = ['auto', 'near', 'far'].includes(nextMode) ? nextMode : 'auto';
    if (zoomMode === normalized) return store.snapshot();
    zoomMode = normalized;
    return sync();
  }

  const api = Object.freeze({
    kind: PERSISTENT_MINIMAP_OWNER_KIND,
    subscribe: store.subscribe,
    snapshot: store.snapshot,
    diagnostics: () => Object.freeze({
      ...store.diagnostics(),
      zoomMode,
      mapView: lastView?.id || '',
      mapScale: lastView?.scale || '',
      backgroundCount: backgrounds.size,
    }),
    setZoomMode,
    zoomIn: () => setZoomMode('near'),
    zoomOut: () => setZoomMode('far'),
    autoZoom: () => setZoomMode('auto'),
  });

  function expose() {
    if (stopped || windowLike.POCKETMONSTER_MINIMAP_HUD === api) return false;
    try { windowLike.POCKETMONSTER_MINIMAP_HUD = api; } catch { return false; }
    windowLike.POCKETMONSTER_UNIFIED_HUD?.rebind?.();
    return true;
  }

  function sync() {
    if (stopped) return store.snapshot();
    const pose = readPose();
    const worldId = worldIdFrom(windowLike, pose);
    if (worldId === 'pirate-fruit') {
      const frame = pirateFruitMinimapFrame(pose, zoomMode);
      lastView = frame.mapView;
      store.publish(frame);
      decorateMap(lastView);
    } else {
      store.publish(projectMinimapFrame({ bounds: null }));
    }
    expose();
    // A Dock render can replace minimap children whenever the player moves.
    // Re-attach the cached raster after that synchronous render completes.
    decorateMap(lastView);
    return store.snapshot();
  }

  function restoreAfterSceneBind() {
    expose();
    sync();
  }

  function stop() {
    if (stopped) return false;
    stopped = true;
    if (timer) {
      const clear = windowLike.clearInterval?.bind(windowLike) || globalThis.clearInterval;
      clear?.(timer);
      timer = 0;
    }
    windowLike.removeEventListener?.('pocketmonster:online-scene-ready', restoreAfterSceneBind);
    if (windowLike.POCKETMONSTER_MINIMAP_HUD === api) {
      try { delete windowLike.POCKETMONSTER_MINIMAP_HUD; } catch { windowLike.POCKETMONSTER_MINIMAP_HUD = undefined; }
    }
    return true;
  }

  installMobileVisibilityStyles(documentLike);
  expose();
  sync();
  windowLike.addEventListener?.('pocketmonster:online-scene-ready', restoreAfterSceneBind);
  const schedule = windowLike.setInterval?.bind(windowLike) || globalThis.setInterval;
  if (typeof schedule === 'function') timer = schedule(sync, Math.max(50, Number(intervalMs) || 125));

  return Object.freeze({ kind: PERSISTENT_MINIMAP_OWNER_KIND, api, sync, stop });
}

export function installPersistentMinimapOwner(options = {}) {
  const windowLike = options.windowLike || globalThis.window;
  if (!windowLike) return null;
  const existing = windowLike[OWNER_KEY];
  if (existing?.kind === PERSISTENT_MINIMAP_OWNER_KIND) return existing;
  existing?.stop?.();
  const owner = createPersistentMinimapOwner({ ...options, windowLike });
  try { windowLike[OWNER_KEY] = owner; } catch {}
  return owner;
}
