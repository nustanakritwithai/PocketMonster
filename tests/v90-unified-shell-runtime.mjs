import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixtureCombat } from './v91-combat-fixtures.mjs';

const scenario = process.argv[2] || '';
const windowEvents = new EventTarget();
const teardownSequence = [];
globalThis.window = globalThis;
window.addEventListener = windowEvents.addEventListener.bind(windowEvents);
window.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
window.dispatchEvent = windowEvents.dispatchEvent.bind(windowEvents);
globalThis.CustomEvent = class extends Event {
  constructor(type, options) { super(type); this.detail = options?.detail; }
};

const locationState = {
  href: 'https://game.example/index.html?world=pirate-fruit&panel=human',
  origin: 'https://game.example',
  pathname: '/index.html',
  search: '?world=pirate-fruit&panel=human',
  replacedWith: null,
  replace(value) { teardownSequence.push('redirect'); this.replacedWith = value; },
};
globalThis.location = locationState;
function setTopLocation(value) {
  const url = new URL(value, locationState.href);
  locationState.href = url.href;
  locationState.origin = url.origin;
  locationState.pathname = url.pathname;
  locationState.search = url.search;
}
const historyCalls = [];
globalThis.history = {
  replaceState(state, _title, value) { historyCalls.push({ type: 'replace', state, value }); setTopLocation(value); },
  pushState() { assert.fail('shell must not add a second history entry on top of child navigation'); },
};

function classList() {
  const values = new Set();
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value),
    toggle(value) { if (values.has(value)) values.delete(value); else values.add(value); },
  };
}
function element(tag, id = '') {
  return {
    get ownerDocument() { return globalThis.document; },
    tagName: tag.toUpperCase(),
    id,
    title: '',
    dataset: {},
    style: {},
    children: [],
    classList: classList(),
    value: '',
    textContent: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this[name] = value; },
    addEventListener() {},
    querySelector() { return null; },
    focus() {},
    remove() { this.removed = true; },
  };
}

const sceneWindowEvents = new EventTarget();
let sceneFocusCount = 0;
const sceneWindow = {
  location: { href: 'about:blank' },
  CustomEvent: globalThis.CustomEvent,
  addEventListener: sceneWindowEvents.addEventListener.bind(sceneWindowEvents),
  dispatchEvent: sceneWindowEvents.dispatchEvent.bind(sceneWindowEvents),
  focus() { sceneFocusCount += 1; },
};
const frameListeners = new Map();
const sceneFrame = element('iframe', 'onlineWorldSceneFrame');
sceneFrame.contentWindow = sceneWindow;
sceneFrame.addEventListener = (type, handler) => frameListeners.set(type, handler);
Object.defineProperty(sceneFrame, 'src', {
  get() { return this.srcValue || ''; },
  set(value) {
    if (value === 'about:blank') teardownSequence.push('blank');
    this.srcValue = value;
    sceneWindow.location.href = value;
    delete sceneWindow.POCKETMONSTER_WORLD_STATE;
    delete sceneWindow.POCKETMONSTER_WORLD_PRESENCE;
  },
});
sceneFrame.remove = () => {
  teardownSequence.push('remove');
  sceneFrame.removed = true;
};
sceneFrame.emitLoad = () => frameListeners.get('load')?.();

const elements = new Map();
const gameChat = element('section', 'gameChat');
const headerNote = { after(node) { elements.set(node.id, node); } };
gameChat.querySelector = selector => selector === 'header span' ? headerNote : null;
for (const id of ['gameChat', 'chatToggleBtn', 'chatCloseBtn', 'chatForm', 'chatMessages', 'chatError', 'chatInput']) {
  elements.set(id, id === 'gameChat' ? gameChat : element('div', id));
}
const body = element('body');
let iframeCreates = 0;
globalThis.document = {
  documentElement: { dataset: {} },
  head: { append(node) { if (node.id) elements.set(node.id, node); } },
  body,
  getElementById(id) { return elements.get(id) || null; },
  querySelector(selector) { return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null; },
  createElement(tag) {
    if (tag === 'iframe') { iframeCreates += 1; return sceneFrame; }
    const node = element(tag);
    if (tag === 'select') node.value = 'WORLD';
    return node;
  },
};
let fullscreenRequestCount = 0;
document.documentElement.requestFullscreen = async () => {
  fullscreenRequestCount += 1;
  document.fullscreenElement = document.documentElement;
};

