import assert from 'node:assert/strict';

const PARENT_ORIGIN = 'https://parent.example';
const INPUT_TYPE = 'pocketmonster:unified-mobile-input-v1';
const READY_TYPE = 'pocketmonster:unified-mobile-input-ready-v1';
const eventLog = [];

class FakeTarget extends EventTarget {
  constructor(name) {
    super();
    this.name = name;
    this.dataset = {};
    this.style = {};
  }

  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }

  dispatchEvent(event) {
    if (event.type.startsWith('pointer')) {
      eventLog.push({
        target: this.name,
        type: event.type,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });
    }
    return super.dispatchEvent(event);
  }
}

class FakePointerEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    for (const [key, value] of Object.entries(init)) {
      if (!(key in this)) Object.defineProperty(this, key, { value });
    }
  }
}

class FakeMutationObserver {
  static observers = new Set();

  constructor(callback) {
    this.callback = callback;
  }

  observe() {
    FakeMutationObserver.observers.add(this);
  }

  disconnect() {
    FakeMutationObserver.observers.delete(this);
  }

  static flush() {
    for (const observer of [...FakeMutationObserver.observers]) observer.callback([]);
  }
}

const parentMessages = [];
const parentWindow = {
  postMessage(message, origin) {
    parentMessages.push({ message, origin });
  },
};
const childWindow = new FakeTarget('window');
childWindow.parent = parentWindow;
const documentElement = new FakeTarget('documentElement');
const head = { appendChild() {} };
let cameraZone = null;
let joystickZone = null;
const childActions = new Map([
  ['.tc-cannon-left', new FakeTarget('cannonLeft')],
  ['.tc-cannon-right', new FakeTarget('cannonRight')],
  ['.tc-dash', new FakeTarget('dash')],
  ['.tc-jump', new FakeTarget('jump')],
  ['.tc-attack', new FakeTarget('attack')],
  ['.interaction-prompt', new FakeTarget('helmPrompt')],
]);
const documentLike = {
  documentElement,
  head,
  readyState: 'loading',
  createElement: () => new FakeTarget('element'),
  getElementById: () => null,
  querySelector(selector) {
    if (selector === '.tc-camzone') return cameraZone;
    if (selector === '.tc-joyzone') return joystickZone;
    if (childActions.has(selector)) return childActions.get(selector);
    return null;
  },
};

Object.assign(globalThis, {
  window: childWindow,
  document: documentLike,
  location: { search: `?parentOrigin=${encodeURIComponent(PARENT_ORIGIN)}` },
  MutationObserver: FakeMutationObserver,
  PointerEvent: FakePointerEvent,
  getComputedStyle: () => ({ display: 'none', visibility: 'hidden' }),
  innerWidth: 800,
  innerHeight: 600,
});

function messageEvent(data, { source = parentWindow, origin = PARENT_ORIGIN } = {}) {
  const event = new Event('message');
  Object.defineProperties(event, {
    data: { value: data },
    source: { value: source },
    origin: { value: origin },
  });
  return event;
}

function send(data, options) {
  childWindow.dispatchEvent(messageEvent(data, options));
}

function input(message) {
  return { type: INPUT_TYPE, ...message };
}

await import(`../pirate-fruit-offline/unified-input-bridge-v900.mjs?test=${Date.now()}`);

assert.equal(parentMessages.some(({ message }) => message.type === READY_TYPE), false, 'ready waits for the real camera zone');
cameraZone = new FakeTarget('cameraZone');
FakeMutationObserver.flush();
assert.equal(parentMessages.some(({ message }) => message.type === READY_TYPE), false, 'a camera zone created before iframe load cannot race the parent generation');
documentLike.readyState = 'complete';
childWindow.dispatchEvent(new Event('load'));
assert.deepEqual(
  parentMessages.filter(({ message }) => message.type === READY_TYPE),
  [{ message: { type: READY_TYPE }, origin: PARENT_ORIGIN }],
  'ready is type-only and is sent exactly after the camera zone exists',
);
FakeMutationObserver.flush();
assert.equal(parentMessages.filter(({ message }) => message.type === READY_TYPE).length, 1, 'ready is announced once per child document');

send(input({ kind: 'camera', phase: 'start', frameGeneration: 1, gestureId: 1, x: 1, y: 2 }), { origin: 'https://attacker.example' });
send(input({ kind: 'camera', phase: 'start', frameGeneration: 1, gestureId: 1, x: 1, y: 2 }), { source: {} });
send(input({ kind: 'camera', phase: 'move', frameGeneration: 1, gestureId: 1, x: 2, y: 3 }));
send(input({ kind: 'camera', phase: 'end', frameGeneration: 1, gestureId: 1 }));
send(input({ kind: 'camera', phase: 'start', frameGeneration: 1, gestureId: 0, x: 1, y: 2 }));
send(input({ kind: 'camera', phase: 'start', frameGeneration: 1, gestureId: 1.5, x: 1, y: 2 }));
assert.equal(eventLog.length, 0, 'source/origin violations, orphan packets, and non-positive integer gesture ids are rejected');
send(input({ kind: 'camera', phase: 'start', frameGeneration: 1, gestureId: 1, x: 10, y: 20 }));
assert.equal(eventLog.length, 1, 'a valid start can establish the first generation without an init handshake');
assert.deepEqual(eventLog[0], { target: 'cameraZone', type: 'pointerdown', pointerId: 9102, x: 10, y: 20 });

