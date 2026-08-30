import { loadRuntimeConfig } from './runtime-config.mjs';
import { COMBINED_VERSION, COMBINED_WORLDS, DEFAULT_COMBINED_WORLD, resolveCombinedWorld, worldById } from './combined-worlds-v900.mjs?v=902';
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

await import('./chat-runtime.mjs?v=8.4.0-chat-top-right');

const worldGate = document.getElementById('worldGate');
const switcher = document.getElementById('worldSwitcher');
const panelSwitcher = document.getElementById('controlPanelSwitcher');
const startup = document.getElementById('startupStatus');

function setSwitcher(activeId) {
  if (!switcher) return;
  switcher.hidden = false;
  for (const button of switcher.querySelectorAll('[data-combined-world]')) {
    button.setAttribute('aria-current', button.dataset.combinedWorld === activeId ? 'page' : 'false');
  }
}

function currentPanel(worldId) {
  return document.body.dataset.controlPanel || panelIdFromLocation(location, worldId);
}

function selectWorld(id) {
  const world = worldById(id);
  if (!world) return;
  const panel = currentPanel(world.id);
  if (new URL(location.href).searchParams.get('world') === world.id && document.body.dataset.combinedWorld === world.id) return;
  location.assign(`${location.pathname}?${combinedLocationQuery(world.id, panel)}`);
}

function selectPanel(id) {
  const worldId = document.body.dataset.combinedWorld;
  if (!worldId) return;
  const panel = applyControlPanel(id, worldId);
  const url = `${location.pathname}?${combinedLocationQuery(worldId, panel.id)}`;
  history.replaceState(null, '', url);
}

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
  worldGate?.classList.add('hidden');
  setSwitcher(world.id);
  if (startup) {
    startup.textContent = world.id === 'pocket-monster' ? 'กำลังเปิดเกมเดิมใน V9.0…' : `กำลังเปิด${world.label}…`;
    startup.className = 'startup-status';
  }
  await import(world.runtime);
}

worldGate?.querySelectorAll('[data-combined-world]').forEach(button => {
  button.addEventListener('click', () => selectWorld(button.dataset.combinedWorld));
});
switcher?.querySelectorAll('[data-combined-world]').forEach(button => {
  button.addEventListener('click', () => selectWorld(button.dataset.combinedWorld));
});
panelSwitcher?.querySelectorAll('[data-control-panel]').forEach(button => {
  button.addEventListener('click', () => selectPanel(button.dataset.controlPanel));
});

await bootWorld(resolveCombinedWorld());
