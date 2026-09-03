import { combinedLocationQuery, defaultPanelForWorld } from './control-panels-v900.mjs';
import { bindPirateSaveHost } from './pirate-save-bridge-v900.mjs?v=1';
import { syncPirateFruitControlHud } from './pirate-fruit-control-hud-v900.mjs?v=5';
import { createPirateNpcNameParentProxy } from './pirate-npc-name-interaction-v900.mjs?v=2';
import { readPirateOnboardingState } from './pirate-onboarding-overlay-v900.mjs?v=1';
import {
  PIRATE_HUD_INIT_MESSAGE,
  createPirateHudTelemetryCollector,
} from './pirate-hud-telemetry-v900.mjs?v=1';
import { publishWorldState } from './world-presence-v800.mjs';
import {
  PIRATE_PRESENCE_ZONE,
  createPiratePresenceStatusMessage,
  createPirateSnapshotMessage,
  sanitizePirateLocalPresence,
  sanitizePirateWorldSnapshot,
} from './pirate-presence-bridge-v900.mjs?v=2';
import { createPocketPlayerHudStore } from './pocket-hud-view-model.mjs?v=1';

export const PIRATE_FRUIT_OFFLINE_ENTRY = new URL('./pirate-fruit-offline/index.html?v=917', import.meta.url).href;
export const POCKET_ANIMAL_CONTROL_RUNTIME = './game-v800.js?v=827&animalControl=pirate-fruit';
export const PIRATE_UNIFIED_INPUT_MESSAGE = 'pocketmonster:unified-mobile-input-v1';

const pocketPlayerHud = createPocketPlayerHudStore();
if (typeof window !== 'undefined') {
  window.POCKETMONSTER_POCKET_HUD = Object.freeze({
    player: pocketPlayerHud,
    resetAll() { pocketPlayerHud.reset(); },
  });
}

const startup = document.getElementById('startupStatus');
const game = document.getElementById('game');
if (!game) throw new Error('missing #game for Pirate Fruit boot');

let throwRuntimePromise = null;
let pirateRuntimeActive = true;

export function ensurePocketAnimalControl() {
  if (typeof window !== 'undefined' && window.POCKETMONSTER_ANIMAL_CONTROL) {
    return Promise.resolve(window.POCKETMONSTER_ANIMAL_CONTROL);
  }
  if (!throwRuntimePromise) {
    throwRuntimePromise = import('./game-v800.js?v=827&animalControl=pirate-fruit').then(() => {
      const control = window.POCKETMONSTER_ANIMAL_CONTROL;
      if (!control) throw new Error('Pocket animal control did not register');
      window.dispatchEvent(new Event('resize'));
      return control;
    });
  }
  return throwRuntimePromise;
}

function mountPirateOffline() {
  game.replaceChildren();
  const frame = document.createElement('iframe');
  frame.id = 'pirateFruitFrame';
  frame.title = 'Pirate Fruit';
  const frameUrl = new URL(PIRATE_FRUIT_OFFLINE_ENTRY);
  frameUrl.searchParams.set('parentOrigin', location.origin);
  frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock allow-fullscreen');
  frame.setAttribute('allow', 'fullscreen');
  game.appendChild(frame);
  bindPirateSaveHost(frame);
  frame.src = frameUrl.href;
  return frame;
}

function assignCombinedWorld(worldId) {
  window.dispatchEvent(new CustomEvent('pocketmonster:world-warp-v1', {
    detail: { type: 'pocketmonster:world-warp-v1', world: worldId, panel: defaultPanelForWorld(worldId), source: 'pirate-fruit-portal' },
  }));
}

function syncPirateOnboardingActionProxies(onboarding) {
  const layerId = 'pirateOnboardingActionProxies';
  let layer = document.getElementById(layerId);
  if (!onboarding.active) {
    layer?.remove();
    return;
  }
  if (!layer) {
    layer = document.createElement('div');
    layer.id = layerId;
    document.body?.appendChild(layer);
  }
  // The integrated parent HUD owns the visible/touchable controls. Keep the
  // structural onboarding layer empty so a hidden child tutorial cannot leave
  // invisible proxy buttons over the game surface.
  layer.replaceChildren();
}

