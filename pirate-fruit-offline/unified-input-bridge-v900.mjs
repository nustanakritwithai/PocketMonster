import {
  PIRATE_ONBOARDING_COMPACT_CSS,
  PIRATE_ONBOARDING_COMPACT_STYLE_ID,
  PIRATE_ONBOARDING_STATE_MESSAGE,
} from '../pirate-onboarding-overlay-v900.mjs?v=1';
import {
  PIRATE_HUD_INIT_MESSAGE,
  startPirateHudTelemetryPublisher,
} from '../pirate-hud-telemetry-v900.mjs?v=2';

export const PIRATE_UNIFIED_INPUT_MESSAGE = 'pocketmonster:unified-mobile-input-v1';
export const PIRATE_UNIFIED_INPUT_READY_MESSAGE = 'pocketmonster:unified-mobile-input-ready-v1';
/** The native Pirate HUD alone decides this mode.  The parent only mirrors it. */
export const PIRATE_UNIFIED_INPUT_MODE_MESSAGE = 'pocketmonster:unified-mobile-input-mode-v1';
export const PIRATE_UNIFIED_INPUT_INTERACTION_MESSAGE = 'pocketmonster:unified-mobile-input-interaction-v1';

const query = new URLSearchParams(location.search);
const parentOrigin = query.get('parentOrigin');
const allowedParentOrigin = (() => {
  try { return parentOrigin ? new URL(parentOrigin).origin : null; } catch { return null; }
})();

const POINTERS = Object.freeze({ joystick: 9101, camera: 9102 });
const ACTION_SELECTORS = Object.freeze({
  skill1: '.tc-skill1',
  skill2: '.tc-skill2',
  skill3: '.tc-skill3',
  skill4: '.tc-ult',
  capture: '.tc-attack',
  summon: '.tc-dash',
  recall: '.tc-jump',
  cannonLeft: '.tc-cannon-left',
  cannonRight: '.tc-cannon-right',
  interact: '.interaction-prompt',
  block: '.tc-block',
  weapon: '.tc-weapon',
  potion1: '.tc-potion1',
  potion2: '.tc-potion2',
  zoomIn: '.tc-zoom-in',
  zoomOut: '.tc-zoom-out',
});
const ONBOARDING_ACTION_SELECTORS = Object.freeze({
  prev: '.onboarding-prev',
  pause: '.onboarding-pause',
  next: '.onboarding-next',
});

let joystickActive = false;
let activeFrameGeneration = null;
let cameraGestureHighWater = 0;
let activeCameraGesture = null;
let inputReadySent = false;
let inputReadyObserver = null;
let inputWindowLoaded = document.readyState === 'complete';
let controlModeObserver = null;
let reportedControlMode = null;
let reportedHelmPrompt = null;
let onboardingStateSignature = null;
let onboardingObserver = null;
let hudTelemetryPublisher = null;
let pendingAudioUnlock = false;
let audioUnlockRetryTimer = null;
let audioUnlockInFlight = null;
let audioUnlockAttempts = 0;

const AUDIO_UNLOCK_RETRY_LIMIT = 40;
const AUDIO_UNLOCK_RETRY_DELAY_MS = 125;

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function requestAudioUnlock() {
  pendingAudioUnlock = true;
  if (audioUnlockInFlight || audioUnlockRetryTimer) return true;
  audioUnlockAttempts = 0;
  retryAudioUnlock();
  return true;
}

function retryAudioUnlock() {
  if (!pendingAudioUnlock || audioUnlockInFlight || audioUnlockRetryTimer) return;
  if (audioUnlockAttempts >= AUDIO_UNLOCK_RETRY_LIMIT) {
    pendingAudioUnlock = false;
    return;
  }
  audioUnlockAttempts += 1;
  const audio = window.__audio;
  if (typeof audio?.unlock !== 'function') {
    audioUnlockRetryTimer = setTimeout(() => {
      audioUnlockRetryTimer = null;
      retryAudioUnlock();
    }, AUDIO_UNLOCK_RETRY_DELAY_MS);
    return;
  }
  audioUnlockInFlight = Promise.resolve()
    .then(() => audio.unlock())
    .then(unlocked => {
      if (unlocked === true) pendingAudioUnlock = false;
      else if (pendingAudioUnlock) {
        audioUnlockRetryTimer = setTimeout(() => {
          audioUnlockRetryTimer = null;
          retryAudioUnlock();
        }, AUDIO_UNLOCK_RETRY_DELAY_MS);
      }
    })
    .catch(() => {
      if (pendingAudioUnlock) {
        audioUnlockRetryTimer = setTimeout(() => {
          audioUnlockRetryTimer = null;
          retryAudioUnlock();
        }, AUDIO_UNLOCK_RETRY_DELAY_MS);
      }
    })
    .finally(() => {
      audioUnlockInFlight = null;
    });
}