send(input({ kind: 'camera', phase: 'start', frameGeneration: 1, gestureId: 1, x: 99, y: 99 }));
assert.equal(eventLog.length, 1, 'duplicate start for the active identity is idempotent');
send(input({ kind: 'camera', phase: 'move', frameGeneration: 1, gestureId: 0, x: 12, y: 22 }));
send(input({ kind: 'camera', phase: 'move', frameGeneration: 1, gestureId: 2, x: 12, y: 22 }));
send(input({ kind: 'camera', phase: 'end', frameGeneration: 2, gestureId: 1 }));
assert.equal(eventLog.length, 1, 'invalid, orphan, and mismatched move/end messages are ignored');

send(input({ kind: 'camera', phase: 'move', frameGeneration: 1, gestureId: 1, x: 15, y: 25 }));
send(input({ kind: 'camera', phase: 'start', frameGeneration: 1, gestureId: 2, x: 30, y: 40 }));
assert.deepEqual(eventLog.slice(1), [
  { target: 'window', type: 'pointermove', pointerId: 9102, x: 15, y: 25 },
  { target: 'window', type: 'pointerup', pointerId: 9102, x: 15, y: 25 },
  { target: 'cameraZone', type: 'pointerdown', pointerId: 9102, x: 30, y: 40 },
], 'a newer gesture closes the active gesture exactly once before starting');

send(input({ kind: 'camera', phase: 'end', frameGeneration: 1, gestureId: 1 }));
assert.equal(eventLog.length, 4, 'a delayed terminal from the replaced gesture cannot close the newer gesture');
send(input({ kind: 'camera', phase: 'end', frameGeneration: 1, gestureId: 2 }));
send(input({ kind: 'camera', phase: 'end', frameGeneration: 1, gestureId: 2 }));
assert.equal(eventLog.filter(({ type }) => type === 'pointerup').length, 2, 'matching and duplicate terminal events synthesize one terminal');
send(input({ kind: 'camera', phase: 'start', frameGeneration: 1, gestureId: 1, x: 50, y: 60 }));
assert.equal(eventLog.filter(({ type }) => type === 'pointerdown').length, 2, 'a replay below the gesture high-water cannot restart the camera');

send(input({ kind: 'camera', phase: 'start', frameGeneration: 1, gestureId: 3, x: 50, y: 60 }));
send(input({ kind: 'camera', phase: 'start', frameGeneration: 2, gestureId: 1, x: 70, y: 80 }));
assert.deepEqual(eventLog.slice(-3), [
  { target: 'cameraZone', type: 'pointerdown', pointerId: 9102, x: 50, y: 60 },
  { target: 'window', type: 'pointerup', pointerId: 9102, x: 50, y: 60 },
  { target: 'cameraZone', type: 'pointerdown', pointerId: 9102, x: 70, y: 80 },
], 'a higher frame generation terminates the old generation and starts with a fresh gesture sequence');
send(input({ kind: 'camera', phase: 'move', frameGeneration: 1, gestureId: 3, x: 500, y: 600 }));
assert.notDeepEqual(eventLog.at(-1), { target: 'window', type: 'pointermove', pointerId: 9102, x: 500, y: 600 });

const terminalsBeforeReset = eventLog.filter(({ type }) => type === 'pointerup').length;
send(input({ kind: 'reset', frameGeneration: 1 }));
assert.equal(eventLog.filter(({ type }) => type === 'pointerup').length, terminalsBeforeReset, 'a stale reset cannot terminate the newer frame generation');
send(input({ kind: 'reset', frameGeneration: 2 }));
send(input({ kind: 'reset', frameGeneration: 2 }));
assert.equal(eventLog.filter(({ type }) => type === 'pointerup').length, terminalsBeforeReset + 1, 'reset closes an active camera once');

send(input({ kind: 'camera', phase: 'start', frameGeneration: 2, gestureId: 2, x: 90, y: 100 }));
childWindow.dispatchEvent(new Event('blur'));
childWindow.dispatchEvent(new Event('blur'));
const terminalsAfterBlur = eventLog.filter(({ type }) => type === 'pointerup').length;
assert.equal(terminalsAfterBlur, terminalsBeforeReset + 2, 'blur closes an active camera exactly once');
send(input({ kind: 'camera', phase: 'move', frameGeneration: 2, gestureId: 2, x: 95, y: 105 }));
assert.notEqual(eventLog.at(-1)?.type, 'pointermove', 'blur leaves no active gesture for a delayed move');