function bindPocketMonsterLink(frame) {
  const sendInput = payload => frame.contentWindow?.postMessage({
    type: PIRATE_UNIFIED_INPUT_MESSAGE,
    ...payload,
  }, '*');
  window.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS?.registerAdapter?.('pirate-fruit', Object.freeze({
    interceptActions: true,
    move: payload => sendInput({ kind: 'move', ...payload }),
    camera: payload => sendInput({ kind: 'camera', ...payload }),
    action: payload => sendInput({ kind: 'action', ...payload }),
    reset: reason => sendInput({ kind: 'reset', reason }),
    activate: () => sendInput({ kind: 'reset', reason: 'pirate-activate' }),
  }));
  let piratePose = null;
  let latestPresenceSnapshot = null;
  let frameGeneration = 0;
  const npcNameProxy = createPirateNpcNameParentProxy({ frame, documentLike: document });
  const hudTelemetry = createPirateHudTelemetryCollector({
    frameWindow: frame.contentWindow,
    frameGeneration,
    onSnapshot: (snapshot, metadata) => {
      pocketPlayerHud.publish(snapshot.player);
      window.dispatchEvent(new CustomEvent('pocketmonster:pirate-hud-update-v1', {
        detail: Object.freeze({ snapshot, metadata }),
      }));
    },
  });
  const activateHudTelemetry = reason => {
    frameGeneration += 1;
    npcNameProxy?.reset();
    hudTelemetry.reset({ frameWindow: frame.contentWindow, frameGeneration, reason });
    frame.contentWindow?.postMessage({ type: PIRATE_HUD_INIT_MESSAGE, frameGeneration }, '*');
  };
  const forwardPresence = snapshot => {
    frame.contentWindow?.postMessage(createPirateSnapshotMessage(snapshot), '*');
  };
  const forwardPresenceStatus = connected => {
    frame.contentWindow?.postMessage(createPiratePresenceStatusMessage(connected), '*');
  };
  frame.addEventListener('load', () => {
    npcNameProxy?.reset();
    if (!pirateRuntimeActive) {
      hudTelemetry.invalidate('load-after-teardown');
      return;
    }
    activateHudTelemetry('reload');
    try { frame.contentWindow?.focus?.(); } catch {}
    forwardPresenceStatus(window.POCKETMONSTER_WORLD_SOCKET_CONNECTED === true);
  });
  window.addEventListener('pocketmonster:world-socket-status', event => {
    forwardPresenceStatus(event.detail?.connected === true);
  });
  publishWorldState({
    getZone: () => 'pirate-fruit',
    getPosition: () => piratePose,
    getDir: () => piratePose?.dir,
  });
  window.POCKETMONSTER_WORLD_PRESENCE = payload => {
    const snapshot = sanitizePirateWorldSnapshot(payload);
    if (!snapshot) return;
    latestPresenceSnapshot = snapshot;
    forwardPresenceStatus(true);
    forwardPresence(snapshot);
  };
  window.addEventListener('message', event => {
    if (!pirateRuntimeActive) return;
    if (event.source !== frame.contentWindow || event.origin !== 'null') return;
    if (hudTelemetry.accept(event)) return;
    if (npcNameProxy?.accept(event)) return;
    const message = event.data;
    const onboarding = readPirateOnboardingState(message);
    if (onboarding) {
      syncPirateOnboardingActionProxies(onboarding);
      return;
    }
    const nextPose = sanitizePirateLocalPresence(message);
    if (nextPose) {
      piratePose = nextPose;
      if (latestPresenceSnapshot) forwardPresence(latestPresenceSnapshot);
      return;
    }
    if (message?.type !== 'pocketmonster:world-warp-v1') return;
    const pocketPortal = message.world === 'pocket-monster' && message.panel === 'throw' && message.source === 'pirate-fruit-portal';
    const livingPortal = message.world === 'living-world' && message.panel === 'human' && message.source === 'pirate-fruit-living-portal';
    if (!pocketPortal && !livingPortal) return;
    assignCombinedWorld(message.world);
  });
  const zoneLabel = document.getElementById('zoneLabel');
  if (zoneLabel) zoneLabel.textContent = 'Pirate Fruit';
  const message = document.getElementById('message');
  if (message) message.textContent = 'โลก Pirate Fruit จริง • เดินเข้าประตูในโลกเพื่อเดินทาง';
  window.addEventListener('pocketmonster:world-warp-v1', event => {
    if (event.detail?.world !== 'pirate-fruit') {
      npcNameProxy?.reset();
      hudTelemetry.invalidate('world-switch');
    }
  });
  window.addEventListener('pagehide', () => {
    npcNameProxy?.reset();
    hudTelemetry.invalidate('pagehide');
  }, { once: true });
  return Object.freeze({
    activate: reason => activateHudTelemetry(reason),
    invalidate: reason => {
      npcNameProxy?.reset();
      pocketPlayerHud.reset();
      return hudTelemetry.invalidate(reason);
    },
  });
}