function nativeControlMode() {
  // TouchControls switches these native buttons synchronously in setMode().
  // Looking at its own inline state stays valid even while the parent hides
  // .tc-root, and never guesses from a player/boat position or an intent.
  const starboard = document.querySelector('.tc-cannon-right');
  return starboard?.style?.display === 'flex' ? 'boat' : 'player';
}

function nativeHelmPrompt() {
  const prompt = document.querySelector('.interaction-prompt');
  const text = prompt?.textContent || '';
  if (prompt?.style?.display === 'none' || !text.includes('พวงมาลัย')) return null;
  return nativeControlMode() === 'boat' ? 'leave' : 'enter';
}

function syncNativeHelmPromptProxy(helmPrompt) {
  const prompt = document.querySelector('.interaction-prompt');
  if (!prompt?.dataset) return;
  if (helmPrompt) prompt.dataset.unifiedHelmProxy = 'true';
  else delete prompt.dataset.unifiedHelmProxy;
}

function publishNativeControlMode(force = false) {
  if (!allowedParentOrigin || !isPositiveSafeInteger(activeFrameGeneration)) return false;
  const controlMode = nativeControlMode();
  if (!force && controlMode === reportedControlMode) return false;
  reportedControlMode = controlMode;
  window.parent.postMessage({
    type: PIRATE_UNIFIED_INPUT_MODE_MESSAGE,
    frameGeneration: activeFrameGeneration,
    controlMode,
  }, allowedParentOrigin);
  return true;
}

function publishNativeHelmPrompt(force = false) {
  if (!allowedParentOrigin || !isPositiveSafeInteger(activeFrameGeneration)) return false;
  const helmPrompt = nativeHelmPrompt();
  // Keep the original element logically visible: its pointerdown listener is
  // the native helm signal consumed by BoatManager.  The child HUD stylesheet
  // hides only this tagged duplicate while the parent wheel proxies that hit.
  syncNativeHelmPromptProxy(helmPrompt);
  if (!force && helmPrompt === reportedHelmPrompt) return false;
  reportedHelmPrompt = helmPrompt;
  window.parent.postMessage({
    type: PIRATE_UNIFIED_INPUT_INTERACTION_MESSAGE,
    frameGeneration: activeFrameGeneration,
    helmPrompt,
  }, allowedParentOrigin);
  return true;
}

function monitorNativeControlMode() {
  controlModeObserver?.disconnect();
  const root = document.documentElement;
  if (!root) return;
  controlModeObserver = new MutationObserver(() => {
    publishNativeControlMode();
    publishNativeHelmPrompt();
  });
  controlModeObserver.observe(root, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['class', 'style'],
  });
  publishNativeControlMode(true);
  publishNativeHelmPrompt(true);
}

function announceInputReady() {
  if (inputReadySent || !allowedParentOrigin || window.parent === window) return inputReadySent;
  if (!inputWindowLoaded) return false;
  if (!document.querySelector('.tc-camzone')) return false;
  inputReadySent = true;
  inputReadyObserver?.disconnect();
  inputReadyObserver = null;
  window.parent.postMessage({ type: PIRATE_UNIFIED_INPUT_READY_MESSAGE }, allowedParentOrigin);
  return true;
}

function monitorInputReady() {
  if (announceInputReady()) return;
  const root = document.documentElement;
  if (!root) {
    window.addEventListener('DOMContentLoaded', monitorInputReady, { once: true });
    return;
  }
  inputReadyObserver?.disconnect();
  inputReadyObserver = new MutationObserver(announceInputReady);
  inputReadyObserver.observe(root, { childList: true, subtree: true });
}

