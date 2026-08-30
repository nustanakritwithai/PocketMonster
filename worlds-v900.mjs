import { loadRuntimeConfig } from './runtime-config.mjs';
import { COMBINED_VERSION, COMBINED_WORLDS, DEFAULT_COMBINED_WORLD, resolveCombinedWorld, worldById } from './combined-worlds-v900.mjs?v=911';
import {
  applyControlPanel,
  combinedLocationQuery,
  panelIdFromLocation,
} from './control-panels-v900.mjs';

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
  await import('./chat-runtime.mjs?v=8.4.0-unified-world-shell-2');
}

const startup = document.getElementById('startupStatus');

function currentPanel(worldId) {
  return document.body.dataset.controlPanel || panelIdFromLocation(location, worldId);
}

function selectWorld(id, panelOverride = null) {
  const world = worldById(id);
  if (!world) return;
  const panel = panelOverride || currentPanel(world.id);
  if (new URL(location.href).searchParams.get('world') === world.id && document.body.dataset.combinedWorld === world.id) return;
  location.assign(`${location.pathname}?${combinedLocationQuery(world.id, panel)}`);
}

function handlePocketMonsterWorldWarp(event) {
  const warp = event?.detail;
  if (warp?.type !== 'pocketmonster:world-warp-v1') return;
  const currentWorld = document.body.dataset.combinedWorld;
  const ranchReturn = currentWorld === 'pocket-monster' && warp.world === 'pirate-fruit' && warp.panel === 'human' && warp.source === 'pocket-monster-ranch-portal';
  const livingReturn = currentWorld === 'living-world' && warp.world === 'pirate-fruit' && warp.panel === 'human' && warp.source === 'living-world-pirate-portal';
  if (!ranchReturn && !livingReturn) return;
  selectWorld(warp.world, warp.panel);
}

window.addEventListener('pocketmonster:world-warp-v1', handlePocketMonsterWorldWarp);

async function bootWorld(id) {
  const world = worldById(id);
  if (!world) return;
  document.body.dataset.combinedWorld = world.id;
  const panel = applyControlPanel(panelIdFromLocation(location, world.id), world.id);
  const canonical = `${location.pathname}?${combinedLocationQuery(world.id, panel.id)}`;
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
}

await bootWorld(resolveCombinedWorld());
