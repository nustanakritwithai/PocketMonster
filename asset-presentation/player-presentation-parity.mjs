import { maybeWrapPlayerPresentationHandle as wrapPlayerPresentationSession } from './player-presentation-session.mjs';
import { applyStudioCharacterRenderProfile } from './studio-character-render-profile.mjs';

export const PLAYER_PRESENTATION_PARITY_SCHEMA = 'pocket-player-presentation-parity-v1';
export const PLAYER_PRESENTATION_FORWARD_YAW = Math.PI;
export const PLAYER_PRESENTATION_TRANSIENT_MAX_AGE_MS = 1500;

function finiteBounds(bounds) {
  return bounds && Number.isFinite(bounds.minY) && Number.isFinite(bounds.maxY) && bounds.maxY > bounds.minY;
}

function readBounds(handle) {
  try {
    const out = handle?.bounds?.({ minY: 0, maxY: 0 });
    return finiteBounds(out) ? { minY: Number(out.minY), maxY: Number(out.maxY) } : null;
  } catch {
    return null;
  }
}

function worldId(windowRef = globalThis.window) {
  return windowRef?.POCKETMONSTER_COMBINED_BOOT?.worldId || null;
}

export function shouldDeferPlayerPresentationParity(windowRef = globalThis.window) {
  return windowRef?.POCKETMONSTER_SCENE_PREWARM === true;
}

function retargetYawForWorld(id) {
  return id === 'pocket-monster' || id === 'living-world' ? PLAYER_PRESENTATION_FORWARD_YAW : 0;
}

export function computePlayerPresentationRetarget({ fallbackBounds, studioBounds, targetWorld } = {}) {
  const fallbackHeight = finiteBounds(fallbackBounds) ? fallbackBounds.maxY - fallbackBounds.minY : 1.8;
  const studioHeight = finiteBounds(studioBounds) ? studioBounds.maxY - studioBounds.minY : fallbackHeight;
  const rawScale = fallbackHeight / Math.max(0.0001, studioHeight);
  const scale = Math.max(0.25, Math.min(4, rawScale));
  return Object.freeze({
    schema: PLAYER_PRESENTATION_PARITY_SCHEMA,
    targetWorld: targetWorld || null,
    fallbackHeight,
    studioHeight,
    scale,
    yaw: retargetYawForWorld(targetWorld),
  });
}

function nowMs(windowRef) {
  const value = windowRef?.performance?.now?.();
  return Number.isFinite(value) ? value : Date.now();
}

function setVisible(nodes, visible) {
  for (const node of nodes || []) if (node) node.visible = visible;
}

function setUniformScale(node, value) {
  if (node?.scale?.setScalar) node.scale.setScalar(value);
  else node?.scale?.set?.(value, value, value);
}

function setForwardYaw(node, yaw) {
  if (node?.rotation?.set) node.rotation.set(0, yaw, 0, node.rotation.order || 'XYZ');
  else if (node?.rotation) node.rotation.y = yaw;
}

function rootWorldScaleY(root, THREE) {
  if (!root?.getWorldScale || !THREE?.Vector3) return 1;
  const value = root.getWorldScale(new THREE.Vector3(1, 1, 1));
  return Number.isFinite(value?.y) && Math.abs(value.y) > 0.0001 ? value.y : 1;
}

function alignStudioFeet({ studio, gameplayRoot, fallbackBounds, THREE }) {
  if (!studio?.root || !finiteBounds(fallbackBounds)) return;
  studio.root.position?.set?.(0, 0, 0);
  gameplayRoot?.updateMatrixWorld?.(true);
  studio.root.updateMatrixWorld?.(true);
  const current = readBounds(studio);
  if (!finiteBounds(current)) return;
  const deltaWorld = fallbackBounds.minY - current.minY;
  const scaleY = rootWorldScaleY(gameplayRoot, THREE);
  if (studio.root.position) studio.root.position.y += deltaWorld / scaleY;
  gameplayRoot?.updateMatrixWorld?.(true);
}

function textureSizeForQuality(quality) {
  if (quality === 'low') return 512;
  if (quality === 'high' || quality === 'ultra') return 1536;
  return 1024;
}

