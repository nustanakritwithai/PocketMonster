import assert from 'node:assert/strict';

import {
  MOBILE_DUAL_POINTER_INPUT_KIND,
  bindMobileDualPointerInput,
} from '../mobile-dual-pointer-input-v900.mjs';

class FakeTarget extends EventTarget {
  constructor() {
    super();
    this.style = {};
  }
}

function pointerEvent(type, pointerId, x, y) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: x },
    clientY: { value: y },
  });
  return event;
}

const windowLike = new FakeTarget();
const documentLike = new FakeTarget();
documentLike.visibilityState = 'visible';
const joystick = new FakeTarget();
const camera = new FakeTarget();
const calls = [];

const input = bindMobileDualPointerInput({
  windowLike,
  documentLike,
  joystickElement: joystick,
  cameraElement: camera,
  onJoystickStart: event => calls.push(['joy-start', event.pointerId]),
  onJoystickMove: event => calls.push(['joy-move', event.pointerId, event.clientX]),
  onJoystickEnd: reason => calls.push(['joy-end', reason]),
  onCameraStart: event => calls.push(['camera-start', event.pointerId]),
  onCameraMove: event => calls.push(['camera-move', event.pointerId, event.clientX]),
  onCameraEnd: reason => calls.push(['camera-end', reason]),
});

assert.equal(input.kind, MOBILE_DUAL_POINTER_INPUT_KIND);
assert.equal(joystick.style.touchAction, 'none');
assert.equal(camera.style.touchAction, 'none');

const joyStart = pointerEvent('pointerdown', 11, 20, 30);
joystick.dispatchEvent(joyStart);
assert.equal(joyStart.defaultPrevented, true);
const cameraStart = pointerEvent('pointerdown', 22, 220, 80);
camera.dispatchEvent(cameraStart);
assert.equal(cameraStart.defaultPrevented, true);
assert.deepEqual(input.diagnostics(), {
  joystickPointerId: 11,
  cameraPointerId: 22,
  resetCount: 0,
});

windowLike.dispatchEvent(pointerEvent('pointermove', 11, 28, 31));
windowLike.dispatchEvent(pointerEvent('pointermove', 22, 206, 84));
assert.deepEqual(calls.slice(0, 4), [
  ['joy-start', 11],
  ['camera-start', 22],
  ['joy-move', 11, 28],
  ['camera-move', 22, 206],
], 'two simultaneous pointers move independently without element pointer capture');

windowLike.dispatchEvent(pointerEvent('pointerup', 11, 28, 31));
assert.equal(input.diagnostics().joystickPointerId, null);
assert.equal(input.diagnostics().cameraPointerId, 22, 'ending joystick cannot cancel camera drag');
windowLike.dispatchEvent(pointerEvent('pointercancel', 22, 206, 84));
assert.equal(input.diagnostics().cameraPointerId, null);

joystick.dispatchEvent(pointerEvent('pointerdown', 33, 40, 50));
camera.dispatchEvent(pointerEvent('pointerdown', 44, 240, 90));
windowLike.dispatchEvent(new Event('blur'));
assert.deepEqual(input.diagnostics(), {
  joystickPointerId: null,
  cameraPointerId: null,
  resetCount: 1,
}, 'focus loss clears stale pointers left by fullscreen or scene transitions');

joystick.dispatchEvent(pointerEvent('pointerdown', 55, 40, 50));
documentLike.visibilityState = 'hidden';
documentLike.dispatchEvent(new Event('visibilitychange'));
assert.equal(input.diagnostics().joystickPointerId, null);
assert.equal(input.diagnostics().resetCount, 2);

input.dispose();
joystick.dispatchEvent(pointerEvent('pointerdown', 66, 40, 50));
assert.equal(input.diagnostics().joystickPointerId, null, 'disposed scene cannot retain input listeners');

console.log('V9 Pocket mobile dual-pointer lifecycle: PASS');
