import {
  PIRATE_ONBOARDING_COMPACT_CSS,
  PIRATE_ONBOARDING_COMPACT_STYLE_ID,
  PIRATE_ONBOARDING_STATE_MESSAGE,
} from '../pirate-onboarding-overlay-v900.mjs?v=1';
import {
  PIRATE_HUD_INIT_MESSAGE,
  startPirateHudTelemetryPublisher,
} from '../pirate-hud-telemetry-v900.mjs?v=1';

export const PIRATE_UNIFIED_INPUT_MESSAGE = 'pocketmonster:unified-mobile-input-v1';

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
let cameraActive = false;
let cameraPoint = { x: 0, y: 0 };
let onboardingStateSignature = null;
let onboardingObserver = null;
let hudTelemetryPublisher = null;

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

function handleCamera(message) {
  const zone = document.querySelector('.tc-camzone');
  if (message.phase === 'start') {
    cameraPoint = { x: message.x, y: message.y };
    cameraActive = dispatchPointer(zone, 'pointerdown', {
      pointerId: POINTERS.camera,
      x: message.x,
      y: message.y,
    });
    return;
  }
  if (message.phase === 'move' && cameraActive) {
    cameraPoint = { x: message.x, y: message.y };
    dispatchPointer(window, 'pointermove', {
      pointerId: POINTERS.camera,
      x: message.x,
      y: message.y,
    });
    return;
  }
  if (cameraActive) {
    dispatchPointer(window, 'pointerup', { pointerId: POINTERS.camera, ...cameraPoint });
    cameraActive = false;
  }
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
  handleCamera({ phase: 'end' });
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
  if (message.kind === 'onboarding-action' && ONBOARDING_ACTION_SELECTORS[message.action]) {
    document.querySelector(ONBOARDING_ACTION_SELECTORS[message.action])?.click();
  } else if (message.kind === 'move' && Number.isFinite(message.x) && Number.isFinite(message.z)) handleMove(message);
  else if (message.kind === 'camera' && ['start', 'move', 'end'].includes(message.phase)) handleCamera(message);
  else if (message.kind === 'action' && ACTION_SELECTORS[message.action]) handleAction(message);
  else if (message.kind === 'reset') resetInputs();
});

window.addEventListener('pagehide', () => {
  resetInputs();
  onboardingObserver?.disconnect();
  hudTelemetryPublisher?.stop();
  hudTelemetryPublisher = null;
  if (allowedParentOrigin) {
    window.parent.postMessage({ type: PIRATE_ONBOARDING_STATE_MESSAGE, active: false }, allowedParentOrigin);
  }
});
document.documentElement.dataset.unifiedParentControls = 'active';
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', monitorOnboardingOverlay, { once: true });
} else {
  monitorOnboardingOverlay();
}
