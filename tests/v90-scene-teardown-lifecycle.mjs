import assert from 'node:assert/strict';

const SCENE_TEARDOWN_EVENT = 'pocketmonster:online-scene-teardown';

class TestCustomEvent extends Event {
  constructor(type, options) {
    super(type);
    this.detail = options?.detail;
  }
}

const parentEvents = new EventTarget();
const childEvents = new EventTarget();
assert.notEqual(parentEvents, childEvents, 'parent and child must use separate EventTarget instances');

const launchSession = Object.freeze({
  sessionToken: 'child-closure-token',
  expiresAtUtc: '2099-01-01T00:00:00Z',
});
const serverGate = Object.freeze({
  state: 'healthy',
  allowFirebaseFallback: false,
  allowPlayerDataWrites: false,
  writePolicy: Object.freeze({ enabled: false, playerDataWrites: false }),
});
const serverGateObservation = Object.freeze({ gateState: 'healthy' });
let parentEndCalls = 0;
let sceneBootRegistrations = 0;
let sceneBootReports = 0;
let sceneBootLeaves = 0;
const sceneLease = Object.freeze({ kind: 'monsterlife-online-scene-lease-v1', generation: 1 });
const parentWindow = parentEvents;
parentWindow.location = { origin: 'https://game.example' };
parentWindow.POCKETMONSTER_RUNTIME_CONFIG = Object.freeze({
  manifestValid: true,
  featureFlags: Object.freeze({ launchTicket: true }),
});
parentWindow.POCKETMONSTER_LAUNCH_SESSION = launchSession;
parentWindow.POCKETMONSTER_SERVER_GATE = serverGate;
parentWindow.POCKETMONSTER_SERVER_GATE_OBSERVATION = serverGateObservation;
parentWindow.POCKETMONSTER_ONLINE_SHELL = Object.freeze({
  kind: 'monsterlife-online-world-shell-v1',
  registerSceneBoot(receivedWindow, href) {
    assert.equal(receivedWindow, childWindow);
    assert.equal(href, childWindow.location.href);
    sceneBootRegistrations += 1;
    return sceneLease;
  },
  reportSceneBoot(receivedWindow, lease) {
    assert.equal(receivedWindow, childWindow);
    assert.equal(lease, sceneLease);
    sceneBootReports += 1;
    return true;
  },
  leaveSceneBoot(receivedWindow, lease) {
    assert.equal(receivedWindow, childWindow);
    assert.equal(lease, sceneLease);
    sceneBootLeaves += 1;
    return true;
  },
  endSession() { parentEndCalls += 1; return true; },
});

const childWindow = childEvents;
childWindow.parent = parentWindow;
childWindow.location = { origin: 'https://game.example' };
childWindow.CustomEvent = TestCustomEvent;
globalThis.window = childWindow;
globalThis.location = childWindow.location;
globalThis.CustomEvent = TestCustomEvent;

const body = {
  children: [{ id: 'sceneBootstrapStatus' }],
  replaceChildren(...children) { this.children = children; },
};
globalThis.document = {
  body,
  documentElement: { dataset: {} },
  getElementById() { return null; },
};

let resolveFetchStarted;
const fetchStarted = new Promise(resolve => { resolveFetchStarted = resolve; });
let fetchSignal = null;
globalThis.fetch = async (_url, options = {}) => {
  fetchSignal = options.signal || null;
  resolveFetchStarted();
  return new Promise((_resolve, reject) => {
    fetchSignal?.addEventListener('abort', () => {
      const error = new Error('scene fetch aborted by parent teardown');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
};

const sceneImport = import(`../scene-entry-v900.mjs?teardown-test=${Date.now()}`)
  .then(() => null, error => error);
await fetchStarted;
assert.equal(sceneBootRegistrations, 1, 'child registers its boot lease before template work');
assert.equal(sceneBootReports, 0);

const sceneHandle = childWindow.POCKETMONSTER_ONLINE_SCENE;
assert.ok(sceneHandle, 'scene publishes its lifecycle handle before starting abortable work');
assert.equal(sceneHandle.diagnostics().hasSessionToken, true, 'scene closure initially owns the parent session token');
assert.equal(childWindow.POCKETMONSTER_LAUNCH_SESSION, launchSession);
assert.equal(childWindow.POCKETMONSTER_SERVER_GATE, serverGate, 'child inherits the exact parent Server gate');
assert.equal(childWindow.POCKETMONSTER_SERVER_GATE_OBSERVATION, serverGateObservation);
assert.equal(fetchSignal?.aborted, false);

let parentTargetSignals = 0;
parentEvents.addEventListener(SCENE_TEARDOWN_EVENT, () => { parentTargetSignals += 1; });
const detail = { reason: 'parent-logout', acknowledged: false };
childEvents.dispatchEvent(new TestCustomEvent(SCENE_TEARDOWN_EVENT, { detail }));

const importError = await sceneImport;
assert.equal(importError?.name, 'AbortError', 'in-flight child bootstrap is aborted');
assert.equal(detail.acknowledged, true, 'child synchronously acknowledges the explicit parent teardown signal');
assert.equal(parentTargetSignals, 0, 'child teardown event does not leak onto the parent EventTarget');
assert.equal(parentEndCalls, 0, 'a parent-originated teardown cannot recursively end the parent session');
assert.equal(sceneBootReports, 0, 'AbortError during parent teardown is not reported as a scene failure');
assert.equal(sceneBootLeaves, 0, 'parent already owns lease invalidation during explicit teardown');
assert.equal(fetchSignal.aborted, true);
assert.deepEqual(sceneHandle.diagnostics(), {
  ended: true,
  reason: 'parent-logout',
  aborted: true,
  hasSessionToken: false,
});
assert.equal('POCKETMONSTER_LAUNCH_SESSION' in childWindow, false);
assert.equal('POCKETMONSTER_SERVER_SESSION_TOKEN' in childWindow, false);
assert.equal('POCKETMONSTER_RUNTIME_CONFIG' in childWindow, false);
assert.equal('POCKETMONSTER_SERVER_GATE' in childWindow, false);
assert.equal('POCKETMONSTER_SERVER_GATE_OBSERVATION' in childWindow, false);
assert.equal('POCKETMONSTER_ONLINE_SCENE' in childWindow, false);
assert.deepEqual(body.children, [], 'child DOM is cleared before its iframe realm is discarded');
assert.equal(parentWindow.POCKETMONSTER_LAUNCH_SESSION, launchSession, 'child cleanup never mutates the parent session owner');
assert.equal(parentWindow.POCKETMONSTER_SERVER_GATE, serverGate, 'child cleanup never mutates the parent gate owner');

console.log('V9 child scene teardown lifecycle: PASS');
