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
});

let joystickActive = false;
let cameraActive = false;
let cameraPoint = { x: 0, y: 0 };

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
  if (message?.type !== PIRATE_UNIFIED_INPUT_MESSAGE) return;
  if (message.kind === 'move' && Number.isFinite(message.x) && Number.isFinite(message.z)) handleMove(message);
  else if (message.kind === 'camera' && ['start', 'move', 'end'].includes(message.phase)) handleCamera(message);
  else if (message.kind === 'action' && ACTION_SELECTORS[message.action]) handleAction(message);
  else if (message.kind === 'reset') resetInputs();
});

window.addEventListener('pagehide', resetInputs);
document.documentElement.dataset.unifiedParentControls = 'active';
