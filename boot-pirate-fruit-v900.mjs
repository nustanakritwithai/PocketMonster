import { combinedLocationQuery, defaultPanelForWorld } from './control-panels-v900.mjs';
import { syncPirateFruitControlHud } from './pirate-fruit-control-hud-v900.mjs';
import { publishWorldState } from './world-presence-v800.mjs';
import {
  PIRATE_PRESENCE_ZONE,
  createPiratePresenceStatusMessage,
  createPirateSnapshotMessage,
  sanitizePirateLocalPresence,
  sanitizePirateWorldSnapshot,
} from './pirate-presence-bridge-v900.mjs?v=2';

export const PIRATE_FRUIT_OFFLINE_ENTRY = new URL('./pirate-fruit-offline/index.html?v=908', import.meta.url).href;
export const POCKET_ANIMAL_CONTROL_RUNTIME = './game-v800.js?v=818&animalControl=pirate-fruit';

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
    throwRuntimePromise = import('./game-v800.js?v=818&animalControl=pirate-fruit').then(() => {
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
  frame.src = frameUrl.href;
  frame.setAttribute('allow', 'fullscreen');
  game.appendChild(frame);
  return frame;
}

function assignCombinedWorld(worldId) {
  window.dispatchEvent(new CustomEvent('pocketmonster:world-warp-v1', {
    detail: { type: 'pocketmonster:world-warp-v1', world: worldId, panel: defaultPanelForWorld(worldId), source: 'pirate-fruit-portal' },
  }));
}

function bindPocketMonsterLink(frame) {
  const frameOrigin = new URL(frame.src).origin;
  let piratePose = null;
  let latestPresenceSnapshot = null;
  const forwardPresence = snapshot => {
    frame.contentWindow?.postMessage(createPirateSnapshotMessage(snapshot), frameOrigin);
  };
  const forwardPresenceStatus = connected => {
    frame.contentWindow?.postMessage(createPiratePresenceStatusMessage(connected), frameOrigin);
  };
  frame.addEventListener('load', () => {
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
    if (event.source !== frame.contentWindow || event.origin !== frameOrigin) return;
    const message = event.data;
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
}

if (typeof window !== 'undefined') {
  window.POCKETMONSTER_PIRATE_FRUIT = Object.freeze({
    source: 'pirate-fruit-offline',
    visual: 'pocket-asset-engine',
    ui: 'pirate-fruit-original',
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
bindPocketMonsterLink(pirateFrame);
window.POCKETMONSTER_SCENE_LIFECYCLE=Object.freeze({
  mount:()=>{
    pirateRuntimeActive=true;
    requestAnimationFrame(()=>{
      try{pirateFrame.contentWindow?.focus?.();}catch{}
      window.dispatchEvent(new Event('resize'));
    });
    return true;
  },
  unmount:()=>{
    pirateRuntimeActive=false;
    try{pirateFrame.contentWindow?.blur?.();}catch{}
    return true;
  },
  diagnostics:()=>Object.freeze({active:pirateRuntimeActive}),
});
pirateFrame.addEventListener('load', () => {
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