window.POCKETMONSTER_RUNTIME_CONFIG = Object.freeze({
  manifestValid: true,
  apiBaseUrl: 'https://server.example',
  webSocketUrl: 'wss://server.example/ws/chat',
  featureFlags: Object.freeze({
    launchTicket: true,
    vpsWrites: false,
    playerDataWrites: false,
    firebaseFallback: false,
  }),
});
window.POCKETMONSTER_LAUNCH_SESSION = Object.freeze({
  sessionToken: 'stable-shell-session',
  expiresAtUtc: '2099-01-01T00:00:00Z',
});
const serverGate = Object.freeze({
  state: 'healthy',
  allowFirebaseFallback: false,
  allowPlayerDataWrites: false,
  writePolicy: Object.freeze({ enabled: false, playerDataWrites: false }),
});
const serverGateObservation = Object.freeze({ gateState: 'healthy' });
if (scenario !== 'missing-server-gate') {
  window.POCKETMONSTER_SERVER_GATE = serverGate;
  window.POCKETMONSTER_SERVER_GATE_OBSERVATION = serverGateObservation;
}
const launchSessionIdentity = window.POCKETMONSTER_LAUNCH_SESSION;
const sessionValues = new Map([['monsterlife.session.v1', JSON.stringify(window.POCKETMONSTER_LAUNCH_SESSION)]]);
globalThis.sessionStorage = {
  getItem(key) { return sessionValues.get(key) || null; },
  removeItem(key) { sessionValues.delete(key); },
};
globalThis.fetch = async () => ({ ok: true, json: async () => ({ messages: [] }) });

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  send() {}
  close() { this.readyState = FakeWebSocket.CLOSED; this.listeners.get('close')?.(); }
}
globalThis.WebSocket = FakeWebSocket;

let shellImportError = null;
try {
  await import(`../online-world-shell-v900.mjs?runtime-test=${scenario}-${Date.now()}`);
} catch (error) {
  shellImportError = error;
}
if (scenario === 'missing-server-gate') {
  assert.equal(shellImportError?.code, 'ONLINE_SERVER_REQUIRED');
  assert.equal(iframeCreates, 0, 'missing parent gate fails before scene iframe construction');
  assert.equal(FakeWebSocket.instances.length, 0, 'missing parent gate fails before transport construction');
  console.log('V9 unified shell missing Server gate: PASS');
  process.exit(0);
}
if (shellImportError) throw shellImportError;
await new Promise(resolve => setTimeout(resolve, 20));

const onlineShell = window.POCKETMONSTER_ONLINE_SHELL;
const bootId = onlineShell.bootId;
const chatNode = elements.get('gameChat');
const frameNode = body.children[0].children.find(node => node.tagName === 'IFRAME');
const combatHostNode = body.children[0].children.find(node => node.id === 'combatV91Shell');
const combatController = onlineShell.combat;
const shellStatusNode = body.children[0].children.find(node => node.id === 'onlineWorldShellStatus');
let readyEvents = 0;
let errorEvents = 0;
window.addEventListener('pocketmonster:online-scene-ready', () => { readyEvents += 1; });
window.addEventListener('pocketmonster:online-scene-error', () => { errorEvents += 1; });
assert.equal(frameNode, sceneFrame);
assert.ok(combatHostNode, 'persistent parent shell owns one Combat V9.1 host');
assert.equal(body.children[0].children.filter(node => node.id === 'combatV91Shell').length, 1);
assert.equal(iframeCreates, 1, 'Combat integration must not create another iframe');
assert.ok(Object.isFrozen(combatController));
assert.equal(combatController.authority, 'client_projection_only');
assert.equal(combatController.serverReconcileExposed, false);
assert.equal(typeof combatController.reconcile, 'undefined', 'untrusted scenes cannot forge Server reconciliation');
assert.equal('POCKETMONSTER_COMBAT_V91_SHELL' in window, false,
  'Combat reuses the one non-configurable online-shell capability instead of adding another global');
