import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  MAX_SNAPSHOT_CANDIDATES,
  ONLINE_WORLD_SHELL_KIND,
  createOnlineScenePresenceBridge,
  isHostedOnlineWorldScene,
  sanitizeOnlineWorldPose,
  sanitizeOnlineWorldSnapshot,
} from '../online-world-bridge-v900.mjs';
import {
  isActiveLaunchSession,
  requireActiveOnlineLaunchSession,
} from '../launch-bootstrap.mjs';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const entry = read('entry-preload-v900.mjs');
const shell = read('online-world-shell-v900.mjs');
const bridgeSource = read('online-world-bridge-v900.mjs');
const fullscreenBridge = read('persistent-fullscreen-v900.mjs');
const minimapOwner = read('persistent-minimap-owner-v900.mjs');
const shellCss = read('style-v900.css');
const sceneEntry = read('scene-entry-v900.mjs');
const sceneHtml = read('scene-v900.html');
const worlds = read('worlds-v900.mjs');
const chat = read('chat-runtime.mjs');
const indexHtml = read('index.html');
const v900Html = read('v900.html');
const runtimeConfig = JSON.parse(read('runtime-config.json'));
const pirateOfflineHtml = read('pirate-fruit-offline/index.html');
const pirateBootstrap = read('pirate-fruit-offline/pocket-bootstrap.mjs');

