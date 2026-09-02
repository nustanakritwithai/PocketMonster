import {
  createUnifiedMinimapStore,
  projectMinimapFrame,
} from './unified-minimap-v900.mjs';
import { PIRATE_FRUIT_ISLAND_CENTERS } from './pirate-fruit-island-map-v900.mjs';

export const PERSISTENT_MINIMAP_OWNER_KIND = 'pocketmonster:persistent-minimap-owner-v1';
const STYLE_HREF = new URL('./unified-minimap-mobile-v900.css?v=1', import.meta.url).href;
const OWNER_KEY = '__POCKETMONSTER_PERSISTENT_MINIMAP_OWNER__';

const PIRATE_ISLANDS = Object.freeze(Object.entries(PIRATE_FRUIT_ISLAND_CENTERS).map(([id, island]) => Object.freeze({
  id: `island-${id}`,
  kind: 'warp',
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

function headingDegrees(dir) {
  return typeof dir === 'number' && Number.isFinite(dir) ? dir * 180 / Math.PI : 0;
}

function safePose(pose) {
  if (!pose || typeof pose !== 'object') return null;
  if (!Number.isFinite(pose.x) || !Number.isFinite(pose.z)) return null;
  return Object.freeze({ x: pose.x, z: pose.z, heading: headingDegrees(pose.dir) });
}

export function pirateFruitMinimapFrame(pose = null) {
  return projectMinimapFrame({
    bounds: PIRATE_FRUIT_MINIMAP_BOUNDS,
    markers: PIRATE_ISLANDS,
    player: safePose(pose),
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

export function createPersistentMinimapOwner({
  windowLike = globalThis.window,
  documentLike = globalThis.document,
  intervalMs = 125,
} = {}) {
  if (!windowLike) throw new TypeError('persistent minimap owner requires windowLike');
  const store = createUnifiedMinimapStore();
  let timer = 0;
  let stopped = false;

  const api = Object.freeze({
    kind: PERSISTENT_MINIMAP_OWNER_KIND,
    subscribe: store.subscribe,
    snapshot: store.snapshot,
    diagnostics: store.diagnostics,
  });

  function expose() {
    if (stopped || windowLike.POCKETMONSTER_MINIMAP_HUD === api) return false;
    try { windowLike.POCKETMONSTER_MINIMAP_HUD = api; } catch { return false; }
    windowLike.POCKETMONSTER_UNIFIED_HUD?.rebind?.();
    return true;
  }

  function readPose() {
    try { return windowLike.POCKETMONSTER_WORLD_STATE?.() || null; } catch { return null; }
  }

  function sync() {
    if (stopped) return store.snapshot();
    const pose = readPose();
    const worldId = worldIdFrom(windowLike, pose);
    if (worldId === 'pirate-fruit') store.publish(pirateFruitMinimapFrame(pose));
    else store.publish(projectMinimapFrame({ bounds: null }));
    expose();
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
  const owner = createPersistentMinimapOwner({ ...options, windowLike });
  try { windowLike[OWNER_KEY] = owner; } catch {}
  return owner;
}