assert.equal(FakeWebSocket.instances.length, 1);
assert.equal(onlineShell.diagnostics().chat.socketCreates, 1);
assert.equal(await onlineShell.requestFullscreen({ navigationUI: 'hide' }), true);
assert.equal(await onlineShell.requestFullscreen({ navigationUI: 'hide' }), true);
assert.equal(fullscreenRequestCount, 1, 'persistent shell requests fullscreen once and reuses it across scene swaps');

const combatFixture = fixtureCombat({ combatId: 'combat:v90-parent-shell' });
const combatSessionOptions = Object.freeze({
  combatId: combatFixture.combatId,
  profiles: [combatFixture.actor, combatFixture.target],
  statusSnapshots: [combatFixture.actorStatus, combatFixture.targetStatus],
  focusedEntityId: combatFixture.actor.entityId,
});
function openCombatProjection() {
  const opened = combatController.openSession(combatSessionOptions);
  assert.equal(opened.ok, true, opened.reason);
  assert.equal(combatHostNode.hidden, false);
  assert.equal(combatHostNode.children.length, 1, 'one host renders one Combat panel');
  assert.equal(combatController.readState()?.combatId, combatFixture.combatId);
  assert.equal(onlineShell.diagnostics().combat.active, true);
}

function installScenePose(zone) {
  const snapshots = [];
  sceneWindow.POCKETMONSTER_WORLD_STATE = () => ({ zone, x: 1, z: 2, dir: 0.5 });
  sceneWindow.POCKETMONSTER_WORLD_PRESENCE = snapshot => snapshots.push(snapshot);
  return snapshots;
}

function registerSceneBoot() {
  const lease = onlineShell.registerSceneBoot(sceneWindow, sceneWindow.location.href);
  assert.ok(lease && Object.isFrozen(lease), 'same-origin scene receives one frozen boot lease');
  return lease;
}

function reportSceneReady(lease) {
  assert.equal(onlineShell.reportSceneBoot(sceneWindow, lease, Object.freeze({ status: 'ready' })), true);
}

let snapshots = installScenePose('pirate-fruit');
let activeLease = registerSceneBoot();
sceneFrame.emitLoad();
assert.equal(shellStatusNode.classList.contains('hidden'), false, 'iframe load alone cannot claim runtime readiness');
assert.equal(onlineShell.diagnostics().sceneReadyCount, 0);
assert.equal(combatController.openSession(combatSessionOptions).reason, 'online_scene_inactive',
  'Combat remains unavailable until the active scene reports ready');
reportSceneReady(activeLease);
openCombatProjection();
assert.equal(sceneFocusCount, 1, 'ready scene receives input focus');
assert.equal(shellStatusNode.classList.contains('hidden'), true);
assert.equal(readyEvents, 1);
assert.equal(onlineShell.reportSceneBoot(sceneWindow, activeLease, { status: 'ready' }), false, 'duplicate reports are rejected');
assert.equal(onlineShell.diagnostics().activeWorld, 'pirate-fruit');
assert.equal(window.POCKETMONSTER_WORLD_PRESENCE({ zone: 'hub', players: [] }), false);
assert.equal(window.POCKETMONSTER_WORLD_PRESENCE({ zone: 'pirate-fruit', players: [{ id: 'p1', x: 1, z: 2 }] }), true);
assert.equal(snapshots.length, 1);

const teardownCombatReopenAttempts = [];
sceneWindow.addEventListener('pocketmonster:online-scene-teardown', event => {
  teardownCombatReopenAttempts.push(Object.freeze({
    reason: event.detail?.reason,
    result: combatController.openSession(combatSessionOptions),
  }));
});

