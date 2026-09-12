import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createOnlineScenePresenceBridge } from '../online-world-bridge-v900.mjs';

const worldsSource = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8');
const captureStart = worldsSource.indexOf('function capturePresenceBindings()');
const prepareStart = worldsSource.indexOf('function preparePocketRuntime(world)');
const prepareEnd = worldsSource.indexOf('\n\nfor (const world of COMBINED_WORLDS)', prepareStart);
assert.ok(captureStart >= 0 && prepareStart > captureStart && prepareEnd > prepareStart);
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