for (const file of [
  'entry-preload-v900.mjs',
  'online-world-bridge-v900.mjs',
  'online-world-shell-v900.mjs',
  'persistent-fullscreen-v900.mjs',
  'persistent-minimap-owner-v900.mjs',
  'scene-entry-v900.mjs',
  'worlds-v900.mjs',
  'chat-runtime.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `${file} syntax failed`);
}

assert.equal(indexHtml, v900Html, 'active and versioned V9 entries stay byte-identical');
assert.match(indexHtml, /entry-preload-v900\.mjs\?v=942/, 'active HTML cache-busts the restored minimap entry');
assert.match(indexHtml, /style-v900\.css\?v=943/, 'active HTML cache-busts the Pirate-primary presentation and persistent shell layout');
assert.match(sceneHtml, /style-v900\.css\?v=943/, 'hosted scene cache-busts the same V9 stylesheet');
assert.doesNotMatch(sceneHtml, /style-v900\.css\?v=913/, 'hosted scene cannot mix a stale stylesheet');
assert.equal((indexHtml.match(/href="\.\/combat-v91\.css\?v=1"/g) || []).length, 1,
  'the parent document loads one Combat V9.1 stylesheet');
assert.match(entry, /persistent-minimap-owner-v900\.mjs\?v=2/, 'top-level entry loads the restored raster/near-far minimap owner revision');
assert.match(minimapOwner, /pocketmonster:persistent-minimap-owner-v2/, 'production minimap owner exposes the v2 capability');
assert.match(minimapOwner, /MAP_RASTER_SIZE = 160/, 'production minimap owner restores the legacy 160px terrain raster');
assert.match(minimapOwner, /PIRATE_FRUIT_MINIMAP_NEAR_PADDING = 18/, 'production minimap owner restores legacy near-range padding');
assert.match(minimapOwner, /PIRATE_FRUIT_MINIMAP_LOCAL_SCALE = 1\.3/, 'production minimap owner restores legacy local island scale');
assert.match(entry, /await prepareLaunch\(config\)[\s\S]*await import\('\.\/online-world-shell-v900\.mjs\?v=32'\)/, 'top-level authenticates once before starting the cache-busted shell');
assert.match(entry, /config\.manifestValid !== true \|\| config\.featureFlags\?\.launchTicket !== true[\s\S]*ONLINE_CONFIG_REQUIRED/, 'V9 entry fails closed before shell boot when online launch configuration is unavailable');
assert.match(entry, /requireActiveOnlineLaunchSession\(config, launch\.session\)/, 'V9 entry verifies the redeemed session before patching or scene boot');
assert.match(entry, /healthVersionGate/, 'persistent parent owns the one Server health/version gate');
const parentSessionGateIndex = entry.indexOf('requireActiveOnlineLaunchSession(config, launch.session)');
const parentServerGateIndex = entry.indexOf('await healthVersionGate(config)');
const parentHealthyGateIndex = entry.indexOf("serverGate.state !== 'healthy'");
const parentPatchIndex = entry.indexOf('await applyPendingPatch()');
const parentShellIndex = entry.indexOf("await import('./online-world-shell-v900.mjs?v=32')");
assert.ok(parentSessionGateIndex >= 0 && parentServerGateIndex > parentSessionGateIndex, 'Server gate runs only after the parent session is valid');
assert.ok(parentHealthyGateIndex > parentServerGateIndex, 'parent explicitly requires a healthy Server gate');
assert.ok(parentPatchIndex > parentHealthyGateIndex, 'unhealthy Server stops before patch or scene work');
assert.ok(parentShellIndex > parentPatchIndex, 'shell starts only after session, Server, and patch gates pass');
assert.match(entry, /POCKETMONSTER_SERVER_GATE/, 'parent publishes the frozen gate capability for embedded scenes');
assert.match(entry, /POCKETMONSTER_SERVER_GATE_OBSERVATION/, 'parent publishes one matching gate observation');
assert.doesNotMatch(entry, /worlds-v900\.mjs|new WebSocket/, 'top-level entry never boots a scene or socket outside the shell');
assert.match(shell, /createElement\('iframe'\)/, 'shell owns one active scene browsing context');
assert.equal((shell.match(/createElement\('iframe'\)/g) || []).length, 1, 'shell creates exactly one scene iframe');
assert.equal((shell.match(/from '\.\/combat-v91-entry\.mjs\?v=3'/g) || []).length, 1,
  'parent shell imports one Combat V9.1 controller module');
assert.equal((shell.match(/createCombatV91Shell\(\{ container: combatHost, transport: combatTransport \}\)/g) || []).length, 1,
  'parent shell creates one Combat controller in one host');
assert.equal((shell.match(/from '\.\/combat-v91-transport\.mjs\?v=1'/g) || []).length, 1,
  'parent shell imports one production Combat transport');
assert.match(shell, /combatTransport\.start\(\{[\s\S]*runtime: window\.POCKETMONSTER_CHAT_RUNTIME/,
  'Combat binds only to the authenticated shared socket runtime');
assert.match(shell, /combatHost\.id = 'combatV91Shell'/, 'Combat uses one persistent parent host');
assert.match(shell, /combat: publicCombatShell/, 'Combat projection capability is part of the one online-shell authority');
assert.doesNotMatch(shell, /POCKETMONSTER_COMBAT_V91_SHELL|\.reconcile\(/,
  'scene code cannot access a second Combat global or forge Server reconciliation');
assert.match(shell, /function signalSceneTeardown\(reason\) \{\s*closeCombatSession\(\)/,
  'scene teardown closes pending Combat state without destroying the persistent host');
assert.match(shell, /await import\('\.\/chat-runtime\.mjs\?v=8\.4\.0-unified-world-shell-5'\)/, 'shell owns the one chat transport');
assert.match(shell, /requireActiveOnlineLaunchSession\(window\.POCKETMONSTER_RUNTIME_CONFIG, window\.POCKETMONSTER_LAUNCH_SESSION\)/, 'shell refuses to create a scene or socket without an active parent session');
const shellServerGateIndex = shell.indexOf('POCKETMONSTER_SERVER_GATE');
const shellFrameIndex = shell.indexOf("createElement('iframe')");
const shellCombatHostIndex = shell.indexOf("createElement('aside')");
assert.ok(shellServerGateIndex >= 0 && shellServerGateIndex < shellFrameIndex, 'shell verifies the inherited healthy gate before creating a scene or socket');
assert.ok(shellCombatHostIndex > shellServerGateIndex, 'shell creates Combat only after the inherited Server gate passes');
assert.doesNotMatch(shell, /location\.(?:assign|replace|reload)/, 'scene changes never navigate the top-level document');
assert.doesNotMatch(shell, /createElement\('style'\)|style\.textContent/, 'shell cannot depend on CSP-blocked inline styles');
assert.match(shellCss, /#onlineWorldSceneFrame\{position:absolute;inset:0;width:100%;height:100%;border:0/, 'external V9 CSS fills the viewport with the active scene');
assert.match(shell, /history\.replaceState/, 'shell mirrors child routes without another full navigation');
assert.match(shell, /registerSceneBoot/, 'shell issues an exact-reference readiness lease to each scene document');
assert.match(shell, /reportSceneBoot/, 'shell accepts sanitized ready/error outcomes only for the active lease');
assert.match(shell, /requestFullscreen: requestPersistentFullscreen/, 'parent shell owns fullscreen across all scene documents');
assert.match(shell, /sceneWindow\.focus\(\)/, 'parent shell restores input focus after each scene reports ready');
assert.match(shell, /lease === activeSceneLease|activeSceneLease === lease/, 'stale scene reports are rejected by exact lease identity');
const rawLoadHandler = shell.match(/sceneFrame\.addEventListener\('load', \(\) => \{([\s\S]*?)\n\}\);/)?.[1] || '';
assert.doesNotMatch(rawLoadHandler, /classList\.add\('hidden'\)|online-scene-loaded/, 'iframe load remains diagnostic and cannot publish false readiness');
assert.match(shell, /POCKETMONSTER_WORLD_STATE = \(\) => presenceBridge\.readPose\(\)/, 'shell owns the stable pose provider');
assert.match(shell, /POCKETMONSTER_WORLD_PRESENCE = payload => presenceBridge\.acceptSnapshot\(payload\)/, 'shell owns the stable snapshot consumer');
assert.match(sceneEntry, /window\.parent\.POCKETMONSTER_LAUNCH_SESSION/, 'hosted scenes reuse the parent session object without redeeming it');
assert.match(sceneEntry, /persistent-fullscreen-v900\.mjs\?v=3/, 'hosted scene installs the persistent fullscreen bridge before the world runtime');
assert.match(sceneEntry, /bindPersistentFullscreenControls\(window, \{ signal: sceneLifetime\.signal \}\)/, 'scene entry binds visible fullscreen controls before any world runtime starts');
assert.match(fullscreenBridge, /shell\.requestFullscreen\(options\)/, 'child fullscreen requests delegate to the top-level owner');
assert.match(pirateOfflineHtml, /persistent-fullscreen-v900\.mjs\?v=3[\s\S]*pocket-bootstrap\.mjs\?v=1/, 'Pirate iframe installs the fullscreen bridge before its save bootstrap');
assert.match(pirateBootstrap, /await installPirateSaveSandbox\(\);[\s\S]*await import\('\.\/assets\/index-C3SJLfq8\.js'\)/, 'Pirate save hydration completes before the exact vendored runtime loads');
assert.match(sceneEntry, /window\.parent\.POCKETMONSTER_RUNTIME_CONFIG/, 'hosted scenes reuse the shell runtime configuration');
assert.doesNotMatch(sceneEntry, /loadRuntimeConfig/, 'hosted scenes cannot independently load or normalize runtime configuration');
assert.match(sceneEntry, /__POCKETMONSTER_RUNTIME_MANIFEST__ = config/, 'legacy scene runtimes receive the same normalized configuration');
assert.match(sceneEntry, /window\.parent\.POCKETMONSTER_SERVER_GATE/, 'hosted scenes inherit the exact parent Server gate');
assert.match(sceneEntry, /POCKETMONSTER_SERVER_GATE = serverGate/, 'legacy scene runtimes receive the inherited gate capability');
assert.match(sceneEntry, /registerSceneBoot\?\.\(window, sceneHref\)/, 'child registers its exact document URL with the parent shell');
assert.match(sceneEntry, /reportSceneBoot\?\.\(window, sceneLease/, 'child reports boot outcome with its exact lease');
assert.match(sceneEntry, /v900\.html\?v=916/, 'hosted scene cache-busts the shared V9 DOM template');
assert.match(sceneEntry, /pagehide[\s\S]*leaveParentSceneBoot\(\)[\s\S]*teardownScene\('scene-pagehide'\)/, 'pagehide revokes the lease and aborts scene capabilities before BFCache');
assert.match(sceneEntry, /endParentSession\('scene-session-ended'\)/, 'child logout delegates cleanup to the parent session owner');
assert.match(sceneEntry, /requireActiveOnlineLaunchSession\(config, launchSession\)/, 'hosted scene rejects missing, malformed, or expired sessions');
assert.match(sceneEntry, /POCKETMONSTER_SCENE_EMBEDDED = true/, 'hosted scene explicitly disables standalone transport boot');
assert.match(sceneEntry, /if \(!isHostedOnlineWorldScene\(window\)\)[\s\S]*throw new Error/, 'scene boot fails closed unless the exact-origin parent shell is present');
assert.match(shell, /combined-worlds-v900\.mjs\?v=926/, 'persistent shell cache-busts the changed world catalog');
assert.match(shell, /searchParams\.set\('shellRevision', '38'\)/, 'persistent shell cache-busts the changed scene HTML');
assert.match(worlds, /combined-worlds-v900\.mjs\?v=926/, 'scene router cache-busts the changed world catalog');
assert.match(sceneEntry, /worlds-v900\.mjs\?v=931/, 'hosted scene cache-busts the three-world router');
assert.match(worlds, /const worldPresenceBindings = new Map\(\)/, 'scene router owns each runtime presence binding');
assert.match(worlds, /const activePresenceBindings = capturePresenceBindings\(\)[\s\S]*await import\(world\.runtime\)[\s\S]*worldPresenceBindings\.set\(world\.id, capturePresenceBindings\(\)\)[\s\S]*lifecycle\.unmount\?\.\(\)[\s\S]*applyPresenceBindings\(activePresenceBindings\)/, 'Pocket prewarm restores the active Pirate presence provider after import');
assert.match(worlds, /runtimeLifecycles\.get\(world\.id\)\?\.mount\?\.\(\)[\s\S]*applyPresenceBindings\(worldPresenceBindings\.get\(world\.id\)\)/, 'mount activates the selected world presence provider');
const childWorldImportIndex = sceneEntry.indexOf("await import('./worlds-v900.mjs?v=931')");
const childReadyReportIndex = sceneEntry.indexOf("status: 'ready'", childWorldImportIndex);
assert.ok(childWorldImportIndex >= 0 && childReadyReportIndex > childWorldImportIndex, 'child reports ready only after the selected world runtime finishes importing');
assert.doesNotMatch(sceneEntry, /prepareLaunch|redeemLaunchTicket|chat-runtime|new WebSocket|sessionStorage/, 'scene entry cannot redeem, persist, or create another transport');
assert.match(worlds, /POCKETMONSTER_SCENE_EMBEDDED !== true[\s\S]*chat-runtime/, 'combined router skips chat inside the hosted scene');
assert.doesNotMatch(sceneHtml, /entry-preload-v900|chat-runtime/, 'scene document cannot boot top-level auth or chat');
assert.equal((chat.match(/new WebSocket/g) || []).length, 1, 'only one physical WebSocket constructor site exists in the transport');
assert.match(chat, /Symbol\.for\('monsterlife\.chat-runtime\.singleton\.v1'\)/, 'chat transport is idempotent across cache-busted imports');
assert.match(chat, /state\.socket\.readyState !== WebSocket\.CLOSED/, 'transport refuses another socket while the previous transport is connecting, open, or closing');
assert.match(chat, /reconnectTimer/, 'transport owns one cancellable reconnect timer');
assert.match(chat, /addEventListener\('pagehide', suspend\)[\s\S]*addEventListener\('pageshow', resume\)/, 'bfcache pauses and resumes the transport without terminal logout');
assert.match(chat, /state\.token = null[\s\S]*state\.after = 0/, 'terminal cleanup erases the bearer token and chat cursor');
assert.doesNotMatch(`${shell}\n${bridgeSource}\n${sceneEntry}`, /new WebSocket|vpsWrites|playerDataWrites|firebaseFallback/, 'shell and bridge stay presentation-only');
assert.equal(runtimeConfig.featureFlags.vpsWrites, false);
assert.equal(runtimeConfig.featureFlags.playerDataWrites, false);
assert.equal(runtimeConfig.featureFlags.firebaseFallback, false);
assert.equal(runtimeConfig.featureFlags.launchTicket, true);

const activeSession = { sessionToken: 'session', expiresAtUtc: '2099-01-01T00:00:00Z' };
assert.equal(isActiveLaunchSession(activeSession), true);
for (const session of [
  null,
  { sessionToken: '', expiresAtUtc: '2099-01-01T00:00:00Z' },
  { sessionToken: 'session', expiresAtUtc: 'not-a-date' },
  { sessionToken: 'session', expiresAtUtc: '2000-01-01T00:00:00Z' },
]) assert.equal(isActiveLaunchSession(session), false);
assert.equal(requireActiveOnlineLaunchSession({ manifestValid: true, featureFlags: { launchTicket: true } }, activeSession), activeSession);
for (const config of [
  { manifestValid: false, featureFlags: { launchTicket: true } },
  { manifestValid: true, featureFlags: { launchTicket: false } },
]) assert.throws(() => requireActiveOnlineLaunchSession(config, activeSession), { code: 'ONLINE_SESSION_REQUIRED' });

const parentWindow = { location: { origin: 'https://game.example' }, POCKETMONSTER_ONLINE_SHELL: { kind: ONLINE_WORLD_SHELL_KIND } };
assert.equal(isHostedOnlineWorldScene({ parent: parentWindow, location: { origin: 'https://game.example' } }), true);
assert.equal(isHostedOnlineWorldScene({ parent: parentWindow, location: { origin: 'https://evil.example' } }), false);
assert.equal(sanitizeOnlineWorldPose({ zone: 'pirate-fruit', x: 1, z: -2, dir: 0.25 })?.zone, 'pirate-fruit');
assert.deepEqual(sanitizeOnlineWorldPose({ zone: 'pirate-fruit', x: 1, z: -2, dir: 0.25, locomotion: 'run', animation: { combatState: 'attack', attackProgress: .5, dashing: true } }), { zone: 'pirate-fruit', x: 1, z: -2, dir: .25, locomotion: 'run', animation: { combatState: 'attack', attackProgress: .5, dashing: true } });
assert.equal(sanitizeOnlineWorldPose({ zone: 'pirate-fruit', x: Number.NaN, z: 0, dir: 0 }), null);
assert.equal(sanitizeOnlineWorldPose({ zone: '../bad', x: 0, z: 0, dir: 0 }), null);
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'hub', players: [] }, 'pirate-fruit'), null);
const sanitized = sanitizeOnlineWorldSnapshot({
  zone: 'pirate-fruit',
  players: [
    { id: 'alice', name: 'Alice', x: 1, z: 2, dir: 0.5 },
    { id: 'alice', name: 'duplicate', x: 9, z: 9 },
    { id: 'bad', name: 'bad', x: Infinity, z: 0 },
  ],
}, 'pirate-fruit');
assert.deepEqual(sanitized, {
  zone: 'pirate-fruit',
  players: [{ id: 'alice', name: 'Alice', x: 1, z: 2, dir: 0.5, locomotion: 'idle', animation: null }],
});
assert.equal(sanitizeOnlineWorldSnapshot({
  zone: 'pirate-fruit',
  players: Array.from({ length: MAX_SNAPSHOT_CANDIDATES + 1 }, () => null),
}, 'pirate-fruit'), null, 'oversized snapshot candidate arrays fail closed before scanning');
const boundaryCandidates = Array.from({ length: MAX_SNAPSHOT_CANDIDATES }, () => null);
boundaryCandidates[MAX_SNAPSHOT_CANDIDATES - 1] = { id: 'last-valid', x: 1, z: 2 };
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: boundaryCandidates }, 'pirate-fruit')?.players.at(-1)?.id, 'last-valid');
const cappedPlayers = sanitizeOnlineWorldSnapshot({
  zone: 'pirate-fruit',
  players: Array.from({ length: MAX_SNAPSHOT_CANDIDATES }, (_, index) => ({ id: `player-${index}`, x: index, z: index })),
}, 'pirate-fruit');
assert.equal(cappedPlayers.players.length, 100, 'sanitized output stays within the remote-player render cap');

function fakeScene(pose) {
  const snapshots = [];
  const statuses = [];
  return {
    pose,
    snapshots,
    statuses,
    CustomEvent: class {
      constructor(type, options) { this.type = type; this.detail = options?.detail; }
    },
    POCKETMONSTER_WORLD_STATE() { return this.pose; },
    POCKETMONSTER_WORLD_PRESENCE(snapshot) { snapshots.push(snapshot); },
    dispatchEvent(event) { statuses.push(event.detail?.connected); },
  };
}

let activeScene = fakeScene({ zone: 'pirate-fruit', x: 4, z: 5, dir: 0.2 });
const sceneBridge = createOnlineScenePresenceBridge({ getSceneWindow: () => activeScene });
assert.deepEqual(sceneBridge.readPose(), { zone: 'pirate-fruit', x: 4, z: 5, dir: 0.2, locomotion: 'idle', animation: null });
assert.equal(sceneBridge.acceptSnapshot({ zone: 'hub', players: [] }), false, 'wrong-zone snapshot is discarded');
assert.equal(sceneBridge.acceptSnapshot({ zone: 'pirate-fruit', players: [{ id: 'p1', x: 1, z: 1 }] }), true);
assert.equal(activeScene.snapshots.length, 1);
assert.deepEqual(activeScene.statuses, [true]);
activeScene.pose = { zone: 'hub', x: 0, z: 0, dir: 1 };
assert.equal(sceneBridge.readPose().zone, 'hub');
assert.deepEqual(activeScene.snapshots.at(-1), { zone: 'hub', players: [] }, 'internal zone changes clear stale labels immediately');
sceneBridge.reset();
assert.deepEqual(activeScene.snapshots.at(-1), { zone: 'hub', players: [] }, 'scene reset clears markers in the outgoing zone');
assert.equal(activeScene.statuses.at(-1), false, 'scene reset forwards a disconnected status before navigation');
assert.equal(sceneBridge.diagnostics().activeZone, null);
activeScene = fakeScene({ zone: 'hub', x: 0, z: 0, dir: 1 });
assert.equal(sceneBridge.acceptSnapshot({ zone: 'pirate-fruit', players: [] }), false, 'stale scene snapshot cannot cross a transition');
assert.equal(sceneBridge.acceptSnapshot({ zone: 'hub', players: [{ id: 'p2', x: 2, z: 3 }] }), true);
assert.equal(sceneBridge.diagnostics().acceptedSnapshots, 2);

const browserEvents = new EventTarget();
globalThis.window = globalThis;
window.addEventListener = browserEvents.addEventListener.bind(browserEvents);
window.removeEventListener = browserEvents.removeEventListener.bind(browserEvents);
window.dispatchEvent = browserEvents.dispatchEvent.bind(browserEvents);
globalThis.CustomEvent = class extends Event {
  constructor(type, options) { super(type); this.detail = options?.detail; }
};
const elements = new Map();
function fakeElement(id = '') {
  const listeners = new Map();
  const classes = new Set();
  return {
    id,
    dataset: {},
    value: '',
    textContent: '',
    children: [],
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
      toggle(value) { if (classes.has(value)) classes.delete(value); else classes.add(value); },
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    emit(type, event = {}) { listeners.get(type)?.(event); },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    querySelector() { return null; },
    focus() {},
  };
}
const panel = fakeElement('gameChat');
const headerNote = { after(node) { elements.set(node.id, node); } };
panel.querySelector = selector => selector === 'header span' ? headerNote : null;
for (const id of ['gameChat', 'chatToggleBtn', 'chatCloseBtn', 'chatForm', 'chatMessages', 'chatError', 'chatInput']) {
  elements.set(id, id === 'gameChat' ? panel : fakeElement(id));
}
globalThis.document = {
  head: { append(node) { if (node.id) elements.set(node.id, node); } },
  body: { append() {} },
  querySelector(selector) { return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null; },
  createElement(tag) {
    const element = fakeElement();
    if (tag === 'select') element.value = 'WORLD';
    return element;
  },
};
globalThis.sessionStorage = {
  getItem(key) {
    if (key !== 'monsterlife.session.v1') return null;
    return JSON.stringify({ sessionToken: 'stable-session', expiresAtUtc: '2099-01-01T00:00:00Z' });
  },
};
globalThis.fetch = async input => String(input).includes('runtime-config.json')
  ? { json: async () => ({ apiBaseUrl: 'https://server.example', webSocketUrl: 'wss://server.example/ws/chat' }) }
  : { ok: true, json: async () => ({ messages: [] }) };
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
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  emit(type, event = {}) { for (const handler of this.listeners.get(type) || []) handler(event); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = FakeWebSocket.CLOSED; this.emit('close'); }
}
globalThis.WebSocket = FakeWebSocket;
let activePose = { zone: 'pirate-fruit', x: 1, z: 2, dir: 0 };
window.POCKETMONSTER_WORLD_STATE = () => activePose;
window.POCKETMONSTER_WORLD_PRESENCE = () => true;
await import(`../chat-runtime.mjs?unified-test=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(FakeWebSocket.instances.length, 1, 'first shell transport creates one socket');
const physicalSocket = FakeWebSocket.instances[0];
physicalSocket.readyState = FakeWebSocket.OPEN;
physicalSocket.emit('open');
activePose = { zone: 'hub', x: 3, z: 4, dir: 0.5 };
await new Promise(resolve => setTimeout(resolve, 280));
await import(`../chat-runtime.mjs?duplicate-test=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(FakeWebSocket.instances.length, 1, 'a second module evaluation reuses the singleton socket');
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().socketCreates, 1);
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().socketGeneration, 1);
assert.ok(physicalSocket.sent.some(message => message.type === 'world-pos' && message.zone === 'pirate-fruit'));
assert.ok(physicalSocket.sent.some(message => message.type === 'world-pos' && message.zone === 'hub'));
window.dispatchEvent(new Event('pagehide'));
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().paused, true, 'pagehide suspends instead of terminating the session');
assert.equal(physicalSocket.readyState, FakeWebSocket.CLOSED);
window.dispatchEvent(new Event('pageshow'));
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().paused, false);
assert.equal(FakeWebSocket.instances.length, 2, 'bfcache restore creates one replacement after the prior socket is closed');
window.dispatchEvent(new Event('pageshow'));
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(FakeWebSocket.instances.length, 2, 'duplicate pageshow cannot create another socket');
assert.ok(FakeWebSocket.instances.filter(socket => socket.readyState !== FakeWebSocket.CLOSED).length <= 1, 'at most one physical socket is active concurrently');
const resumedSocket = FakeWebSocket.instances.at(-1);
window.dispatchEvent(new Event('pocketmonster:session-ended'));
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().stopped, true, 'logout stops the parent singleton transport');
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().reconnectPending, false, 'logout cannot schedule a reconnect');
assert.equal(window.POCKETMONSTER_CHAT_RUNTIME.diagnostics().hasToken, false, 'logout erases the bearer from the singleton state');
assert.equal(resumedSocket.readyState, FakeWebSocket.CLOSED);

console.log('V9 unified online world shell: PASS');
