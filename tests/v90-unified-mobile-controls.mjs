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
    this.dataset = {};
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

const ids = ['pirateUnifiedControls', 'joystick', 'stick', 'pirateJoyKnob', 'cameraPad', 'skill1Btn', 'skill2Btn', 'skill3Btn', 'skill4Btn', 'captureBtn', 'summonBtn', 'recallBtn', 'pirateBlockBtn', 'pirateWeaponBtn', 'piratePotion1Btn', 'piratePotion2Btn', 'pirateZoomInBtn', 'pirateZoomOutBtn'];
const elements = new Map(ids.map(id => [id, new FakeTarget(id)]));
const windowLike = new FakeTarget('window');
const documentLike = new FakeTarget('document');
documentLike.visibilityState = 'visible';
documentLike.body = new FakeTarget('body');
documentLike.getElementById = id => elements.get(id) || null;

const controls = createUnifiedMobileControls({ windowLike, documentLike });
assert.equal(controls.kind, UNIFIED_MOBILE_CONTROLS_KIND);

const pocketCalls = [];
const pirateCalls = [];
controls.registerAdapter('pocket-monster', {
  interceptActions: true,
  move: payload => pocketCalls.push(['move', payload]),
  camera: payload => pocketCalls.push(['camera', payload]),
  action: payload => pocketCalls.push(['action', payload]),
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
assert.equal(controls.diagnostics().controlMode, 'pirate');
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
assert.equal(controls.diagnostics().controlMode, 'capture');
assert.equal(controls.diagnostics().pointerInput.joystickPointerId, null, 'world switch releases stale joystick capture');
assert.equal(controls.diagnostics().pointerInput.cameraPointerId, null, 'world switch releases stale camera capture');
const pocketAction = pointer('pointerdown', 44, 0, 0);
elements.get('captureBtn').dispatchEvent(pocketAction);
assert.equal(pocketAction.defaultPrevented, true, 'Pocket mode intercepts the same Pirate-shaped button before dormant handlers');
elements.get('captureBtn').dispatchEvent(pointer('pointerup', 44, 0, 0));
assert.deepEqual(
  pocketCalls.filter(([kind]) => kind === 'action').map(([, payload]) => [payload.action, payload.phase]),
  [['capture', 'start'], ['capture', 'end']],
);

elements.get('joystick').dispatchEvent(pointer('pointerdown', 55, 20, 50));
windowLike.dispatchEvent(pointer('pointermove', 55, 10, 50));
assert.ok(pocketCalls.some(([kind, payload]) => kind === 'move' && payload.active === true));
assert.equal(pirateCalls.filter(([kind]) => kind === 'move').at(-1)[1].active, false, 'old world receives neutral input before adapter switch');


const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const bootSource = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const bridgeSource = fs.readFileSync(new URL('../pirate-fruit-offline/unified-input-bridge-v900.mjs', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const htmlSource = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const sceneEntrySource = fs.readFileSync(new URL('../scene-entry-v900.mjs', import.meta.url), 'utf8');
const sceneHtmlSource = fs.readFileSync(new URL('../scene-v900.html', import.meta.url), 'utf8');
assert.doesNotMatch(gameSource, /bindMobileDualPointerInput/, 'Pocket runtime no longer creates a second pointer lifecycle');
assert.match(gameSource, /registerAdapter\('pocket-monster'/);
assert.match(gameSource, /registerAdapter\('pocket-monster',[\s\S]*interceptActions:true[\s\S]*beginCaptureAim\(\)[\s\S]*executeCaptureThrow\(\)[\s\S]*summonThrow\(\)[\s\S]*recall\(true\)[\s\S]*dispatchSkill/);
assert.match(bootSource, /registerAdapter\?\.\('pirate-fruit'/);
assert.match(bootSource, /postMessage\([\s\S]*, '\*'\)/, 'parent targets the exact opaque Pirate frame window');
assert.match(bridgeSource, /event\.source !== window\.parent \|\| event\.origin !== allowedParentOrigin/);
assert.match(bridgeSource, /\.tc-joyzone/);
assert.match(bridgeSource, /block: '\.tc-block'/);
assert.match(htmlSource, /id="pirateUnifiedControls"[\s\S]*id="pirateJoyKnob"[\s\S]*id="captureBtn"[^>]*tc-attack/);
assert.match(styleSource, /#pirateUnifiedControls\{[^}]*z-index:20[^}]*pointer-events:none/);
assert.match(styleSource, /#pirateUnifiedControls #joystick\.tc-joyzone/);
assert.match(styleSource, /#pirateUnifiedControls\[data-control-mode="capture"\] \.pirate-only/);
assert.match(styleSource, /#pirateUnifiedControls \.tc-btn\{[^}]*background-color:/);
assert.doesNotMatch(styleSource, /#pirateUnifiedControls \.tc-btn\{[^}]*background:/, 'Pocket mode must be able to paint capture icons on the shared Pirate buttons');
assert.doesNotMatch(styleSource, /pirate-fruit"\]\[data-control-panel="human"\] #hud,/, 'shared control ancestors cannot be display:none');
assert.doesNotMatch(sceneEntrySource, /installNpcInteractionLayer/, 'rollback: online scene must not remount the NPC interaction hotfix');
assert.match(sceneHtmlSource, /scene-entry-v900.mjs\?v=36/, 'online scene cache-busts the Dock world-lifecycle wiring');

console.log('V9 Pirate-primary single-HTML mobile controls: PASS');
