import assert from 'node:assert/strict';

import {
  PIRATE_CONTROL_MODE_EVENT,
  PIRATE_HELM_PROMPT_EVENT,
  PIRATE_UNIFIED_INPUT_INTERACTION_MESSAGE,
  PIRATE_UNIFIED_INPUT_MODE_MESSAGE,
  PIRATE_UNIFIED_INPUT_READY_MESSAGE,
  createPirateIframeInputTransport,
} from '../unified-mobile-controls-v900.mjs';

const sent = [];
const parentResets = [];
const windowLike = new EventTarget();
const modeEvents = [];
const helmPromptEvents = [];
windowLike.addEventListener(PIRATE_CONTROL_MODE_EVENT, event => modeEvents.push(event.detail));
windowLike.addEventListener(PIRATE_HELM_PROMPT_EVENT, event => helmPromptEvents.push(event.detail));
const firstFrameWindow = {
  postMessage(message, origin) { sent.push({ message, origin, target: 'first' }); },
};
const frame = { contentWindow: firstFrameWindow };
const transport = createPirateIframeInputTransport({
  frame,
  inputMessageType: 'pocketmonster:unified-mobile-input-v1',
  resetParentInput: reason => parentResets.push(reason),
  windowLike,
});

const readyEvent = (source = frame.contentWindow, origin = 'null') => ({
  source,
  origin,
  data: { type: PIRATE_UNIFIED_INPUT_READY_MESSAGE },
});

assert.equal(transport.camera({ phase: 'start', gestureId: 1, x: 10, y: 20 }), false);
assert.equal(transport.move({ active: true, x: 1, z: 0 }), false);
assert.equal(sent.length, 0, 'input never reaches an iframe before a loaded generation is ready');

assert.equal(transport.beginGeneration('frame-load'), true);
assert.deepEqual(parentResets, ['pirate-input-frame-load']);
assert.equal(transport.diagnostics().frameGeneration, 1);
assert.equal(transport.acceptReady(readyEvent({}, 'null')), false, 'a stale iframe window cannot claim readiness');
assert.equal(transport.acceptReady(readyEvent(frame.contentWindow, 'https://game.example')), false, 'sandbox readiness requires the opaque child origin');

assert.equal(transport.camera({ phase: 'start', gestureId: 2, x: 12, y: 20 }), false);
assert.equal(transport.acceptReady(readyEvent()), true);
assert.deepEqual(parentResets, ['pirate-input-frame-load', 'pirate-input-ready']);
assert.deepEqual(sent.map(item => item.message), [{
  type: 'pocketmonster:unified-mobile-input-v1',
  frameGeneration: 1,
  kind: 'reset',
  reason: 'pirate-input-ready',
}]);

const modeEvent = (controlMode, { source = frame.contentWindow, origin = 'null', frameGeneration = 1 } = {}) => ({
  source,
  origin,
  data: { type: PIRATE_UNIFIED_INPUT_MODE_MESSAGE, controlMode, frameGeneration },
});
assert.equal(transport.acceptReady(modeEvent('boat', { source: {} })), false, 'a foreign frame cannot change Pirate controls');
assert.equal(transport.acceptReady(modeEvent('boat', { origin: 'https://game.example' })), false, 'only the opaque active iframe may change Pirate controls');
assert.equal(transport.acceptReady(modeEvent('boat', { frameGeneration: 2 })), false, 'a future generation cannot change controls before readiness');
const modeEventsBeforeBoat = modeEvents.length;
assert.equal(transport.acceptReady(modeEvent('boat')), true);
assert.deepEqual(modeEvents.at(-1), { controlMode: 'boat', frameGeneration: 1 });
assert.equal(transport.acceptReady(modeEvent('boat')), true, 'a duplicate mode report is accepted but does not reset parent pointers');
assert.equal(modeEvents.length, modeEventsBeforeBoat + 1);
assert.equal(transport.acceptReady(modeEvent('invalid')), false, 'only player and boat native modes are accepted');

