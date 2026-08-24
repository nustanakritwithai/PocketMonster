import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORKBOOK_CAPTURE_ADAPTER } from '../balance-config.mjs';
import {
  beginCaptureAttempt,
  cancelCaptureAttempt,
  captureAttemptSnapshot,
  commitCaptureAttempt,
  createCaptureAttemptLedger,
  resolveCaptureAttempt,
} from '../capture-transaction.mjs';
import { ENCOUNTER_POLICY, fillEngagedWildIds } from '../runtime-policies.mjs';

const root = new URL('../', import.meta.url);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const compactHeader = source.indexOf('){', start);
  const spacedHeader = source.indexOf(') {', start);
  const headerEnd = compactHeader >= 0 && (spacedHeader < 0 || compactHeader < spacedHeader)
    ? compactHeader
    : spacedHeader;
  assert.ok(headerEnd > start, `${name} header`);
  const brace = source.indexOf('{', headerEnd);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unclosed ${name}`);
}

function assertBefore(source, before, after, message) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert.ok(beforeIndex >= 0, `${message}: missing ${before}`);
  assert.ok(afterIndex >= 0, `${message}: missing ${after}`);
  assert.ok(beforeIndex < afterIndex, message);
}

class TestVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  clone() {
    return new TestVector3(this.x, this.y, this.z);
  }

  copy(value) {
    this.x = value.x;
    this.y = value.y;
    this.z = value.z;
    return this;
  }

  add(value) {
    this.x += value.x;
    this.y += value.y;
    this.z += value.z;
    return this;
  }

  multiplyScalar(value) {
    this.x *= value;
    this.y *= value;
    this.z *= value;
    return this;
  }
}

class TestMesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.userData = {};
    this.position = new TestVector3();
    this.rotation = new TestVector3();
    this.scale = { value: 1, setScalar(value) { this.value = value; } };
    this.visible = true;
  }
}

class TestMeshStandardMaterial {
  constructor(options) {
    Object.assign(this, options);
  }
}

const TEST_THREE = Object.freeze({
  Mesh: TestMesh,
  MeshStandardMaterial: TestMeshStandardMaterial,
  Vector3: TestVector3,
});

function testBallMesh() {
  return {
    position: new TestVector3(4, 0.7, 2),
    rotation: new TestVector3(),
    scale: { value: 1, setScalar(value) { this.value = value; } },
    material: {
      color: { setHex() {} },
      emissive: { setHex() {} },
      emissiveIntensity: 0,
    },
  };
}

function instantiateCaptureRuntime(js, bindings = {}) {
  const scope = {
    captureAimActive: false,
    captureAimLine: { visible: false },
    activeCaptureAttempt: null,
    captureSequence: null,
    ...bindings,
  };
  const declarations = [
    'runBestEffortCombatPresentation',
    'throwProjectile',
    'abortCaptureSequence',
    'executeCaptureThrow',
    'startCaptureSequence',
    'finishCaptureSuccess',
    'finishCaptureFail',
    'updateCaptureSequence',
  ].map(name => extractFunction(js, name)).join('\n');
  const factory = Function(...Object.keys(scope), `"use strict";\n${declarations}\nreturn {\n  executeCaptureThrow,\n  startCaptureSequence,\n  updateCaptureSequence,\n  snapshot:()=>({captureAimActive,activeCaptureAttempt,captureSequence}),\n};`);
  return factory(...Object.values(scope));
}

function executeThrowBindings({ ledger, attemptId, wild, projectiles, presentationThrow = null, counters, removed }) {
  const state = { currentZone: 'grass-meadow', inventory: { captureBalls: 1 } };
  const captureAimLine = { visible: true };
  const scene = { add() {} };
  return {
    bindings: {
      captureAimActive: true,
      captureAimLine,
      activeCaptureAttempt: null,
      captureSequence: null,
      activeSummon: null,
      pendingSummon: null,
      BALANCE: { captureRange: 10, captureAimRadius: 1 },
      THREE: TEST_THREE,
      beginCaptureAttempt,
      boxGeometry: () => ({}),
      cancelCaptureAttempt,
      cancelOwnedAITarget: targetId => {
        counters.ownedAi += 1;
        assert.equal(targetId, wild.id);
        return true;
      },
      cancelWildAIAction: target => {
        counters.wildAi += 1;
        assert.equal(target, wild);
        return true;
      },
      captureAttemptLedger: ledger,
      capturePrerequisite: () => true,
      captureWorkbookMonsterId: () => 'MON_002',
      el: () => ({ classList: { remove() {} } }),
      ensureCaptureReferenceLevel: () => 5,
      forward: () => new TestVector3(0, 0, 1),
      msg() {},
      nextCaptureAttemptId: () => attemptId,
      playSFX: () => {
        counters.sfx += 1;
        if (presentationThrow === 'sfx') throw new Error('sfx presentation failed');
      },
      player: { position: new TestVector3() },
      playerThrowOrigin: () => new TestVector3(0, 1, 0),
      playerVisual: { play() {
        counters.visual += 1;
        if (presentationThrow === 'visual') throw new Error('player presentation failed');
      } },
      projectiles,
      removeAndDispose: (_scene, object) => { removed.push(object); },
      renderHUD() {},
      resolveCapture() { counters.resolved += 1; },
      saveGame() {},
      scene,
      spawnBurst() {},
      state,
      wildDisplayName: () => 'Test Wild',
    },
    captureAimLine,
    state,
  };
}

function runExecutePresentationRegressions(js) {
  for (const presentationThrow of ['visual', 'sfx']) {
    const engagedBeforeCapture = presentationThrow === 'visual';
    const attemptId = `presentation-${presentationThrow}`;
    const ledger = createCaptureAttemptLedger();
    const projectiles = [];
    const removed = [];
    const counters = { ownedAi: 0, wildAi: 0, visual: 0, sfx: 0, resolved: 0 };
    const wild = {
      id: `wild-${presentationThrow}`,
      boss: false,
      elite: false,
      dead: false,
      capturing: false,
      captureEngagementResumePending: false,
      engaged: engagedBeforeCapture,
      mesh: { visible: true, position: new TestVector3(3, 0, 2) },
    };
    const setup = executeThrowBindings({ ledger, attemptId, wild, projectiles, presentationThrow, counters, removed });
    const runtime = instantiateCaptureRuntime(js, { ...setup.bindings, aimedWild: () => wild });

    assert.doesNotThrow(() => runtime.executeCaptureThrow(), `${presentationThrow} throw must stay presentation-only`);
    assert.equal(counters.ownedAi, 1, `${presentationThrow} throw still cancels owned AI target`);
    assert.equal(counters.wildAi, 1, `${presentationThrow} throw still cancels wild AI action`);
    assert.equal(wild.captureEngagementResumePending, engagedBeforeCapture, `${presentationThrow} throw snapshots pre-freeze engagement exactly`);
    assert.equal(wild.capturing, true, `${presentationThrow} throw still freezes the target`);
    assert.equal(projectiles.length, 1, `${presentationThrow} throw starts exactly one projectile`);
    assert.equal(projectiles[0].type, 'capture');
    assert.equal(typeof projectiles[0].onHit, 'function');
    assert.equal(counters.resolved, 0, 'projectile callback stays deferred');
    assert.equal(setup.state.inventory.captureBalls, 0, 'presentation failure never refunds the consumed ball');
    assert.equal(captureAttemptSnapshot(ledger, attemptId)?.phase, 'thrown');
    assert.equal(runtime.snapshot().activeCaptureAttempt?.attemptId, attemptId);
  }
}

function runCaptureEngagementSlotRegression() {
  const selected = fillEngagedWildIds([
    {
      id: 'capturing-resume-priority',
      dead: false,
      capturing: true,
      engaged: true,
      resumePriority: true,
      targetValid: true,
      distanceToTarget: 1,
      distanceFromHome: 1,
    },
    {
      id: 'available-aggressor',
      dead: false,
      capturing: false,
      engaged: false,
      resumePriority: false,
      targetValid: true,
      distanceToTarget: 2,
      distanceFromHome: 2,
    },
  ], { ...ENCOUNTER_POLICY, maxEngaged: 1 });
  assert.equal(selected.has('capturing-resume-priority'), false, 'a frozen capture target never reserves an engagement slot');
  assert.deepEqual([...selected], ['available-aggressor'], 'another eligible wild can use the slot during capture');
}

function runProjectileCreationFailureRegression(js) {
  const attemptId = 'projectile-create-failure';
  const ledger = createCaptureAttemptLedger();
  const removed = [];
  const counters = { ownedAi: 0, wildAi: 0, visual: 0, sfx: 0, resolved: 0 };
  const wild = {
    id: 'wild-projectile-failure',
    boss: false,
    elite: false,
    dead: false,
    capturing: false,
    mesh: { visible: true, position: new TestVector3(2, 0, 1) },
  };
  const projectiles = [];
  let partialProjectile = null;
  projectiles.push = function pushThenFail(projectile) {
    partialProjectile = projectile;
    Array.prototype.push.call(this, projectile);
    throw new Error('projectile scheduler rejected creation');
  };
  const setup = executeThrowBindings({ ledger, attemptId, wild, projectiles, counters, removed });
  const runtime = instantiateCaptureRuntime(js, { ...setup.bindings, aimedWild: () => wild });

  assert.doesNotThrow(() => runtime.executeCaptureThrow(), 'partial projectile creation failure must fail closed');
  assert.ok(partialProjectile, 'test reaches the callback-bearing partial projectile');
  assert.equal(typeof partialProjectile.onHit, 'function');
  assert.equal(projectiles.length, 0, 'failed projectile and callback are removed from the scheduler');
  assert.ok(removed.includes(partialProjectile.mesh), 'failed projectile mesh is disposed');
  assert.equal(captureAttemptSnapshot(ledger, attemptId)?.phase, 'cancelled', 'creation failure terminally cancels the transaction');
  assert.equal(setup.state.inventory.captureBalls, 0, 'terminal cancellation does not refund the thrown ball');
  assert.equal(wild.capturing, false, 'creation failure releases the frozen target');
  assert.equal(wild.mesh.visible, true, 'creation failure restores the live target mesh');
  assert.equal(runtime.snapshot().activeCaptureAttempt, null);
  assert.equal(runtime.snapshot().captureSequence, null);
}

function runStartSequencePresentationRegression(js) {
  const attemptId = 'start-presentation-failure';
  const wild = {
    id: 'wild-start',
    speciesId: 'test-species',
    dead: false,
    capturing: true,
    mesh: { visible: true, position: new TestVector3(5, 0, 4) },
  };
  const ballMesh = testBallMesh();
  const resolution = Object.freeze({ finalChancePct: 74, captureSucceeded: true });
  const runtime = instantiateCaptureRuntime(js, {
    activeCaptureAttempt: { attemptId, wild },
    captureSequence: null,
    THREE: TEST_THREE,
    boxGeometry: () => ({}),
    cancelCaptureAttempt() {},
    captureAttemptLedger: {},
    clampEmissive: value => value,
    msg() {},
    playSFX() { throw new Error('tension presentation failed'); },
    removeAndDispose() {},
    renderHUD() {},
    saveGame() {},
    scene: { add() {} },
    spById: { 'test-species': { id: 'test-species' } },
    spawnBurst() {},
    spawnRingPulse() {},
    wildDisplayName: () => 'Start Wild',
    projectiles: [],
  });

  assert.equal(runtime.startCaptureSequence(wild, ballMesh, attemptId, resolution), true);
  const snapshot = runtime.snapshot();
  assert.equal(snapshot.captureSequence?.attemptId, attemptId);
  assert.equal(snapshot.captureSequence?.wild, wild);
  assert.equal(snapshot.captureSequence?.ballMesh, ballMesh);
  assert.equal(snapshot.captureSequence?.phase, 'tension');
  assert.equal(snapshot.captureSequence?.phaseTime, 0);
  assert.equal(snapshot.captureSequence?.resolution, resolution);
  assert.equal(wild.capturing, true);
  assert.equal(wild.mesh.visible, false);
  assert.equal(ballMesh.scale.value, 3.6);
  assert.equal(ballMesh.position.y, 0.7);
}

function resolvedLifecycleAttempt({ attemptId, success }) {
  const ledger = createCaptureAttemptLedger();
  const started = beginCaptureAttempt(ledger, {
    attemptId,
    inventory: { captureBalls: 1 },
    targetId: 'wild-lifecycle',
    targetMonsterId: 'MON_002',
    ballClass: 'Basic',
    ballTargetType: null,
    referenceLevel: 5,
    ownedMonsterActive: false,
  });
  assert.equal(started.ok, true, started.reason);
  const resolved = resolveCaptureAttempt(ledger, success ? {
    attemptId,
    projectileHit: true,
    calculatorInput: {
      targetId: 'wild-lifecycle',
      monsterId: 'MON_002',
      currentHp: 1,
      maxHp: 100,
      activeStatusIds: [],
      targetSecondaryType: null,
      targetLevel: 5,
      variant: 'Normal',
      targetAlive: true,
    },
    rng: () => 0,
  } : {
    attemptId,
    projectileHit: false,
    calculatorInput: null,
    rng: () => assert.fail('projectile miss must not roll'),
  });
  assert.equal(resolved.ok, true, resolved.reason);
  assert.equal(resolved.attempt.resolution.captureSucceeded, success);
  return { ledger, resolution: resolved.attempt.resolution };
}

function completionRuntime(js, { attemptId, success, throwAt }) {
  const { ledger, resolution } = resolvedLifecycleAttempt({ attemptId, success });
  const ballMesh = testBallMesh();
  const wildMesh = { visible: false, position: new TestVector3(6, 0, 3), rotation: new TestVector3() };
  const wild = {
    id: 'wild-lifecycle',
    speciesId: 'runtime-species',
    zone: 'grass-meadow',
    level: 5,
    dead: false,
    capturing: true,
    engaged: false,
    state: 'capture',
    aiState: { state: 'chase' },
    rare: true,
    elite: true,
    genes: {},
    potential: 1,
    gender: 'F',
    evolutionPath: null,
    statusState: { currentTimeSec: 3 },
    mesh: wildMesh,
  };
  const cs = {
    attemptId,
    wild,
    ballMesh,
    pos: wildMesh.position.clone(),
    sp: { id: 'runtime-species' },
    name: 'Lifecycle Wild',
    chance: resolution.finalChancePct / 100,
    resolution,
    success,
    phaseTime: 1.69,
    phase: 'tension',
  };
  const state = {
    currentZone: 'grass-meadow',
    collection: [],
    party: [null],
    storage: [],
    exp: 0,
    eliteProgress: { defeated: {} },
  };
  const removed = [];
  const counters = { rare: 0, elite: 0, starter: 0, render: 0 };
  if (throwAt === 'animation') {
    ballMesh.material.color.setHex = () => { throw new Error('capture animation failed'); };
  }
  const runtime = instantiateCaptureRuntime(js, {
    activeCaptureAttempt: { attemptId, wild },
    captureSequence: cs,
    ZONES: { 'grass-meadow': { progressionBossSpeciesId: 'different-species' } },
    cancelCaptureAttempt,
    cancelWildAIAction: () => true,
    captureAttemptLedger: ledger,
    captureIdentityForWild: () => ({ monsterId: 'MON_002', stage: 1, runtimeSecondary: null }),
    clampEmissive: value => value,
    commitCaptureAttempt,
    console: { warn() {} },
    endEncounterEffects: value => ({ ...value, ended: true }),
    ensureProgressionEncounter() {},
    makeInstance: () => ({ instanceId: `owned-${attemptId}` }),
    markEliteProgress() {
      counters.elite += 1;
      if (throwAt === 'elite') throw new Error('elite progress failed');
    },
    markRareDiscovery() {
      counters.rare += 1;
      if (throwAt === 'rare') throw new Error('rare progress failed');
    },
    markStarterJourney() {
      counters.starter += 1;
      if (throwAt === 'starter') throw new Error('starter progress failed');
    },
    msg() {},
    playSFX() {
      if (throwAt === 'sfx') throw new Error('result presentation failed');
    },
    playerExpReward: () => 12,
    projectiles: [],
    removeAndDispose: (_scene, object) => { removed.push(object); },
    removeWildLabel() {},
    renderAll() {
      counters.render += 1;
      if (throwAt === 'render') throw new Error('render failed');
    },
    renderHUD() {
      counters.render += 1;
      if (throwAt === 'render') throw new Error('render failed');
    },
    respawnWild() {},
    retireWild() {},
    saveGame() {},
    scene: {},
    spawnCaptureResultEffect() {},
    spawnGroundDecal() {},
    state,
    triggerCameraShake() {},
    wildRespawnDelay: () => 1,
    wildTypes: () => ['Fire'],
  });
  return { ballMesh, counters, ledger, removed, runtime, state, wild, wildMesh };
}

function runCaptureCompletionRegressions(js) {
  for (const throwAt of ['sfx', 'animation', 'rare', 'elite', 'starter', 'render']) {
    const attemptId = `success-${throwAt}`;
    const setup = completionRuntime(js, { attemptId, success: true, throwAt });
    assert.doesNotThrow(() => setup.runtime.updateCaptureSequence(0.02), `${throwAt} failure cannot escape success completion`);
    const attempt = captureAttemptSnapshot(setup.ledger, attemptId);
    assert.equal(attempt?.phase, 'committed', `${throwAt} failure cannot produce commit_failed`);
    assert.equal(attempt?.commitOutcome, 'success');
    assert.equal(setup.state.collection.length, 1, `${throwAt} failure cannot block ownership`);
    assert.equal(setup.state.party[0], `owned-${attemptId}`);
    assert.equal(setup.wild.dead, true);
    assert.equal(setup.wild.capturing, false);
    assert.ok(setup.removed.includes(setup.ballMesh), `${throwAt} failure cannot strand the ball`);
    assert.ok(setup.removed.includes(setup.wildMesh), `${throwAt} failure cannot strand the captured target`);
    assert.equal(setup.runtime.snapshot().captureSequence, null);
    assert.equal(setup.runtime.snapshot().activeCaptureAttempt, null);
  }

  for (const throwAt of ['sfx', 'render']) {
    const attemptId = `failure-${throwAt}`;
    const setup = completionRuntime(js, { attemptId, success: false, throwAt });
    assert.doesNotThrow(() => setup.runtime.updateCaptureSequence(0.02), `${throwAt} failure cannot escape failed-capture completion`);
    const attempt = captureAttemptSnapshot(setup.ledger, attemptId);
    assert.equal(attempt?.phase, 'committed', `${throwAt} failure cannot produce commit_failed`);
    assert.equal(attempt?.commitOutcome, 'failure');
    assert.equal(setup.state.collection.length, 0);
    assert.equal(setup.wild.dead, false);
    assert.equal(setup.wild.capturing, false);
    assert.equal(setup.wild.mesh.visible, true);
    assert.equal(setup.wild.engaged, true);
    assert.equal(setup.wild.state, 'chase');
    assert.ok(setup.removed.includes(setup.ballMesh), `${throwAt} failure cannot strand the ball`);
    assert.equal(setup.runtime.snapshot().captureSequence, null);
    assert.equal(setup.runtime.snapshot().activeCaptureAttempt, null);
  }
}

function runCaptureLifecycleRegressions(js) {
  runExecutePresentationRegressions(js);
  runCaptureEngagementSlotRegression();
  runProjectileCreationFailureRegression(js);
  runStartSequencePresentationRegression(js);
  runCaptureCompletionRegressions(js);
}

export function assertCaptureLiveWiring({ js, config, packageJson }) {
  const execute = extractFunction(js, 'executeCaptureThrow');
  const resolve = extractFunction(js, 'resolveCapture');
  const start = extractFunction(js, 'startCaptureSequence');
  const update = extractFunction(js, 'updateCaptureSequence');
  const success = extractFunction(js, 'finishCaptureSuccess');
  const failure = extractFunction(js, 'finishCaptureFail');
  const chance = extractFunction(js, 'captureChance');
  const prerequisite = extractFunction(js, 'capturePrerequisite');
  const calculatorInput = extractFunction(js, 'captureCalculatorInput');
  const identity = extractFunction(js, 'captureIdentityForWild');
  const sourceType = extractFunction(js, 'captureWorkbookType');
  const statuses = extractFunction(js, 'captureActiveStatusIds');
  const damageWild = extractFunction(js, 'damageWild');
  const updateWild = extractFunction(js, 'updateWild');
  const reset = extractFunction(js, 'resetWild');
  const clearWilds = extractFunction(js, 'clearWilds');
  const selectAggressors = extractFunction(js, 'selectWildAggressors');
  const abort = extractFunction(js, 'abortCaptureSequence');
  const projectile = extractFunction(js, 'throwProjectile');
  const presentation = extractFunction(js, 'runBestEffortCombatPresentation');
  const summon = extractFunction(js, 'summonThrow');
  const makeInstance = extractFunction(js, 'makeInstance');
  const saveEnvelope = extractFunction(js, 'currentSaveEnvelope');

  assert.match(js, /from '\.\/capture-transaction\.mjs'/, 'live client imports the capture transaction boundary');
  assert.match(js, /from '\.\/balance-capture\.mjs'/, 'live client imports CAP_v1.0 calculator');
  assert.match(js, /monsterCatalogEntry/, 'live identity uses the workbook/runtime catalog');
  assert.match(js, /const captureAttemptLedger=createCaptureAttemptLedger\(\)/, 'ledger stays module-local and transient');
  assert.doesNotMatch(js, /liveCaptureChance\(/, 'legacy capture formula is not called by the playable client');
  assert.doesNotMatch(js, /eliteCaptureModifier|captureBonus:\.05/, 'legacy scene coefficients cannot shadow CAP_v1.0');
  assert.match(presentation, /try\{callback\(\);return true;\}catch\{return false;\}/, 'combat presentation failures stay best-effort');

  assert.match(execute, /beginCaptureAttempt\(/, 'a valid throw begins the transaction before projectile flight');
  assert.match(execute, /attemptId:attemptId/, 'the throw binds a stable attempt identity');
  assert.match(execute, /inventory:state\.inventory/, 'the transaction owns live ball inventory mutation');
  assert.match(execute, /targetMonsterId,ballClass:'Basic'/, 'begin binds the resolved workbook monster identity');
  assert.match(execute, /ownedMonsterActive:!!\(activeSummon\|\|pendingSummon\)/, 'begin snapshots active and in-flight summon state');
  assert.match(execute, /ensureCaptureReferenceLevel\(t\)/, 'a targeted throw starts the encounter reference snapshot');
  assert.doesNotMatch(execute, /captureBalls\s*--|captureBalls\s*-=|captureBalls\s*=/, 'the scene cannot consume a ball outside the transaction');
  assert.match(execute, /t\.captureEngagementResumePending=t\.engaged===true;t\.capturing=true/, 'throw snapshots pre-freeze engagement for failed-capture resume');
  assert.match(execute, /t\.capturing=true/, 'target remains frozen for projectile flight');
  assert.match(execute, /runBestEffortCombatPresentation\(\(\)=>\{playerVisual\.play\('throw',\{duration:\.34\}\);playSFX\('sfx_throw_ball'\);\}\)/, 'throw pose and SFX cannot gate projectile creation');
  assert.match(execute, /projectileStarted=throwProjectile\('capture'/, 'throw observes projectile creation success');
  assert.match(execute, /if\(!projectileStarted\)\{abortCaptureSequence\(t\)/, 'projectile creation failure terminally aborts the attempt');
  assertBefore(execute, "cancelOwnedAITarget(t.id,'capture_started')", "playerVisual.play('throw'", 'owned AI is cancelled before throwable presentation');
  assertBefore(execute, "cancelWildAIAction(t,'capture_started')", "playerVisual.play('throw'", 'wild AI is cancelled before throwable presentation');
  assertBefore(execute, 't.captureEngagementResumePending=t.engaged===true', 't.capturing=true', 'engagement resume evidence is captured before target freeze');
  assertBefore(execute, 't.capturing=true', "playerVisual.play('throw'", 'target is frozen before throwable presentation');
  assertBefore(execute, "playerVisual.play('throw'", "throwProjectile('capture'", 'projectile creation follows the best-effort throw pose');
  assert.match(projectile, /projectiles\.push\(projectile\)/, 'projectile callback enters the scheduler only through the guarded creator');
  assert.match(projectile, /catch\{const index=projectile\?projectiles\.indexOf\(projectile\):-1;if\(index>=0\)projectiles\.splice\(index,1\)/, 'partial projectile creation removes its callback-bearing scheduler entry');
  assert.match(projectile, /return false;\}\}/, 'projectile creation reports failure to its caller');
  assert.match(selectAggressors, /candidate\.capturing=w\?\.capturing/, 'live aggressor selection forwards the capture freeze exclusion');
  assert.match(selectAggressors, /candidate\.resumePriority=w\?\.captureEngagementResumePending===true/, 'resume evidence is only a post-capture priority hint');

  assert.match(resolve, /resolveCaptureAttempt\(/, 'projectile completion enters the idempotent resolver');
  assert.match(resolve, /projectileHit/, 'miss/hit is explicitly bound at the projectile boundary');
  assert.match(resolve, /rng:Math\.random/, 'the one client RNG call is injected into the transaction');
  assert.match(resolve, /if\(resolved\.replay\)return/, 'duplicate projectile callbacks are exact no-ops');
  assert.match(resolve, /commitCaptureAttempt\(/, 'non-rolling miss/disabled outcomes commit through the same guard');
  assert.match(resolve, /try\{calculatorInput=projectileHit\?captureCalculatorInput\(/, 'calculator extraction failure is contained at the projectile boundary');
  assert.match(resolve, /if\(projectileHit&&!calculatorInput\)\{abortCaptureSequence\(w\)/, 'invalid calculator state terminally aborts and releases the target');
  assert.match(resolve, /try\{resolved=resolveCaptureAttempt\(/, 'resolver exceptions are contained at the projectile boundary');
  assert.match(resolve, /if\(!resolved\?\.ok\)\{abortCaptureSequence\(w\)/, 'resolver rejection terminally aborts and releases the target');
  assert.match(resolve, /if\(!committed\.ok\)\{if\(ballMesh\)try\{removeAndDispose\(scene,ballMesh\);\}catch\{\}if\(w\?\.mesh&&!w\.dead\)\{try\{w\.capturing=false;\}/, 'immediate commit failure cannot strand its ball or target');
  assertBefore(resolve, 'abortCaptureSequence(w)', "msg('ข้อมูลมอนหรือ encounter ไม่ตรง Workbook", 'invalid calculator cleanup precedes presentation');

  assert.match(start, /resolution/, 'tension animation consumes an immutable resolution');
  assert.match(start, /success:resolution\.captureSucceeded/, 'the sequence cannot decide outcome itself');
  assert.doesNotMatch(start, /Math\.random|captureChance\(/, 'tension never rerolls or recomputes chance');
  assert.match(start, /runBestEffortCombatPresentation\(\(\)=>\{playSFX\('sfx_capture_tension'/, 'tension presentation cannot invalidate a started sequence');
  assertBefore(start, 'captureSequence=cs', "playSFX('sfx_capture_tension')", 'sequence is published before its first presentation');
  assertBefore(start, 'cs.ballMesh=ballMesh', "playSFX('sfx_capture_tension')", 'valid sequence owns its ball before presentation');
  assert.match(update, /commitCaptureAttempt\(/, 'animation completion commits side effects once');
  assert.match(update, /onSuccess:\(\)=>finishCaptureSuccess\(cs\)/, 'success side effects stay behind commit');
  assert.match(update, /onFailure:\(\)=>finishCaptureFail\(cs\)/, 'failure side effects stay behind commit');
  assert.match(update, /runBestEffortCombatPresentation\(\(\)=>\{const drop=/, 'tension animation failure cannot gate completion');
  assertBefore(update, 'captureSequence=null', 'commitCaptureAttempt(', 'global sequence clears before completion callbacks');
  assertBefore(update, 'commitCaptureAttempt(', 'activeCaptureAttempt=null', 'active attempt clears even when commit reports failure');

  assert.equal((success.match(/makeInstance\(/g) ?? []).length, 1, 'success calls the canonical instance factory exactly once');
  assert.match(success, /captureProfile\.baseBond/, 'captured Bond comes from the workbook Stage profile');
  assert.match(success, /captureProfile\.stage===2\?captureProfile\.monsterId:undefined/, 'captured Stage2 gets canonical workbook form evidence');
  assert.match(success, /captureProfile\.monsterId!==identity\.monsterId\|\|captureProfile\.stage!==identity\.stage/, 'factory fails closed if wild identity drifts after resolution');
  assert.match(success, /endEncounterEffects\(/, 'successful capture closes encounter statuses');
  assert.match(success, /try\{if\(w\.rare\)markRareDiscovery\(w,'captured'\);\}catch\{\}/, 'rare progression cannot gate successful ownership');
  assert.match(success, /try\{if\(w\.elite\)markEliteProgress\(w,'captured'\);\}catch\{\}/, 'elite progression cannot gate successful ownership');
  assert.match(success, /try\{if\(state\.currentZone==='grass-meadow'\)markStarterJourney\('captured'\);\}catch\{\}/, 'starter progression cannot gate successful ownership');
  assert.match(success, /runBestEffortCombatPresentation\(\(\)=>\{playSFX\('sfx_capture_success'/, 'success presentation cannot fail the transaction callback');
  assertBefore(success, 'state.collection.push(inst)', "playSFX('sfx_capture_success')", 'ownership commits before success presentation');
  assertBefore(success, 'w.capturing=false', "playSFX('sfx_capture_success')", 'captured target releases before success presentation');
  assertBefore(success, 'removeAndDispose(scene,cs.ballMesh)', "playSFX('sfx_capture_success')", 'capture ball clears before success presentation');
  assert.match(makeInstance, /formId:opts\.formId\?\?opts\.evolutionPath\?\?sp\.id/, 'factory accepts explicit canonical Stage2 form identity');
  assert.match(failure, /engaged=true/, 'failed capture preserves the encounter and resumes chase');
  assert.doesNotMatch(failure, /endEncounterEffects\(/, 'failed capture preserves HP/status encounter state');
  assert.match(failure, /runBestEffortCombatPresentation\(\(\)=>\{playSFX\('sfx_capture_fail'/, 'failure presentation cannot fail the transaction callback');
  assertBefore(failure, 'removeAndDispose(scene,cs.ballMesh)', "playSFX('sfx_capture_fail')", 'failed capture ball clears before presentation');
  assertBefore(failure, 'w.capturing=false', "playSFX('sfx_capture_fail')", 'failed target releases before presentation');

  assert.match(identity, /workbookStage2MonsterId/, 'evolved wild uses the Stage2 workbook ID');
  assert.match(identity, /workbookBaseMonsterId/, 'base wild uses the Stage1 workbook ID');
  assert.match(identity, /wildPath\(w\)/, 'known Stage2 path may contribute canonical secondary type');
  assert.match(identity, /const stage=w\?\.evolutionPath\?2:1/, 'every non-empty live evolutionPath is Stage2 identity evidence');
  assert.doesNotMatch(identity, /stage===2&&!path/, 'legacy live Stage2 aliases cannot be rejected before capture policy');
  const liveStage2Aliases = [...new Set([...js.matchAll(/evolutionPath:'([^']+)'/g)].map(match => match[1]))].sort();
  assert.deepEqual(liveStage2Aliases, ['flame_wolf', 'magma_bear'], 'every configured legacy Stage2 spawn alias enters the generic Stage2 identity path');
  assert.match(sourceType, /runtimeType==='Fairy'\?'LIGHT'/, 'runtime Fairy maps back to workbook LIGHT');
  assert.match(statuses, /expiresAtSec>status\.currentTimeSec/, 'only active encounter statuses affect capture');
  assert.match(calculatorInput, /captureWorkbookMonsterId\(w\)/, 'calculator input resolves Stage1/Stage2 workbook identity');
  assert.match(calculatorInput, /captureActiveStatusIds\(w\)/, 'calculator reads canonical encounter statuses');
  assert.match(calculatorInput, /captureWorkbookVariant\(w\)/, 'calculator reads central variant policy');
  assert.match(calculatorInput, /validCapturePolicyForWild\(w\)/, 'variant flags and encounter capture policy must agree');
  assert.match(calculatorInput, /ownedMonsterActive:!!\(activeSummon\|\|pendingSummon\)/, 'calculator cannot ignore an in-flight summon');
  assert.match(chance, /resolveWorkbookCapture\(/, 'HUD preview uses CAP_v1.0');
  assert.match(chance, /finalChancePct\/100/, 'HUD converts workbook percent exactly once');
  assert.doesNotMatch(chance, /ensureCaptureReferenceLevel\(/, 'HUD preview cannot start or mutate an encounter snapshot');

  assert.match(reset, /captureReferenceLevel=null/, 'proper encounter reset discards the reference snapshot');
  assert.match(prerequisite, /pendingSummon\|\|projectiles\.some\(p=>p\.type==='summon'\)/, 'reverse summon-to-capture race is blocked');
  assert.match(damageWild, /ensureCaptureReferenceLevel\(w\)/, 'first owned-monster hit snapshots the encounter reference');
  assert.match(updateWild, /ensureCaptureReferenceLevel\(w\)/, 'first wild engagement snapshots the encounter reference');
  assert.match(abort, /cancelCaptureAttempt\(/, 'abort terminally cancels a thrown transaction without refund');
  assert.match(abort, /projectile\?\.type!==['"]capture['"]/, 'abort removes the in-flight capture projectile and its callback');
  assert.match(abort, /w\.capturing=false/, 'abort releases the frozen target');
  assert.match(clearWilds, /clearCaptureAttemptLedger\(/, 'zone/encounter teardown releases bounded ledger state');
  assert.match(summon, /if\(activeCaptureAttempt\|\|captureSequence\)/, 'summon is blocked while capture is active');
  assert.doesNotMatch(saveEnvelope, /captureAttemptLedger|activeCaptureAttempt|captureReferenceLevel/, 'transient ledger/reference never enter save envelopes');

  assert.match(config, /activation: 'live_client_transaction'/, 'CAP_v1.0 is live only behind the accepted client transaction');
  assert.match(config, /rollAuthority: 'future_server_boundary'/, 'client activation does not claim server authority');
  const scripts = JSON.parse(packageJson).scripts;
  assert.match(scripts['test:v81:capture'], /v81-capture-transaction\.mjs/);
  assert.match(scripts['test:v81:capture'], /v81-capture-transaction-mutants\.mjs/);
  assert.match(scripts['test:v81:capture'], /v81-capture-live-wiring\.mjs/);
  assert.match(scripts['test:v81:capture'], /v81-capture-live-wiring-mutants\.mjs/);

  runCaptureLifecycleRegressions(js);
}

assert.equal(WORKBOOK_CAPTURE_ADAPTER.activation, 'live_client_transaction');
assert.equal(WORKBOOK_CAPTURE_ADAPTER.rollAuthority, 'future_server_boundary');
assertCaptureLiveWiring({
  js: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
  config: fs.readFileSync(new URL('balance-config.mjs', root), 'utf8'),
  packageJson: fs.readFileSync(new URL('package.json', root), 'utf8'),
});

console.log('V8.1 A27 live capture wiring: PASS');