send(input({ kind: 'camera', phase: 'start', frameGeneration: 2, gestureId: 3, x: 110, y: 120 }));
const terminalsBeforeReload = eventLog.filter(({ type }) => type === 'pointerup').length;
send(input({ kind: 'reset', frameGeneration: 3 }));
assert.equal(eventLog.filter(({ type }) => type === 'pointerup').length, terminalsBeforeReload + 1, 'a reload generation reset terminates the prior document gesture once');
let audioUnlocks = 0;
childWindow.__audio = { unlock: () => { audioUnlocks += 1; return Promise.resolve(true); } };
send(input({ kind: 'audio-unlock', frameGeneration: 3 }));
assert.equal(audioUnlocks, 1, 'parent control gesture unlocks the Pirate iframe audio graph');
const startsBeforeStaleReloadPackets = eventLog.filter(({ type }) => type === 'pointerdown').length;
send(input({ kind: 'camera', phase: 'start', frameGeneration: 2, gestureId: 4, x: 130, y: 140 }));
send(input({ kind: 'camera', phase: 'move', frameGeneration: 2, gestureId: 3, x: 135, y: 145 }));
send(input({ kind: 'camera', phase: 'end', frameGeneration: 2, gestureId: 3 }));
assert.equal(eventLog.filter(({ type }) => type === 'pointerdown').length, startsBeforeStaleReloadPackets, 'packets from the pre-reload generation remain stale');
send(input({ kind: 'camera', phase: 'start', frameGeneration: 3, gestureId: 1, x: 150, y: 160 }));
const modeMessagesBeforeBoat = parentMessages.filter(({ message }) => message.type === 'pocketmonster:unified-mobile-input-mode-v1').length;
childActions.get('.tc-cannon-right').style.display = 'flex';
FakeMutationObserver.flush();
assert.deepEqual(
  parentMessages.filter(({ message }) => message.type === 'pocketmonster:unified-mobile-input-mode-v1').at(-1),
  {
    message: {
      type: 'pocketmonster:unified-mobile-input-mode-v1',
      frameGeneration: 3,
      controlMode: 'boat',
    },
    origin: PARENT_ORIGIN,
  },
  'native TouchControls publishes boat mode only after the parent-established generation',
);
assert.equal(parentMessages.filter(({ message }) => message.type === 'pocketmonster:unified-mobile-input-mode-v1').length, modeMessagesBeforeBoat + 1);

send(input({ kind: 'action', frameGeneration: 3, action: 'cannonRight', phase: 'start', pointerId: 41 }));
send(input({ kind: 'action', frameGeneration: 3, action: 'cannonRight', phase: 'end', pointerId: 41 }));
assert.deepEqual(
  eventLog.filter(({ target }) => target === 'cannonRight').map(({ type }) => type),
  ['pointerdown', 'pointerup'],
  'boat cannon action reaches the active native cannon button',
);
assert.equal(eventLog.some(({ target }) => target === 'attack'), false, 'boat cannon action never falls through to hidden player attack');
childActions.get('.interaction-prompt').style.display = 'block';
childActions.get('.interaction-prompt').textContent = '☸ ปล่อยพวงมาลัย';
FakeMutationObserver.flush();
assert.deepEqual(
  parentMessages.filter(({ message }) => message.type === 'pocketmonster:unified-mobile-input-interaction-v1').at(-1),
  {
    message: {
      type: 'pocketmonster:unified-mobile-input-interaction-v1',
      frameGeneration: 3,
      helmPrompt: 'leave',
    },
    origin: PARENT_ORIGIN,
  },
  'only the visible native helm prompt publishes a parent wheel state',
);
assert.equal(
  childActions.get('.interaction-prompt').dataset.unifiedHelmProxy,
  'true',
  'the child tags the existing helm prompt so only its duplicate center panel is hidden',
);
send(input({ kind: 'action', frameGeneration: 3, action: 'interact', phase: 'start', pointerId: 42 }));
send(input({ kind: 'action', frameGeneration: 3, action: 'interact', phase: 'end', pointerId: 42 }));
assert.deepEqual(
  eventLog.filter(({ target }) => target === 'helmPrompt').map(({ type }) => type),
  ['pointerdown', 'pointerup'],
  'the parent wheel dispatches the existing native interaction prompt only',
);
childActions.get('.interaction-prompt').textContent = '💬 คุยกับ กะลาสี';
FakeMutationObserver.flush();
assert.equal(
  childActions.get('.interaction-prompt').dataset.unifiedHelmProxy,
  undefined,
  'a non-helm interaction restores its own original center prompt instead of being hidden',
);
childWindow.dispatchEvent(new Event('pagehide'));
childWindow.dispatchEvent(new Event('pagehide'));
assert.equal(eventLog.filter(({ target, type }) => target === 'window' && type === 'pointerup').length, terminalsBeforeReload + 2, 'pagehide closes an active camera exactly once');

joystickZone = new FakeTarget('joystickZone');
send(input({ kind: 'move', frameGeneration: 1, active: true, x: 1, z: 0 }));
assert.equal(eventLog.some(({ target }) => target === 'joystickZone'), false, 'stale non-camera input cannot cross a frame generation');

console.log('V9 Pirate unified input bridge recovery: PASS');
