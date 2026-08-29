import { loadRuntimeConfig } from './runtime-config.mjs';
import { requireFirebaseLogin } from './firebase-auth-ui.mjs';
import { COMBINED_VERSION, COMBINED_WORLDS, worldById, worldIdFromLocation } from './combined-worlds-v900.mjs';

const runtimeConfig = await loadRuntimeConfig();
if (typeof window !== 'undefined') {
  window.POCKETMONSTER_RUNTIME_CONFIG = runtimeConfig;
  window.POCKETMONSTER_COMBINED = Object.freeze({
    version: COMBINED_VERSION,
    worldCount: COMBINED_WORLDS.length,
    worlds: COMBINED_WORLDS.map(world => world.id),
    includesOriginalGame: true,
    mergedIntoLiveV800: false,
  });
}

await requireFirebaseLogin(runtimeConfig);

const worldGate = document.getElementById('worldGate');
const switcher = document.getElementById('worldSwitcher');
const startup = document.getElementById('startupStatus');

function setSwitcher(activeId) {
  if (!switcher) return;
  switcher.hidden = false;
  for (const button of switcher.querySelectorAll('[data-combined-world]')) {
    button.setAttribute('aria-current', button.dataset.combinedWorld === activeId ? 'page' : 'false');
  }
}

function selectWorld(id) {
  const world = worldById(id);
  if (!world) return;
  const url = new URL(location.href);
  if (url.searchParams.get('world') === world.id && document.body.dataset.combinedWorld === world.id) return;
  location.assign(`${url.pathname}?world=${encodeURIComponent(world.id)}`);
}

async function bootWorld(id) {
  const world = worldById(id);
  if (!world) return;
  document.body.dataset.combinedWorld = world.id;
  window.POCKETMONSTER_COMBINED_BOOT = Object.freeze({
    worldId: world.id,
    runtime: world.runtime,
    includesOriginalGame: world.id === 'pocket-monster',
  });
  worldGate?.classList.add('hidden');
  setSwitcher(world.id);
  if (startup) {
    startup.textContent = world.id === 'pocket-monster' ? 'กำลังเปิดเกมเดิมใน V9.0…' : `กำลังเปิด${world.label}…`;
    startup.className = 'startup-status';
  }
  await import(world.runtime);
  if (world.id === 'pocket-monster') await import('./chat-runtime.mjs?v=8.4.0-chat-f3914ae');
}

worldGate?.querySelectorAll('[data-combined-world]').forEach(button => {
  button.addEventListener('click', () => selectWorld(button.dataset.combinedWorld));
});
switcher?.querySelectorAll('[data-combined-world]').forEach(button => {
  button.addEventListener('click', () => selectWorld(button.dataset.combinedWorld));
});

const requested = worldIdFromLocation();
if (requested) await bootWorld(requested);
else {
  worldGate?.classList.remove('hidden');
  if (startup) startup.className = 'startup-status hidden';
}
