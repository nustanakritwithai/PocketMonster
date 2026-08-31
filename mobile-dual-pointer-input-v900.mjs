export const MOBILE_DUAL_POINTER_INPUT_KIND = 'monsterlife-mobile-dual-pointer-input-v1';

function validPointerId(value) {
  return Number.isFinite(value) ? value : null;
}

export function bindMobileDualPointerInput({
  windowLike = globalThis.window,
  documentLike = globalThis.document,
  joystickElement,
  cameraElement,
  onJoystickStart = () => {},
  onJoystickMove = () => {},
  onJoystickEnd = () => {},
  onCameraStart = () => {},
  onCameraMove = () => {},
  onCameraEnd = () => {},
} = {}) {
  if (!windowLike?.addEventListener
    || !documentLike?.addEventListener
    || !joystickElement?.addEventListener
    || !cameraElement?.addEventListener) {
    throw new TypeError('Mobile dual-pointer input requires window, document, joystick, and camera targets');
  }

  let joystickPointerId = null;
  let cameraPointerId = null;
  let resetCount = 0;
  let disposed = false;

  if (joystickElement.style) joystickElement.style.touchAction = 'none';
  if (cameraElement.style) cameraElement.style.touchAction = 'none';

  const preventGesture = event => {
    if (event?.cancelable) event.preventDefault();
  };

  const capturePointer = (element, pointerId) => {
    try { element.setPointerCapture?.(pointerId); } catch {}
  };

  const releasePointer = (element, pointerId) => {
    if (pointerId === null) return;
    try {
      if (element.hasPointerCapture?.(pointerId) !== false) element.releasePointerCapture?.(pointerId);
    } catch {}
  };

  const startJoystick = event => {
    const pointerId = validPointerId(event?.pointerId);
    if (disposed || pointerId === null || joystickPointerId !== null || pointerId === cameraPointerId) return;
    preventGesture(event);
    joystickPointerId = pointerId;
    capturePointer(joystickElement, pointerId);
    onJoystickStart(event);
  };

  const startCamera = event => {
    const pointerId = validPointerId(event?.pointerId);
    if (disposed || pointerId === null || cameraPointerId !== null || pointerId === joystickPointerId) return;
    preventGesture(event);
    cameraPointerId = pointerId;
    capturePointer(cameraElement, pointerId);
    onCameraStart(event);
  };

  const movePointer = event => {
    if (disposed) return;
    if (event?.pointerId === joystickPointerId) {
      preventGesture(event);
      onJoystickMove(event);
    } else if (event?.pointerId === cameraPointerId) {
      preventGesture(event);
      onCameraMove(event);
    }
  };

  const endPointer = (event, reason = event?.type || 'pointer-end') => {
    if (disposed) return;
    if (event?.pointerId === joystickPointerId) {
      preventGesture(event);
      releasePointer(joystickElement, joystickPointerId);
      joystickPointerId = null;
      onJoystickEnd(reason);
    }
    if (event?.pointerId === cameraPointerId) {
      preventGesture(event);
      releasePointer(cameraElement, cameraPointerId);
      cameraPointerId = null;
      onCameraEnd(reason);
    }
  };

  const reset = (reason = 'reset') => {
    if (disposed) return false;
    const hadJoystick = joystickPointerId !== null;
    const hadCamera = cameraPointerId !== null;
    releasePointer(joystickElement, joystickPointerId);
    releasePointer(cameraElement, cameraPointerId);
    joystickPointerId = null;
    cameraPointerId = null;
    if (hadJoystick) onJoystickEnd(reason);
    if (hadCamera) onCameraEnd(reason);
    resetCount += 1;
    return hadJoystick || hadCamera;
  };

  const onPointerUp = event => endPointer(event, 'pointerup');
  const onPointerCancel = event => endPointer(event, 'pointercancel');
  const onBlur = () => reset('blur');
  const onPageHide = () => reset('pagehide');
  const onVisibilityChange = () => {
    if (documentLike.visibilityState === 'hidden') reset('visibility-hidden');
  };

  joystickElement.addEventListener('pointerdown', startJoystick, { passive: false });
  cameraElement.addEventListener('pointerdown', startCamera, { passive: false });
  windowLike.addEventListener('pointermove', movePointer, { capture: true, passive: false });
  windowLike.addEventListener('pointerup', onPointerUp, { capture: true, passive: false });
  windowLike.addEventListener('pointercancel', onPointerCancel, { capture: true, passive: false });
  windowLike.addEventListener('blur', onBlur);
  windowLike.addEventListener('pagehide', onPageHide);
  documentLike.addEventListener('visibilitychange', onVisibilityChange);

  return Object.freeze({
    kind: MOBILE_DUAL_POINTER_INPUT_KIND,
    reset,
    diagnostics: () => Object.freeze({ joystickPointerId, cameraPointerId, resetCount }),
    dispose() {
      if (disposed) return false;
      reset('dispose');
      disposed = true;
      joystickElement.removeEventListener('pointerdown', startJoystick);
      cameraElement.removeEventListener('pointerdown', startCamera);
      windowLike.removeEventListener('pointermove', movePointer, true);
      windowLike.removeEventListener('pointerup', onPointerUp, true);
      windowLike.removeEventListener('pointercancel', onPointerCancel, true);
      windowLike.removeEventListener('blur', onBlur);
      windowLike.removeEventListener('pagehide', onPageHide);
      documentLike.removeEventListener('visibilitychange', onVisibilityChange);
      return true;
    },
  });
}
