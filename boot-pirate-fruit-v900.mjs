import { combinedLocationQuery, defaultPanelForWorld } from './control-panels-v900.mjs';
import { bindPirateSaveHost } from './pirate-save-bridge-v900.mjs?v=1';
import { syncPirateFruitControlHud } from './pirate-fruit-control-hud-v900.mjs?v=11';
import { readPirateOnboardingState } from './pirate-onboarding-overlay-v900.mjs?v=1';
import {
  PIRATE_HUD_INIT_MESSAGE,
  createPirateHudTelemetryCollector,
} from './pirate-hud-telemetry-v900.mjs?v=2';
import { publishWorldState, registerExternalPose } from './world-presence-v800.mjs?v=4';
import {
  PIRATE_PRESENCE_ZONE,
  createPiratePresenceStatusMessage,
  createPirateSnapshotMessage,
  advancePirateSnapshotVisualAge,
  sanitizePirateLocalPresence,
  sanitizePirateWorldSnapshot,
  pirateCentralAuthorityOwnsZone,
} from './pirate-presence-bridge-v900.mjs?v=5';
import { createPocketPlayerHudStore } from './pocket-hud-view-model.mjs?v=2';
import { createPirateIframeInputTransport } from './unified-mobile-controls-v900.mjs?v=11';
import { loadStudioCharacterFromEngine } from './asset-presentation/studio-character-live-bridge.mjs?v=2';
import {
  PIRATE_STUDIO_CHARACTER_ACCEPTED,
  PIRATE_STUDIO_CHARACTER_FAILED,
  PIRATE_STUDIO_CHARACTER_PACKAGE,
  PIRATE_STUDIO_CHARACTER_READY,
} from './asset-presentation/studio-character-pirate-channel.mjs?v=1';