function handleInputWindowLoad() {
  inputWindowLoaded = true;
  announceInputReady();
}

function installCompactOnboardingStyle() {
  if (document.getElementById(PIRATE_ONBOARDING_COMPACT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PIRATE_ONBOARDING_COMPACT_STYLE_ID;
  style.textContent = PIRATE_ONBOARDING_COMPACT_CSS;
  document.head?.appendChild(style);
}

function syncOnboardingOverlay() {
  const root = document.querySelector('.onboarding-root');
  const style = root ? getComputedStyle(root) : null;
  const active = Boolean(root && style?.display !== 'none' && style?.visibility !== 'hidden');
  if (active) installCompactOnboardingStyle();
  const actions = {};
  if (active) {
    for (const [action, selector] of Object.entries(ONBOARDING_ACTION_SELECTORS)) {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect?.();
      if (rect?.width > 0 && rect?.height > 0) {
        actions[action] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
    }
  }
  const state = { type: PIRATE_ONBOARDING_STATE_MESSAGE, active, actions };
  const signature = JSON.stringify(state);
  if (signature === onboardingStateSignature || !allowedParentOrigin) return;
  onboardingStateSignature = signature;
  window.parent.postMessage(state, allowedParentOrigin);
}

function monitorOnboardingOverlay() {
  onboardingObserver?.disconnect();
  onboardingObserver = new MutationObserver(syncOnboardingOverlay);
  onboardingObserver.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['class', 'style'],
  });
  syncOnboardingOverlay();
}

function dispatchPointer(target, type, { pointerId, x = 0, y = 0 } = {}) {
  if (!target?.dispatchEvent) return false;
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: 'touch',
    isPrimary: pointerId === POINTERS.joystick,
    clientX: x,
    clientY: y,
  }));
  return true;
}

function handleMove(message) {
  const zone = document.querySelector('.tc-joyzone');
  if (!zone) return;
  const centerX = Math.max(54, innerWidth * .18);
  const centerY = Math.max(54, innerHeight * .72);
  if (message.active === true && !joystickActive) {
    joystickActive = dispatchPointer(zone, 'pointerdown', {
      pointerId: POINTERS.joystick,
      x: centerX,
      y: centerY,
    });
  }
  if (message.active === true && joystickActive) {
    dispatchPointer(window, 'pointermove', {
      pointerId: POINTERS.joystick,
      x: centerX + message.x * 43,
      y: centerY + message.z * 43,
    });
  } else if (joystickActive) {
    dispatchPointer(window, 'pointerup', { pointerId: POINTERS.joystick, x: centerX, y: centerY });
    joystickActive = false;
  }
}

function closeActiveCamera() {
  if (!activeCameraGesture) return false;
  const { point } = activeCameraGesture;
  activeCameraGesture = null;
  dispatchPointer(window, 'pointerup', { pointerId: POINTERS.camera, ...point });
  return true;
}

function handleCamera(message) {
  const { frameGeneration, gestureId } = message;
  if (!isPositiveSafeInteger(frameGeneration) || !isPositiveSafeInteger(gestureId)) return;

  if (message.phase === 'start') {
    if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
    if (activeFrameGeneration !== null && frameGeneration < activeFrameGeneration) return;
    if (activeFrameGeneration === null || frameGeneration > activeFrameGeneration) {
      closeActiveCamera();
      activeFrameGeneration = frameGeneration;
      cameraGestureHighWater = 0;
    }
    if (gestureId <= cameraGestureHighWater) return;
    closeActiveCamera();
    cameraGestureHighWater = gestureId;
    const point = { x: message.x, y: message.y };
    if (dispatchPointer(document.querySelector('.tc-camzone'), 'pointerdown', {
      pointerId: POINTERS.camera,
      ...point,
    })) {
      activeCameraGesture = { frameGeneration, gestureId, point };
    }
    return;
  }

  if (frameGeneration !== activeFrameGeneration
    || activeCameraGesture?.frameGeneration !== frameGeneration
    || activeCameraGesture?.gestureId !== gestureId) return;
  if (message.phase === 'move') {
    if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
    activeCameraGesture.point = { x: message.x, y: message.y };
    dispatchPointer(window, 'pointermove', {
      pointerId: POINTERS.camera,
      x: message.x,
      y: message.y,
    });
    return;
  }
  closeActiveCamera();
}

