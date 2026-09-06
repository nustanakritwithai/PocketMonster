import assert from 'node:assert/strict';

import {
  PIRATE_UNIFIED_INPUT_READY_MESSAGE,
  createPirateIframeInputTransport,
} from '../unified-mobile-controls-v900.mjs';

const sent = [];
const parentResets = [];
const firstFrameWindow = {
  postMessage(message, origin) { sent.push({ message, origin, target: 'first' }); },
};
const frame = { contentWindow: firstFrameWindow };
const transport = createPirateIframeInputTransport({
  frame,
  inputMessageType: 'pocketmonster:unified-mobile-input-v1',
  resetParentInput: reason => parentResets.push(reason),
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
