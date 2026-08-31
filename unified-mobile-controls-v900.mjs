import { bindMobileDualPointerInput } from './mobile-dual-pointer-input-v900.mjs?v=2';

export const UNIFIED_MOBILE_CONTROLS_KIND = 'monsterlife-unified-mobile-controls-v1';

const ACTION_BUTTONS = Object.freeze({
  skill1Btn: 'skill1',
  skill2Btn: 'skill2',
  skill3Btn: 'skill3',
  skill4Btn: 'skill4',
  captureBtn: 'capture',
  summonBtn: 'summon',
  recallBtn: 'recall',
  pirateBlockBtn: 'block',
  pirateWeaponBtn: 'weapon',
  piratePotion1Btn: 'potion1',
  piratePotion2Btn: 'potion2',
  pirateZoomInBtn: 'zoomIn',
  pirateZoomOutBtn: 'zoomOut',
});

const CONTROL_MODES = Object.freeze({
  'pirate-fruit': 'pirate',
  'pocket-monster': 'capture',
  'living-world': 'travel',
});

export function createUnifiedMobileControls({
  windowLike = globalThis.window,
  documentLike = globalThis.document,
} = {}) {
  const joystickElement = documentLike?.getElementById?.('joystick');
  const stickElement = documentLike?.getElementById?.('stick');
  const joystickKnobElement = documentLike?.getElementById?.('pirateJoyKnob');
  const cameraElement = documentLike?.getElementById?.('cameraPad');
  const controlSurface = documentLike?.getElementById?.('pirateUnifiedControls');
  if (!joystickElement || !stickElement || !joystickKnobElement || !cameraElement || !controlSurface) {
    throw new Error('Pirate-primary mobile controls require the shared Pirate control surface');
  }

  const adapters = new Map();
  const actionPointers = new Map();
  let activeWorldId = null;
  let cameraPoint = null;
  let joystickCenter = null;

  const activeAdapter = () => adapters.get(activeWorldId) || null;

  const setControlMode = worldId => {
    const mode = CONTROL_MODES[worldId] || 'travel';
    controlSurface.dataset.controlMode = mode;
    if (documentLike?.body?.dataset) documentLike.body.dataset.mobileControlMode = mode;
    if (mode === 'pirate') {
      for (const buttonId of Object.keys(ACTION_BUTTONS)) {
        const button = documentLike.getElementById(buttonId);
        if (!button) continue;
        button.disabled = false;
        button.removeAttribute?.('aria-disabled');
        button.removeAttribute?.('data-state');
        button.removeAttribute?.('data-sub');
        button.classList?.remove?.('aiming', 'cooldown', 'on-cooldown', 'no-uses');
        for (const property of ['backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat']) {
          if (button.style) button.style[property] = '';
        }
      }
    }
    return mode;
  };

  const beginJoystick = event => {
    const rect = joystickElement.getBoundingClientRect();
    joystickCenter = {
      x: event.clientX,
      y: event.clientY,
      localX: event.clientX - rect.left,
      localY: event.clientY - rect.top,
    };
    stickElement.style.left = `${joystickCenter.localX}px`;
    stickElement.style.top = `${joystickCenter.localY}px`;
    stickElement.classList?.add?.('tc-visible');
    updateJoystick(event);
  };

  const updateJoystick = event => {
    if (!joystickCenter) return;
    const radius = 43;
    let dx = event.clientX - joystickCenter.x;
    let dy = event.clientY - joystickCenter.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    if (magnitude > radius) {
      dx *= radius / magnitude;
      dy *= radius / magnitude;
    }
    joystickKnobElement.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px)`;
    activeAdapter()?.move?.({ x: dx / radius, z: dy / radius, active: true });
  };

  const endJoystick = reason => {
    joystickCenter = null;
    stickElement.classList?.remove?.('tc-visible');
    joystickKnobElement.style.transform = 'translate(-50%,-50%)';
    activeAdapter()?.move?.({ x: 0, z: 0, active: false, reason });
  };

  const pointerInput = bindMobileDualPointerInput({
    windowLike,
    documentLike,
    joystickElement,
    cameraElement,
    onJoystickStart: beginJoystick,
    onJoystickMove: updateJoystick,
    onJoystickEnd: endJoystick,
    onCameraStart: event => {
      cameraPoint = { x: event.clientX, y: event.clientY };
      activeAdapter()?.camera?.({ phase: 'start', x: event.clientX, y: event.clientY, dx: 0, dy: 0 });
    },
    onCameraMove: event => {
      const previous = cameraPoint || { x: event.clientX, y: event.clientY };
      const payload = {
        phase: 'move',
        x: event.clientX,
        y: event.clientY,
        dx: event.clientX - previous.x,
        dy: event.clientY - previous.y,
      };
      cameraPoint = { x: event.clientX, y: event.clientY };
      activeAdapter()?.camera?.(payload);
    },
    onCameraEnd: reason => {
      cameraPoint = null;
      activeAdapter()?.camera?.({ phase: 'end', reason });
    },
  });

  const stopPirateAction = event => {
    if (activeAdapter()?.interceptActions !== true) return false;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    return true;
  };

  for (const [buttonId, action] of Object.entries(ACTION_BUTTONS)) {
    const button = documentLike.getElementById(buttonId);
    if (!button) continue;
    button.addEventListener('pointerdown', event => {
      if (!stopPirateAction(event) || actionPointers.has(event.pointerId)) return;
      actionPointers.set(event.pointerId, { action, button });
      try { button.setPointerCapture?.(event.pointerId); } catch {}
      activeAdapter()?.action?.({ action, phase: 'start', pointerId: event.pointerId });
    }, { capture: true, passive: false });
    const finish = event => {
      const active = actionPointers.get(event.pointerId);
      if (!active || active.button !== button) return;
      stopPirateAction(event);
      actionPointers.delete(event.pointerId);
      try { button.releasePointerCapture?.(event.pointerId); } catch {}
      activeAdapter()?.action?.({
        action: active.action,
        phase: event.type === 'pointercancel' ? 'cancel' : 'end',
        pointerId: event.pointerId,
      });
    };
    button.addEventListener('pointerup', finish, { capture: true, passive: false });
    button.addEventListener('pointercancel', finish, { capture: true, passive: false });
  }

  const reset = (reason = 'reset') => {
    pointerInput.reset(reason);
    for (const { action } of actionPointers.values()) {
      activeAdapter()?.action?.({ action, phase: 'cancel', reason });
    }
    actionPointers.clear();
    cameraPoint = null;
    joystickCenter = null;
    stickElement.classList?.remove?.('tc-visible');
    joystickKnobElement.style.transform = 'translate(-50%,-50%)';
    activeAdapter()?.reset?.(reason);
  };

  const api = Object.freeze({
    kind: UNIFIED_MOBILE_CONTROLS_KIND,
    registerAdapter(worldId, adapter) {
      if (typeof worldId !== 'string' || !adapter || typeof adapter !== 'object') return false;
      adapters.set(worldId, adapter);
      if (worldId === activeWorldId) adapter.activate?.();
      return true;
    },
    activate(worldId) {
      if (typeof worldId !== 'string' || !worldId) return false;
      if (activeWorldId === worldId) {
        setControlMode(worldId);
        activeAdapter()?.activate?.();
        return true;
      }
      reset('world-switch');
      activeWorldId = worldId;
      setControlMode(worldId);
      activeAdapter()?.activate?.();
      return true;
    },
    reset,
    diagnostics: () => Object.freeze({
      activeWorldId,
      controlMode: controlSurface.dataset.controlMode,
      adapters: Object.freeze([...adapters.keys()]),
      actionPointerCount: actionPointers.size,
      pointerInput: pointerInput.diagnostics(),
    }),
  });
  return api;
}

export const unifiedMobileControls = typeof window !== 'undefined' && typeof document !== 'undefined'
  ? createUnifiedMobileControls()
  : null;
if (typeof window !== 'undefined' && unifiedMobileControls) {
  window.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS = unifiedMobileControls;
}