const helmPromptEvent = (helmPrompt, { source = frame.contentWindow, origin = 'null', frameGeneration = 1 } = {}) => ({
  source,
  origin,
  data: { type: PIRATE_UNIFIED_INPUT_INTERACTION_MESSAGE, helmPrompt, frameGeneration },
});
assert.equal(transport.acceptReady(helmPromptEvent('enter', { source: {} })), false, 'a foreign frame cannot expose a helm interaction');
assert.equal(transport.acceptReady(helmPromptEvent('enter', { origin: 'https://game.example' })), false, 'helm prompt data uses the same opaque-origin gate');
assert.equal(transport.acceptReady(helmPromptEvent('enter', { frameGeneration: 2 })), false, 'a future frame cannot expose a stale helm button');
assert.equal(transport.acceptReady(helmPromptEvent('attack')), false, 'only enter, leave, or null are valid native helm prompts');
assert.equal(transport.acceptReady(helmPromptEvent('enter')), true);
assert.deepEqual(helmPromptEvents.at(-1), { helmPrompt: 'enter', frameGeneration: 1 });

assert.equal(transport.camera({ phase: 'move', gestureId: 2, x: 15, y: 20 }), false);
assert.equal(transport.camera({ phase: 'end', gestureId: 2 }), false);
assert.equal(sent.length, 1, 'a gesture begun before ready is not partially replayed after ready');

assert.equal(transport.camera({ phase: 'start', gestureId: 3, x: 20, y: 30 }), true);
assert.equal(transport.camera({ phase: 'start', gestureId: 4, x: 21, y: 30 }), false, 'an active gesture cannot be replaced by another start');
assert.equal(transport.camera({ phase: 'move', gestureId: 3, x: 24, y: 32, dx: 4, dy: 2 }), true);
assert.equal(transport.camera({ phase: 'end', gestureId: 3, reason: 'pointerup' }), true);
const generationOneCamera = sent.slice(1).map(item => item.message);
assert.deepEqual(generationOneCamera.map(message => message.phase), ['start', 'move', 'end']);
assert.ok(generationOneCamera.every(message => message.frameGeneration === 1 && message.gestureId === 3));
assert.ok(sent.every(item => item.origin === '*'));

const sentBeforeDuplicateReady = sent.length;
assert.equal(transport.acceptReady(readyEvent()), true);
assert.equal(sent.length, sentBeforeDuplicateReady, 'duplicate ready is idempotent and cannot interrupt a gesture');

assert.equal(transport.camera({ phase: 'start', gestureId: 4, x: 30, y: 40 }), true);
assert.equal(transport.beginGeneration('frame-load'), true);
assert.equal(transport.diagnostics().frameGeneration, 2);
assert.equal(transport.diagnostics().ready, false);
assert.deepEqual(modeEvents.at(-1), { controlMode: 'player', frameGeneration: 2 }, 'a new iframe generation clears a stale boat HUD before any input is accepted');
assert.deepEqual(helmPromptEvents.at(-1), { helmPrompt: null, frameGeneration: 2 }, 'a new iframe generation clears a stale helm prompt before any input is accepted');
assert.equal(transport.camera({ phase: 'move', gestureId: 4, x: 31, y: 40 }), false);
assert.equal(transport.camera({ phase: 'end', gestureId: 4 }), false);
assert.equal(transport.action({ action: 'capture', phase: 'start' }), false);
assert.equal(sent.at(-1).message.phase, 'start', 'late input from the previous generation is dropped, not queued');

const secondFrameWindow = {
  postMessage(message, origin) { sent.push({ message, origin, target: 'second' }); },
};
frame.contentWindow = secondFrameWindow;
assert.equal(transport.acceptReady(readyEvent(firstFrameWindow)), false, 'ready from the replaced iframe window is rejected');
assert.equal(transport.acceptReady(readyEvent()), true);
assert.equal(sent.at(-1).message.kind, 'reset');
assert.equal(sent.at(-1).message.frameGeneration, 2);
assert.equal(sent.at(-1).target, 'second');

assert.equal(transport.camera({ phase: 'start', gestureId: 4, x: 35, y: 40 }), false, 'gesture high-water survives iframe generations');
assert.equal(transport.camera({ phase: 'start', gestureId: 5, x: 35, y: 40 }), true);
assert.equal(transport.camera({ phase: 'move', gestureId: 5, x: 36, y: 41 }), true);
assert.equal(transport.camera({ phase: 'end', gestureId: 5 }), true);
assert.ok(sent.slice(-3).every(item => item.message.frameGeneration === 2 && item.message.gestureId === 5));
assert.deepEqual(parentResets, [
  'pirate-input-frame-load',
  'pirate-input-ready',
  'pirate-input-frame-load',
  'pirate-input-ready',
]);

console.log('V9 Pirate iframe input readiness transport: PASS');