function normalizeAction(action) {
  return String(action || 'idle').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isLocomotionAction(action) {
  const value = normalizeAction(action);
  return value === 'idle' || value === 'walk' || value === 'run';
}

function transientWindowMs(action, options = {}) {
  const normalized = normalizeAction(action);
  if (normalized === 'dead' || normalized === 'death' || normalized === 'faint') return Infinity;
  const explicit = Number(options?.duration) * 1000;
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(PLAYER_PRESENTATION_TRANSIENT_MAX_AGE_MS, explicit);
  return PLAYER_PRESENTATION_TRANSIENT_MAX_AGE_MS;
}

export function resolvePlayerPresentationAction({ requestedAction = 'idle', requestedAt = -Infinity, requestedOptions = {}, moving = false, now = 0 } = {}) {
  const action = normalizeAction(requestedAction);
  if (!isLocomotionAction(action) && now - requestedAt <= transientWindowMs(action, requestedOptions)) return action;
  if (moving) return action === 'run' ? 'run' : 'walk';
  return 'idle';
}

/**
 * Adds host-world visual parity on top of the cross-world presentation session.
 * Gameplay/root authority remains on the original handle; only the nested Studio
 * visual is scaled, oriented, textured and animation-synchronized.
 */
export function maybeWrapPlayerPresentationHandle(options = {}) {
  const fallback = options.handle;
  const fallbackBounds = readBounds(fallback);
  const fallbackChildren = [...(fallback?.root?.children || [])];
  const session = wrapPlayerPresentationSession(options);
  if (!session || session === fallback) return session || fallback;

  const { THREE, quality, windowRef = globalThis.window } = options;
  const gameplayRoot = session.root;
  let disposed = false;
  let lastMoving = false;
  let requestedAction = 'idle';
  let requestedOptions = {};
  let requestedAt = -Infinity;
  let lastAppliedAction = 'idle';
  let parityPromise = null;
  let parityReport = null;

  function currentResolvedAction() {
    return resolvePlayerPresentationAction({
      requestedAction,
      requestedAt,
      requestedOptions,
      moving: lastMoving,
      now: nowMs(windowRef),
    });
  }

  function ensureLocomotionParity() {
    if (disposed || session.presentationSource !== 'studio-character') return;
    const next = currentResolvedAction();
    if (next === lastAppliedAction) return;
    session.play?.(next, { restart: true });
    lastAppliedAction = next;
    if (gameplayRoot?.userData) gameplayRoot.userData.presentationReplayAction = next;
  }

  function ensureParity() {
    if (disposed) return Promise.resolve(null);
    // worlds-v900 prewarms the Pocket runtime while Pirate Fruit is still the
    // active route. Do not cache a resolved-null parity promise here: the
    // underlying Studio session intentionally defers its upgrade during prewarm.
    // The first real mounted update must be allowed to retry scale/yaw/PBR/action
    // parity once POCKETMONSTER_SCENE_PREWARM has been cleared.
    if (shouldDeferPlayerPresentationParity(windowRef)) return Promise.resolve(null);
    if (parityPromise) return parityPromise;

    // Force the underlying session to begin its async Studio upgrade now, then
    // observe the real presentationReady promise rather than the pre-upgrade null.
    session.update?.(0, { moving: lastMoving });
    const pending = session.presentationReady;
    parityPromise = Promise.resolve(pending).then(async studio => {
      if (!studio || disposed) {
        // A transient null must never poison future mounted retries.
        if (!disposed) parityPromise = null;
        return studio || null;
      }

      // The session has just swapped to Studio. Keep the known-good fallback on
      // screen while scale/orientation and verified textures are being applied.
      if (studio.root) studio.root.visible = false;
      setVisible(fallbackChildren, true);

      const studioBounds = readBounds(studio);
      const retarget = computePlayerPresentationRetarget({
        fallbackBounds,
        studioBounds,
        targetWorld: worldId(windowRef),
      });

      setUniformScale(studio.root, retarget.scale);
      setForwardYaw(studio.root, retarget.yaw);
      alignStudioFeet({ studio, gameplayRoot, fallbackBounds, THREE });

      let renderProfile = Object.freeze({ state: 'skipped', assigned: 0, failed: [], reason: 'no-render-profile' });
      if (studio.renderProfile) {
        try {
          renderProfile = await applyStudioCharacterRenderProfile(studio.root, studio.renderProfile, {
            THREE,
            documentRef: windowRef?.document || globalThis.document,
            maxTextureSize: textureSizeForQuality(quality),
            isDisposed: () => disposed || studio.disposed === true,
            registerTexture: texture => studio.ownTexture?.(texture),
          });
        } catch (error) {
          renderProfile = Object.freeze({
            state: 'failed',
            assigned: 0,
            failed: [String(error?.message || error)],
          });
        }
      }

      const replayAction = currentResolvedAction();
      studio.play?.(replayAction, { ...requestedOptions, restart: true });
      lastAppliedAction = replayAction;

      setVisible(fallbackChildren, false);
      if (studio.root) studio.root.visible = true;
      gameplayRoot?.updateMatrixWorld?.(true);
      gameplayRoot.userData ??= {};
      gameplayRoot.userData.presentationParity = PLAYER_PRESENTATION_PARITY_SCHEMA;
      gameplayRoot.userData.presentationScale = retarget.scale;
      gameplayRoot.userData.presentationForwardYaw = retarget.yaw;
      gameplayRoot.userData.presentationRenderProfileState = renderProfile.state;
      gameplayRoot.userData.presentationReplayAction = replayAction;

      parityReport = Object.freeze({
        ...retarget,
        action: replayAction,
        renderProfile,
      });
      return studio;
    }).catch(error => {
      setVisible(fallbackChildren, true);
      gameplayRoot.userData ??= {};
      gameplayRoot.userData.presentationParityError = String(error?.message || error);
      parityReport = Object.freeze({
        schema: PLAYER_PRESENTATION_PARITY_SCHEMA,
        state: 'fallback',
        error: String(error?.message || error),
      });
      return null;
    });
    return parityPromise;
  }

  const wrapper = {
    id: session.id,
    role: session.role,
    root: gameplayRoot,
    get rig() { return session.rig; },
    get ready() { return session.ready; },
    get presentationReady() { return ensureParity(); },
    get presentationSource() { return session.presentationSource; },
    get presentationParity() { return parityReport; },
    play(action, playOptions = {}) {
      requestedAction = String(action || 'idle');
      requestedOptions = { ...playOptions };
      requestedAt = nowMs(windowRef);
      lastAppliedAction = normalizeAction(requestedAction);
      session.play?.(action, playOptions);
      ensureParity();
      return wrapper;
    },
    update(dt, context) {
      if (context && typeof context.moving === 'boolean') lastMoving = context.moving;
      session.update?.(dt, context);
      ensureParity();
      ensureLocomotionParity();
      return wrapper;
    },
    anchor(name, target) { ensureParity(); return session.anchor(name, target); },
    bounds(target) { ensureParity(); return session.bounds(target); },
    setAppearance(...args) { session.setAppearance?.(...args); return wrapper; },
    dispose() {
      if (disposed) return wrapper;
      disposed = true;
      session.dispose?.();
      return wrapper;
    },
  };

  queueMicrotask(() => { void ensureParity(); });
  return wrapper;
}
