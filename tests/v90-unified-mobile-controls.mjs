import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  UNIFIED_MOBILE_CONTROLS_KIND,
  createUnifiedMobileControls,
} from '../unified-mobile-controls-v900.mjs';

class FakeTarget extends EventTarget {
  constructor(id = '') {
    super();
    this.id = id;
    this.style = {};
    this.capturedPointers = new Set();
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  setPointerCapture(pointerId) { this.capturedPointers.add(pointerId); }
  hasPointerCapture(pointerId) { return this.capturedPointers.has(pointerId); }
  releasePointerCapture(pointerId) { this.capturedPointers.delete(pointerId); }
}

function pointer(type, pointerId, clientX, clientY) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}

const ids = ['joystick', 'stick', 'cameraPad', 'skill1Btn', 'skill2Btn', 'skill3Btn', 'skill4Btn', 'captureBtn', 'summonBtn', 'recallBtn'];
const elements = new Map(ids.map(id => [id, new FakeTarget(id)]));
const windowLike = new FakeTarget('window');
const documentLike = new FakeTarget('document');
documentLike.visibilityState = 'visible';
documentLike.getElementById = id => elements.get(id) || null;

const controls = createUnifiedMobileControls({ windowLike, documentLike });
assert.equal(controls.kind, UNIFIED_MOBILE_CONTROLS_KIND);

const pocketCalls = [];
const pirateCalls = [];
controls.registerAdapter('pocket-monster', {
  move: payload => pocketCalls.push(['move', payload]),
  camera: payload => pocketCalls.push(['camera', payload]),
  reset: reason => pocketCalls.push(['reset', reason]),
});
controls.registerAdapter('pirate-fruit', {
  interceptActions: true,
  move: payload => pirateCalls.push(['move', payload]),
  camera: payload => pirateCalls.push(['camera', payload]),
  action: payload => pirateCalls.push(['action', payload]),
  reset: reason => pirateCalls.push(['reset', reason]),
});

controls.activate('pirate-fruit');
elements.get('joystick').dispatchEvent(pointer('pointerdown', 11, 80, 50));
elements.get('cameraPad').dispatchEvent(pointer('pointerdown', 22, 70, 40));
windowLike.dispatchEvent(pointer('pointermove', 11, 90, 50));
windowLike.dispatchEvent(pointer('pointermove', 22, 75, 44));
assert.equal(controls.diagnostics().pointerInput.joystickPointerId, 11);
assert.equal(controls.diagnostics().pointerInput.cameraPointerId, 22);
assert.ok(pirateCalls.some(([kind, payload]) => kind === 'move' && payload.active === true));
assert.ok(pirateCalls.some(([kind, payload]) => kind === 'camera' && payload.phase === 'move' && payload.dx === 5));

const attackDown = pointer('pointerdown', 33, 0, 0);
elements.get('captureBtn').dispatchEvent(attackDown);
elements.get('captureBtn').dispatchEvent(pointer('pointerup', 33, 0, 0));
assert.equal(attackDown.defaultPrevented, true, 'Pirate actions are intercepted before dormant Pocket handlers');
assert.deepEqual(
  pirateCalls.filter(([kind]) => kind === 'action').map(([, payload]) => [payload.action, payload.phase]),
  [['capture', 'start'], ['capture', 'end']],
);

controls.activate('pocket-monster');
assert.equal(controls.diagnostics().pointerInput.joystickPointerId, null, 'world switch releases stale joystick capture');
assert.equal(controls.diagnostics().pointerInput.cameraPointerId, null, 'world switch releases stale camera capture');
const pocketAction = pointer('pointerdown', 44, 0, 0);
elements.get('captureBtn').dispatchEvent(pocketAction);
assert.equal(pocketAction.defaultPrevented, false, 'Pocket action continues to its existing handler on the same HTML button');

elements.get('joystick').dispatchEvent(pointer('pointerdown', 55, 20, 50));
windowLike.dispatchEvent(pointer('pointermove', 55, 10, 50));
assert.ok(pocketCalls.some(([kind, payload]) => kind === 'move' && payload.active === true));
assert.equal(pirateCalls.filter(([kind]) => kind === 'move').at(-1)[1].active, false, 'old world receives neutral input before adapter switch');

const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const bootSource = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const bridgeSource = fs.readFileSync(new URL('../pirate-fruit-offline/unified-input-bridge-v900.mjs', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
assert.doesNotMatch(gameSource, /bindMobileDualPointerInput/, 'Pocket runtime no longer creates a second pointer lifecycle');
assert.match(gameSource, /registerAdapter\('pocket-monster'/);
assert.match(bootSource, /registerAdapter\?\.\('pirate-fruit'/);
assert.match(bridgeSource, /event\.source !== window\.parent \|\| event\.origin !== allowedParentOrigin/);
assert.match(bridgeSource, /\.tc-joyzone/);
assert.match(styleSource, /pirate-fruit"\]\[data-control-panel="human"\] #joystick[\s\S]*display:block!important/);
assert.doesNotMatch(styleSource, /pirate-fruit"\]\[data-control-panel="human"\] #hud,/, 'shared control ancestors cannot be display:none');

console.log('V9 single-HTML unified mobile controls: PASS');
