import assert from 'node:assert/strict';

import {
  MOBILE_DUAL_POINTER_INPUT_KIND,
  bindMobileDualPointerInput,
} from '../mobile-dual-pointer-input-v900.mjs';

class FakeTarget extends EventTarget {
  constructor(rect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 }) {
    super();
    this.style = {};
    this.capturedPointers = new Set();
    this.rect = rect;
  }

  getBoundingClientRect() { return this.rect; }

  setPointerCapture(pointerId) { this.capturedPointers.add(pointerId); }
  hasPointerCapture(pointerId) { return this.capturedPointers.has(pointerId); }
  releasePointerCapture(pointerId) {
    if (!this.capturedPointers.delete(pointerId)) return;
    this.dispatchEvent(pointerEvent('lostpointercapture', pointerId, 0, 0));
  }

  losePointerCapture(pointerId) { this.releasePointerCapture(pointerId); }
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
const joystick = new FakeTarget({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400 });
const camera = new FakeTarget({ left: 200, top: 0, width: 200, height: 400, right: 400, bottom: 400 });
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
assert.deepEqual([...joystick.capturedPointers], [11]);
assert.deepEqual([...camera.capturedPointers], [22], 'each control surface captures only its own pointer');

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
assert.equal(joystick.capturedPointers.size, 0);
assert.equal(camera.capturedPointers.size, 0);
assert.equal(calls.filter(([kind]) => kind === 'joy-end').length, 1,
  'pointerup plus capture release emits one joystick terminal callback');
assert.equal(calls.filter(([kind]) => kind === 'camera-end').length, 1,
  'pointercancel plus capture release emits one camera terminal callback');

joystick.dispatchEvent(pointerEvent('pointerdown', 31, 40, 50));
joystick.losePointerCapture(31);
assert.equal(input.diagnostics().joystickPointerId, null,
  'unexpected joystick capture loss clears the active pointer');
assert.deepEqual(calls.at(-1), ['joy-end', 'lostpointercapture']);
const joyEndsAfterCaptureLoss = calls.filter(([kind]) => kind === 'joy-end').length;
windowLike.dispatchEvent(pointerEvent('pointerup', 31, 40, 50));
assert.equal(calls.filter(([kind]) => kind === 'joy-end').length, joyEndsAfterCaptureLoss,
  'pointerup after joystick capture loss cannot emit a second terminal callback');
joystick.dispatchEvent(pointerEvent('pointerdown', 32, 42, 52));
assert.equal(input.diagnostics().joystickPointerId, 32,
  'joystick accepts a new gesture after unexpected capture loss');
windowLike.dispatchEvent(pointerEvent('pointerup', 32, 42, 52));

camera.dispatchEvent(pointerEvent('pointerdown', 41, 240, 90));
camera.losePointerCapture(41);
assert.equal(input.diagnostics().cameraPointerId, null,
  'unexpected camera capture loss clears the active pointer');
assert.deepEqual(calls.at(-1), ['camera-end', 'lostpointercapture']);
const cameraEndsAfterCaptureLoss = calls.filter(([kind]) => kind === 'camera-end').length;
windowLike.dispatchEvent(pointerEvent('pointercancel', 41, 240, 90));
assert.equal(calls.filter(([kind]) => kind === 'camera-end').length, cameraEndsAfterCaptureLoss,
  'pointercancel after camera capture loss cannot emit a second terminal callback');
camera.dispatchEvent(pointerEvent('pointerdown', 42, 242, 92));
assert.equal(input.diagnostics().cameraPointerId, 42,
  'camera accepts a new gesture after unexpected capture loss');
windowLike.dispatchEvent(pointerEvent('pointerup', 42, 242, 92));

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
assert.equal(joystick.capturedPointers.size, 0, 'scene reset releases stale joystick capture');

documentLike.visibilityState = 'visible';
joystick.dispatchEvent(pointerEvent('pointerdown', 71, 40, 50));
camera.dispatchEvent(pointerEvent('pointerdown', 72, 240, 90));
camera.releasePointerCapture(72);
camera.dispatchEvent(pointerEvent('lostpointercapture', 72, 240, 90));
assert.equal(input.diagnostics().cameraPointerId, null);
assert.equal(input.diagnostics().joystickPointerId, 71, 'losing camera capture preserves walking');
camera.dispatchEvent(pointerEvent('pointerdown', 73, 240, 90));
windowLike.dispatchEvent(pointerEvent('pointermove', 73, 250, 90));
assert.deepEqual(calls.at(-1), ['camera-move', 73, 250], 'next drag works immediately after lost capture');
camera.capturedPointers.delete(73);
camera.dispatchEvent(pointerEvent('pointerdown', 74, 240, 90));
assert.equal(input.diagnostics().cameraPointerId, 74, 'a new camera drag recovers when a browser silently drops capture');
assert.ok(calls.some(call => call[0] === 'camera-end' && call[1] === 'stale-pointercapture'));
for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
  documentLike.dispatchEvent(new Event(type));
  assert.equal(input.diagnostics().cameraPointerId, null);
  assert.equal(input.diagnostics().joystickPointerId, null);
  camera.dispatchEvent(pointerEvent('pointerdown', 75, 240, 90));
}
windowLike.dispatchEvent(new Event('orientationchange'));
assert.equal(input.diagnostics().cameraPointerId, null);

joystick.dispatchEvent(pointerEvent('pointerdown', 81, 40, 50));
joystick.capturedPointers.delete(81);
joystick.dispatchEvent(pointerEvent('pointerdown', 82, 40, 50));
assert.equal(input.diagnostics().joystickPointerId, 82, 'a new joystick drag also recovers from silently dropped capture');
assert.ok(calls.some(call => call[0] === 'joy-end' && call[1] === 'stale-pointercapture'));

input.reset('retarget-fixture');
calls.length = 0;
joystick.dispatchEvent(pointerEvent('pointerdown', 91, 40, 200));
joystick.dispatchEvent(pointerEvent('pointerdown', 92, 300, 120));
assert.equal(input.diagnostics().joystickPointerId, 91, 'walking pointer stays on the left pad');
assert.equal(input.diagnostics().cameraPointerId, 92, 'retargeted right-finger starts look even when the event target is the capturing joystick');
assert.ok(calls.some(call => call[0] === 'camera-start' && call[1] === 92));

input.reset('retarget-fixture');
calls.length = 0;
camera.dispatchEvent(pointerEvent('pointerdown', 93, 300, 120));
camera.dispatchEvent(pointerEvent('pointerdown', 94, 40, 200));
assert.equal(input.diagnostics().cameraPointerId, 93);
assert.equal(input.diagnostics().joystickPointerId, 94, 'retargeted left-finger starts walk when the event target is the capturing camera');

input.reset('retarget-fixture');
calls.length = 0;
joystick.dispatchEvent(pointerEvent('pointerdown', 95, 40, 200));
joystick.dispatchEvent(pointerEvent('pointerdown', 96, 60, 220));
assert.equal(input.diagnostics().joystickPointerId, 95);
assert.equal(input.diagnostics().cameraPointerId, null, 'a second finger still on the joystick does not steal look');

input.dispose();
joystick.dispatchEvent(pointerEvent('pointerdown', 66, 40, 50));
assert.equal(input.diagnostics().joystickPointerId, null, 'disposed scene cannot retain input listeners');

console.log('V9 Pocket mobile dual-pointer lifecycle: PASS');
