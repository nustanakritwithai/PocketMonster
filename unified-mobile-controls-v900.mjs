import { bindMobileDualPointerInput } from './mobile-dual-pointer-input-v900.mjs?v=9';

export const UNIFIED_MOBILE_CONTROLS_KIND = 'monsterlife-unified-mobile-controls-v1';
export const PIRATE_UNIFIED_INPUT_READY_MESSAGE = 'pocketmonster:unified-mobile-input-ready-v1';
export const PIRATE_UNIFIED_INPUT_MODE_MESSAGE = 'pocketmonster:unified-mobile-input-mode-v1';
export const PIRATE_UNIFIED_INPUT_INTERACTION_MESSAGE = 'pocketmonster:unified-mobile-input-interaction-v1';
export const PIRATE_CONTROL_MODE_EVENT = 'pocketmonster:pirate-control-mode-v1';
export const PIRATE_HELM_PROMPT_EVENT = 'pocketmonster:pirate-helm-prompt-v1';

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
  windowLike = globalThis.window,
} = {}) {
  if (!frame || typeof inputMessageType !== 'string' || !inputMessageType) {
    throw new TypeError('Pirate iframe input transport requires a frame and message type');
  }

  let frameGeneration = 0;
  let readyGeneration = 0;
  let activeCameraGestureId = null;
  let cameraGestureHighWater = 0;
  let droppedInputCount = 0;
  let nativeControlMode = 'player';
  let nativeHelmPrompt = null;

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

  const announceNativeControlMode = controlMode => {
    if (!['player', 'boat'].includes(controlMode) || controlMode === nativeControlMode) return false;
    nativeControlMode = controlMode;
    const detail = Object.freeze({ controlMode, frameGeneration });
    let modeEvent;
    if (typeof CustomEvent === 'function') {
      modeEvent = new CustomEvent(PIRATE_CONTROL_MODE_EVENT, { detail });
    } else {
      modeEvent = new Event(PIRATE_CONTROL_MODE_EVENT);
      Object.defineProperty(modeEvent, 'detail', { value: detail });
    }
    windowLike?.dispatchEvent?.(modeEvent);
    return true;
  };

  const announceNativeHelmPrompt = helmPrompt => {
    const nextPrompt = ['enter', 'leave'].includes(helmPrompt) ? helmPrompt : null;
    if (nextPrompt === nativeHelmPrompt) return false;
    nativeHelmPrompt = nextPrompt;
    const detail = Object.freeze({ helmPrompt: nextPrompt, frameGeneration });
    let promptEvent;
    if (typeof CustomEvent === 'function') {
      promptEvent = new CustomEvent(PIRATE_HELM_PROMPT_EVENT, { detail });
    } else {
      promptEvent = new Event(PIRATE_HELM_PROMPT_EVENT);
      Object.defineProperty(promptEvent, 'detail', { value: detail });
    }
    windowLike?.dispatchEvent?.(promptEvent);
    return true;
  };

  return Object.freeze({
    beginGeneration(reason = 'frame-load') {
      if (frameGeneration >= Number.MAX_SAFE_INTEGER) return false;
      frameGeneration += 1;
      readyGeneration = 0;
      activeCameraGestureId = null;
      // A replacement child starts in the normal player HUD until that exact
      // generation reports its own native mode. This clears a prior frame's
      // boat layout without manufacturing an interaction or boat intent.
      nativeControlMode = null;
      announceNativeControlMode('player');
      nativeHelmPrompt = 'leave';
      announceNativeHelmPrompt(null);
      resetParentInput(`pirate-input-${reason}`);
      return true;
    },
    acceptReady(event) {
      if (event?.source !== frame.contentWindow || event?.origin !== 'null' || frameGeneration <= 0) return false;
      if (event?.data?.type === PIRATE_UNIFIED_INPUT_MODE_MESSAGE) {
        if (!ready() || event.data.frameGeneration !== frameGeneration) return false;
        if (!['player', 'boat'].includes(event.data.controlMode)) return false;
        announceNativeControlMode(event.data.controlMode);
        return true;
      }
      if (event?.data?.type === PIRATE_UNIFIED_INPUT_INTERACTION_MESSAGE) {
        if (!ready() || event.data.frameGeneration !== frameGeneration) return false;
        if (event.data.helmPrompt !== null && !['enter', 'leave'].includes(event.data.helmPrompt)) return false;
        announceNativeHelmPrompt(event.data.helmPrompt);
        return true;
      }
      if (event?.data?.type !== PIRATE_UNIFIED_INPUT_READY_MESSAGE) return false;
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
      nativeControlMode,
      nativeHelmPrompt,
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
  pirateHelmBtn: 'interact',
  piratePotion1Btn: 'potion1',
  piratePotion2Btn: 'potion2',
  pirateZoomInBtn: 'zoomIn',
  pirateZoomOutBtn: 'zoomOut',
});

const PIRATE_BOAT_ACTION_BUTTONS = Object.freeze({
  captureBtn: 'cannonRight',
  skill1Btn: 'cannonLeft',
  pirateHelmBtn: 'interact',
  piratePotion1Btn: 'potion1',
  piratePotion2Btn: 'potion2',
  pirateZoomInBtn: 'zoomIn',
  pirateZoomOutBtn: 'zoomOut',
});

const PIRATE_PLAYER_BUTTON_STATE = Object.freeze({
  skill1Btn: { icon: '1', label: 'สกิล Pirate 1' },
  skill2Btn: { icon: '2', label: 'สกิล Pirate 2' },
  skill3Btn: { icon: '3', label: 'สกิล Pirate 3' },
  skill4Btn: { icon: 'ULT', label: 'ท่าไม้ตาย Pirate' },
  captureBtn: { icon: '⚔', label: 'โจมตี' },
  summonBtn: { icon: '💨', label: 'แดช' },
  recallBtn: { icon: '⬆', label: 'กระโดด' },
  pirateBlockBtn: { icon: '🛡', label: 'ป้องกัน' },
  pirateWeaponBtn: { icon: '👊', label: 'เปลี่ยนอาวุธ' },
  piratePotion1Btn: { icon: 'ยา', label: 'ใช้ยา 1' },
  piratePotion2Btn: { icon: 'ยา2', label: 'ใช้ยา 2' },
  pirateZoomInBtn: { icon: '＋', label: 'ซูมเข้า' },
  pirateZoomOutBtn: { icon: '−', label: 'ซูมออก' },
});

const PIRATE_BOAT_BUTTON_STATE = Object.freeze({
  captureBtn: { icon: '💣▶', label: 'ยิงปืนใหญ่กราบขวา' },
  skill1Btn: { icon: '◀💣', label: 'ยิงปืนใหญ่กราบซ้าย' },
  pirateHelmBtn: { icon: '☸', label: 'ปล่อยพวงมาลัย' },
  piratePotion1Btn: PIRATE_PLAYER_BUTTON_STATE.piratePotion1Btn,
  piratePotion2Btn: PIRATE_PLAYER_BUTTON_STATE.piratePotion2Btn,
  pirateZoomInBtn: PIRATE_PLAYER_BUTTON_STATE.pirateZoomInBtn,
  pirateZoomOutBtn: PIRATE_PLAYER_BUTTON_STATE.pirateZoomOutBtn,
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
  let pirateControlMode = 'player';
  let pirateHelmPrompt = null;

  const activeAdapter = () => adapters.get(activeWorldId) || null;

  let visualUnsubscribe = null;

  const setImportantStyle = (button, property, value) => {
    if (!button?.style) return;
    if (typeof button.style.setProperty === 'function') button.style.setProperty(property, value, 'important');
    else button.style[property] = value;
  };

  const clearInlineStyle = (button, property) => {
    if (!button?.style) return;
    if (typeof button.style.removeProperty === 'function') button.style.removeProperty(property);
    else delete button.style[property];
  };

  const setPirateButton = (buttonId, state, visible) => {
    const button = documentLike.getElementById(buttonId);
    if (!button) return;
    if (state) {
      button.setAttribute?.('data-pirate-icon', state.icon);
      button.setAttribute?.('aria-label', state.label);
    }
    setImportantStyle(button, 'display', visible ? 'flex' : 'none');
    setImportantStyle(button, 'pointer-events', visible ? 'auto' : 'none');
  };

  const restorePiratePlayerButtons = () => {
    for (const [buttonId, state] of Object.entries(PIRATE_PLAYER_BUTTON_STATE)) {
      const button = documentLike.getElementById(buttonId);
      if (!button) continue;
      button.setAttribute?.('data-pirate-icon', state.icon);
      button.setAttribute?.('aria-label', state.label);
      clearInlineStyle(button, 'display');
      clearInlineStyle(button, 'pointer-events');
      clearInlineStyle(button, 'right');
      clearInlineStyle(button, 'bottom');
      clearInlineStyle(button, 'width');
      clearInlineStyle(button, 'height');
      clearInlineStyle(button, 'min-width');
      clearInlineStyle(button, 'min-height');
    }
    setPirateButton('pirateHelmBtn', { icon: '☸', label: 'ถือพวงมาลัย' }, false);
    const helm = documentLike.getElementById('pirateHelmBtn');
    clearInlineStyle(helm, 'left');
    clearInlineStyle(helm, 'right');
    clearInlineStyle(helm, 'bottom');
    clearInlineStyle(helm, 'width');
    clearInlineStyle(helm, 'height');
    clearInlineStyle(helm, 'min-width');
    clearInlineStyle(helm, 'min-height');
  };

  const applyPirateBoatButtons = () => {
    for (const buttonId of Object.keys(ACTION_BUTTONS)) {
      const state = PIRATE_BOAT_BUTTON_STATE[buttonId];
      setPirateButton(buttonId, state, Boolean(state));
    }
    const port = documentLike.getElementById('skill1Btn');
    if (port) {
      setImportantStyle(port, 'right', '156px');
      setImportantStyle(port, 'bottom', '18px');
      setImportantStyle(port, 'width', '62px');
      setImportantStyle(port, 'height', '62px');
      setImportantStyle(port, 'min-width', '62px');
      setImportantStyle(port, 'min-height', '62px');
    }
    const starboard = documentLike.getElementById('captureBtn');
    if (starboard) {
      setImportantStyle(starboard, 'right', '14px');
      setImportantStyle(starboard, 'bottom', '18px');
      setImportantStyle(starboard, 'width', '62px');
      setImportantStyle(starboard, 'height', '62px');
      setImportantStyle(starboard, 'min-width', '62px');
      setImportantStyle(starboard, 'min-height', '62px');
    }
  };

  const applyPirateHelmButton = () => {
    const controlMode = controlSurface.dataset.controlMode;
    const helmPrompt = pirateControlMode === 'boat' ? 'leave' : pirateHelmPrompt;
    const visible = controlMode === 'pirate' && helmPrompt !== null;
    setPirateButton('pirateHelmBtn', {
      icon: '☸',
      label: helmPrompt === 'leave' ? 'ปล่อยพวงมาลัย' : 'ถือพวงมาลัย',
    }, visible);
    if (!visible) return;
    const helm = documentLike.getElementById('pirateHelmBtn');
    // The MMORPG chat dock begins at 32.5% of the viewport.  Park the helm
    // just to its left, vertically centered against the chat dock, so it does
    // not compete with either broadside cannon or the chat input itself.
    setImportantStyle(helm, 'left', 'max(8px, calc(32.5% - 72px))');
    setImportantStyle(helm, 'right', 'auto');
    setImportantStyle(helm, 'bottom', 'calc((var(--hud-dock-expanded) - 62px) / 2)');
    setImportantStyle(helm, 'width', '62px');
    setImportantStyle(helm, 'height', '62px');
    setImportantStyle(helm, 'min-width', '62px');
    setImportantStyle(helm, 'min-height', '62px');
  };

  const actionForButton = buttonId => (
    activeWorldId === 'pirate-fruit' && pirateControlMode === 'boat'
      ? PIRATE_BOAT_ACTION_BUTTONS[buttonId] ?? null
      : ACTION_BUTTONS[buttonId] ?? null
  );

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
    if (mode === 'pirate') controlSurface.dataset.pirateControlMode = pirateControlMode;
    else delete controlSurface.dataset.pirateControlMode;
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
    if (mode === 'pirate' && pirateControlMode === 'boat') applyPirateBoatButtons();
    else restorePiratePlayerButtons();
    applyPirateHelmButton();
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

  for (const buttonId of Object.keys(ACTION_BUTTONS)) {
    const button = documentLike.getElementById(buttonId);
    if (!button) continue;
    button.addEventListener('pointerdown', event => {
      const action = actionForButton(buttonId);
      if (!action || !stopPirateAction(event) || actionPointers.has(event.pointerId)) return;
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
        phase: event.type === 'pointerup' ? 'end' : 'cancel',
        pointerId: event.pointerId,
      });
    };
    button.addEventListener('pointerup', finish, { capture: true, passive: false });
    button.addEventListener('pointercancel', finish, { capture: true, passive: false });
    button.addEventListener('lostpointercapture', finish, { capture: true, passive: false });
  }

  const reset = (reason = 'reset') => {
    pointerInput.reset(reason);
    const pendingActions = [...actionPointers];
    actionPointers.clear();
    for (const [pointerId, { action, button }] of pendingActions) {
      try { button.releasePointerCapture?.(pointerId); } catch {}
      activeAdapter()?.action?.({ action, phase: 'cancel', reason });
    }
    cameraPoint = null;
    activeCameraGestureId = null;
    joystickCenter = null;
    stickElement.classList?.remove?.('tc-visible');
    joystickKnobElement.style.transform = 'translate(-50%,-50%)';
    activeAdapter()?.reset?.(reason);
  };

  const setPirateControlMode = nextMode => {
    if (!['player', 'boat'].includes(nextMode) || nextMode === pirateControlMode) return false;
    // Finish every parent gesture before changing what its button represents.
    // The native child is authoritative for board/deck/helm and this does not
    // manufacture an interaction or a boat intent.
    if (activeWorldId === 'pirate-fruit') reset('pirate-control-mode-change');
    pirateControlMode = nextMode;
    if (activeWorldId === 'pirate-fruit') setControlMode(activeWorldId);
    return true;
  };

  windowLike?.addEventListener?.(PIRATE_CONTROL_MODE_EVENT, event => {
    const nextMode = event?.detail?.controlMode;
    setPirateControlMode(nextMode);
  });

  windowLike?.addEventListener?.(PIRATE_HELM_PROMPT_EVENT, event => {
    const nextPrompt = ['enter', 'leave'].includes(event?.detail?.helmPrompt)
      ? event.detail.helmPrompt
      : null;
    if (nextPrompt === pirateHelmPrompt) return;
    pirateHelmPrompt = nextPrompt;
    if (activeWorldId === 'pirate-fruit') setControlMode(activeWorldId);
  });
  for (const type of ['blur', 'pagehide', 'orientationchange']) {
    windowLike.addEventListener(type, () => reset(type));
  }
  for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
    documentLike.addEventListener(type, () => reset(type));
  }
  documentLike.addEventListener('visibilitychange', () => {
    if (documentLike.visibilityState === 'hidden') reset('visibility-hidden');
  });

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
      pirateControlMode,
      pirateHelmPrompt,
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