if (typeof window !== 'undefined') {
  window.POCKETMONSTER_PIRATE_FRUIT = Object.freeze({
    source: 'pirate-fruit-offline',
    visual: 'pocket-asset-engine',
    ui: 'pirate-fruit-parent-primary',
    entry: PIRATE_FRUIT_OFFLINE_ENTRY,
    remote: false,
    mergedWithV800: false,
    presentationOnly: true,
    combatAuthority: false,
    animalControlRuntime: POCKET_ANIMAL_CONTROL_RUNTIME,
  });
  window.POCKETMONSTER_ENSURE_THROW_RUNTIME = ensurePocketAnimalControl;
  window.POCKETMONSTER_SYNC_PIRATE_CONTROLS = () => syncPirateFruitControlHud(document.getElementById('pirateFruitFrame'));
}

if (startup) {
  startup.textContent = document.body?.dataset?.controlPanel === 'throw'
    ? 'กำลังเปิดระบบควบคุมสัตว์ของ Pocket Monster…'
    : 'กำลังเปิดโลก Pirate Fruit…';
  startup.className = 'startup-status';
}

const pirateFrame = mountPirateOffline();
const pirateHudTelemetry = bindPocketMonsterLink(pirateFrame);
window.POCKETMONSTER_SCENE_LIFECYCLE=Object.freeze({
  mount:()=>{
    pirateRuntimeActive=true;
    pirateHudTelemetry.activate('mount');
    requestAnimationFrame(()=>{
      try{pirateFrame.contentWindow?.focus?.();}catch{}
      window.dispatchEvent(new Event('resize'));
    });
    return true;
  },
  unmount:()=>{
    pirateRuntimeActive=false;
    pirateHudTelemetry.invalidate('teardown');
    try{pirateFrame.contentWindow?.blur?.();}catch{}
    return true;
  },
  diagnostics:()=>Object.freeze({active:pirateRuntimeActive}),
});
pirateFrame.addEventListener('load', () => {
  if (!pirateRuntimeActive) return;
  syncPirateFruitControlHud(pirateFrame);
  let tries = 0;
  const retry = setInterval(() => {
    syncPirateFruitControlHud(pirateFrame);
    tries += 1;
    if (tries >= 20) clearInterval(retry);
  }, 400);
});
syncPirateFruitControlHud(pirateFrame);
if (startup) {
  startup.textContent = 'เข้าโลก Pirate Fruit แล้ว';
  startup.className = 'startup-status ok';
}

if (document.body?.dataset?.controlPanel === 'throw') {
  await ensurePocketAnimalControl();
}
