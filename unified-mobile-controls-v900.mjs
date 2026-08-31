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
});

export function createUnifiedMobileControls({
  windowLike = globalThis.window,
  documentLike = globalThis.document,
} = {}) {
  const joystickElement = documentLike?.getElementById?.('joystick');
  const stickElement = documentLike?.getElementById?.('stick');
  const cameraElement = documentLike?.getElementById?.('cameraPad');
  if (!joystickElement || !stickElement || !cameraElement) {
    throw new Error('Unified mobile controls require #joystick, #stick, and #cameraPad');
  }

  const adapters = new Map();
  const actionPointers = new Map();
  let activeWorldId = null;
  let cameraPoint = null;

  const activeAdapter = () => adapters.get(activeWorldId) || null;

  const updateJoystick = event => {
    const rect = joystickElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.max(1, rect.width * .34);
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const magnitude = Math.hypot(dx, dy) || 1;
    if (magnitude > radius) {
      dx *= radius / magnitude;
      dy *= radius / magnitude;
    }
    stickElement.style.transform = `translate(${dx}px,${dy}px)`;
    activeAdapter()?.move?.({ x: dx / radius, z: dy / radius, active: true });
  };

  const endJoystick = reason => {
    stickElement.style.transform = 'translate(0,0)';
    activeAdapter()?.move?.({ x: 0, z: 0, active: false, reason });
  };

  const pointerInput = bindMobileDualPointerInput({
    windowLike,
    documentLike,
    joystickElement,
    cameraElement,
    onJoystickStart: updateJoystick,
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
    stickElement.style.transform = 'translate(0,0)';
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
        activeAdapter()?.activate?.();
        return true;
      }
      reset('world-switch');
      activeWorldId = worldId;
      activeAdapter()?.activate?.();
      return true;
    },
    reset,
    diagnostics: () => Object.freeze({
      activeWorldId,
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
