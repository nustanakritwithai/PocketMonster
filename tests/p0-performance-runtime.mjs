import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createDirtyGate,
  createDistanceTickScheduler,
  createObjectPool,
  createSharedResourceCache,
  remainingCountdownSeconds,
  shouldRefreshEggCountdown,
  selectQualityProfile,
} from '../performance-runtime.mjs';
import { disposeObject3D } from '../scene-resource-lifecycle.mjs';
import { activeJs } from './active-assets.mjs';

function disposable(extra = {}) {
  return { calls: 0, userData: {}, dispose() { this.calls++; }, ...extra };
}

const cache = createSharedResourceCache();
let geometryCreates = 0;
let materialCreates = 0;
const geometryA = cache.geometry('sphere:1', () => { geometryCreates++; return disposable(); });
const geometryB = cache.geometry('sphere:1', () => { geometryCreates++; return disposable(); });
const materialA = cache.material('standard:red', () => { materialCreates++; return disposable(); });
const materialB = cache.material('standard:red', () => { materialCreates++; return disposable(); });
assert.equal(geometryA, geometryB, 'geometry cache must reuse the same GPU resource');
assert.equal(materialA, materialB, 'material cache must reuse the same GPU resource');
assert.equal(geometryCreates, 1);
assert.equal(materialCreates, 1);
assert.equal(geometryA.userData.shared, true);
assert.equal(materialA.userData.shared, true);
assert.deepEqual(disposeObject3D({ geometry: geometryA, material: materialA }), { geometries: 0, materials: 0, textures: 0 }, 'per-object cleanup must retain shared resources');
assert.equal(geometryA.calls, 0);
assert.equal(materialA.calls, 0);
assert.deepEqual(cache.dispose(), { geometries: 1, materials: 1 });
assert.equal(geometryA.calls, 1);
assert.equal(materialA.calls, 1);

let objectCreates = 0;
let objectDestroys = 0;
const pool = createObjectPool({
  maxSize: 2,
  create: () => ({ id: ++objectCreates, active: false }),
  reset: object => { object.active = false; },
  destroy: () => { objectDestroys++; },
});
const first = pool.acquire();
first.active = true;
pool.release(first);
assert.equal(pool.acquire(), first, 'released object must be reused');
const second = pool.acquire();
const third = pool.acquire();
pool.release(first);
pool.release(second);
pool.release(third);
assert.equal(pool.stats().free, 2, 'pool must remain bounded');
assert.equal(objectDestroys, 1, 'overflow must be destroyed instead of retained');
pool.drain();
assert.equal(objectDestroys, 3);

assert.deepEqual(selectQualityProfile({ deviceMemory: 2, hardwareConcurrency: 4, devicePixelRatio: 3, saveData: false }), {
  tier: 'low', maxDpr: 1, antialias: false, shadows: false, nearAiHz: 20, midAiHz: 10, farAiHz: 4, labelHz: 8,
});
assert.equal(selectQualityProfile({ deviceMemory: 6, hardwareConcurrency: 6, devicePixelRatio: 2 }).tier, 'medium');
const high = selectQualityProfile({ deviceMemory: 8, hardwareConcurrency: 8, devicePixelRatio: 3 });
assert.equal(high.tier, 'high');
assert.equal(high.maxDpr, 1.5, 'high tier must still cap DPR for mobile stability');
assert.equal(high.shadows, true);
assert.equal(selectQualityProfile({ deviceMemory: 8, hardwareConcurrency: 8, devicePixelRatio: 3, saveData: true }).tier, 'low');
assert.equal(remainingCountdownSeconds(1001, 1000), 1, 'countdown must not enable hatch before readyAt');
assert.equal(remainingCountdownSeconds(1000, 1000), 0);
assert.equal(remainingCountdownSeconds(999, 1000), 0);
assert.equal(remainingCountdownSeconds('invalid', 1000), 0);
assert.equal(shouldRefreshEggCountdown(true, 1), true, 'open manager must refresh an existing egg even when Storage is empty');
assert.equal(shouldRefreshEggCountdown(true, 0), false);
assert.equal(shouldRefreshEggCountdown(false, 1), false);



const scheduler = createDistanceTickScheduler({ nearDistance: 10, midDistance: 20, nearHz: 20, midHz: 10, farHz: 4 });
assert.equal(scheduler.advance('near', 5, 0.02), 0);
assert.equal(scheduler.advance('near', 5, 0.03), 0.05);
assert.equal(scheduler.advance('mid', 15, 0.05), 0);
assert.equal(scheduler.advance('mid', 15, 0.05), 0.1);
assert.equal(scheduler.advance('far', 30, 0.1), 0);
assert.equal(scheduler.advance('far', 30, 0.15), 0.25);
assert.equal(scheduler.advance('engaged', 30, 0.01, true), 0.01, 'engaged work must not wait behind far-distance throttling');
scheduler.clear('far');
assert.equal(scheduler.size(), 3);
const combatTransitionScheduler = createDistanceTickScheduler({ nearDistance: 10, midDistance: 20, nearHz: 20, midHz: 10, farHz: 4 });
assert.equal(combatTransitionScheduler.advance('wild', 30, 0.2), 0);
assert.equal(combatTransitionScheduler.advance('wild', 30, 0.02, true), 0.02, 'engaged AI must use only the current frame dt');
assert.equal(combatTransitionScheduler.advance('wild', 30, 0.05), 0, 'engaged AI must clear throttled backlog');


const dirty = createDirtyGate({ initial: false, minIntervalMs: 1000 });
assert.equal(dirty.consume(0), false);
dirty.mark();
assert.equal(dirty.consume(100), true);
assert.equal(dirty.consume(200), false);
dirty.mark();
assert.equal(dirty.consume(500), false, 'dirty render must honor its minimum interval');
assert.equal(dirty.consume(1100), true);

assert.match(activeJs, /createSharedResourceCache/);
assert.match(activeJs, /createObjectPool/);
assert.match(activeJs, /selectQualityProfile/);
assert.match(activeJs, /createDistanceTickScheduler/);
assert.match(activeJs, /createDirtyGate/);
assert.match(activeJs, /renderer\.setPixelRatio\(Math\.min\(devicePixelRatio,qualityProfile\.maxDpr\)\)/);
assert.match(activeJs, /renderer\.shadowMap\.enabled=qualityProfile\.shadows/);
assert.doesNotMatch(activeJs, /renderer\.setPixelRatio\(Math\.min\(devicePixelRatio,1\.7\)\)/);
assert.doesNotMatch(activeJs, /if\(!el\('monsterManager'\)\.classList\.contains\('hidden'\)\)renderManager\(\)/, 'frame loop must not rebuild Ranch manager every 120ms');
assert.match(activeJs, /managerDirty\.consume/);
assert.match(activeJs, /distanceTickScheduler\.advance/);
assert.match(activeJs, /releaseTransientEffect/);
assert.match(activeJs, /function updateEggCountdowns\(/);
assert.match(activeJs, /data-egg-ready-at/);
assert.match(activeJs, /data-egg-countdown/);
assert.match(activeJs, /data-egg-hatch/);
assert.match(activeJs, /shouldRefreshEggCountdown\(managerOpen,state\.eggs\.length\)/);

console.log('P0 performance runtime regression: PASS');
