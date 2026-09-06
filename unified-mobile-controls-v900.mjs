import { bindMobileDualPointerInput } from './mobile-dual-pointer-input-v900.mjs?v=3';

export const UNIFIED_MOBILE_CONTROLS_KIND = 'monsterlife-unified-mobile-controls-v1';
export const PIRATE_UNIFIED_INPUT_READY_MESSAGE = 'pocketmonster:unified-mobile-input-ready-v1';

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Gate the parent-owned controls behind the current Pirate iframe generation.
 * Input is deliberately never queued: a gesture which began before readiness
 * must end locally and the player must start a fresh gesture after readiness.
 */
export function createPirateIframeInputTransport({
  frame,
  inputMessageType = 'pocketmonster:unified-mobile-input-v1',
  resetParentInput = () => {},
} = {}) {
  if (!frame || typeof inputMessageType !== 'string' || !inputMessageType) {
    throw new TypeError('Pirate iframe input transport requires a frame and message type');
  }

  let frameGeneration = 0;
  let readyGeneration = 0;
  let activeCameraGestureId = null;
  let cameraGestureHighWater = 0;
  let droppedInputCount = 0;

  const ready = () => frameGeneration > 0 && readyGeneration === frameGeneration;
  const post = payload => {
    if (!ready()) {
      droppedInputCount += 1;
      return false;
    }
    const frameWindow = frame.contentWindow;
    if (!frameWindow?.postMessage) {
      droppedInputCount += 1;
      return false;
    }
    frameWindow.postMessage({
      ...payload,
      type: inputMessageType,
      frameGeneration,
    }, '*');
    return true;
  };

  const reset = (reason = 'reset') => {
    activeCameraGestureId = null;
    return post({ kind: 'reset', reason });
  };

  return Object.freeze({
    beginGeneration(reason = 'frame-load') {
      if (frameGeneration >= Number.MAX_SAFE_INTEGER) return false;
      frameGeneration += 1;
      readyGeneration = 0;
      activeCameraGestureId = null;
      resetParentInput(`pirate-input-${reason}`);
      return true;
    },
    acceptReady(event) {
      if (event?.source !== frame.contentWindow
        || event?.origin !== 'null'
        || event?.data?.type !== PIRATE_UNIFIED_INPUT_READY_MESSAGE
        || frameGeneration <= 0) return false;
      if (ready()) return true;
      // Clear any physical gesture which began while the iframe was loading.
      // The adapter reset caused by this call is still gated because readiness
      // is committed only afterwards.
      resetParentInput('pirate-input-ready');
      activeCameraGestureId = null;
      readyGeneration = frameGeneration;
      post({ kind: 'reset', reason: 'pirate-input-ready' });
      return true;
    },
    move(payload) { return post({ kind: 'move', ...payload }); },
    action(payload) { return post({ kind: 'action', ...payload }); },
    camera(payload = {}) {
      const { phase, gestureId } = payload;
      if (!positiveInteger(gestureId)) {
        droppedInputCount += 1;
        return false;
      }
      if (phase === 'start') {
        if (!ready() || activeCameraGestureId !== null || gestureId <= cameraGestureHighWater) {
          droppedInputCount += 1;
          return false;
        }
        activeCameraGestureId = gestureId;
        cameraGestureHighWater = gestureId;
        const sent = post({ kind: 'camera', ...payload });
        if (!sent) activeCameraGestureId = null;
        return sent;
      }
      if (!ready() || activeCameraGestureId !== gestureId || !['move', 'end'].includes(phase)) {
        droppedInputCount += 1;
        return false;
      }
      const sent = post({ kind: 'camera', ...payload });
      if (phase === 'end') activeCameraGestureId = null;
      return sent;
    },
    reset,
    diagnostics: () => Object.freeze({
      frameGeneration,
      readyGeneration,
      ready: ready(),
      activeCameraGestureId,
      cameraGestureHighWater,
      droppedInputCount,
    }),
  });
}

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