function handleAction(message) {
  const target = document.querySelector(ACTION_SELECTORS[message.action]);
  if (!target) return;
  const pointerId = Number.isFinite(message.pointerId) ? message.pointerId + 9200 : 9200;
  const rect = target.getBoundingClientRect();
  const point = { pointerId, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  if (message.phase === 'start') dispatchPointer(target, 'pointerdown', point);
  else dispatchPointer(target, message.phase === 'cancel' ? 'pointercancel' : 'pointerup', point);
}

function resetInputs() {
  handleMove({ active: false, x: 0, z: 0 });
  closeActiveCamera();
}

function handleTransportReset(message) {
  if (!isPositiveSafeInteger(message.frameGeneration)) return;
  if (activeFrameGeneration !== null && message.frameGeneration < activeFrameGeneration) return;
  const advancesGeneration = activeFrameGeneration === null || message.frameGeneration > activeFrameGeneration;
  resetInputs();
  activeFrameGeneration = message.frameGeneration;
  if (advancesGeneration) cameraGestureHighWater = 0;
  publishNativeControlMode(true);
  publishNativeHelmPrompt(true);
}

window.addEventListener('message', event => {
  if (window.parent === window || event.source !== window.parent || event.origin !== allowedParentOrigin) return;
  const message = event.data;
  if (message?.type === PIRATE_HUD_INIT_MESSAGE && Number.isSafeInteger(message.frameGeneration) && message.frameGeneration >= 0) {
    hudTelemetryPublisher?.stop();
    hudTelemetryPublisher = startPirateHudTelemetryPublisher({
      document,
      frameGeneration: message.frameGeneration,
      parentOrigin: allowedParentOrigin,
    });
    return;
  }
  if (message?.type !== PIRATE_UNIFIED_INPUT_MESSAGE) return;
  if (message.kind === 'audio-unlock') {
    if (!isPositiveSafeInteger(message.frameGeneration) || message.frameGeneration !== activeFrameGeneration) return;
    requestAudioUnlock();
    retryAudioUnlock();
    return;
  }
  if (message.kind === 'camera' && ['start', 'move', 'end'].includes(message.phase)) {
    handleCamera(message);
    return;
  }
  if (message.kind === 'reset') {
    handleTransportReset(message);
    return;
  }
  if (!isPositiveSafeInteger(message.frameGeneration) || message.frameGeneration !== activeFrameGeneration) return;
  if (message.kind === 'onboarding-action' && ONBOARDING_ACTION_SELECTORS[message.action]) {
    document.querySelector(ONBOARDING_ACTION_SELECTORS[message.action])?.click();
  } else if (message.kind === 'move' && Number.isFinite(message.x) && Number.isFinite(message.z)) handleMove(message);
  else if (message.kind === 'action' && ACTION_SELECTORS[message.action]) handleAction(message);
});

window.addEventListener('blur', resetInputs);

window.addEventListener('pagehide', () => {
  pendingAudioUnlock = false;
  if (audioUnlockRetryTimer !== null) {
    clearTimeout(audioUnlockRetryTimer);
    audioUnlockRetryTimer = null;
  }
  resetInputs();
  inputReadyObserver?.disconnect();
  inputReadyObserver = null;
  controlModeObserver?.disconnect();
  controlModeObserver = null;
  onboardingObserver?.disconnect();
  hudTelemetryPublisher?.stop();
  hudTelemetryPublisher = null;
  if (allowedParentOrigin) {
    window.parent.postMessage({ type: PIRATE_ONBOARDING_STATE_MESSAGE, active: false }, allowedParentOrigin);
  }
});
document.documentElement.dataset.unifiedParentControls = 'active';
if (!inputWindowLoaded) window.addEventListener('load', handleInputWindowLoad, { once: true });
monitorInputReady();
monitorNativeControlMode();
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', monitorOnboardingOverlay, { once: true });
} else {
  monitorOnboardingOverlay();
}
