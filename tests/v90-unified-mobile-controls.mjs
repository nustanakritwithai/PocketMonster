import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PIRATE_CONTROL_MODE_EVENT,
  PIRATE_HELM_PROMPT_EVENT,
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
    this.attributes = new Map();
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  setPointerCapture(pointerId) { this.capturedPointers.add(pointerId); }
  hasPointerCapture(pointerId) { return this.capturedPointers.has(pointerId); }
  releasePointerCapture(pointerId) { this.capturedPointers.delete(pointerId); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
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

function pirateControlMode(mode) {
  const event = new Event(PIRATE_CONTROL_MODE_EVENT);
  Object.defineProperty(event, 'detail', { value: { controlMode: mode } });
  return event;
}

function pirateHelmPrompt(helmPrompt) {
  const event = new Event(PIRATE_HELM_PROMPT_EVENT);
  Object.defineProperty(event, 'detail', { value: { helmPrompt } });
  return event;
}

const ids = ['pirateUnifiedControls', 'joystick', 'stick', 'pirateJoyKnob', 'cameraPad', 'skill1Btn', 'skill2Btn', 'skill3Btn', 'skill4Btn', 'captureBtn', 'summonBtn', 'recallBtn', 'pirateBlockBtn', 'pirateWeaponBtn', 'pirateHelmBtn', 'piratePotion1Btn', 'piratePotion2Btn', 'pirateZoomInBtn', 'pirateZoomOutBtn'];
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
const firstCameraGesture = pirateCalls
  .filter(([kind, payload]) => kind === 'camera' && ['start', 'move'].includes(payload.phase))
  .map(([, payload]) => payload);
assert.equal(firstCameraGesture.length, 2);
assert.ok(Number.isSafeInteger(firstCameraGesture[0].gestureId) && firstCameraGesture[0].gestureId > 0);
assert.equal(
  firstCameraGesture[1].gestureId,
  firstCameraGesture[0].gestureId,
  'camera start and move carry one stable gesture identity',
);
const firstCameraGestureId = firstCameraGesture[0].gestureId;

const attackDown = pointer('pointerdown', 33, 0, 0);
elements.get('captureBtn').dispatchEvent(attackDown);
elements.get('captureBtn').dispatchEvent(pointer('pointerup', 33, 0, 0));
assert.equal(attackDown.defaultPrevented, true, 'Pirate actions are intercepted before dormant Pocket handlers');
assert.deepEqual(
  pirateCalls.filter(([kind]) => kind === 'action').map(([, payload]) => [payload.action, payload.phase]),
  [['capture', 'start'], ['capture', 'end']],
);

// The helm remains a native proximity interaction.  The parent button appears
// only after the child reports the native helm prompt; it cannot auto-board or
// acquire the helm from elsewhere on the deck.
windowLike.dispatchEvent(pirateHelmPrompt('enter'));
assert.equal(elements.get('pirateHelmBtn').getAttribute('aria-label'), 'ถือพวงมาลัย');
assert.equal(elements.get('pirateHelmBtn').style.display, 'flex');
assert.equal(elements.get('pirateHelmBtn').style.right, '85px', 'helm is centered between the two 62px cannon buttons');
elements.get('pirateHelmBtn').dispatchEvent(pointer('pointerdown', 59, 0, 0));
elements.get('pirateHelmBtn').dispatchEvent(pointer('pointerup', 59, 0, 0));
assert.deepEqual(
  pirateCalls.filter(([kind]) => kind === 'action').slice(-2).map(([, payload]) => [payload.action, payload.phase]),
  [['interact', 'start'], ['interact', 'end']],
  'the wheel forwards only the existing native interaction prompt',
);

// Native Pirate alone reaches helm mode. Once it reports that state, the
// shared parent must change the meaning of buttons without leaving a pressed
// player action or auto-boarding/auto-helming.
elements.get('captureBtn').dispatchEvent(pointer('pointerdown', 60, 0, 0));
assert.equal(controls.diagnostics().actionPointerCount, 1);
windowLike.dispatchEvent(pirateControlMode('boat'));
assert.equal(controls.diagnostics().controlMode, 'pirate');
assert.equal(controls.diagnostics().pirateControlMode, 'boat');
assert.equal(controls.diagnostics().actionPointerCount, 0, 'mode change clears a held player action before the button is remapped');
assert.equal(elements.get('captureBtn').getAttribute('aria-label'), 'ยิงปืนใหญ่กราบขวา');
assert.equal(elements.get('skill1Btn').getAttribute('aria-label'), 'ยิงปืนใหญ่กราบซ้าย');
assert.equal(elements.get('pirateHelmBtn').getAttribute('aria-label'), 'ปล่อยพวงมาลัย');
assert.equal(elements.get('pirateHelmBtn').style.right, '85px');
assert.equal(elements.get('summonBtn').style.display, 'none', 'boat HUD removes the boost button');
assert.equal(elements.get('recallBtn').style.display, 'none', 'boat HUD removes the anchor button');
assert.equal(elements.get('skill2Btn').style.display, 'none', 'hidden player skills cannot remain touch targets while steering');

const boatActionsStart = pirateCalls.filter(([kind]) => kind === 'action').length;
for (const [buttonId, pointerId] of [['captureBtn', 61], ['skill1Btn', 62], ['pirateHelmBtn', 63]]) {
  elements.get(buttonId).dispatchEvent(pointer('pointerdown', pointerId, 0, 0));
  elements.get(buttonId).dispatchEvent(pointer('pointerup', pointerId, 0, 0));
}
assert.deepEqual(
  pirateCalls.filter(([kind]) => kind === 'action').slice(boatActionsStart).map(([, payload]) => [payload.action, payload.phase]),
  [
    ['cannonRight', 'start'], ['cannonRight', 'end'],
    ['cannonLeft', 'start'], ['cannonLeft', 'end'],
    ['interact', 'start'], ['interact', 'end'],
  ],
  'helm mode routes only to native cannon and interaction actions, never boost or anchor HUD actions',
);

windowLike.dispatchEvent(pirateHelmPrompt(null));
windowLike.dispatchEvent(pirateControlMode('player'));
assert.equal(controls.diagnostics().pirateControlMode, 'player');
assert.equal(elements.get('captureBtn').getAttribute('aria-label'), 'โจมตี');
assert.equal(elements.get('summonBtn').getAttribute('aria-label'), 'แดช');
assert.equal(elements.get('recallBtn').getAttribute('aria-label'), 'กระโดด');
assert.equal(elements.get('pirateHelmBtn').style.display, 'none', 'wheel hides when the native proximity prompt is no longer active');
const playerActionsStart = pirateCalls.filter(([kind]) => kind === 'action').length;
for (const [buttonId, pointerId] of [['captureBtn', 65], ['summonBtn', 66], ['recallBtn', 67]]) {
  elements.get(buttonId).dispatchEvent(pointer('pointerdown', pointerId, 0, 0));
  elements.get(buttonId).dispatchEvent(pointer('pointerup', pointerId, 0, 0));
}
assert.deepEqual(
  pirateCalls.filter(([kind]) => kind === 'action').slice(playerActionsStart).map(([, payload]) => [payload.action, payload.phase]),
  [['capture', 'start'], ['capture', 'end'], ['summon', 'start'], ['summon', 'end'], ['recall', 'start'], ['recall', 'end']],
  'leaving helm restores ordinary Pirate actions',
);

pirateCalls.length = 0;
elements.get('cameraPad').dispatchEvent(pointer('pointerdown', 22, 70, 40));
const resumedCameraGestureId = pirateCalls
  .filter(([kind, payload]) => kind === 'camera' && payload.phase === 'start')
  .at(-1)?.[1]?.gestureId;
assert.ok(Number.isSafeInteger(resumedCameraGestureId) && resumedCameraGestureId > firstCameraGestureId, 'mode cleanup requires a fresh camera gesture after leaving helm');
const potionLook = pointer('pointerdown', 77, 50, 90);
elements.get('piratePotion1Btn').dispatchEvent(potionLook);
elements.get('piratePotion1Btn').dispatchEvent(pointer('pointerup', 77, 50, 90));
assert.equal(controls.diagnostics().controlMode, 'pirate', 'potion tap while looking cannot leave Pirate control mode');
assert.equal(controls.diagnostics().pointerInput.cameraPointerId, 22, 'potion tap cannot steal the look-around pointer');
assert.equal(pirateCalls.filter(([kind]) => kind === 'reset').length, 0, 'potion tap while looking cannot reset the control surface');
assert.deepEqual(
  pirateCalls.filter(([kind]) => kind === 'action').map(([, payload]) => [payload.action, payload.phase]),
  [['potion1', 'start'], ['potion1', 'end']],
);
windowLike.dispatchEvent(pointer('pointerup', 22, 70, 40));
assert.ok(
  pirateCalls.some(([kind, payload]) => kind === 'camera'
    && payload.phase === 'end'
    && payload.gestureId === resumedCameraGestureId),
  'camera end carries the identity allocated at start',
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

elements.get('cameraPad').dispatchEvent(pointer('pointerdown', 66, 120, 40));
windowLike.dispatchEvent(pointer('pointermove', 66, 125, 42));
windowLike.dispatchEvent(pointer('pointerup', 66, 125, 42));
const secondCameraGesture = pocketCalls
  .filter(([kind, payload]) => kind === 'camera')
  .map(([, payload]) => payload);
assert.deepEqual(secondCameraGesture.map(payload => payload.phase), ['start', 'move', 'end']);
assert.ok(
  secondCameraGesture.every(payload => payload.gestureId === secondCameraGesture[0].gestureId),
  'the next camera gesture keeps one identity through its complete lifecycle',
);
assert.ok(
  secondCameraGesture[0].gestureId > firstCameraGestureId,
  'camera gesture identities increase monotonically across worlds',
);

elements.get('joystick').dispatchEvent(pointer('pointerdown', 55, 20, 50));
windowLike.dispatchEvent(pointer('pointermove', 55, 10, 50));
assert.ok(pocketCalls.some(([kind, payload]) => kind === 'move' && payload.active === true));
const lastPirateMove = pirateCalls.filter(([kind]) => kind === 'move').at(-1);
assert.ok(!lastPirateMove || lastPirateMove[1].active === false, 'mode cleanup leaves no stale Pirate movement for the next world');


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
assert.match(bootSource, /createPirateIframeInputTransport\([\s\S]*frame\.addEventListener\('load',[\s\S]*beginGeneration\('frame-load'\)/);
assert.match(bootSource, /if \(inputTransport\.acceptReady\(event\)\) return;/);
assert.match(bootSource, /postMessage\([\s\S]*, '\*'\)/, 'parent targets the exact opaque Pirate frame window');
assert.match(bridgeSource, /event\.source !== window\.parent \|\| event\.origin !== allowedParentOrigin/);
assert.match(bridgeSource, /\.tc-joyzone/);
assert.match(bridgeSource, /block: '\.tc-block'/);
assert.match(bridgeSource, /interact: '\.interaction-prompt'/, 'the new wheel uses the existing native interaction prompt');
assert.match(bridgeSource, /dataset\.unifiedHelmProxy/, 'only the native helm prompt is marked for center-panel retirement');
assert.match(htmlSource, /id="pirateUnifiedControls"[\s\S]*id="pirateJoyKnob"[\s\S]*id="captureBtn"[^>]*tc-attack[\s\S]*id="pirateHelmBtn"[^>]*tc-helm/);
assert.match(styleSource, /#pirateUnifiedControls\{[^}]*z-index:20[^}]*pointer-events:none/);
assert.match(styleSource, /#pirateUnifiedControls #joystick\.tc-joyzone/);
assert.match(styleSource, /#pirateUnifiedControls\[data-control-mode="capture"\] \.pirate-only/);
assert.match(styleSource, /#pirateUnifiedControls \.tc-btn\{[^}]*background-color:/);
assert.doesNotMatch(styleSource, /#pirateUnifiedControls \.tc-btn\{[^}]*background:/, 'Pocket mode must be able to paint capture icons on the shared Pirate buttons');
assert.doesNotMatch(styleSource, /pirate-fruit"\]\[data-control-panel="human"\] #hud,/, 'shared control ancestors cannot be display:none');
assert.doesNotMatch(sceneEntrySource, /installNpcInteractionLayer/, 'rollback: online scene must not remount the NPC interaction hotfix');
assert.match(styleSource, /#cameraPad\.tc-camzone\{[^}]*bottom:168px/, 'camera pad leaves a hole for the original Pirate คุยกับ prompt above chat');
assert.doesNotMatch(styleSource, /#cameraPad\.tc-camzone\{[^}]*height:100%/, 'camera pad cannot cover the bottom talk prompt');
assert.match(styleSource, /body\[data-pirate-dialogue="open"\] #onlineWorldSceneFrame\{[^}]*z-index:40/, 'open Pirate window raises the scene above HUD buttons');
assert.match(styleSource, /body\[data-pirate-dialogue="open"\] #pirateUnifiedControls\{[^}]*visibility:hidden/, 'open world overlay hides the parent control surface so close is tappable');
assert.match(sceneHtmlSource, /scene-entry-v900.mjs\?v=58/, 'online scene cache-busts the unified Pirate ship-control bridge');

console.log('V9 Pirate-primary single-HTML mobile controls: PASS');