export const PIRATE_FRUIT_OFFLINE_ENTRY = new URL('./pirate-fruit-offline/index.html?v=941', import.meta.url).href;
export const POCKET_ANIMAL_CONTROL_RUNTIME = './game-v800.js?v=829&animalControl=pirate-fruit';
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
    throwRuntimePromise = import('./game-v800.js?v=829&animalControl=pirate-fruit').then(() => {
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
  const studioCapability = globalThis.crypto?.randomUUID?.()
    || `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  frameUrl.searchParams.set('studioCapability', studioCapability);
  frame.dataset.studioCapability = studioCapability;
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
  const inputTransport = createPirateIframeInputTransport({
    frame,
    inputMessageType: PIRATE_UNIFIED_INPUT_MESSAGE,
    resetParentInput: reason => {
      if (!pirateRuntimeActive) return false;
      return window.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS?.reset?.(reason) === true;
    },
  });
  window.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS?.registerAdapter?.('pirate-fruit', Object.freeze({
    interceptActions: true,
    move: payload => inputTransport.move(payload),
    camera: payload => inputTransport.camera(payload),
    action: payload => inputTransport.action(payload),
    reset: reason => inputTransport.reset(reason),
    unlockAudio: () => inputTransport.unlockAudio(),
    activate: () => inputTransport.reset('pirate-activate'),
  }));
  frame.addEventListener('load', () => inputTransport.beginGeneration('frame-load'));
  let piratePose = null;
  let latestPresenceSnapshot = null;
  let latestPresenceAt = 0;
  let centralAuthorityCapability = null;
  let frameReady = false;
  let studioPackagePromise = null;
  let studioState = 'pending';
  const relayStudioPackage = () => {
    if (studioPackagePromise) return studioPackagePromise;
    studioState = 'loading';
    studioPackagePromise = loadStudioCharacterFromEngine()
      .then(pkg => {
        if (!pirateRuntimeActive) return;
        frame.contentWindow?.postMessage({
          type: PIRATE_STUDIO_CHARACTER_PACKAGE,
          capability: frame.dataset.studioCapability,
          package: pkg,
        }, '*');
        studioState = 'relayed';
      })
      .catch(error => {
        studioState = 'fallback';
        frame.contentWindow?.postMessage({
          type: PIRATE_STUDIO_CHARACTER_FAILED,
          capability: frame.dataset.studioCapability,
          error: String(error?.message || error),
        }, '*');
        console.warn('Studio character broker failed; Pirate fallback remains visible', error);
      });
    return studioPackagePromise;
  };
  // Server snapshots carry up to 512 recent visual events; retain only the
  // newest late-boot snapshot so history is replayed once, age-adjusted.
  const pendingPresenceSnapshots = [];
  let pendingPresenceDropped = 0;
  let frameGeneration = 0;
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
    hudTelemetry.reset({ frameWindow: frame.contentWindow, frameGeneration, reason });
    frame.contentWindow?.postMessage({ type: PIRATE_HUD_INIT_MESSAGE, frameGeneration }, '*');
  };
  const forwardPresence = snapshot => {
    if (!frameReady) {
      if (snapshot?.zone === PIRATE_PRESENCE_ZONE && snapshot?.players?.some(player => player?.visual?.events?.length)) {
        if (pendingPresenceSnapshots.length) pendingPresenceDropped += pendingPresenceSnapshots.length;
        pendingPresenceSnapshots.splice(0, pendingPresenceSnapshots.length, { snapshot, queuedAt: Date.now() });
      }
      return;
    }
    frame.contentWindow?.postMessage(createPirateSnapshotMessage(snapshot), '*');
  };
  const forwardPresenceStatus = connected => {
    frame.contentWindow?.postMessage(createPiratePresenceStatusMessage(connected), '*');
  };
  window.POCKETMONSTER_PIRATE_PRESENCE_QUEUE_DIAGNOSTICS = () => Object.freeze({
    pending: pendingPresenceSnapshots.length,
    dropped: pendingPresenceDropped,
    frameReady,
    input: inputTransport.diagnostics(),
    studioState,
  });
  const markFrameReady = () => {
    if (!pirateRuntimeActive) {
      hudTelemetry.invalidate('load-after-teardown');
      return;
    }
    activateHudTelemetry('reload');
    frameReady = true;
    const now = Date.now();
    const pending = pendingPresenceSnapshots.pop();
    pendingPresenceSnapshots.length = 0;
    if (pending && now - pending.queuedAt <= 3000 && pending.snapshot?.zone === PIRATE_PRESENCE_ZONE) {
      const aged = advancePirateSnapshotVisualAge(pending.snapshot, now - pending.queuedAt);
      if (aged.players.some(player => player?.visual?.events?.length || player?.visual?.projectiles?.length)) {
        frame.contentWindow?.postMessage(createPirateSnapshotMessage(aged), '*');
      }
    }
    try { frame.contentWindow?.focus?.(); } catch {}
    forwardPresenceStatus(window.POCKETMONSTER_WORLD_SOCKET_CONNECTED === true);
    if (latestPresenceSnapshot && now - latestPresenceAt <= 3000) forwardPresence(latestPresenceSnapshot);
  };
  frame.addEventListener('load', markFrameReady);
  try {
    if (frame.contentDocument?.readyState === 'complete' || frame.readyState === 'complete') queueMicrotask(markFrameReady);
  } catch {}
  window.addEventListener('pocketmonster:world-socket-status', event => {
    const connected = event.detail?.connected === true;
    if (!connected) {
      latestPresenceSnapshot = null;
      latestPresenceAt = 0;
      centralAuthorityCapability = null;
      pendingPresenceSnapshots.length = 0;
      window.POCKETMONSTER_WORLD_VISUAL_RESET?.();
      registerExternalPose(null);
      forwardPresence({ zone: PIRATE_PRESENCE_ZONE, players: [] });
    }
    forwardPresenceStatus(connected);
  });
  publishWorldState({
    getZone: () => 'pirate-fruit',
    getPosition: () => null,
    getDir: () => undefined,
    allowActors: true,
    getAllowActors: () => !pirateCentralAuthorityOwnsZone(
      centralAuthorityCapability,
      latestPresenceSnapshot?.zone || PIRATE_PRESENCE_ZONE,
    ),
  });
  window.POCKETMONSTER_WORLD_PRESENCE = payload => {
    if (!pirateRuntimeActive) return false;
    const snapshot = sanitizePirateWorldSnapshot(payload);
    if (!snapshot) return false;
    latestPresenceSnapshot = snapshot;
    centralAuthorityCapability = snapshot.centralAuthority || null;
    latestPresenceAt = Date.now();
    forwardPresenceStatus(true);
    forwardPresence(snapshot);
    return true;
  };
  window.addEventListener('message', event => {
    if (inputTransport.acceptReady(event)) return;
    if (!pirateRuntimeActive) return;
    if (event.source !== frame.contentWindow) return;
    const dialogue = event.data;
    if (dialogue?.type === 'pocketmonster:pirate-dialogue-v1') {
      const open = dialogue.open === true;
      const apply = doc => {
        if (!doc?.body) return;
        if (open) doc.body.dataset.pirateDialogue = 'open';
        else delete doc.body.dataset.pirateDialogue;
      };
      apply(document);
      try { apply(window.frameElement?.ownerDocument); } catch {}
      try { apply(window.parent?.document); } catch {}
      try { window.parent?.postMessage({ type: 'pocketmonster:pirate-dialogue-v1', open }, '*'); } catch {}
      return;
    }
    if (event.origin !== 'null') return;
    if (hudTelemetry.accept(event)) return;
    const message = event.data;
    if (message?.capability === frame.dataset.studioCapability && message.type === PIRATE_STUDIO_CHARACTER_READY) {
      void relayStudioPackage();
      return;
    }
    if (message?.capability === frame.dataset.studioCapability && message.type === PIRATE_STUDIO_CHARACTER_ACCEPTED) {
      studioState = 'studio-character';
      return;
    }
    if (message?.capability === frame.dataset.studioCapability && message.type === PIRATE_STUDIO_CHARACTER_FAILED) {
      studioState = 'fallback';
      return;
    }
    const onboarding = readPirateOnboardingState(message);
    if (onboarding) {
      syncPirateOnboardingActionProxies(onboarding);
      return;
    }
    const nextPose = sanitizePirateLocalPresence(message);
    if (nextPose) {
      const previousVisualSession = piratePose?.visual?.sessionId;
      const nextVisualSession = nextPose.visual?.sessionId;
      if (previousVisualSession && nextVisualSession && previousVisualSession !== nextVisualSession) {
        window.POCKETMONSTER_WORLD_VISUAL_RESET?.();
      }
      if (nextPose.visual?.events?.length) {
        window.POCKETMONSTER_WORLD_VISUAL_EVENTS?.(nextPose.visual.events);
        piratePose = Object.freeze({
          ...nextPose,
          visual: Object.freeze({ ...nextPose.visual, events: Object.freeze([]) }),
        });
      } else {
        piratePose = nextPose;
      }
      registerExternalPose(piratePose);
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
      hudTelemetry.invalidate('world-switch');
    }
  });
  window.addEventListener('pagehide', () => {
    hudTelemetry.invalidate('pagehide');
  }, { once: true });
  return Object.freeze({
    activate: reason => activateHudTelemetry(reason),
    invalidate: reason => {
      pocketPlayerHud.reset();
      return hudTelemetry.invalidate(reason);
    },
    clearPresenceQueue: () => {
      pendingPresenceSnapshots.length = 0;
      latestPresenceSnapshot = null;
      centralAuthorityCapability = null;
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
    registerExternalPose(null);
    delete window.POCKETMONSTER_PIRATE_PRESENCE_QUEUE_DIAGNOSTICS;
    pirateHudTelemetry.clearPresenceQueue();
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
