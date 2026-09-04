import { loadRuntimeConfig } from './runtime-config.mjs';
import { COMBINED_VERSION, COMBINED_WORLDS, DEFAULT_COMBINED_WORLD, resolveCombinedWorld, worldById } from './combined-worlds-v900.mjs?v=940';
import {
  allowedPanelForWorld,
  applyControlPanel,
  combinedLocationQuery,
  panelIdFromLocation,
} from './control-panels-v900.mjs';
import { createSceneRouteController } from './scene-route-controller-v900.mjs';
import { unifiedMobileControls } from './unified-mobile-controls-v900.mjs?v=4';

const runtimeConfig = window.POCKETMONSTER_RUNTIME_CONFIG || await loadRuntimeConfig();
if (typeof window !== 'undefined') {
  window.POCKETMONSTER_RUNTIME_CONFIG = runtimeConfig;
  window.POCKETMONSTER_COMBINED = Object.freeze({
    version: COMBINED_VERSION,
    worldCount: COMBINED_WORLDS.length,
    worlds: COMBINED_WORLDS.map(world => world.id),
    includesOriginalGame: true,
    mergedIntoLiveV800: false,
    defaultWorld: DEFAULT_COMBINED_WORLD,
    characterSystem: 'pirate-fruit',
    throwSystem: 'pocket-monster',
  });
}

if (window.POCKETMONSTER_SCENE_EMBEDDED !== true) {
  await import('./chat-runtime.mjs?v=8.4.0-unified-world-shell-5');
}

const startup = document.getElementById('startupStatus');

function currentPanel(worldId) {
  return document.body.dataset.controlPanel || panelIdFromLocation(location, worldId);
}

function combinedWorldLocation(worldId, panelId) {
  const query = new URLSearchParams(combinedLocationQuery(worldId, panelId));
  if (window.POCKETMONSTER_SCENE_EMBEDDED === true) {
    const shellRevision = new URL(location.href).searchParams.get('shellRevision');
    if (shellRevision !== null) query.set('shellRevision', shellRevision);
  }
  return `${location.pathname}?${query}`;
}

const routeController = createSceneRouteController({ initialRoute: resolveCombinedWorld() });
const savedWorldGameNodes = new Map();
const runtimeLifecycles = new Map();
const runtimePreparations = new Map();
const worldPresenceBindings = new Map();
let activeRuntimeId = null;

function capturePresenceBindings() {
  return Object.freeze({
    state: window.POCKETMONSTER_WORLD_STATE,
    presence: window.POCKETMONSTER_WORLD_PRESENCE,
  });
}

function applyPresenceBindings(bindings) {
  for (const [key, value] of [
    ['POCKETMONSTER_WORLD_STATE', bindings?.state],
    ['POCKETMONSTER_WORLD_PRESENCE', bindings?.presence],
  ]) {
    if (typeof value === 'function') window[key] = value;
    else delete window[key];
  }
}

function preparePocketRuntime(world) {
  if (world?.id !== 'pocket-monster' || runtimeLifecycles.has(world.id)) return Promise.resolve(true);
  if (runtimePreparations.has(world.id)) return runtimePreparations.get(world.id);
  const preparation = (async () => {
    const mountTarget = document.createElement('div');
    mountTarget.hidden = true;
    window.POCKETMONSTER_SCENE_MOUNT_TARGET = mountTarget;
    window.POCKETMONSTER_SCENE_PREWARM = true;
    const activePresenceBindings = capturePresenceBindings();
    try {
      await import(world.runtime);
      const lifecycle = window.POCKETMONSTER_SCENE_LIFECYCLE || null;
      if (!lifecycle) throw new Error('Pocket runtime did not register its scene lifecycle');
      worldPresenceBindings.set(world.id, capturePresenceBindings());
      lifecycle.unmount?.();
      applyPresenceBindings(activePresenceBindings);
      runtimeLifecycles.set(world.id, lifecycle);
      savedWorldGameNodes.set(world.id, [...mountTarget.childNodes]);
      return true;
    } finally {
      if (window.POCKETMONSTER_SCENE_MOUNT_TARGET === mountTarget) delete window.POCKETMONSTER_SCENE_MOUNT_TARGET;
      delete window.POCKETMONSTER_SCENE_PREWARM;
    }
  })();
  runtimePreparations.set(world.id, preparation);
  preparation.catch(() => runtimePreparations.delete(world.id));
  return preparation;
}

