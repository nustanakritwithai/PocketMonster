import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createOnlineScenePresenceBridge } from '../online-world-bridge-v900.mjs';

const worldsSource = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pirateBootSource = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const captureStart = worldsSource.indexOf('function capturePresenceBindings()');
const prepareStart = worldsSource.indexOf('function preparePocketRuntime(world)');
const prepareEnd = worldsSource.indexOf('\nfor (const world of COMBINED_WORLDS)', prepareStart);
assert.ok(captureStart >= 0 && prepareStart > captureStart && prepareEnd > prepareStart);
assert.match(worldsSource, /POCKETMONSTER_MANAGED_POCKET_PREPARE\s*=\s*\(\)\s*=>\s*preparePocketRuntime/,
  'managed worlds expose the shared Pocket preparation promise');
assert.match(pirateBootSource, /managedPrepare[\s\S]*?managedPrepare\(\)/,
  'Pirate ensure awaits the managed preparation before reading the control API');
assert.match(pirateBootSource, /managedPrepare[\s\S]*?import\('\.\/game-v800\.js\?v=839&animalControl=pirate-fruit'\)/,
  'legacy direct import remains only as the fallback path');
const ensureStart = pirateBootSource.indexOf('export function ensurePocketAnimalControl()');
const ensureEnd = pirateBootSource.indexOf('\n}\n\nfunction mountPirateOnline', ensureStart);
assert.ok(ensureStart >= 0 && ensureEnd > ensureStart, 'extracts the production ensure function');
const ensureSource = pirateBootSource.slice(ensureStart, ensureEnd + 2)
  .replace('export function ensurePocketAnimalControl()', 'function ensurePocketAnimalControl()')
  .replace("import('./game-v800.js?v=839&animalControl=pirate-fruit')", 'fallbackImport()');
let managedPrepareCalls = 0;
let fallbackImportCalls = 0;
let releaseManagedPrepare;
const managedPreparePending = new Promise(resolve => { releaseManagedPrepare = resolve; });
const ensureWindow = {
  POCKETMONSTER_MANAGED_POCKET_PREPARE: () => { managedPrepareCalls += 1; return managedPreparePending; },
  dispatchEvent() {},
};
const ensurePocketAnimalControl = new Function(
  'window', 'fallbackImport', 'Event',
  `let throwRuntimePromise = null; ${ensureSource}; return ensurePocketAnimalControl;`,
)(ensureWindow, async () => { fallbackImportCalls += 1; }, Event);
const ensureFirst = ensurePocketAnimalControl();
const ensureSecond = ensurePocketAnimalControl();
assert.equal(ensureFirst, ensureSecond, 'bag/throw ensure calls share the pending managed preparation');
await Promise.resolve();
assert.equal(managedPrepareCalls, 1, 'managed preparation starts once');
assert.equal(fallbackImportCalls, 0, 'managed preparation does not start a second game import');
ensureWindow.POCKETMONSTER_ANIMAL_CONTROL = { source: 'managed-pocket-runtime' };
releaseManagedPrepare();
assert.equal((await ensureFirst).source, 'managed-pocket-runtime');
const captureAndApply = worldsSource.slice(captureStart, prepareStart);
const prepareSource = worldsSource.slice(prepareStart, prepareEnd)
  .replace('await import(world.runtime)', 'await loader(world.runtime)');

const piratePose = Object.freeze({ zone: 'pirate-fruit', x: 12, y: 0, z: -4, dir: 1 });
const pocketPose = Object.freeze({ zone: 'pocket-monster', x: 0, y: 0, z: 0, dir: 0 });
let activeRuntimeId = 'pirate-fruit';
const bindings = new Map([
  ['pirate-fruit', { state: () => piratePose, presence: () => true }],
  ['pocket-monster', { state: () => pocketPose, presence: () => true }],
]);
const accepted = [];
const target = {
  POCKETMONSTER_WORLD_STATE: () => piratePose,
  POCKETMONSTER_WORLD_PRESENCE: () => true,
  POCKETMONSTER_SCENE_PRESENCE: {
    state: () => bindings.get(activeRuntimeId)?.state?.() || null,
    accept: payload => {
      accepted.push(payload);
      return bindings.get(activeRuntimeId)?.presence?.(payload) ?? false;
    },
  },
  CustomEvent: class extends Event {
    constructor(type, options) { super(type); this.detail = options?.detail; }
  },
  dispatchEvent() {},
};
const bridge = createOnlineScenePresenceBridge({ getSceneWindow: () => target, now: () => 1000 });
const rawStateBeforePrewarm = target.POCKETMONSTER_WORLD_STATE;
const runtimeLifecycles = new Map();
const runtimePreparations = new Map();
const savedWorldGameNodes = new Map();
const mountTarget = { hidden: false, childNodes: [] };
const documentLike = { createElement() { return mountTarget; } };
const loaderStarted = new Promise(resolve => { globalThis.__loaderStarted = resolve; });
let releaseLoader;
const loaderRelease = new Promise(resolve => { releaseLoader = resolve; });
const loader = async () => {
  target.POCKETMONSTER_WORLD_STATE = () => pocketPose;
  globalThis.__loaderStarted();
  await loaderRelease;
  throw new Error('simulated Pocket prewarm import failure');
};
const preparePocketRuntime = new Function(
  'window', 'document', 'runtimeLifecycles', 'runtimePreparations', 'savedWorldGameNodes', 'loader',
  `${captureAndApply}${prepareSource}; return preparePocketRuntime;`,
)(target, documentLike, runtimeLifecycles, runtimePreparations, savedWorldGameNodes, loader);
const pocketWorld = { id: 'pocket-monster', runtime: './game-v800.js?v=test' };

const prewarm = preparePocketRuntime(pocketWorld);
assert.equal(preparePocketRuntime(pocketWorld), prewarm, 'repeated preparation calls share one promise');
await loaderStarted;
assert.equal(target.POCKETMONSTER_WORLD_STATE(), pocketPose, 'raw global is overwritten while Pocket prewarm is pending');
assert.equal(bridge.readPose()?.zone, 'pirate-fruit', 'active facade ignores Pocket prewarm raw write');
assert.equal(bridge.acceptSnapshot({ zone: 'pirate-fruit', players: [] }), true, 'Pirate snapshot reaches active facade');
assert.equal(accepted.length, 1);
assert.equal(bridge.isReady('pirate-fruit'), true, 'bridge remains ready for Pirate after rejected prewarm');
releaseLoader();
await assert.rejects(prewarm, /simulated Pocket/);
assert.equal(target.POCKETMONSTER_WORLD_STATE(), piratePose, 'actual prepare finally restores active raw binding');
assert.equal(bridge.readPose()?.zone, 'pirate-fruit');
assert.notEqual(bridge.readPose()?.zone, 'pocket-monster');

console.log('Pirate active presence survives rejected Pocket prewarm: PASS');