const POCKET_ACTION_IDS = Object.freeze({
  skill1: 'skill-1',
  skill2: 'skill-2',
  skill3: 'skill-3',
  skill4: 'skill-4',
  capture: 'capture',
  summon: 'summon',
  recall: 'recall',
  block: 'block',
  weapon: 'weapon',
  potion1: 'potion1',
  potion2: 'potion2',
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
  let activeCameraGestureId = null;
  let cameraGestureSequence = 0;
  let joystickCenter = null;

  const activeAdapter = () => adapters.get(activeWorldId) || null;

  let visualUnsubscribe = null;

  const paintActionButton = (button, item) => {
    if (!button) return;
    const classList = button.classList;
    if (!item) {
      classList?.remove?.('cooling', 'pressed', 'unavailable');
      classList?.add?.('empty');
      button.removeAttribute?.('data-cd');
      button.removeAttribute?.('data-count');
      button.removeAttribute?.('data-reason');
      button.removeAttribute?.('aria-disabled');
      button.style?.removeProperty?.('--cooldown');
      return;
    }
    classList?.remove?.('empty');
    classList?.toggle?.('pressed', item.pressed === true);
    const enabled = item.enabled !== false;
    classList?.toggle?.('unavailable', !enabled);
    if (enabled) button.removeAttribute?.('aria-disabled');
    else button.setAttribute?.('aria-disabled', 'true');
    if (item.reason) {
      button.setAttribute?.('title', item.reason);
      button.setAttribute?.('data-reason', item.reason);
    } else {
      button.removeAttribute?.('title');
      button.removeAttribute?.('data-reason');
    }
    const remaining = typeof item.cooldownRemaining === 'number' && Number.isFinite(item.cooldownRemaining) ? item.cooldownRemaining : 0;
    const total = typeof item.cooldownTotal === 'number' && Number.isFinite(item.cooldownTotal) ? item.cooldownTotal : 0;
    const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
    classList?.toggle?.('cooling', pct > 0);
    button.style?.setProperty?.('--cooldown', `${pct}%`);
    if (pct > 0) button.setAttribute?.('data-cd', String(Math.ceil(remaining)));
    else button.removeAttribute?.('data-cd');
    if (typeof item.count === 'number' && item.count > 0) button.setAttribute?.('data-count', String(item.count));
    else button.removeAttribute?.('data-count');
    if (item.state) button.setAttribute?.('data-state', item.state);
    else button.removeAttribute?.('data-state');
  };

  const applyActionVisuals = snapshot => {
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
    const byId = new Map(items.map(item => [item.id, item]));
    for (const [buttonId, action] of Object.entries(ACTION_BUTTONS)) {
      const button = documentLike.getElementById(buttonId);
      if (!button) continue;
      const pocketId = POCKET_ACTION_IDS[action];
      paintActionButton(button, byId.get(pocketId) || byId.get(action) || null);
    }
  };

  const bindActionVisuals = () => {
    if (typeof visualUnsubscribe === 'function') {
      try { visualUnsubscribe(); } catch {}
      visualUnsubscribe = null;
    }
    const mode = controlSurface.dataset.controlMode;
    const actions = windowLike?.POCKETMONSTER_POCKET_HUD?.actions;
    if (mode === 'capture' && actions?.subscribe) {
      visualUnsubscribe = actions.subscribe(applyActionVisuals);
      return;
    }
    applyActionVisuals({ items: [] });
    if (mode === 'pirate') {
      for (const buttonId of Object.keys(ACTION_BUTTONS)) {
        const button = documentLike.getElementById(buttonId);
        if (!button) continue;
        button.classList?.remove?.('empty', 'cooling', 'pressed', 'unavailable');
        button.removeAttribute?.('data-cd');
        button.removeAttribute?.('data-count');
        button.removeAttribute?.('data-reason');
        button.style?.removeProperty?.('--cooldown');
      }
    }
  };

  const setControlMode = worldId => {
    const panelId = documentLike?.body?.dataset?.controlPanel;
    const mode = (panelId === 'throw' || worldId === 'pocket-monster')
      ? 'capture'
      : (CONTROL_MODES[worldId] || 'travel');
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
    bindActionVisuals();
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
      cameraGestureSequence += 1;
      activeCameraGestureId = cameraGestureSequence;
      cameraPoint = { x: event.clientX, y: event.clientY };
      activeAdapter()?.camera?.({
        phase: 'start',
        gestureId: activeCameraGestureId,
        x: event.clientX,
        y: event.clientY,
        dx: 0,
        dy: 0,
      });
    },
    onCameraMove: event => {
      if (activeCameraGestureId === null) return;
      const previous = cameraPoint || { x: event.clientX, y: event.clientY };
      const payload = {
        phase: 'move',
        gestureId: activeCameraGestureId,
        x: event.clientX,
        y: event.clientY,
        dx: event.clientX - previous.x,
        dy: event.clientY - previous.y,
      };
      cameraPoint = { x: event.clientX, y: event.clientY };
      activeAdapter()?.camera?.(payload);
    },
    onCameraEnd: reason => {
      const gestureId = activeCameraGestureId;
      cameraPoint = null;
      activeCameraGestureId = null;
      if (gestureId !== null) activeAdapter()?.camera?.({ phase: 'end', gestureId, reason });
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
    activeCameraGestureId = null;
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
      bindActionVisuals();
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
      cameraGestureSequence,
      activeCameraGestureId,
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
