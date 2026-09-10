import { createStudioCharacterProvider } from './providers/studio-character.mjs';
import { registerStudioCharacterPackage } from './studio-character-package.mjs';
import { loadStudioCharacterFromEngine } from './studio-character-live-bridge.mjs';
import {
  PIRATE_STUDIO_CHARACTER_FAILED,
  PIRATE_STUDIO_CHARACTER_PACKAGE,
  PIRATE_STUDIO_CHARACTER_READY,
} from './studio-character-pirate-channel.mjs';

export const PLAYER_PRESENTATION_FALLBACK_ID = 'character.human.pirate-fruit.v1';
export const PLAYER_PRESENTATION_SESSION_SCHEMA = 'pocket-player-presentation-session-v1';

let cachedPackage = null;
let packagePromise = null;
let lastError = null;
let brokerInstalled = false;
let loadAttempts = 0;

function combinedRuntimeActive(windowRef = globalThis.window) {
  return !!windowRef?.POCKETMONSTER_COMBINED_BOOT;
}

function currentWorld(windowRef = globalThis.window) {
  return windowRef?.POCKETMONSTER_COMBINED_BOOT?.worldId || null;
}

function matchingPirateFrame(message, source, documentRef = globalThis.document) {
  if (!message?.capability || !documentRef?.querySelectorAll) return null;
  for (const frame of documentRef.querySelectorAll('iframe[data-studio-capability]')) {
    if (frame.dataset?.studioCapability === message.capability && frame.contentWindow === source) return frame;
  }
  return null;
}

function postPackage(frame, pkg) {
  if (!frame?.contentWindow || !pkg) return false;
  frame.contentWindow.postMessage({
    type: PIRATE_STUDIO_CHARACTER_PACKAGE,
    capability: frame.dataset.studioCapability,
    package: pkg,
  }, '*');
  return true;
}

function postFailure(frame, error) {
  if (!frame?.contentWindow) return false;
  frame.contentWindow.postMessage({
    type: PIRATE_STUDIO_CHARACTER_FAILED,
    capability: frame.dataset.studioCapability,
    error: String(error?.message || error || 'Studio Character unavailable'),
  }, '*');
  return true;
}

export function playerPresentationSessionDiagnostics() {
  return Object.freeze({
    schema: PLAYER_PRESENTATION_SESSION_SCHEMA,
    state: cachedPackage ? 'studio-character' : packagePromise ? 'loading' : lastError ? 'fallback' : 'idle',
    characterId: cachedPackage?.manifest?.id || PLAYER_PRESENTATION_FALLBACK_ID,
    primaryCharacter: cachedPackage?.rig?.primaryCharacter || null,
    loadAttempts,
    error: lastError ? String(lastError?.message || lastError) : null,
  });
}

export function peekPlayerPresentationPackage() {
  return cachedPackage;
}

export function loadPlayerPresentationPackage() {
  if (cachedPackage) return Promise.resolve(cachedPackage);
  if (packagePromise) return packagePromise;
  loadAttempts += 1;
  packagePromise = loadStudioCharacterFromEngine()
    .then(pkg => {
      registerStudioCharacterPackage(pkg);
      cachedPackage = pkg;
      lastError = null;
      packagePromise = null;
      relayCachedPlayerPresentationToPirateFrames();
      return pkg;
    })
    .catch(error => {
      lastError = error;
      packagePromise = null;
      throw error;
    });
  return packagePromise;
}

export function relayCachedPlayerPresentationToPirateFrames(documentRef = globalThis.document) {
  if (!cachedPackage || !documentRef?.querySelectorAll) return 0;
  let relayed = 0;
  for (const frame of documentRef.querySelectorAll('iframe[data-studio-capability]')) {
    if (postPackage(frame, cachedPackage)) relayed += 1;
  }
  return relayed;
}