for (const [world, panel, zone] of [
  ['pocket-monster', 'throw', 'hub'],
  ['living-world', 'human', 'living-world'],
  ['pirate-fruit', 'human', 'pirate-fruit'],
]) {
  const reopenAttemptCount = teardownCombatReopenAttempts.length;
  assert.equal(onlineShell.navigate(world, panel), true);
  assert.equal(teardownCombatReopenAttempts.length, reopenAttemptCount + 1,
    'the outgoing child receives one synchronous teardown signal');
  assert.equal(teardownCombatReopenAttempts.at(-1).result.reason, 'online_scene_inactive',
    'the outgoing child cannot reopen Combat during scene teardown');
  assert.equal(combatController.readState(), null, 'scene navigation closes pending Combat state');
  assert.equal(combatHostNode.hidden, true);
  assert.deepEqual(combatHostNode.children, []);
  assert.equal(shellStatusNode.classList.contains('hidden'), false);
  assert.equal(onlineShell.reportSceneBoot(sceneWindow, activeLease, { status: 'ready' }), false, 'navigation invalidates the prior document lease before changing src');
  snapshots = installScenePose(zone);
  activeLease = registerSceneBoot();
  sceneFrame.emitLoad();
  assert.equal(shellStatusNode.classList.contains('hidden'), false, 'new document load waits for its own ready report');
  reportSceneReady(activeLease);
  assert.equal(sceneFocusCount, onlineShell.diagnostics().sceneReadyCount, 'each new ready scene regains input focus');
  assert.equal(onlineShell.diagnostics().activeWorld, world);
  assert.equal(window.POCKETMONSTER_WORLD_STATE().zone, zone);
  assert.equal(onlineShell.bootId, bootId, 'top-level shell identity survives scene navigation');
  assert.equal(window.POCKETMONSTER_LAUNCH_SESSION, launchSessionIdentity, 'the same Monster Life session object survives scene navigation');
  assert.equal(elements.get('gameChat'), chatNode, 'Chat DOM identity survives scene navigation');
  assert.equal(body.children[0].children.find(node => node.tagName === 'IFRAME'), frameNode, 'one iframe browsing context is reused');
  assert.equal(body.children[0].children.find(node => node.id === 'combatV91Shell'), combatHostNode,
    'one Combat host DOM identity survives scene navigation');
  assert.equal(onlineShell.combat, combatController, 'one Combat controller identity survives scene navigation');
  assert.equal(FakeWebSocket.instances.length, 1, 'scene navigation cannot create another socket');
  openCombatProjection();
}

const readyCountBeforeError = onlineShell.diagnostics().sceneReadyCount;
assert.equal(onlineShell.navigate('pocket-monster', 'throw'), true);
const errorLease = registerSceneBoot();
sceneFrame.emitLoad();
assert.equal(onlineShell.reportSceneBoot(sceneWindow, errorLease, {
  status: 'error',
  code: 'ONLINE_SCENE_BOOT_FAILED',
  stage: 'runtime',
}), true);
assert.equal(shellStatusNode.classList.contains('hidden'), false);
assert.equal(shellStatusNode.classList.contains('error'), true);
assert.equal(onlineShell.diagnostics().sceneReadyCount, readyCountBeforeError);
assert.equal(errorEvents, 1);
assert.equal(onlineShell.reportSceneBoot(sceneWindow, errorLease, { status: 'ready' }), false, 'an errored lease cannot later become ready');
assert.equal(combatController.openSession(combatSessionOptions).reason, 'online_scene_inactive',
  'an errored scene cannot open Combat');

setTopLocation('/index.html?world=living-world&panel=human');
window.dispatchEvent(new Event('popstate'));
installScenePose('living-world');
assert.equal(onlineShell.reportSceneBoot(sceneWindow, errorLease, { status: 'ready' }), false);
activeLease = registerSceneBoot();
sceneFrame.emitLoad();
reportSceneReady(activeLease);
openCombatProjection();
assert.equal(onlineShell.diagnostics().activeWorld, 'living-world');
assert.equal(FakeWebSocket.instances.length, 1, 'history traversal keeps the same socket');
assert.ok(historyCalls.every(call => call.type === 'replace'));