for (const world of COMBINED_WORLDS) {
  routeController.register(world.id, {
    async mount() {
      if (world.id === 'pocket-monster') await preparePocketRuntime(world);
      const game = document.getElementById('game');
      const saved = savedWorldGameNodes.get(world.id);
      if (saved && game) game.replaceChildren(...saved);
      else if (game) game.replaceChildren();
      if (!runtimeLifecycles.has(world.id)) {
        await import(world.runtime);
        runtimeLifecycles.set(world.id, window.POCKETMONSTER_SCENE_LIFECYCLE || null);
        worldPresenceBindings.set(world.id, capturePresenceBindings());
      }
      runtimeLifecycles.get(world.id)?.mount?.();
      applyPresenceBindings(worldPresenceBindings.get(world.id));
      activeRuntimeId = world.id;
    },
    async unmount() { runtimeLifecycles.get(world.id)?.unmount?.(); },
  });
}

async function switchWorldInDocument(id, panelOverride = null) {
  const world = worldById(id);
  if (!world) return;
  const panelId = allowedPanelForWorld(world.id, panelOverride || currentPanel(world.id));
  if (new URL(location.href).searchParams.get('world') === world.id && document.body.dataset.combinedWorld === world.id) return;
  if (world.id === 'pocket-monster') await preparePocketRuntime(world);
  const panel = applyControlPanel(panelId, world.id).id;
  window.POCKETMONSTER_COMBINED_BOOT = Object.freeze({
    worldId: world.id,
    runtime: world.runtime,
    includesOriginalGame: world.id === 'pocket-monster',
    controlPanel: panel,
  });
  document.body.dataset.combinedWorld = world.id;
  document.body.dataset.controlPanel = panel;
  unifiedMobileControls.activate(world.id);
  const game = document.getElementById('game');
  if (activeRuntimeId && game) savedWorldGameNodes.set(activeRuntimeId, [...game.childNodes]);
  const switched = await routeController.switchTo(world.id, { panel });
  if (!switched) return;
  history.replaceState(null, '', combinedWorldLocation(world.id, panel));
}

function handlePocketMonsterWorldWarp(event) {
  const warp = event?.detail;
  if (warp?.type !== 'pocketmonster:world-warp-v1') return;
  const currentWorld = document.body.dataset.combinedWorld;
  const pirateReturn = currentWorld === 'pirate-fruit' && (warp.world === 'pocket-monster' || warp.world === 'living-world');
  const ranchReturn = currentWorld === 'pocket-monster' && warp.world === 'pirate-fruit' && warp.panel === 'human' && warp.source === 'pocket-monster-ranch-portal';
  const livingReturn = currentWorld === 'living-world' && warp.world === 'pirate-fruit' && warp.panel === 'human' && warp.source === 'living-world-pirate-portal';
  if (!ranchReturn && !livingReturn && !pirateReturn) return;
  switchWorldInDocument(warp.world, warp.panel);
}

window.addEventListener('pocketmonster:world-warp-v1', handlePocketMonsterWorldWarp);

function selectPanel(id) {
  const worldId = document.body.dataset.combinedWorld;
  if (!worldId) return;
  const panel = applyControlPanel(id, worldId);
  unifiedMobileControls?.activate(worldId);
  const url = combinedWorldLocation(worldId, panel.id);
  if (`${location.pathname}${location.search}` !== url) history.replaceState(null, '', url);
}

async function bootWorld(id) {
  const world = worldById(id);
  if (!world) return;
  document.body.dataset.combinedWorld = world.id;
  const panel = applyControlPanel(panelIdFromLocation(location, world.id), world.id);
  unifiedMobileControls.activate(world.id);
  const canonical = combinedWorldLocation(world.id, panel.id);
  if (`${location.pathname}${location.search}` !== canonical) history.replaceState(null, '', canonical);
  window.POCKETMONSTER_COMBINED_BOOT = Object.freeze({
    worldId: world.id,
    runtime: world.runtime,
    includesOriginalGame: world.id === 'pocket-monster',
    controlPanel: panel.id,
  });
  if (startup) {
    startup.textContent = world.id === 'pocket-monster' ? 'กำลังเปิดเกมเดิมใน V9.0…' : `กำลังเปิด${world.label}…`;
    startup.className = 'startup-status';
  }
  await import(world.runtime);
  runtimeLifecycles.set(world.id, window.POCKETMONSTER_SCENE_LIFECYCLE || null);
  worldPresenceBindings.set(world.id, capturePresenceBindings());
  activeRuntimeId = world.id;
}

await bootWorld(resolveCombinedWorld());

if (document.body.dataset.combinedWorld === 'pirate-fruit') {
  const prewarm = () => {
    if (document.body.dataset.combinedWorld !== 'pirate-fruit') return;
    preparePocketRuntime(worldById('pocket-monster')).catch(err => {
      console.warn('Pocket runtime prewarm failed; warp will retry', err);
    });
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(prewarm, { timeout: 1200 });
  else if (typeof window.setTimeout === 'function') window.setTimeout(prewarm, 0);
}