export function installPlayerPresentationReplayBroker({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  if (brokerInstalled || !windowRef?.addEventListener || !documentRef) return false;
  if (!combinedRuntimeActive(windowRef)) return false;
  brokerInstalled = true;

  windowRef.addEventListener('message', event => {
    const message = event?.data;
    if (message?.type !== PIRATE_STUDIO_CHARACTER_READY || event.origin !== 'null') return;
    const frame = matchingPirateFrame(message, event.source, documentRef);
    if (!frame) return;
    if (cachedPackage) postPackage(frame, cachedPackage);
  });

  windowRef.addEventListener('pocketmonster:world-warp-v1', event => {
    if (event?.detail?.world !== 'pirate-fruit' || !cachedPackage) return;
    for (const delay of [0, 80, 240, 700]) {
      windowRef.setTimeout?.(() => relayCachedPlayerPresentationToPirateFrames(documentRef), delay);
    }
  });

  windowRef.POCKETMONSTER_PLAYER_PRESENTATION_SESSION = Object.freeze({
    diagnostics: playerPresentationSessionDiagnostics,
    peek: peekPlayerPresentationPackage,
    load: loadPlayerPresentationPackage,
    relayPirate: () => relayCachedPlayerPresentationToPirateFrames(documentRef),
  });
  return true;
}

export function shouldUsePlayerPresentationSession({ def, request, windowRef = globalThis.window } = {}) {
  return combinedRuntimeActive(windowRef)
    && def?.id === PLAYER_PRESENTATION_FALLBACK_ID
    && request?.role === 'player';
}

function safeSetOrigin(node) {
  node?.position?.set?.(0, 0, 0);
  node?.rotation?.set?.(0, 0, 0);
  node?.scale?.set?.(1, 1, 1);
}

function hideFallbackChildren(root, hidden) {
  for (const child of hidden) child.visible = false;
  root?.updateMatrixWorld?.(true);
}

export function maybeWrapPlayerPresentationHandle({
  handle,
  def,
  request,
  THREE,
  quality,
  windowRef = globalThis.window,
} = {}) {
  if (!handle || !shouldUsePlayerPresentationSession({ def, request, windowRef })) return handle;
  installPlayerPresentationReplayBroker({ windowRef, documentRef: windowRef?.document || globalThis.document });

  const fallback = handle;
  const root = fallback.root;
  const fallbackChildren = [...(root?.children || [])];
  let active = fallback;
  let studio = null;
  let disposed = false;
  let upgradePromise = null;
  let lastMoving = false;
  let lastAction = 'idle';

  const wrapper = {
    id: fallback.id,
    role: fallback.role || request.role,
    root,
    get rig() { return active?.rig || fallback.rig; },
    get ready() { return fallback.ready; },
    get presentationReady() { return upgradePromise || Promise.resolve(studio); },
    get presentationSource() { return studio ? 'studio-character' : 'pirate-fruit'; },
    play(action, options) {
      lastAction = String(action || 'idle');
      ensureUpgrade();
      active?.play?.(action, options);
      return wrapper;
    },
    update(dt, context) {
      if (context && typeof context.moving === 'boolean') lastMoving = context.moving;
      ensureUpgrade();
      active?.update?.(dt, context);
      return wrapper;
    },
    anchor(name, target) {
      ensureUpgrade();
      return active?.anchor?.(name, target) ?? fallback.anchor(name, target);
    },
    bounds(target) {
      ensureUpgrade();
      return active?.bounds?.(target) ?? fallback.bounds(target);
    },
    setAppearance(...args) {
      active?.setAppearance?.(...args);
      return wrapper;
    },
    dispose() {
      if (disposed) return wrapper;
      disposed = true;
      try { studio?.dispose?.(); } catch {}
      if (studio?.root?.parent === root) root.remove?.(studio.root);
      fallback.dispose?.();
      return wrapper;
    },
  };

  function ensureUpgrade() {
    if (disposed || studio || upgradePromise) return upgradePromise;
    if (!combinedRuntimeActive(windowRef)) return null;
    const world = currentWorld(windowRef);
    if (windowRef?.POCKETMONSTER_SCENE_PREWARM === true && world !== 'pocket-monster') return null;

    upgradePromise = loadPlayerPresentationPackage()
      .then(pkg => {
        if (disposed) return null;
        registerStudioCharacterPackage(pkg);
        const factory = createStudioCharacterProvider({ THREE });
        const next = factory({
          def: pkg.catalogEntry,
          request: { ...request, assetId: pkg.manifest.id, quality: request?.quality || quality },
          THREE,
          quality: request?.quality || quality,
        });
        return Promise.resolve(next?.ready).then(() => next);
      })
      .then(next => {
        if (!next || disposed) {
          next?.dispose?.();
          return null;
        }
        studio = next;
        safeSetOrigin(studio.root);
        hideFallbackChildren(root, fallbackChildren);
        root.add?.(studio.root);
        root.userData ??= {};
        root.userData.activePresentation = 'studio-character';
        root.userData.presentationCharacterId = cachedPackage?.manifest?.id || null;
        root.userData.presentationPrimaryCharacter = cachedPackage?.rig?.primaryCharacter || null;
        active = studio;
        const locomotion = lastMoving ? 'walk' : ['idle', 'walk', 'run'].includes(lastAction) ? lastAction : 'idle';
        studio.play?.(locomotion, { restart: true });
        windowRef?.dispatchEvent?.(new CustomEvent('pocketmonster:player-presentation-changed-v1', {
          detail: Object.freeze({
            schema: PLAYER_PRESENTATION_SESSION_SCHEMA,
            source: 'studio-character',
            characterId: cachedPackage?.manifest?.id || null,
            primaryCharacter: cachedPackage?.rig?.primaryCharacter || null,
          }),
        }));
        return studio;
      })
      .catch(error => {
        lastError = error;
        root.userData ??= {};
        root.userData.activePresentation = 'pirate-fruit';
        root.userData.presentationError = String(error?.message || error);
        return null;
      });
    return upgradePromise;
  }

  if (currentWorld(windowRef) === 'pocket-monster' && windowRef?.POCKETMONSTER_SCENE_PREWARM !== true) {
    queueMicrotask(() => ensureUpgrade());
  }
  return wrapper;
}