let parentTeardownEvents = 0;
let childTeardownDetail = null;
let staleReportDuringTeardown = null;
window.addEventListener('pocketmonster:online-scene-teardown', () => { parentTeardownEvents += 1; });
sceneWindow.POCKETMONSTER_LAUNCH_SESSION = Object.freeze({ sessionToken: 'child-session-token' });
sceneWindow.addEventListener('pocketmonster:online-scene-teardown', event => {
  teardownSequence.push('child-signal');
  staleReportDuringTeardown = onlineShell.reportSceneBoot(sceneWindow, activeLease, { status: 'ready' });
  childTeardownDetail = event.detail;
  delete sceneWindow.POCKETMONSTER_LAUNCH_SESSION;
  event.detail.acknowledged = true;
});
assert.equal(onlineShell.endSession('test-session-ended'), true);
assert.equal(onlineShell.endSession('duplicate-session-ended'), false, 'parent session cleanup is idempotent');
assert.equal(sessionValues.has('monsterlife.session.v1'), false, 'parent session owner clears tab storage');
assert.equal('POCKETMONSTER_LAUNCH_SESSION' in window, false, 'parent session owner clears the global session object');
assert.equal('POCKETMONSTER_SERVER_GATE' in window, false, 'parent logout clears the inherited Server gate');
assert.equal('POCKETMONSTER_SERVER_GATE_OBSERVATION' in window, false, 'parent logout clears Server gate observation');
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().stopped, true);
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().hasToken, false);
assert.equal(parentTeardownEvents, 0, 'teardown signal is dispatched in the child realm, not the parent EventTarget');
assert.equal(staleReportDuringTeardown, false, 'logout invalidates the active lease before signalling the child');
assert.deepEqual(childTeardownDetail, { reason: 'test-session-ended', acknowledged: true });
assert.equal('POCKETMONSTER_LAUNCH_SESSION' in sceneWindow, false, 'child receives teardown before its realm is discarded');
assert.equal(sceneFrame.src, 'about:blank', 'parent blanks the child browsing context before redirect');
assert.equal(sceneFrame.removed, true, 'parent removes the child iframe before redirect');
assert.equal(combatController.readState(), null, 'logout clears the Combat state');
assert.equal(combatHostNode.hidden, true, 'logout hides the Combat host before removing it');
assert.deepEqual(combatHostNode.children, []);
assert.equal(combatHostNode.removed, true, 'logout removes the Combat host before redirect');
assert.equal(combatController.openSession({}).reason, 'online_session_inactive');
assert.equal(teardownCombatReopenAttempts.at(-1).reason, 'test-session-ended');
assert.equal(teardownCombatReopenAttempts.at(-1).result.reason, 'online_session_inactive',
  'the child cannot reopen Combat during logout teardown');
assert.deepEqual(
  teardownSequence,
  ['child-signal', 'blank', 'remove', 'redirect'],
  'child teardown, blanking, and iframe removal must all finish before the launcher redirect',
);
assert.equal(locationState.replacedWith, 'https://pocketmonster-game.web.app/');

const childLifecycle = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('./v90-scene-teardown-lifecycle.mjs', import.meta.url))],
  { encoding: 'utf8' },
);
assert.equal(
  childLifecycle.status,
  0,
  `actual child scene teardown failed\n${childLifecycle.stdout}\n${childLifecycle.stderr}`,
);
assert.match(childLifecycle.stdout, /V9 child scene teardown lifecycle: PASS/);

const missingGateLifecycle = spawnSync(
  process.execPath,
  [fileURLToPath(import.meta.url), 'missing-server-gate'],
  { encoding: 'utf8' },
);
assert.equal(
  missingGateLifecycle.status,
  0,
  `shell missing-gate fail-closed scenario failed\n${missingGateLifecycle.stdout}\n${missingGateLifecycle.stderr}`,
);
assert.match(missingGateLifecycle.stdout, /V9 unified shell missing Server gate: PASS/);

console.log('V9 unified shell runtime lifecycle: PASS');
