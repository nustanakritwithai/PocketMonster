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
import { resolveOwnedBasicAiAction } from '../basic-ai-resolver.mjs';
import { activeJs } from './active-assets.mjs';

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `${name} must have a body`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

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
assert.match(activeJs, /const qualityProfile=selectQualityProfile\(\{deviceMemory:navigator\.deviceMemory,hardwareConcurrency:navigator\.hardwareConcurrency,devicePixelRatio:window\.devicePixelRatio,saveData:navigator\.connection\?\.saveData===true\}\);/,
  'live quality profile must be selected from current device capabilities');
assert.doesNotMatch(activeJs, /const qualityProfile=Object\.freeze\(\{tier:'medium'/,
  'live runtime must not force every device to the medium profile');
assert.match(activeJs, /createAssetEngine\(\{THREE,quality:qualityProfile\.tier\}\)/);
assert.match(activeJs, /new THREE\.WebGLRenderer\(\{antialias:qualityProfile\.antialias,powerPreference:'high-performance'\}\)/);
assert.match(activeJs, /nearHz:qualityProfile\.nearAiHz/);
assert.match(activeJs, /midHz:qualityProfile\.midAiHz/);
assert.match(activeJs, /farHz:qualityProfile\.farAiHz/);
assert.match(activeJs, /nearHz:qualityProfile\.labelHz/);
assert.match(activeJs, /renderer\.setPixelRatio\(Math\.min\(devicePixelRatio,qualityProfile\.maxDpr\)\)/);
assert.match(activeJs, /renderer\.shadowMap\.enabled=qualityProfile\.shadows/);
assert.match(activeJs, /characterPreviewRenderer=new THREE\.WebGLRenderer\(\{canvas,antialias:qualityProfile\.antialias,alpha:true,powerPreference:'low-power'\}\)/,
  'the secondary character preview renderer must honor adaptive antialiasing');
assert.match(activeJs, /characterPreviewRenderer\.setPixelRatio\(Math\.min\(devicePixelRatio\|\|1,qualityProfile\.maxDpr\)\)/,
  'the secondary character preview renderer must honor the adaptive DPR cap');
assert.doesNotMatch(activeJs, /renderer\.setPixelRatio\(Math\.min\(devicePixelRatio,1\.7\)\)/);
assert.doesNotMatch(activeJs, /if\(!el\('monsterManager'\)\.classList\.contains\('hidden'\)\)renderManager\(\)/, 'frame loop must not rebuild Ranch manager every 120ms');
assert.match(activeJs, /managerDirty\.consume/);
assert.match(activeJs, /const RANCH_ACTIVE_MAX=6;/,
  'W15 renders at most six active Ranch monsters');
const syncRanchVisualsSource = functionSource(activeJs, 'syncRanchVisuals');
const toggleRanchActiveSource = functionSource(activeJs, 'toggleRanchActive');
const updateRanchVisualsSource = functionSource(activeJs, 'updateRanchVisuals');
assert.match(syncRanchVisualsSource, /\.slice\(0,RANCH_ACTIVE_MAX\)/,
  'loaded Ranch state is normalized before visual creation');
assert.match(toggleRanchActiveSource, /state\.ranchActive\.length>=RANCH_ACTIVE_MAX/,
  'the live Ranch toggle rejects a seventh rendered monster');
assert.doesNotMatch(updateRanchVisualsSource, /new THREE\.Vector3/,
  'Ranch animation reuses per-monster direction vectors');
assert.match(updateRanchVisualsSource, /obj\.direction\.set\(/);
assert.match(activeJs, /distanceTickScheduler\.advance/);
assert.match(activeJs, /releaseTransientEffect/);
assert.match(activeJs, /function updateEggCountdowns\(/);
assert.match(activeJs, /data-egg-ready-at/);
assert.match(activeJs, /data-egg-countdown/);
assert.match(activeJs, /data-egg-hatch/);
assert.match(activeJs, /shouldRefreshEggCountdown\(managerOpen,state\.eggs\.length\)/);

const vfxLimitsMatch = activeJs.match(/const VFX_LIMITS=Object\.freeze\(\{maxConcurrentEffects:(\d+),maxParticles:(\d+),maxGroundDecals:(\d+),maxFloatingTexts:(\d+)\}\);/);
assert.ok(vfxLimitsMatch, 'live runtime must define every workbook VFX concurrency budget');
const vfxLimits = Object.freeze({
  maxConcurrentEffects: Number(vfxLimitsMatch[1]),
  maxParticles: Number(vfxLimitsMatch[2]),
  maxGroundDecals: Number(vfxLimitsMatch[3]),
  maxFloatingTexts: Number(vfxLimitsMatch[4]),
});
assert.deepEqual(vfxLimits, { maxConcurrentEffects: 80, maxParticles: 200, maxGroundDecals: 8, maxFloatingTexts: 12 });
assert.equal(Object.hasOwn(vfxLimits, 'maxProjectiles'), false,
  'gameplay projectiles are P0 state, not disposable visual effects in the W15 VFX budget');
const capturePrerequisiteSource = functionSource(activeJs, 'capturePrerequisite');
const summonThrowSource = functionSource(activeJs, 'summonThrow');
assert.equal((activeJs.match(/throwProjectile\(/g) ?? []).length, 3,
  'projectiles must remain limited to the one definition plus capture and summon call sites');
assert.match(capturePrerequisiteSource,
  /pendingSummon\|\|projectiles\.some\(p=>p\.type==='summon'\)/,
  'capture cannot create a projectile while summon state is pending/in flight');
assert.match(capturePrerequisiteSource,
  /activeCaptureAttempt\|\|captureSequence\|\|projectiles\.some\(p=>p\.type==='capture'\)\|\|wilds\.some\(w=>w\.capturing\)/,
  'capture state permits at most one capture projectile/sequence');
assert.match(summonThrowSource, /if\(activeSummon\|\|pendingSummon\)/,
  'summon state permits only one active or pending summon');
const addTransientEffectSource = functionSource(activeJs, 'addTransientEffect');
const canSpawnVFXSource = functionSource(activeJs, 'canSpawnVFX');
const vfxPriorityRank = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 });
assert.equal((activeJs.match(/effects\.push\(/g) ?? []).length, 1,
  'every effects[] producer must pass through the shared particle/effect gate');
assert.match(addTransientEffectSource, /effects\.push\(effect\)/);
assert.match(canSpawnVFXSource, /for\(const evictPriority of \['P4','P3'\]\)/,
  'the gate scans disposable priorities from lowest to higher');
assert.match(canSpawnVFXSource, /return priority==='P0'/,
  'P0 capture feedback is never cut when no disposable slot exists');
function createTransientGate(active, released) {
  return Function(
    'effects',
    'releaseTransientEffect',
    'VFX_LIMITS',
    'VFX_PRIORITY_RANK',
    `'use strict';${canSpawnVFXSource};${addTransientEffectSource};return addTransientEffect;`,
  )(active, effect => released.push(effect), vfxLimits, vfxPriorityRank);
}
const liveEffects = [];
const releasedEffects = [];
const addTransientEffect = createTransientGate(liveEffects, releasedEffects);
for (let index = 0; index < 80; index += 1) {
  assert.equal(addTransientEffect({ mesh: { id: index } }), true);
}
const overflowEffect = { mesh: { id: 80 } };
assert.equal(addTransientEffect(overflowEffect), false, 'the 81st active effect must be rejected');
assert.equal(liveEffects.length, 80, 'normal cuttable VFX never exceeds its budget');
assert.deepEqual(releasedEffects, [overflowEffect], 'rejected effects must release pooled/GPU resources immediately');
assert.equal((activeJs.match(/effects\.splice\(/g) ?? []).length, 2,
  'only priority eviction and lifecycle expiry may splice effects[] directly');

const prioritizedEffects = [];
const priorityReleases = [];
const prioritizedAdd = createTransientGate(prioritizedEffects, priorityReleases);
for (let index = 0; index < 79; index += 1) prioritizedAdd({ mesh: { id: `p2-${index}` } }, 'P2');
const disposableTrail = { mesh: { id: 'p4-trail' } };
prioritizedAdd(disposableTrail, 'P4');
const importantArea = { mesh: { id: 'p1-area' } };
assert.equal(prioritizedAdd(importantArea, 'P1'), true, 'P1 skill feedback survives a full P4/P2 budget');
assert.equal(prioritizedEffects.length, 80);
assert.deepEqual(priorityReleases, [disposableTrail], 'P4 is released before admitting P1');
assert.equal(prioritizedEffects.at(-1).priority, 'P1');

const protectedEffects = [];
const protectedReleases = [];
const protectedAdd = createTransientGate(protectedEffects, protectedReleases);
for (let index = 0; index < 80; index += 1) protectedAdd({ mesh: { id: `protected-${index}` } }, 'P2');
const incomingTrail = { mesh: { id: 'incoming-p4' } };
assert.equal(protectedAdd(incomingTrail, 'P4'), false, 'P4 must not evict P2/P1 work');
assert.deepEqual(protectedReleases, [incomingTrail]);

const p0Effects = [];
const p0Releases = [];
const p0Add = createTransientGate(p0Effects, p0Releases);
for (let index = 0; index < 80; index += 1) p0Add({ mesh: { id: `p2-full-${index}` } }, 'P2');
assert.equal(p0Add({ mesh: { id: 'capture-p0' } }, 'P0'), true, 'P0 capture feedback is never cut');
assert.equal(p0Effects.length, 81, 'P0 may temporarily exceed the cuttable budget when no P3/P4 slot exists');
assert.deepEqual(p0Releases, []);

assert.match(functionSource(activeJs, 'spawnElementalFX'), /mode==='trail'\?'P4':mode==='aura'\?'P2':'P1'/);
assert.match(functionSource(activeJs, 'spawnSkillTrail'), /gravity: 0\.2\}, 'P4'\)/);
assert.match(functionSource(activeJs, 'spawnAreaWave'), /addTransientEffect\(\{mesh: wave, life: 0\.5, maxLife: 0\.5, kind: 'area-wave', expandTo: range \* 2\}, 'P1'\)/);
assert.equal((functionSource(activeJs, 'spawnFeedEffect').match(/\},'P3'\)/g) ?? []).length, 2,
  'both feed/care particle producers are P3');
assert.equal((functionSource(activeJs, 'spawnCaptureResultEffect').match(/priority:'P0'/g) ?? []).length, 5,
  'every success/failure capture result producer remains P0');

const releaseTransientEffectSource = functionSource(activeJs, 'releaseTransientEffect');
const releaseCalls = [];
const releaseTransientEffect = Function(
  'skillSpritePool', 'sparkPool', 'removeAndDispose', 'scene',
  `'use strict';${releaseTransientEffectSource};return releaseTransientEffect;`,
)(
  { release: mesh => releaseCalls.push(['sprite', mesh]) },
  { release: mesh => releaseCalls.push(['spark', mesh]) },
  (_scene, mesh) => releaseCalls.push(['unique', mesh]),
  {},
);
const spriteMesh = { id: 'sprite' }, sparkMesh = { id: 'spark' }, uniqueMesh = { id: 'unique' };
releaseTransientEffect({ mesh: spriteMesh, spritePool: true, pooled: true });
releaseTransientEffect({ mesh: sparkMesh, pooled: true });
releaseTransientEffect({ mesh: uniqueMesh });
assert.deepEqual(releaseCalls, [['sprite', spriteMesh], ['spark', sparkMesh], ['unique', uniqueMesh]],
  'actual release dispatch returns both pool kinds and disposes unique GPU effects');

const updateEffectsSource = functionSource(activeJs, 'updateEffects');
const lifecycleEffects = Array.from({ length: 80 }, (_, index) => ({
  mesh: { id: index }, life: index === 79 ? 0.01 : 10, maxLife: 10, kind: 'test',
}));
const expired = [];
const updateEffects = Function(
  'effects', 'releaseTransientEffect', 'easeOut', 'updateSparkType',
  `'use strict';${updateEffectsSource};return updateEffects;`,
)(lifecycleEffects, effect => expired.push(effect), value => value, () => {});
updateEffects(0.02);
assert.equal(lifecycleEffects.length, 79, 'expired effects leave the active budget');
assert.equal(expired.length, 1, 'expiry releases exactly once');
const addAfterExpiry = createTransientGate(lifecycleEffects, expired);
assert.equal(addAfterExpiry({ mesh: { id: 'replacement' } }), true, 'an expired slot is immediately reusable');
assert.equal(lifecycleEffects.length, 80);

const addGroundDecalSource = functionSource(activeJs, 'addGroundDecal');
const addFloatingTextSource = functionSource(activeJs, 'addFloatingText');
const decals = [];
const removedDecals = [];
const addGroundDecal = Function(
  'groundDecals', 'removeAndDispose', 'scene', 'VFX_LIMITS',
  `'use strict';${addGroundDecalSource};return addGroundDecal;`,
)(decals, (_scene, group) => removedDecals.push(group), {}, vfxLimits);
for (let index = 0; index < 9; index += 1) addGroundDecal({ group: { id: index } });
assert.equal(decals.length, 8, 'ground decals obey their independent workbook cap');
assert.deepEqual(removedDecals, [{ id: 0 }], 'oldest ground decal is disposed on overflow');
const texts = [];
const removedTexts = [];
const addFloatingText = Function(
  'floatingTexts', 'VFX_LIMITS',
  `'use strict';${addFloatingTextSource};return addFloatingText;`,
)(texts, vfxLimits);
for (let index = 0; index < 13; index += 1) {
  addFloatingText({ el: { id: index, remove() { removedTexts.push(this.id); } } });
}
assert.equal(texts.length, 12, 'floating damage text obeys its independent workbook cap');
assert.deepEqual(removedTexts, [0], 'oldest floating text is removed on overflow');

const updateOwnedSource = functionSource(activeJs, 'updateOwned');
const materializeOwnedSource = functionSource(activeJs, 'materializeOwnedBasicAiTarget');
const selectAggressorsSource = functionSource(activeJs, 'selectWildAggressors');
const updateWildSource = functionSource(activeJs, 'updateWild');
const advanceWildLifecycleSource = functionSource(activeJs, 'advanceWildLifecycle');
const applyWildMotionSource = functionSource(activeJs, 'applyWildMotionAndPresentation');
const preflightWildBoundariesSource = functionSource(activeJs, 'preflightWildEncounterBoundaries');
const updateFloatingTextsSource = functionSource(activeJs, 'updateFloatingTexts');
const loopSource = functionSource(activeJs, 'loop');
assert.doesNotMatch(updateOwnedSource, /a\.skillCds=a\.skillCds\.map/,
  'combat cooldowns must update in place instead of allocating each frame');
assert.doesNotMatch(updateOwnedSource, /new THREE\.Vector3/,
  'owned-monster movement must reuse its vector scratch');
assert.doesNotMatch(materializeOwnedSource, /wilds\.filter/,
  'live target materialization must not allocate a filtered array each frame');
assert.match(updateOwnedSource, /fillOwnedBasicAiRequest\(ownedBasicAiScratch,a,wilds\)/,
  'owned Basic AI must reuse one request/snapshot buffer');
assert.match(updateOwnedSource, /shouldRunOwnedCadence\(a,'aiDecisionElapsed',dt,qualityProfile\.nearAiHz,!a\.aiDecision\)/,
  'allocation-heavy owned AI resolution must run on the quality-tier cadence, not every frame');
assert.match(updateOwnedSource, /shouldRunOwnedCadence\(a,'skillUiElapsed',dt,10\)/,
  'cooldown DOM/string work must run on a bounded presentation cadence');
assert.doesNotMatch(updateOwnedSource, /querySelector|createElement|toFixed/,
  'the per-frame owned loop must not allocate cooldown DOM/string presentation');
assert.doesNotMatch(selectAggressorsSource, /wilds\.map|new Set/,
  'wild aggressor selection must reuse candidate and Set buffers');
assert.doesNotMatch(`${updateWildSource}${advanceWildLifecycleSource}${applyWildMotionSource}`, /safeVec3|new THREE\.Vector3/,
  'wild combat/movement hot paths must reuse vector scratch');
assert.match(advanceWildLifecycleSource, /advanceEncounterEffects\(w\.statusState,statusRequest\)/,
  'wild status advancement reuses its request buffer');
assert.match(updateWildSource, /shouldResetEncounter\(resetRequest\)/,
  'wild decision leash evaluation reuses its request buffer');
assert.match(preflightWildBoundariesSource, /shouldResetEncounter\(resetRequest\)/,
  'wild leash evaluation reuses its request buffer');
assert.doesNotMatch(`${updateWildSource}${preflightWildBoundariesSource}`, /shouldResetEncounter\(\{\.\.\.resetRequest\}\)/,
  'wild leash checks cannot allocate request spreads');
assert.doesNotMatch(updateFloatingTextsSource, /safeVec3|new THREE\.Vector3/,
  'floating combat text must reuse projection vectors');
assert.match(updateFloatingTextsSource, /worldToScreen\(p,floatingTextProjectionScratch\.screen,p\)/);
assert.doesNotMatch(loopSource, /\[\.\.\.wilds\]/,
  'the frame loop must not clone the wild array');
assert.match(loopSource, /wildFrameSnapshot\.length=wilds\.length/,
  'the live loop reuses a snapshot buffer to preserve insertion order');
assert.match(loopSource, /for\(let wildIndex=0;wildIndex<wildFrameSnapshot\.length;wildIndex\+\+\)/,
  'wild updates remain forward/insertion ordered');
assert.doesNotMatch(loopSource, /wildIndex=wilds\.length-1/,
  'allocation removal must not reverse observable combat order');

const createScratchSource = functionSource(activeJs, 'createOwnedBasicAiScratch');
const fillRequestSource = functionSource(activeJs, 'fillOwnedBasicAiRequest');
const createOwnedBasicAiScratch = Function(`'use strict';${createScratchSource};return createOwnedBasicAiScratch;`)();
const fillOwnedBasicAiRequest = Function(
  'isWildDamageReady',
  `'use strict';${fillRequestSource};return fillOwnedBasicAiRequest;`,
)(wild => (wild?.capturing === undefined || wild.capturing === false) && wild?.combatEnabled !== false);
const aiScratch = createOwnedBasicAiScratch();
const owned = {
  inst: { instanceId: 'owned-1', speciesId: 'normalooze', fainted: false, hp: 10 },
  mesh: { position: { x: 1, z: 2 } },
  target: null,
  attackCd: 0,
};
const firstWilds = [
  { id: 'wild-1', dead: false, hp: 10, capturing: false, mesh: { position: { x: 3, z: 4 } } },
  { id: 'wild-2', dead: false, hp: 8, mesh: { position: { x: 5, z: 6 } } },
  { id: 'quarantined', dead: true, retired: true, hp: 8, mesh: null },
];
const firstRequest = fillOwnedBasicAiRequest(aiScratch, owned, firstWilds);
assert.deepEqual(firstRequest.enemies.map(enemy => enemy.id), ['wild-1', 'wild-2'],
  'quarantined/no-position Wild actors never poison the exact Owned AI request');
const identities = {
  request: firstRequest,
  actor: firstRequest.actor,
  actorPosition: firstRequest.actor.position,
  enemies: firstRequest.enemies,
  enemy: firstRequest.enemies[0],
  enemyPosition: firstRequest.enemies[0].position,
};
owned.mesh.position.x = 7;
owned.attackCd = 1;
firstWilds[0].mesh.position.z = 9;
const secondRequest = fillOwnedBasicAiRequest(aiScratch, owned, firstWilds.slice(0, 1));
assert.equal(secondRequest, identities.request);
assert.equal(secondRequest.actor, identities.actor);
assert.equal(secondRequest.actor.position, identities.actorPosition);
assert.equal(secondRequest.enemies, identities.enemies);
assert.equal(secondRequest.enemies[0], identities.enemy);
assert.equal(secondRequest.enemies[0].position, identities.enemyPosition);
assert.equal(secondRequest.actor.position.x, 7, 'reused actor snapshot refreshes live values');
assert.equal(secondRequest.enemies[0].position.z, 9, 'reused target snapshot refreshes live values');
assert.equal(secondRequest.enemies.length, 1, 'reused target array truncates stale records');
assert.equal(secondRequest.attackReady, false, 'reused request refreshes cooldown state');
const resolvedScratchRequest = resolveOwnedBasicAiAction(firstRequest);
assert.equal(resolvedScratchRequest.ok, true, 'the actual resolver accepts the reused exact-shape request');
assert.equal(resolvedScratchRequest.targetId, 'wild-1', 'reused IDs reach the actual deterministic target resolver intact');

const cadenceSource = functionSource(activeJs, 'shouldRunOwnedCadence');
const shouldRunOwnedCadence = Function(`'use strict';${cadenceSource};return shouldRunOwnedCadence;`)();
const cadenceState = { aiDecision: null, aiDecisionElapsed: 0, skillUiElapsed: 0 };
let resolverCalls = 0;
let uiCalls = 0;
let stableDecision = null;
for (let frame = 0; frame < 120; frame += 1) {
  if (shouldRunOwnedCadence(cadenceState, 'aiDecisionElapsed', 1 / 60, 24, !cadenceState.aiDecision)) {
    resolverCalls += 1;
    cadenceState.aiDecision ??= (stableDecision = { targetId: 'wild-1' });
  }
  if (shouldRunOwnedCadence(cadenceState, 'skillUiElapsed', 1 / 60, 10)) uiCalls += 1;
  assert.equal(cadenceState.aiDecision, stableDecision, 'cached AI decision remains stable between resolver ticks');
}
assert.ok(resolverCalls >= 47 && resolverCalls <= 49, `24 Hz resolver cadence expected about 48 calls, got ${resolverCalls}`);
assert.equal(uiCalls, 20, '10 Hz cooldown presentation runs 20 times across 120 frames at 60 FPS');

console.log('P0 performance runtime regression: PASS');
