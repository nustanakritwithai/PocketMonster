import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENCOUNTER_POLICY,
  fillEngagedWildIds,
  shouldResetEncounter,
  WILD_BASIC_AI_POLICY,
  WILD_BOSS_BASIC_AI_POLICY,
} from '../runtime-policies.mjs';
import { bossCombatAuthorized, retreatBossChallenge } from '../boss-challenge.mjs';
import {
  createMonsterAIState,
  isCanonicalMonsterAIState,
  resetMonsterAIState,
  resolveWildMonsterAI,
  settleWildAIIntent,
  validateMonsterAIState,
} from '../wild-ai-resolver.mjs';
import { createEncounterStatusState, isEncounterStatusState } from '../status-lifecycle.mjs';

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const parameters = source.indexOf('(', start);
  let parameterDepth = 0;
  let open = -1;
  for (let index = parameters; index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    else if (source[index] === ')') parameterDepth -= 1;
    if (parameterDepth === 0) {
      open = source.indexOf('{', index);
      break;
    }
  }
  assert.ok(open >= 0, `${name} must have a body`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

function createReadyDecision({ actorId = 'wild-1', targetId = 'owned:owned-1:7', profile = WILD_BASIC_AI_POLICY } = {}) {
  const encounterId = 'zone:3:grass';
  const self = {
    id: actorId,
    encounterId,
    alive: true,
    capturing: false,
    engaged: true,
    hp: 10,
    maxHp: 10,
    position: { x: 0, z: 0 },
    home: { x: 0, z: 0 },
    attackReady: true,
    canMove: true,
    canAttack: true,
    forcedRetreat: false,
  };
  const target = {
    id: targetId,
    encounterId,
    alive: true,
    targetable: true,
    capturing: false,
    position: { x: 1, z: 0 },
    recentDamage: 0,
    rolePriority: 0,
  };
  const chase = createMonsterAIState({ actorId, encounterId, state: 'chase', targetId: target.id });
  const windup = resolveWildMonsterAI({
    state: chase,
    snapshot: { nowSec: 1, dtSec: 0, self, targets: [target], profile },
    canEngage: true,
  });
  assert.equal(windup.nextState.state, 'attack_windup');
  const ready = resolveWildMonsterAI({
    state: windup.nextState,
    snapshot: { nowSec: 1 + profile.windupDurationSec, dtSec: profile.windupDurationSec, self, targets: [target], profile },
    canEngage: true,
  });
  assert.equal(ready.action, 'basic_attack');
  return ready;
}

function assertScratchContract(gameSource) {
  const createSource = functionSource(gameSource, 'createWildAiScratch');
  const fillSource = functionSource(gameSource, 'fillWildAiRequest');
  const helpers = Function(
    'WILD_BASIC_AI_POLICY',
    'wildAiTargetAvailable',
    'wildAiPolicy',
    `'use strict';${createSource};${fillSource};return {createWildAiScratch,fillWildAiRequest};`,
  )(WILD_BASIC_AI_POLICY, () => true, wild => wild?.boss === true ? WILD_BOSS_BASIC_AI_POLICY : WILD_BASIC_AI_POLICY);
  const scratch = helpers.createWildAiScratch();
  const wild = {
    id: 'wild-1',
    aiEncounterId: 'zone:3:grass',
    aiState: createMonsterAIState({ actorId: 'wild-1', encounterId: 'zone:3:grass' }),
    dead: false,
    retired: false,
    hp: 10,
    maxHp: 10,
    engaged: true,
    attackCd: 0,
    mesh: { position: { x: 1, z: 2 } },
    home: { x: 3, z: 4 },
    statusState: { currentTimeSec: 5 },
  };
  const target = {
    id: 'owned:owned-1:7',
    position: { x: 6, z: 7 },
    alive: true,
    targetable: true,
  };
  const control = { ok: true, canMove: true, canAttack: true, forcedRetreat: false };
  const first = helpers.fillWildAiRequest(scratch, wild, 0.05, true, control, target);
  const identities = {
    request: first,
    snapshot: first.snapshot,
    self: first.snapshot.self,
    selfPosition: first.snapshot.self.position,
    targets: first.snapshot.targets,
    target: first.snapshot.targets[0],
    targetPosition: first.snapshot.targets[0].position,
  };
  assert.equal(first.state, wild.aiState);
  assert.equal(first.snapshot.nowSec, 5);
  assert.equal(first.snapshot.dtSec, 0.05);
  assert.equal(first.snapshot.self.id, 'wild-1');
  assert.equal(first.snapshot.self.attackReady, true);
  assert.equal(first.snapshot.self.forcedRetreat, false);
  assert.equal(first.snapshot.targets[0].id, 'owned:owned-1:7');
  assert.equal(first.snapshot.targets[0].encounterId, 'zone:3:grass');
  assert.equal(first.snapshot.profile, WILD_BASIC_AI_POLICY);
  const second = helpers.fillWildAiRequest(scratch, {
    ...wild,
    attackCd: 1,
    mesh: { position: { x: 8, z: 9 } },
  }, 0.1, false, { ...control, canAttack: false, forcedRetreat: true }, {
    ...target,
    position: { x: 10, z: 11 },
  });
  assert.equal(second, identities.request);
  assert.equal(second.snapshot, identities.snapshot);
  assert.equal(second.snapshot.self, identities.self);
  assert.equal(second.snapshot.self.position, identities.selfPosition);
  assert.equal(second.snapshot.targets, identities.targets);
  assert.equal(second.snapshot.targets[0], identities.target);
  assert.equal(second.snapshot.targets[0].position, identities.targetPosition);
  assert.deepEqual(second.snapshot.self.position, { x: 8, z: 9 });
  assert.equal(second.snapshot.self.attackReady, false);
  assert.equal(second.snapshot.self.forcedRetreat, true);
  assert.deepEqual(second.snapshot.targets[0].position, { x: 10, z: 11 });
  const boss = helpers.fillWildAiRequest(scratch, { ...wild, boss: true }, 0.1, true, control, target);
  assert.equal(boss.snapshot.profile, WILD_BOSS_BASIC_AI_POLICY);
}

function assertWildCancellationContract(gameSource) {
  const commitSource = functionSource(gameSource, 'commitWildAIState');
  const quarantineSource = functionSource(gameSource, 'quarantineWildAIActor');
  const cancelSource = functionSource(gameSource, 'cancelWildAIAction');
  const commit = Function(
    'validateMonsterAIState',
    `'use strict';${commitSource};return commitWildAIState;`,
  )(validateMonsterAIState);
  const cleared = [];
  const quarantinedActors = [];
  const quarantine = Function(
    'distanceTickScheduler',
    'labelTickScheduler',
    'removeAndDispose',
    'scene',
    'removeWildLabel',
    'wilds',
    'wildPopulationRecoveryPending',
    'cancelOwnedAITarget',
    'discardBattleEventsForTarget',
    'clearWildAiTelegraph',
    `'use strict';${quarantineSource};return quarantineWildAIActor;`,
  )(
    { clear: id => cleared.push(`distance:${id}`) },
    { clear: id => cleared.push(`label:${id}`) },
    (_scene, mesh) => { mesh.disposed = true; },
    {},
    wild => { wild.labelRemoved = true; },
    quarantinedActors,
    false,
    () => 0,
    () => 0,
    () => false,
  );
  const createState = input => createMonsterAIState(input);
  const makeCancel = ({ reset = () => null, create = createState } = {}) => Function(
    'resetMonsterAIState',
    'createMonsterAIState',
    'commitWildAIState',
    'quarantineWildAIActor',
    'clearWildAiTelegraph',
    'recordWildAiTrace',
    `'use strict';${cancelSource};return cancelWildAIAction;`,
  )(reset, create, commit, quarantine, () => {}, () => {});
  const wild = overrides => ({
    id: 'wild-1',
    aiEncounterId: 'zone:3:grass',
    aiActionSequenceFloor: 4,
    aiState: { malformed: true },
    state: 'attack_windup',
    engaged: true,
    retired: false,
    statusState: { currentTimeSec: 2 },
    mesh: { visible: true },
    ...overrides,
  });
  const recovered = wild();
  assert.equal(makeCancel()(recovered, 'recover'), true);
  assert.equal(recovered.aiState.state, 'wander');
  assert.equal(recovered.aiState.pendingAction, null);
  assert.equal(recovered.aiState.nextActionSequence, 4, 'fallback preserves the monotonic action sequence floor');
  assert.equal(recovered.aiActionSequenceFloor, 4);
  assert.equal(recovered.retired, false);

  const invalidFloor = wild({ aiActionSequenceFloor: Number.NaN });
  quarantinedActors.push(invalidFloor);
  assert.equal(makeCancel()(invalidFloor, 'invalid_floor'), false);
  assert.equal(invalidFloor.aiState, null);
  assert.equal(invalidFloor.state, 'fainted');
  assert.equal(invalidFloor.engaged, false);
  assert.equal(invalidFloor.retired, true);
  assert.equal(invalidFloor.dead, true);
  assert.equal(invalidFloor.mesh, null);
  assert.equal(invalidFloor.labelRemoved, true);
  assert.deepEqual(quarantinedActors, [], 'quarantine removes the actor from live targeting/population arrays');
  assert.deepEqual(cleared, ['distance:wild-1', 'label:label:wild-1']);
}

function assertResetWildContract(gameSource) {
  const resetWildSource = functionSource(gameSource, 'resetWild');
  const cancelSource = functionSource(gameSource, 'cancelWildAIAction');
  const commitSource = functionSource(gameSource, 'commitWildAIState');
  const commit = Function(
    'validateMonsterAIState',
    `'use strict';${commitSource};return commitWildAIState;`,
  )(validateMonsterAIState);
  const cancel = Function(
    'resetMonsterAIState', 'createMonsterAIState', 'commitWildAIState',
    'quarantineWildAIActor', 'clearWildAiTelegraph', 'recordWildAiTrace',
    `'use strict';${cancelSource};return cancelWildAIAction;`,
  )(
    resetMonsterAIState,
    createMonsterAIState,
    commit,
    wild => { wild.dead = true; wild.retired = true; wild.engaged = false; return true; },
    () => {},
    () => {},
  );
  const cancelledOwned = [];
  const discardedBattleTargets = [];
  const ended = [];
  const reset = Function(
    'cancelOwnedAITarget', 'cancelWildAIAction',
    'discardBattleEventsForTarget', 'endEncounterEffects', 'createEncounterStatusState',
    `'use strict';${resetWildSource};return resetWild;`,
  )(
    (id, reason) => cancelledOwned.push([id, reason]),
    cancel,
    id => discardedBattleTargets.push(id),
    (status, request) => { ended.push([status, request]); return { ended: true }; },
    request => ({ fresh: true, ...request }),
  );
  const actorId = 'wild-reset';
  const encounterId = 'zone:4:grass';
  const aiState = createMonsterAIState({
    actorId,
    encounterId,
    state: 'attack_windup',
    targetId: 'player:4',
    stateElapsedSec: 0.2,
    retargetRemainingSec: 0.4,
    nextActionSequence: 8,
    pendingAction: {
      kind: 'basic_attack', token: `${actorId}:${encounterId}:7`, targetId: 'player:4', issuedAtSec: null, commandSource: 'wildBasicAI',
    },
  });
  const position = {
    x: 9,
    z: 9,
    copy(home) { this.x = home.x; this.z = home.z; return this; },
  };
  const wild = {
    id: actorId,
    dead: false,
    retired: false,
    aiEncounterId: encounterId,
    aiActionSequenceFloor: 8,
    aiState,
    state: 'attack_windup',
    statusState: { currentTimeSec: 5, effects: ['stun'] },
    captureReferenceLevel: 12,
    hp: 1,
    maxHp: 100,
    engaged: true,
    resetTimer: 2,
    attackCd: 1,
    boss: true,
    combatEnabled: true,
    mesh: { position },
    home: { x: 2, z: 3 },
  };
  reset(wild, 'outside_leash');
  assert.deepEqual(cancelledOwned, [[actorId, 'encounter_reset:outside_leash']]);
  assert.deepEqual(discardedBattleTargets, [actorId], 'successful reset clears only this target contribution ledger');
  assert.equal(ended.length, 1);
  assert.deepEqual(wild.statusState, { fresh: true, encounterId: actorId, nowSec: 0 });
  assert.equal(wild.captureReferenceLevel, null);
  assert.equal(wild.hp, wild.maxHp);
  assert.equal(wild.state, 'wander');
  assert.equal(wild.engaged, false);
  assert.equal(wild.resetTimer, 0);
  assert.equal(wild.attackCd, 0);
  assert.equal(wild.combatEnabled, false);
  assert.deepEqual({ x: position.x, z: position.z }, wild.home);
  assert.equal(wild.aiState.state, 'wander');
  assert.equal(wild.aiState.targetId, null);
  assert.equal(wild.aiState.pendingAction, null);
  assert.equal(wild.aiState.nextActionSequence, 8, 'reset preserves the monotonic action sequence');
  assert.equal(wild.aiActionSequenceFloor, 8);
}

function assertCancelTargetIterationContract(gameSource) {
  const source = functionSource(gameSource, 'cancelWildAITarget');
  const wilds = ['a', 'b', 'c'].map(id => ({ id, aiState: { targetId: 'owned:one:1' } }));
  const cancelled = [];
  const cancelTarget = Function(
    'wilds', 'cancelWildAIAction',
    `'use strict';${source};return cancelWildAITarget;`,
  )(
    wilds,
    wild => {
      cancelled.push(wild.id);
      const index = wilds.indexOf(wild);
      if(index >= 0)wilds.splice(index, 1);
      return false;
    },
  );
  assert.equal(cancelTarget('owned:one:1', 'target_invalid'), 3);
  assert.deepEqual(cancelled, ['c', 'b', 'a']);
  assert.deepEqual(wilds, [], 'reverse cancellation remains complete when quarantine removes each actor');
}

function assertTelegraphFollowContract(gameSource) {
  const source = functionSource(gameSource, 'syncWildAiTelegraphs');
  const effect = { mesh: { position: { x: 0, y: 0.08, z: 0 } } };
  const wild = {
    aiTelegraphEffect: effect,
    aiTelegraphTargetId: 'owned:one:2',
    aiTelegraphYOffset: 0.08,
  };
  const effects = [effect];
  const sync = Function(
    'wilds',
    'effects',
    'wildAiTargetAvailable',
    `'use strict';${source};return syncWildAiTelegraphs;`,
  )([wild], effects, () => true);
  sync({ id: 'owned:one:2', position: { x: 2, y: 0, z: -3 } });
  assert.deepEqual(effect.mesh.position, { x: 2, y: 0.08, z: -3 },
    'windup ring follows the exact locked runtime target');
  sync({ id: 'owned:other:9', position: { x: 99, y: 0, z: 99 } });
  assert.deepEqual(effect.mesh.position, { x: 2, y: 0.08, z: -3 },
    'telegraph never redirects to a different target identity');
  effects.length = 0;
  sync({ id: 'owned:one:2', position: { x: 4, y: 0, z: 5 } });
  assert.equal(wild.aiTelegraphEffect, null, 'expired effect handles are cleared');
  assert.equal(wild.aiTelegraphTargetId, null);
}

function runWildTelegraphFailureProbe(gameSource, { boss, spawnMode }) {
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');
  const clearSource = functionSource(gameSource, 'clearWildAiTelegraph');
  const setSource = functionSource(gameSource, 'setWildAiTelegraph');
  const createSource = functionSource(gameSource, 'createWildAiTelegraph');
  const updateSource = functionSource(gameSource, 'updateWild');
  const effects = [];
  const calls = { spawn: 0, cancel: [], execute: 0, damage: 0, token: 0, action: 0 };
  const effect = { life: 1, mesh: { visible: true, position: { x: 1, y: 0.08, z: 0 } } };
  const target = { id: 'owned:telegraph-target:1', position: { x: 1, y: 0, z: 0 } };
  const wild = {
    id: boss ? 'boss-telegraph' : 'wild-telegraph',
    boss,
    capturing: false,
    retired: false,
    runtimeGeneration: 7,
    statusState: { currentTimeSec: 1 },
    mesh: { position: { x: 0, y: 0, z: 0 }, userData: {} },
    home: { x: 0, y: 0, z: 0 },
    state: 'chase',
    engaged: true,
    aiState: { state: 'chase', targetId: target.id, pendingAction: null },
    aiTelegraphEffect: null,
    aiTelegraphTargetId: null,
    aiTelegraphYOffset: 0,
    lastCommittedAiActionToken: null,
  };
  const api = Function(
    'wild', 'target', 'effects', 'effect', 'spawnMode', 'calls',
    'WILD_BASIC_AI_POLICY',
    `'use strict';
    let resolverCalls=0;
    const wildAiScratch={};
    const wildUpdateScratch={resetRequest:{}};
    const bossChallengeSession={activeBossId:wild.boss?wild.id:null};
    const zoneGeneration=7;
    const spawnRingPulse=()=>{
      calls.spawn++;
      if(spawnMode==='throw')throw new Error('telegraph-spawn-failure');
      if(spawnMode==='null')return null;
      effects.push(effect);return effect;
    };
    const wildFrameRuntimeUsable=()=>true;
    const wildAiTargetAvailable=candidate=>candidate===target;
    const distXZ=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
    const shouldResetEncounter=()=>false;
    const wildEncounterResetCause=()=>null;
    const canCombatTargetWild=()=>true;
    const bossCombatAuthorized=(session,id)=>session.activeBossId===id;
    const exitBossChallenge=()=>false;
    const resetWild=()=>false;
    const MONSTER_AI_DEBUG=false;
    const fillWildAiRequest=()=>({});
    const resolveWildMonsterAI=()=>{
      resolverCalls++;
      if(resolverCalls===1)return{
        ok:true,
        nextState:{state:'attack_windup',targetId:target.id,pendingAction:{token:'telegraph-token-1'}},
        targetId:target.id,
        action:'idle',
        intent:null,
        reason:'attack_windup_started',
        transition:{toState:'attack_windup'},
      };
      if(wild.aiState?.state==='attack_windup')return{
        ok:true,
        nextState:{state:'chase',targetId:target.id,pendingAction:null},
        targetId:target.id,
        action:'basic_attack',
        intent:{actionToken:'telegraph-token-1'},
        reason:'attack_ready',
        transition:null,
      };
      return{
        ok:true,
        nextState:{state:'wander',targetId:null,pendingAction:null},
        targetId:null,
        action:'idle',
        intent:null,
        reason:'idle_after_cancel',
        transition:null,
      };
    };
    const recordWildAiTrace=()=>{};
    const quarantineWildAIActor=()=>false;
    const cancelWildAIAction=(actor,reason)=>{
      calls.cancel.push(reason);
      clearWildAiTelegraph(actor);
      actor.aiState={state:'wander',targetId:null,pendingAction:null};actor.state='wander';
      return true;
    };
    const commitWildAIState=(actor,nextState)=>{actor.aiState=nextState;actor.state=nextState.state;return true;};
    const cacheWildAiMotion=()=>true;
    const ensureCaptureReferenceLevel=()=>1;
    const wildAiPolicy=()=>WILD_BASIC_AI_POLICY;
    const triggerMonsterAction=()=>{calls.action++;};
    const executeWildAiIntent=(actor,decision)=>{
      calls.execute++;calls.damage++;calls.token++;
      actor.lastCommittedAiActionToken=decision.intent.actionToken;
      return true;
    };
    ${bestEffortSource}
    ${clearSource}
    ${setSource}
    ${createSource}
    ${updateSource}
    return{
      run(){
        const frameRuntime={control:{ok:true,canMove:true,canAttack:true}};
        const first=updateWild(wild,.05,true,target,target.id,frameRuntime);
        const afterFirst={
          result:first,
          state:wild.state,
          pendingToken:wild.aiState?.pendingAction?.token??null,
          telegraph:wild.aiTelegraphEffect,
        };
        const second=updateWild(wild,.05,true,target,target.id,frameRuntime);
        return{first:afterFirst,second,state:wild.state,pending:wild.aiState?.pendingAction??null};
      },
    };`,
  )(wild, target, effects, effect, spawnMode, calls, WILD_BASIC_AI_POLICY);
  const result = api.run();
  return { result, wild, effect, effects, calls };
}

function assertWildTelegraphFailureContract(gameSource) {
  for (const spawnMode of ['throw', 'null']) {
    let bossProbe;
    assert.doesNotThrow(() => { bossProbe = runWildTelegraphFailureProbe(gameSource, { boss: true, spawnMode }); },
      `Boss ${spawnMode} telegraph failure must not escape the frame`);
    assert.equal(bossProbe.result.first.result, false);
    assert.equal(bossProbe.result.first.state, 'wander');
    assert.equal(bossProbe.result.first.pendingToken, null,
      'Boss attack windup is cancelled when its required telegraph is unavailable');
    assert.deepEqual(bossProbe.calls.cancel, ['boss_attack_telegraph_unavailable']);
    assert.equal(bossProbe.calls.execute, 0);
    assert.equal(bossProbe.calls.damage, 0, 'cancelled Boss windup cannot execute damage next frame');
    assert.equal(bossProbe.calls.token, 0, 'cancelled Boss windup cannot claim an action token');
    assert.equal(bossProbe.wild.lastCommittedAiActionToken, null);

    let normalProbe;
    assert.doesNotThrow(() => { normalProbe = runWildTelegraphFailureProbe(gameSource, { boss: false, spawnMode }); },
      `normal Wild ${spawnMode} telegraph failure remains best-effort`);
    assert.equal(normalProbe.result.first.result, true);
    assert.equal(normalProbe.result.first.state, 'attack_windup');
    assert.equal(normalProbe.result.first.pendingToken, 'telegraph-token-1');
    assert.deepEqual(normalProbe.calls.cancel, []);
    assert.equal(normalProbe.calls.execute, 1, 'normal Wild gameplay continues after optional visual failure');
    assert.equal(normalProbe.calls.damage, 1);
    assert.equal(normalProbe.calls.token, 1);
  }

  const visible = runWildTelegraphFailureProbe(gameSource, { boss: true, spawnMode: 'ok' });
  assert.equal(visible.result.first.result, true);
  assert.equal(visible.result.first.telegraph, visible.effect);
  assert.equal(visible.result.first.pendingToken, 'telegraph-token-1');
  assert.deepEqual(visible.calls.cancel, []);
  assert.equal(visible.calls.execute, 1);
  assert.equal(visible.calls.damage, 1);
  assert.equal(visible.calls.token, 1);
}

function assertCaptureFailureFailsClosed(gameSource) {
  const source = functionSource(gameSource, 'finishCaptureFail');
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');
  const bestEffort = Function(`'use strict';${bestEffortSource};return runBestEffortCombatPresentation;`)();
  const notices = [];
  const finish = Function(
    'playSFX', 'spawnCaptureResultEffect', 'removeAndDispose', 'scene',
    'cancelWildAIAction', 'msg', 'renderHUD', 'saveGame', 'runBestEffortCombatPresentation',
    `'use strict';${source};return finishCaptureFail;`,
  )(
    () => {}, () => {}, () => {}, {},
    wild => {
      wild.dead = true;
      wild.retired = true;
      wild.engaged = false;
      wild.aiState = null;
      wild.mesh = null;
      return false;
    },
    notice => notices.push(notice), () => {}, () => {}, bestEffort,
  );
  const wild = {
    dead: false,
    retired: false,
    engaged: true,
    capturing: true,
    mesh: { visible: false, position: { copy: () => {} }, rotation: { z: 1 } },
    aiState: { state: 'wander' },
  };
  assert.doesNotThrow(() => finish({
    wild,
    ballMesh: null,
    pos: { x: 0, z: 0 },
    resolution: { reason: 'capture_failed' },
    name: 'Wild',
    chance: 0.5,
  }));
  assert.equal(wild.dead, true);
  assert.equal(wild.retired, true);
  assert.equal(wild.engaged, false, 'failed cancellation must not revive a quarantined capture target');
  assert.equal(wild.mesh, null);
  assert.equal(notices.length, 1);

  const resumedNotices = [];
  const resume = Function(
    'playSFX', 'spawnCaptureResultEffect', 'removeAndDispose', 'scene',
    'cancelWildAIAction', 'msg', 'renderHUD', 'saveGame', 'runBestEffortCombatPresentation',
    `'use strict';${source};return finishCaptureFail;`,
  )(
    () => {}, () => {}, () => {}, {},
    actor => {
      actor.aiState = createMonsterAIState({ actorId: actor.id, encounterId: actor.aiEncounterId });
      actor.state = actor.aiState.state;
      return true;
    },
    notice => resumedNotices.push(notice), () => {}, () => {}, bestEffort,
  );
  const encounterId = 'zone:3:grass';
  const resumed = {
    id: 'capture-resume', aiEncounterId: encounterId, dead: false, retired: false,
    engaged: true, capturing: true, hp: 37, maxHp: 100,
    mesh: { visible: false, position: { x: 0, z: 0, copy(pos) { this.x = pos.x; this.z = pos.z; } }, rotation: { z: 1 } },
    home: { x: 0, z: 0 }, aiState: createMonsterAIState({ actorId: 'capture-resume', encounterId }),
  };
  resume({
    wild: resumed, ballMesh: null, pos: { x: 0, z: 0 },
    resolution: { reason: 'capture_failed' }, name: 'Wild', chance: 0.5,
  });
  assert.equal(resumed.capturing, false);
  assert.equal(resumed.engaged, true, 'failed capture resumes the same provoked encounter');
  const target = {
    id: 'player:3', encounterId, alive: true, targetable: true, capturing: false,
    position: { x: 5, z: 0 }, recentDamage: 0, rolePriority: 0,
  };
  const selected = fillEngagedWildIds([{
    id: resumed.id, dead: resumed.dead, capturing: resumed.capturing,
    targetValid: true, engaged: resumed.engaged, distanceToTarget: 5, distanceFromHome: 0,
  }]);
  assert.equal(selected.has(resumed.id), true, 'capture resume at 5m retains its engagement slot');
  assert.equal(shouldResetEncounter({
    engaged: resumed.engaged, targetValid: selected.has(resumed.id),
    distanceToTarget: 5, distanceFromHome: 0,
  }), false, 'capture resume inside disengage radius must not trigger heal/reset');
  const decision = resolveWildMonsterAI({
    state: resumed.aiState,
    snapshot: {
      nowSec: 1, dtSec: 0,
      self: {
        id: resumed.id, encounterId, alive: true, capturing: false, engaged: resumed.engaged,
        hp: resumed.hp, maxHp: resumed.maxHp, position: { x: 0, z: 0 }, home: resumed.home,
        attackReady: true, canMove: true, canAttack: true, forcedRetreat: false,
      },
      targets: [target], profile: WILD_BASIC_AI_POLICY,
    },
    canEngage: true,
  });
  assert.equal(decision.nextState.state, 'alert');
  assert.equal(decision.targetId, target.id);
  assert.equal(resumed.hp, 37, 'capture failure does not heal the target before combat resumes');
  assert.equal(resumedNotices.length, 1);
}

function assertBossStartFailsClosed(gameSource) {
  const source = functionSource(gameSource, 'startBossChallenge');
  const makeBoss = () => ({
    id: 'boss-1', dead: false, retired: false, engaged: false, combatEnabled: false,
    mesh: { position: { x: 0, z: 0 } }, aiState: { state: 'wander' },
  });
  const makeHarness = ({ boss, cancelWildAIAction, targetDistance = 0, summoned = false }) => Function(
    'boss', 'cancelWildAIAction', 'targetDistance', 'summoned',
    `'use strict';
      let nearbyBossChallengeId='boss-1';
      let bossChallengeSession={status:'idle'};
      const player={position:{x:0,z:0}};
      const activeSummon=summoned?{mesh:{position:{x:targetDistance,z:0}}}:null;
      let acceptCount=0,cancelCount=0;
      const bossChallengeWild=()=>boss;
      const bossPromptAvailable=()=>true;
      const distXZ=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
      const resolveWildAiTarget=()=>({position:{x:targetDistance,z:0}});
      const wildAiTargetAvailable=()=>true;
      const ENCOUNTER_POLICY={disengageRadius:20};
      const acceptBossChallenge=()=>{acceptCount++;return{status:'active'};};
      const ensureCaptureReferenceLevel=()=>{};
      const wrappedCancel=actor=>{cancelCount++;return cancelWildAIAction(actor);};
      const cancelOwnedAIAction=()=>{};
      const el=()=>({classList:{add:()=>{},remove:()=>{}}});
      const playBGM=()=>{};
      const notices=[];
      const msg=notice=>notices.push(notice);
      const wildDisplayName=()=> 'Boss';
      const runBestEffortCombatPresentation=callback=>{try{callback();return true;}catch{return false;}};
      ${source.replace("cancelWildAIAction(boss,'boss_challenge_start',{clearEngagement:true})", 'wrappedCancel(boss)')}
      return{run:startBossChallenge,session:()=>bossChallengeSession,acceptCount:()=>acceptCount,cancelCount:()=>cancelCount,notices};`,
  )(boss, cancelWildAIAction, targetDistance, summoned);
  const boss = makeBoss();
  const harness = makeHarness({
    boss,
    cancelWildAIAction: actor => {
      actor.dead = true;
      actor.retired = true;
      actor.engaged = false;
      actor.combatEnabled = false;
      actor.aiState = null;
      actor.mesh = null;
      return false;
    },
  });
  assert.equal(harness.run(), false);
  assert.deepEqual(harness.session(), { status: 'idle' });
  assert.equal(harness.acceptCount(), 0, 'corrupt Boss must not enter an accepted challenge session');
  assert.equal(boss.dead, true);
  assert.equal(boss.retired, true);
  assert.equal(boss.engaged, false);
  assert.equal(boss.combatEnabled, false);
  assert.equal(boss.aiState, null);

  const distantBoss = makeBoss();
  const distantTarget = makeHarness({
    boss: distantBoss,
    cancelWildAIAction: () => true,
    targetDistance: 20.001,
    summoned: true,
  });
  assert.equal(distantTarget.run(), false, 'Boss challenge rejects an effective AI target outside disengage range');
  assert.deepEqual(distantTarget.session(), { status: 'idle' });
  assert.equal(distantTarget.acceptCount(), 0);
  assert.equal(distantTarget.cancelCount(), 0, 'range rejection occurs before mutating Boss AI state');
  assert.equal(distantBoss.engaged, false);
  assert.equal(distantBoss.combatEnabled, false);
  assert.match(distantTarget.notices[0], /Summon เข้าใกล้ BOSS/);

  const boundaryBoss = makeBoss();
  const boundaryTarget = makeHarness({
    boss: boundaryBoss,
    cancelWildAIAction: () => true,
    targetDistance: 20,
    summoned: true,
  });
  assert.equal(boundaryTarget.run(), true, 'disengage boundary remains inclusive');
  assert.equal(boundaryTarget.acceptCount(), 1);
  assert.equal(boundaryTarget.cancelCount(), 1);
  assert.equal(boundaryBoss.engaged, true);
  assert.equal(boundaryBoss.combatEnabled, true);
}

function materializerFromSource(gameSource, options = {}) {
  const source = functionSource(gameSource, 'materializeWildAiIntentTarget');
  const target = options.target ?? {
    id: 'owned:owned-1:7',
    position: { x: 1, z: 0 },
    alive: true,
    targetable: true,
  };
  return Function(
    'zoneGeneration',
    'wildAiEncounterId',
    'canCombatTargetWild',
    'currentWildAiTargetKey',
    'resolveWildAiTarget',
    'wildAiTargetAvailable',
    'distXZ',
    'wildAiPolicy',
    'resolveCombatStatusRuntime',
    `'use strict';${source};return materializeWildAiIntentTarget;`,
  )(
    options.zoneGeneration ?? 3,
    () => options.encounterId ?? 'zone:3:grass',
    () => options.combatAllowed ?? true,
    () => options.currentTargetKey ?? target.id,
    () => target,
    () => options.targetAvailable ?? true,
    (left, right) => Math.hypot(right.x - left.x, right.z - left.z),
    () => WILD_BASIC_AI_POLICY,
    () => options.control ?? { ok: true, canAttack: true, accuracyMultiplier: 1 },
  );
}

function assertMaterializerContract(gameSource) {
  const ready = createReadyDecision();
  const wild = overrides => ({
    id: 'wild-1',
    dead: false,
    retired: false,
    capturing: false,
    hp: 10,
    mesh: { position: { x: 0, z: 0 } },
    runtimeGeneration: 3,
    aiEncounterId: 'zone:3:grass',
    aiState: ready.nextState,
    lastCommittedAiActionToken: null,
    attackCd: 0,
    statusState: { currentTimeSec: 1.22 },
    ...overrides,
  });
  const valid = materializerFromSource(gameSource)(wild(), ready.intent, true, ready.intent.targetId);
  assert.ok(valid);
  assert.equal(valid.target.id, ready.intent.targetId);
  for (const [actor, intent, canEngage, frameTargetKey, options] of [
    [wild({ dead: true }), ready.intent, true, ready.intent.targetId, {}],
    [wild({ retired: true }), ready.intent, true, ready.intent.targetId, {}],
    [wild({ capturing: true }), ready.intent, true, ready.intent.targetId, {}],
    [wild({ hp: 0 }), ready.intent, true, ready.intent.targetId, {}],
    [wild({ runtimeGeneration: 2 }), ready.intent, true, ready.intent.targetId, {}],
    [wild({ aiEncounterId: 'old-zone' }), ready.intent, true, ready.intent.targetId, {}],
    [wild({ lastCommittedAiActionToken: ready.intent.actionToken }), ready.intent, true, ready.intent.targetId, {}],
    [wild({ attackCd: Number.NaN }), ready.intent, true, ready.intent.targetId, {}],
    [wild({ attackCd: 0.1 }), ready.intent, true, ready.intent.targetId, {}],
    [wild({ aiState: { ...ready.nextState, state: 'recover' } }), ready.intent, true, ready.intent.targetId, {}],
    [wild(), ready.intent, false, ready.intent.targetId, {}],
    [wild(), ready.intent, true, 'player:3', {}],
    [wild(), { ...ready.intent, targetId: 'player:3' }, true, ready.intent.targetId, {}],
    [wild(), { ...ready.intent, kind: 'skill' }, true, ready.intent.targetId, {}],
    [wild(), { ...ready.intent, skillId: 'SK_NORMAL_01' }, true, ready.intent.targetId, {}],
    [wild(), { ...ready.intent, commandSource: 'forged-source' }, true, ready.intent.targetId, {}],
    [wild(), { ...ready.intent, usesConsumed: 1 }, true, ready.intent.targetId, {}],
    [wild(), { ...ready.intent, issuedAtSec: Number.NaN }, true, ready.intent.targetId, {}],
    [wild(), { ...ready.intent, issuedAtSec: 1.220001 }, true, ready.intent.targetId, {}],
    [wild(), ready.intent, true, ready.intent.targetId, { combatAllowed: false }],
    [wild(), ready.intent, true, ready.intent.targetId, { targetAvailable: false }],
    [wild(), ready.intent, true, ready.intent.targetId, { target: { id: ready.intent.targetId, position: { x: 1.250001, z: 0 }, alive: true, targetable: true } }],
    [wild(), ready.intent, true, ready.intent.targetId, { control: { ok: true, canAttack: false } }],
    [wild(), ready.intent, true, ready.intent.targetId, { control: { ok: true, canAttack: true, accuracyMultiplier: Number.NaN } }],
    [wild(), ready.intent, true, ready.intent.targetId, { control: { ok: true, canAttack: true, accuracyMultiplier: -0.001 } }],
    [wild(), ready.intent, true, ready.intent.targetId, { control: { ok: true, canAttack: true, accuracyMultiplier: 1.001 } }],
  ]) {
    assert.equal(materializerFromSource(gameSource, options)(actor, intent, canEngage, frameTargetKey), null);
  }
}

function executorFromSource(gameSource, materialize, activeSummon, counters, settle = settleWildAIIntent, options = {}) {
  const source = functionSource(gameSource, 'executeWildAiIntent');
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');
  const commitSource = functionSource(gameSource, 'commitWildAIState');
  const ownsIntentSource = functionSource(gameSource, 'wildAiStateOwnsIntent');
  const rejectSource = functionSource(gameSource, 'rejectWildAiIntent');
  const commit = Function(
    'validateMonsterAIState',
    `'use strict';${commitSource};return commitWildAIState;`,
  )(validateMonsterAIState);
  const ownsIntent = Function(`'use strict';${ownsIntentSource};return wildAiStateOwnsIntent;`)();
  const cancel = () => { counters.cancellations = (counters.cancellations ?? 0) + 1; return true; };
  const clearTelegraph = () => { counters.telegraphClears = (counters.telegraphClears ?? 0) + 1; return true; };
  const trace = () => {};
  const bestEffort = Function(`'use strict';${bestEffortSource};return runBestEffortCombatPresentation;`)();
  const reject = Function(
    'clearWildAiTelegraph',
    'settleWildAIIntent',
    'commitWildAIState',
    'cancelWildAIAction',
    'recordWildAiTrace',
    `'use strict';${rejectSource};return rejectWildAiIntent;`,
  )(clearTelegraph, settle, commit, cancel, trace);
  const impact = {
    x: 0, y: 0, z: 0,
    copy(position) { this.x = position.x; this.y = position.y ?? 0; this.z = position.z; return this; },
  };
  const statusModifiers = (_status, request) => request?.incomingType
    ? options.defenderModifiers ?? { ok: true, defenseMultiplier: 1, evasionChancePct: 0, damageTakenMultiplier: 1, elementDamageTakenMultiplier: 1 }
    : options.attackerModifiers ?? { ok: true, attackMultiplier: 1 };
  return Function(
    'wildAiStateOwnsIntent',
    'rejectWildAiIntent',
    'materializeWildAiIntentTarget',
    'settleWildAIIntent',
    'commitWildAIState',
    'cancelWildAIAction',
    'clearWildAiTelegraph',
    'recordWildAiTrace',
    'wildAiPolicy',
    'resolveActiveSelfStatusModifiers',
    'wildUpdateScratch',
    'spawnElementalFX',
    'wildTypes',
    'spById',
    'spawnDamageNumber',
    'msg',
    'displayName',
    'wildDamage',
    'triggerCameraShake',
    'activeSummon',
    'faintActive',
    'renderParty',
    'playerData',
    'playerHitText',
    'playerVisual',
    'player',
    'spawnBurst',
    'switchZone',
    'renderHUD',
    'runBestEffortCombatPresentation',
    `'use strict';${source};return executeWildAiIntent;`,
  )(
    ownsIntent,
    reject,
    materialize,
    settle,
    commit,
    cancel,
    clearTelegraph,
    trace,
    () => options.policy ?? WILD_BASIC_AI_POLICY,
    statusModifiers,
    { impact },
    () => { counters.effects += 1; if(options.effectError)throw options.effectError; },
    () => ['Fire'],
    { species: { name: 'Wild' } },
    () => {},
    () => {},
    summon => summon?.inst?.name ?? 'Owned',
    wild => {
      assert.equal(wild.aiState.state, 'recover', 'intent is claimed before damage resolution');
      assert.ok(wild.lastCommittedAiActionToken, 'action token is claimed before damage resolution');
      assert.equal(wild.attackCd, (options.policy ?? WILD_BASIC_AI_POLICY).basicAttackCooldownSec, 'cooldown commits before damage');
      counters.damage += 1;
      return { damage: 4, eff: 1 };
    },
    () => {},
    activeSummon,
    () => { counters.faints += 1; },
    () => {},
    options.playerData ?? { hp: 10, maxHp: 10, invuln: 0 },
    () => ({}),
    options.playerVisual ?? { play() {} },
    options.player ?? { position: { x: 0, y: 0, z: 0 } },
    () => {},
    (...args) => { counters.zoneSwitches = (counters.zoneSwitches ?? 0) + 1; counters.lastZoneSwitch = args; },
    () => {},
    bestEffort,
  );
}

function assertExecutorContract(gameSource) {
  const ready = createReadyDecision();
  const summon = {
    inst: { instanceId: 'owned-1', name: 'Owned', hp: 10, def: 10, level: 1 },
    mesh: { position: { x: 1, y: 0, z: 0 } },
    statusState: {},
  };
  const target = {
    id: ready.intent.targetId,
    kind: 'owned',
    entity: summon,
    position: summon.mesh.position,
  };
  const counters = { damage: 0, effects: 0, faints: 0 };
  const execute = executorFromSource(
    gameSource,
    () => ({ target, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    summon,
    counters,
  );
  const wild = {
    id: 'wild-1', speciesId: 'species', boss: false, aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: ready.nextState, state: 'attack_windup',
    attackCd: 0, lastCommittedAiActionToken: null,
    statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(execute(wild, ready, true, ready.intent.targetId), true);
  assert.equal(wild.aiState.state, 'recover');
  assert.equal(wild.attackCd, 1.2);
  assert.equal(wild.lastCommittedAiActionToken, ready.intent.actionToken);
  assert.equal(summon.inst.hp, 6);
  assert.equal(counters.damage, 1);
  assert.equal(counters.telegraphClears, 1, 'accepted intent clears its token-owned telegraph');
  assert.equal(execute(wild, ready, true, ready.intent.targetId), false, 'replayed intent is rejected');
  assert.equal(counters.damage, 1, 'replayed intent cannot deal damage twice');
  assert.equal(wild.aiState.state, 'recover', 'replay cannot roll a committed actor back to chase');
  assert.equal(counters.telegraphClears, 1, 'replay cannot clear a telegraph owned by a newer action');
  assert.equal(counters.cancellations ?? 0, 0, 'replay cannot cancel current actor state');

  const effectFailure = new Error('wild-impact-presentation-failure');
  const effectSummon = {
    inst: { instanceId: 'owned-1', name: 'Owned', hp: 10, def: 10, level: 1 },
    mesh: { position: { x: 1, y: 0, z: 0 } },
    statusState: {},
  };
  const effectTarget = { id: ready.intent.targetId, kind: 'owned', entity: effectSummon, position: effectSummon.mesh.position };
  const effectCounters = { damage: 0, effects: 0, faints: 0 };
  const executeWithBrokenEffect = executorFromSource(
    gameSource,
    () => ({ target: effectTarget, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    effectSummon,
    effectCounters,
    settleWildAIIntent,
    { effectError: effectFailure },
  );
  const effectWild = {
    id: 'wild-1', speciesId: 'species', boss: false, aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: ready.nextState, state: 'attack_windup', attackCd: 0, lastCommittedAiActionToken: null,
    statusState: { currentTimeSec: 1.22 },
  };
  assert.doesNotThrow(() => assert.equal(executeWithBrokenEffect(effectWild, ready, true, ready.intent.targetId), true),
    'impact VFX failure cannot escape or gate an accepted Wild Basic');
  assert.equal(effectSummon.inst.hp, 6, 'owned HP commits before the failing impact VFX');
  assert.equal(effectWild.aiState.state, 'recover');
  assert.equal(effectWild.attackCd, WILD_BASIC_AI_POLICY.basicAttackCooldownSec);
  assert.equal(effectCounters.damage, 1);
  assert.equal(effectCounters.effects, 1);
  assert.equal(executeWithBrokenEffect(effectWild, ready, true, ready.intent.targetId), false,
    'a replay after presentation failure remains an exact no-op');
  assert.equal(effectSummon.inst.hp, 6);
  assert.equal(effectCounters.damage, 1);

  const newerState = {
    ...ready.nextState,
    nextActionSequence: ready.nextState.nextActionSequence + 1,
    pendingAction: { ...ready.nextState.pendingAction, token: `${ready.intent.actionToken}:newer` },
  };
  const staleWild = {
    id: 'wild-1', speciesId: 'species', boss: false, aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: newerState.nextActionSequence,
    aiState: newerState, state: 'attack_windup', attackCd: 0,
    lastCommittedAiActionToken: null, statusState: { currentTimeSec: 1.22 },
  };
  const staleCounters = { damage: 0, effects: 0, faints: 0, cancellations: 0, telegraphClears: 0 };
  const executeStale = executorFromSource(
    gameSource,
    () => ({ target, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    summon,
    staleCounters,
  );
  assert.equal(executeStale(staleWild, ready, true, ready.intent.targetId), false);
  assert.equal(staleWild.aiState, newerState, 'an older callback cannot mutate a newer pending action');
  assert.equal(staleWild.lastCommittedAiActionToken, null);
  assert.equal(staleCounters.damage, 0);
  assert.equal(staleCounters.cancellations, 0);
  assert.equal(staleCounters.telegraphClears, 0);

  const playerReady = createReadyDecision({ targetId: 'player:3' });
  const playerEntity = { position: { x: 1, y: 0, z: 0 } };
  const playerTarget = { id: 'player:3', kind: 'player', entity: playerEntity, position: playerEntity.position };
  const playerData = { hp: 10, maxHp: 10, invuln: 0 };
  const playerCounters = { damage: 0, effects: 0, faints: 0, zoneSwitches: 0 };
  const executePlayer = executorFromSource(
    gameSource,
    () => ({ target: playerTarget, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    null,
    playerCounters,
    settleWildAIIntent,
    { playerData, player: playerEntity },
  );
  const playerWild = {
    id: 'wild-1', speciesId: 'species', boss: false, atk: 10,
    aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: playerReady.nextState, state: 'attack_windup',
    attackCd: 0, lastCommittedAiActionToken: null,
    statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(executePlayer(playerWild, playerReady, true, playerReady.intent.targetId), true);
  assert.equal(playerData.hp, 5);
  assert.equal(playerData.invuln, 0.5);
  assert.equal(playerWild.attackCd, 1.2);
  assert.equal(executePlayer(playerWild, playerReady, true, playerReady.intent.targetId), false);
  assert.equal(playerData.hp, 5, 'replayed player intent cannot deal damage twice');

  const lethalReady = createReadyDecision({ targetId: 'player:3' });
  const lethalPlayerData = { hp: 3, maxHp: 12, invuln: 0 };
  const lethalCounters = { damage: 0, effects: 0, faints: 0, zoneSwitches: 0 };
  const executeLethal = executorFromSource(
    gameSource,
    () => ({ target: playerTarget, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    null,
    lethalCounters,
    settleWildAIIntent,
    { playerData: lethalPlayerData, player: playerEntity },
  );
  const lethalWild = {
    id: 'wild-1', speciesId: 'species', boss: false, atk: 10,
    aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: lethalReady.nextState, state: 'attack_windup',
    attackCd: 0, lastCommittedAiActionToken: null,
    statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(executeLethal(lethalWild, lethalReady, true, lethalReady.intent.targetId), true);
  assert.equal(lethalPlayerData.hp, 12);
  assert.equal(lethalCounters.zoneSwitches, 1);
  assert.deepEqual(lethalCounters.lastZoneSwitch, ['hub', true]);
  assert.equal(lethalWild.lastCommittedAiActionToken, lethalReady.intent.actionToken,
    'lethal zone switch occurs only after the intent is claimed');

  const bossReady = createReadyDecision({ targetId: 'player:3', profile: WILD_BOSS_BASIC_AI_POLICY });
  const bossPlayerData = { hp: 20, maxHp: 20, invuln: 0 };
  const bossCounters = { damage: 0, effects: 0, faints: 0, zoneSwitches: 0 };
  const executeBoss = executorFromSource(
    gameSource,
    () => ({ target: playerTarget, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    null,
    bossCounters,
    settleWildAIIntent,
    { playerData: bossPlayerData, player: playerEntity, policy: WILD_BOSS_BASIC_AI_POLICY },
  );
  const bossWild = {
    id: 'wild-1', speciesId: 'species', boss: true, atk: 10,
    aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: bossReady.nextState, state: 'attack_windup',
    attackCd: 0, lastCommittedAiActionToken: null,
    statusState: { currentTimeSec: 1.65 },
  };
  assert.equal(executeBoss(bossWild, bossReady, true, bossReady.intent.targetId), true);
  assert.equal(bossWild.attackCd, 0.85);
  assert.equal(bossPlayerData.hp, 13);

  const scaledReady = createReadyDecision({ targetId: 'player:3' });
  const scaledPlayerData = { hp: 10, maxHp: 10, invuln: 0 };
  const scaledCounters = { damage: 0, effects: 0, faints: 0 };
  const executeScaled = executorFromSource(
    gameSource,
    () => ({ target: playerTarget, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    null,
    scaledCounters,
    settleWildAIIntent,
    { playerData: scaledPlayerData, player: playerEntity, attackerModifiers: { ok: true, attackMultiplier: 0.5 } },
  );
  const scaledWild = {
    id: 'wild-1', speciesId: 'species', boss: false, atk: 10,
    aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: scaledReady.nextState, state: 'attack_windup', attackCd: 0,
    lastCommittedAiActionToken: null, statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(executeScaled(scaledWild, scaledReady, true, scaledReady.intent.targetId), true);
  assert.equal(scaledPlayerData.hp, 8, 'player damage honors attacker status multipliers');

  const missReady = createReadyDecision({ targetId: 'player:3' });
  const missedPlayerData = { hp: 10, maxHp: 10, invuln: 0 };
  const missCounters = { damage: 0, effects: 0, faints: 0 };
  const executeMiss = executorFromSource(
    gameSource,
    () => ({ target: playerTarget, control: { ok: true, canAttack: true, accuracyMultiplier: 0 } }),
    null,
    missCounters,
    settleWildAIIntent,
    { playerData: missedPlayerData, player: playerEntity },
  );
  const missWild = {
    id: 'wild-1', speciesId: 'species', boss: false, atk: 10,
    aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: missReady.nextState, state: 'attack_windup', attackCd: 0,
    lastCommittedAiActionToken: null, statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(executeMiss(missWild, missReady, true, missReady.intent.targetId), true);
  assert.equal(missedPlayerData.hp, 10, 'status accuracy miss applies to the player target path');
  assert.equal(missWild.lastCommittedAiActionToken, missReady.intent.actionToken, 'a resolved miss still consumes exactly one intent');

  const invalidGuardReady = createReadyDecision();
  const guardedSummon = {
    inst: { instanceId: 'owned-1', name: 'Owned', hp: 10, def: 10, level: 1 },
    mesh: { position: { x: 1, y: 0, z: 0 } }, statusState: {},
  };
  const guardedTarget = { id: invalidGuardReady.intent.targetId, kind: 'owned', entity: guardedSummon, position: guardedSummon.mesh.position };
  const invalidGuardCounters = { damage: 0, effects: 0, faints: 0, cancellations: 0 };
  const executeInvalidGuard = executorFromSource(
    gameSource,
    () => ({ target: guardedTarget, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    guardedSummon,
    invalidGuardCounters,
    settleWildAIIntent,
    { defenderModifiers: { ok: false } },
  );
  const invalidGuardWild = {
    id: 'wild-1', speciesId: 'species', boss: false, aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: invalidGuardReady.nextState, state: 'attack_windup', attackCd: 0,
    lastCommittedAiActionToken: null, statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(executeInvalidGuard(invalidGuardWild, invalidGuardReady, true, invalidGuardReady.intent.targetId), false);
  assert.equal(guardedSummon.inst.hp, 10);
  assert.equal(invalidGuardWild.aiState.state, 'chase');
  assert.equal(invalidGuardWild.attackCd, 0);
  assert.equal(invalidGuardWild.lastCommittedAiActionToken, null);
  assert.equal(invalidGuardCounters.damage, 0);

  const invalidAttackerReady = createReadyDecision({ targetId: 'player:3' });
  const invalidAttackerData = { hp: 10, maxHp: 10, invuln: 0 };
  const invalidAttackerCounters = { damage: 0, effects: 0, faints: 0 };
  const executeInvalidAttacker = executorFromSource(
    gameSource,
    () => ({ target: playerTarget, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    null,
    invalidAttackerCounters,
    settleWildAIIntent,
    { playerData: invalidAttackerData, player: playerEntity, attackerModifiers: { ok: false } },
  );
  const invalidAttackerWild = {
    id: 'wild-1', speciesId: 'species', boss: false, atk: 10,
    aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: invalidAttackerReady.nextState, state: 'attack_windup', attackCd: 0,
    lastCommittedAiActionToken: null, statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(executeInvalidAttacker(invalidAttackerWild, invalidAttackerReady, true, invalidAttackerReady.intent.targetId), false);
  assert.equal(invalidAttackerData.hp, 10);
  assert.equal(invalidAttackerWild.aiState.state, 'chase');
  assert.equal(invalidAttackerWild.lastCommittedAiActionToken, null);

  const rejectedCounters = { damage: 0, effects: 0, faints: 0 };
  const reject = executorFromSource(gameSource, () => null, summon, rejectedCounters);
  const rejectedWild = {
    id: 'wild-1', speciesId: 'species', boss: false, aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: ready.nextState, state: 'attack_windup',
    attackCd: 0, lastCommittedAiActionToken: null,
    statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(reject(rejectedWild, ready, true, ready.intent.targetId), false);
  assert.equal(rejectedWild.aiState.state, 'chase');
  assert.equal(rejectedWild.attackCd, 0, 'rejected intent does not start cooldown');
  assert.equal(rejectedCounters.damage, 0);
  assert.equal(rejectedCounters.telegraphClears, 1, 'rejected intent clears its stale telegraph');

  const malformedCounters = { damage: 0, effects: 0, faints: 0, cancellations: 0 };
  const malformed = executorFromSource(
    gameSource,
    () => ({ target, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    summon,
    malformedCounters,
    () => ({ ok: false, reason: 'invalid_intent_settlement', nextState: null }),
  );
  const malformedWild = {
    id: 'wild-1', speciesId: 'species', boss: false, aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: ready.nextState, state: 'attack_windup',
    attackCd: 0, lastCommittedAiActionToken: null,
    statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(malformed(malformedWild, ready, true, ready.intent.targetId), false);
  assert.equal(malformedCounters.cancellations, 1, 'invalid settlement fails closed through lifecycle cancellation');
  assert.equal(malformedCounters.damage, 0);

  const forgedCounters = { damage: 0, effects: 0, faints: 0, cancellations: 0 };
  const forgedState = executorFromSource(
    gameSource,
    () => ({ target, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }),
    summon,
    forgedCounters,
    () => ({
      ok: true,
      reason: 'forged_settlement',
      nextState: { actorId: 'wild-1', encounterId: 'zone:3:grass', nextActionSequence: 2 },
    }),
  );
  const forgedWild = {
    id: 'wild-1', speciesId: 'species', boss: false, aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
    aiState: ready.nextState, state: 'attack_windup', attackCd: 0,
    lastCommittedAiActionToken: null, statusState: { currentTimeSec: 1.22 },
  };
  assert.equal(forgedState(forgedWild, ready, true, ready.intent.targetId), false);
  assert.equal(forgedCounters.cancellations, 1, 'schema-invalid next state is cancelled');
  assert.equal(forgedCounters.damage, 0);
  assert.equal(forgedWild.lastCommittedAiActionToken, null);
  assert.equal(forgedWild.attackCd, 0);
}

function assertBoundedEngagementDamage(gameSource) {
  const runScenario = ({ candidates, requiredId = null, bossId = null }) => {
    const selected = fillEngagedWildIds(candidates, undefined, new Set(), requiredId);
    const summon = {
      inst: { instanceId: 'owned-1', name: 'Owned', hp: 30, def: 10, level: 1 },
      mesh: { position: { x: 1, y: 0, z: 0 } }, statusState: {},
    };
    const counters = { damage: 0, effects: 0, faints: 0 };
    let committed = 0;
    for (const candidate of candidates) {
      const profile = candidate.id === bossId ? WILD_BOSS_BASIC_AI_POLICY : WILD_BASIC_AI_POLICY;
      const ready = createReadyDecision({ actorId: candidate.id, profile });
      const target = { id: ready.intent.targetId, kind: 'owned', entity: summon, position: summon.mesh.position };
      const execute = executorFromSource(
        gameSource,
        (_wild, _intent, canEngage) => canEngage
          ? { target, control: { ok: true, canAttack: true, accuracyMultiplier: 1 } }
          : null,
        summon,
        counters,
        settleWildAIIntent,
        { policy: profile },
      );
      const wild = {
        id: candidate.id, speciesId: 'species', boss: candidate.id === bossId,
        aiEncounterId: 'zone:3:grass', aiActionSequenceFloor: 2,
        aiState: ready.nextState, state: 'attack_windup', attackCd: 0,
        lastCommittedAiActionToken: null, statusState: { currentTimeSec: 1 + profile.windupDurationSec },
      };
      if (execute(wild, ready, selected.has(candidate.id), ready.intent.targetId)) committed += 1;
    }
    assert.equal(committed, 2);
    assert.equal(counters.damage, 2, 'no more than maxEngaged actors can commit damage');
    return selected;
  };

  const regular = runScenario({ candidates: [
    { id: 'wild-3', dead: false, targetValid: true, engaged: false, distanceToTarget: 3, distanceFromHome: 3 },
    { id: 'wild-1', dead: false, targetValid: true, engaged: false, distanceToTarget: 1, distanceFromHome: 1 },
    { id: 'wild-2', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
  ] });
  assert.deepEqual([...regular], ['wild-1', 'wild-2']);

  const bossReserved = runScenario({
    requiredId: 'boss',
    bossId: 'boss',
    candidates: [
      { id: 'normal-2', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
      { id: 'boss', dead: false, targetValid: true, engaged: true, distanceToTarget: 6, distanceFromHome: 6 },
      { id: 'normal-1', dead: false, targetValid: true, engaged: false, distanceToTarget: 1, distanceFromHome: 1 },
    ],
  });
  assert.deepEqual([...bossReserved], ['boss', 'normal-1']);
}

function assertCapturingWildDoesNotReserveEngagementSlot(gameSource) {
  const source = functionSource(gameSource, 'selectWildAggressors');
  const wilds = [
    { id: 'capturing', dead: false, capturing: true, engaged: true, runtimeGeneration: 3, mesh: { position: { x: 0.5, z: 0 } }, home: { x: 0, z: 0 } },
    { id: 'normal-a', dead: false, capturing: false, engaged: false, runtimeGeneration: 3, mesh: { position: { x: 1, z: 0 } }, home: { x: 0, z: 0 } },
    { id: 'normal-b', dead: false, capturing: false, engaged: false, runtimeGeneration: 3, mesh: { position: { x: 2, z: 0 } }, home: { x: 0, z: 0 } },
  ];
  const select = Function(
    'resolveWildAiTarget', 'wildAiTargetAvailable', 'wilds', 'wildAggressorCandidatePool',
    'wildAggressorCandidates', 'canCombatTargetWild', 'zoneGeneration', 'distXZ',
    'fillEngagedWildIds', 'ENCOUNTER_POLICY', 'engagedWildIdsScratch', 'bossChallengeSession',
    `'use strict';let wildAiFrameTarget=null;${source};return selectWildAggressors;`,
  )(
    () => ({ id: 'player:3', position: { x: 0, z: 0 } }),
    () => true,
    wilds,
    [],
    [],
    () => true,
    3,
    (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    fillEngagedWildIds,
    { aggroRadius: 4, leashRadius: 18, disengageRadius: 20, maxEngaged: 2 },
    new Set(),
    { activeBossId: null },
  );
  assert.deepEqual([...select()], ['normal-a', 'normal-b'],
    'capturing Wild is paused and cannot consume a live attacker slot');
}

function assertWildRuntimeActorValidation(gameSource) {
  const finiteSource = functionSource(gameSource, 'finiteWildVector');
  const finiteValueSource = functionSource(gameSource, 'finiteNonNegativeWildValue');
  const monsterActionSource = functionSource(gameSource, 'knownWildMonsterAction');
  const motionActionSource = functionSource(gameSource, 'knownWildMotionAction');
  const validateSource = functionSource(gameSource, 'validateWildRuntimeActor');
  const sweepSource = functionSource(gameSource, 'quarantineInvalidWildActors');
  const ensureDirectionSource = functionSource(gameSource, 'ensureDirection');
  const lifecycleSource = functionSource(gameSource, 'advanceWildLifecycle');
  const presentationSource = functionSource(gameSource, 'applyWildMotionAndPresentation');
  const animateEntitySource = functionSource(gameSource, 'animateEntity');
  const damageWildSource = functionSource(gameSource, 'damageWild');
  const finalizePendingDefeatSource = functionSource(gameSource, 'finalizePendingWildDefeat');
  const quarantineSource = functionSource(gameSource, 'quarantineWildAIActor');
  const abortCaptureSource = functionSource(gameSource, 'abortCaptureSequence');
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');
  const bestEffort = Function(`'use strict';${bestEffortSource};return runBestEffortCombatPresentation;`)();
  const validate = Function(
    'isCanonicalMonsterAIState', 'spById', 'zoneGeneration', 'wildAiEncounterId', 'isEncounterStatusState',
    `'use strict';${finiteSource};${finiteValueSource};${monsterActionSource};${motionActionSource};${validateSource};return validateWildRuntimeActor;`,
  )(isCanonicalMonsterAIState, { species: {} }, 3, () => 'zone:3:grass', isEncounterStatusState);
  const validActor = (actorId = 'wild-valid') => {
    const aiState = createMonsterAIState({ actorId, encounterId: 'zone:3:grass' });
    const vector = (x = 0, y = 0, z = 0) => ({
      x, y, z, copy() { return this; }, clone() { return vector(this.x, this.y, this.z); },
      lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; },
      add(other) { this.x += other.x; this.y += other.y; this.z += other.z; return this; },
      multiplyScalar(scale) { this.x *= scale; this.y *= scale; this.z *= scale; return this; },
      set(nextX, nextY, nextZ) { this.x = nextX; this.y = nextY; this.z = nextZ; return this; },
    });
    return {
      id: actorId, speciesId: 'species', dead: false, retired: false, capturing: false, engaged: false,
      combatEnabled: true, boss: false, elite: false, rare: false, level: 1, maxHp: 10, hp: 10,
      atk: 3, def: 3, spAtk: 3, spDef: 3, spd: 3,
      mesh: {
        position: vector(), rotation: vector(), scale: vector(1, 1, 1),
        userData: {
          baseScale: vector(1, 1, 1), animPhase: 0, monPhase: 0,
          monAction: 'idle', monActionTimer: 0, monActionDuration: 0.22,
        },
      },
      home: vector(), dir: vector(0, 0, -1), wanderDir: vector(0, 0, -1),
      aiMotion: { action: 'wander', targetId: null, direction: vector(0, 0, -1) }, attackCd: 0, wanderT: 2,
      runtimeGeneration: 3, aiEncounterId: 'zone:3:grass', aiState, state: aiState.state,
      aiActionSequenceFloor: aiState.nextActionSequence,
      statusState: createEncounterStatusState({ encounterId: actorId, nowSec: 0 }),
    };
  };
  assert.equal(validate(validActor()), true);
  assert.equal(validate({ ...validActor(), hp: Number.NaN }), false);
  assert.equal(validate({ ...validActor(), home: null }), false);
  assert.equal(validate({ ...validActor(), statusState: null }), false);
  assert.equal(validate({ ...validActor(), statusState: {
    encounterId: 'wild-valid', currentTimeSec: 0, ended: false, statuses: [null], controlDr: null,
  } }), false);
  assert.equal(validate({ ...validActor(), attackCd: Number.NaN }), false);
  assert.equal(validate({ ...validActor(), atk: Number.NaN }), false);
  assert.equal(validate({ ...validActor(), spd: -0.001 }), false);
  assert.equal(validate({ ...validActor(), aiMotion: null }), false);
  assert.equal(validate({ ...validActor(), dir: null }), false);
  assert.equal(validate({ ...validActor(), aiState: { actorId: 'forged' } }), false);
  const missingDirectionMethod = validActor('wild-dir-method');
  missingDirectionMethod.dir.lengthSq = null;
  assert.equal(validate(missingDirectionMethod), false);
  const missingPresentationState = validActor('wild-presentation-state');
  missingPresentationState.mesh.userData = null;
  assert.equal(validate(missingPresentationState), false);
  const missingPositionMutation = validActor('wild-position-method');
  missingPositionMutation.mesh.position.add = null;
  assert.equal(validate(missingPositionMutation), false);
  const missingScaleMutation = validActor('wild-scale-method');
  missingScaleMutation.mesh.scale.multiplyScalar = null;
  assert.equal(validate(missingScaleMutation), false);
  for (const [label, mutateActor] of [
    ['phase', actor => { actor.mesh.userData.monPhase = Number.POSITIVE_INFINITY; }],
    ['action', actor => { actor.mesh.userData.monAction = 'forged'; }],
    ['timer', actor => { actor.mesh.userData.monActionTimer = Number.NaN; }],
    ['negative timer', actor => { actor.mesh.userData.monActionTimer = -0.001; }],
    ['duration', actor => { actor.mesh.userData.monActionDuration = Number.POSITIVE_INFINITY; }],
    ['zero duration', actor => { actor.mesh.userData.monActionDuration = 0; }],
    ['timer overflow', actor => { actor.mesh.userData.monActionTimer = 0.23; }],
  ]) {
    const invalidAnimation = validActor(`wild-animation-${label}`);
    mutateActor(invalidAnimation);
    assert.equal(validate(invalidAnimation), false, `invalid animation ${label} fails closed before presentation`);
  }

  const actors = [
    validActor(),
    validActor(),
    { ...validActor(), id: 'wild-hp', hp: Number.NaN },
    { ...validActor(), id: 'wild-home', home: null },
    { ...validActor(), id: 'wild-status', statusState: null },
    null,
    7,
    { id: 'dead-shape', dead: true, retired: true },
  ];
  let quarantined = 0;
  const sweep = Function(
    'wilds', 'wildRuntimeActorIdsScratch', 'validateWildRuntimeActor', 'markWildRuntimeValidated',
    'recordWildAiTrace', 'quarantineWildAIActor', 'wildPopulationRecoveryPending',
    `'use strict';${sweepSource};return quarantineInvalidWildActors;`,
  )(
    actors,
    new Set(),
    validate,
    () => ({}),
    () => {},
    actor => { const index = actors.indexOf(actor); if (index >= 0) actors.splice(index, 1); quarantined += 1; return true; },
    false,
  );
  assert.equal(sweep(), 7);
  assert.equal(quarantined, 5);
  assert.deepEqual(actors.map(actor => actor.id), ['wild-valid']);

  const runtimeByActor = new WeakMap();
  const pipelineActors = [validActor('pipeline-valid')];
  const pipelineBadDirection = validActor('pipeline-bad-direction');
  pipelineBadDirection.dir.lengthSq = null;
  pipelineActors.push(pipelineBadDirection);
  const pipelineBadPresentation = validActor('pipeline-bad-presentation');
  pipelineBadPresentation.mesh.userData = null;
  pipelineActors.push(pipelineBadPresentation);
  const pipelineBadPosition = validActor('pipeline-bad-position');
  pipelineBadPosition.mesh.position.add = null;
  pipelineActors.push(pipelineBadPosition);
  const pipelineBadScale = validActor('pipeline-bad-scale');
  pipelineBadScale.mesh.scale.multiplyScalar = null;
  pipelineActors.push(pipelineBadScale);
  const pipelineBadAnimation = validActor('pipeline-bad-animation');
  pipelineBadAnimation.mesh.userData.monActionDuration = 0;
  pipelineActors.push(pipelineBadAnimation);
  const pipelineSweep = Function(
    'wilds', 'wildRuntimeActorIdsScratch', 'validateWildRuntimeActor', 'markWildRuntimeValidated',
    'recordWildAiTrace', 'quarantineWildAIActor', 'wildPopulationRecoveryPending',
    `'use strict';${sweepSource};return quarantineInvalidWildActors;`,
  )(
    pipelineActors,
    new Set(),
    validate,
    actor => {
      const runtime = { actor, validationToken: 1, statusState: actor.statusState, control: null, selfModifiers: null };
      runtimeByActor.set(actor, runtime);
      return runtime;
    },
    () => {},
    actor => { const index = pipelineActors.indexOf(actor); if (index >= 0) pipelineActors.splice(index, 1); return true; },
    false,
  );
  assert.equal(pipelineSweep(), 5);
  assert.deepEqual(pipelineActors.map(actor => actor.id), ['pipeline-valid']);
  const ensureDirection = Function('THREE', `'use strict';${ensureDirectionSource};return ensureDirection;`)({});
  const frameRuntimeUsable = (actor, runtime) => runtime?.actor === actor && runtime.statusState === actor.statusState;
  const lifecycle = Function(
    'wildFrameRuntimeCache', 'wildFrameRuntimeUsable', 'validateWildRuntimeActor', 'quarantineWildAIActor',
    'markWildRuntimeValidated', 'wildUpdateScratch', 'advanceEncounterEffects', 'damageWild',
    'statusDamageType', 'wildTypes', 'resolveCombatStatusRuntime', 'resolveActiveSelfStatusModifiers',
    'tickCooldown', 'ensureDirection',
    `'use strict';${lifecycleSource};return advanceWildLifecycle;`,
  )(
    runtimeByActor,
    frameRuntimeUsable,
    validate,
    () => assert.fail('validated pipeline actor must not be quarantined'),
    actor => runtimeByActor.get(actor),
    { statusRequest: {} },
    (state) => ({ ok: true, state, damage: 0, ticks: [] }),
    () => true,
    () => 'Normal',
    () => ['Normal'],
    () => ({ ok: true, canMove: false, cooldownRecoveryMultiplier: 1 }),
    () => ({ ok: true, speedMultiplier: 1 }),
    (cooldown, dt) => Math.max(0, cooldown - dt),
    ensureDirection,
  );
  const animateEntity = Function(`'use strict';${animateEntitySource};return animateEntity;`)();
  const animateMonster = Function('typeFx', `'use strict';${functionSource(gameSource, 'animateMonster')};return animateMonster;`)(() => ({ speed: 1 }));
  const presentation = Function(
    'wildFrameRuntimeUsable', 'wilds', 'distXZ', 'wildUpdateScratch', 'ensureDirection',
    'moveWildWithFieldCollision', 'monsterLookYaw', 'wildAiTargetAvailable', 'animateEntity', 'animateMonster',
    `'use strict';${presentationSource};return applyWildMotionAndPresentation;`,
  )(
    frameRuntimeUsable,
    pipelineActors,
    (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    {},
    ensureDirection,
    () => false,
    () => 0,
    () => false,
    animateEntity,
    animateMonster,
  );
  const pipelineActor = pipelineActors[0];
  const runtime = lifecycle(pipelineActor, 0.016, runtimeByActor.get(pipelineActor));
  assert.ok(runtime, 'valid survivor advances through the real lifecycle function');
  assert.doesNotThrow(() => presentation(pipelineActor, 0.016, null, null, runtime));
  assert.equal(Number.isFinite(pipelineActor.mesh.userData.animPhase), true);
  assert.equal(Number.isFinite(pipelineActor.mesh.userData.monPhase), true,
    'the validated survivor remains finite through the real monster animation path');
  const defeatedIds = [];
  const { damageWild: damage, finalizePendingWildDefeat: finalizePendingDefeat } = Function(
    'wildDamageTargetAvailable', 'ensureCaptureReferenceLevel', 'wildTypes', 'triggerMonsterAction',
    'spawnElementalFX', 'THREE', 'spawnDamageNumber', 'hitFlashGroup', 'triggerCameraShake',
    'playSFX', 'setTimeout', 'spawnRingPulse', 'defeatWild', 'runBestEffortCombatPresentation',
    `'use strict';${finalizePendingDefeatSource}${damageWildSource};return {damageWild,finalizePendingWildDefeat};`,
  )(
    () => true,
    () => {},
    () => ['Normal'],
    () => {},
    () => {},
    { Vector3: class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
    () => {},
    () => {},
    () => {},
    () => {},
    () => 0,
    () => {},
    target => { defeatedIds.push(target.id); target.dead = true; },
    bestEffort,
  );
  const scaleBeforeDamage = pipelineActor.mesh.scale.x;
  assert.doesNotThrow(() => damage(pipelineActor, 1, { type: 'Normal', eff: 1 }),
    'validated survivor reaches the real damage path with complete vector/scale capabilities');
  assert.equal(pipelineActor.hp, 9);
  assert.ok(Math.abs(pipelineActor.mesh.scale.x - scaleBeforeDamage * 0.94) < 1e-12);
  assert.equal(finalizePendingDefeat(pipelineActor), false, 'positive HP cannot be finalized as a defeat');

  const immediateLethal = validActor('damage-immediate-lethal');
  immediateLethal.hp = 2;
  assert.equal(damage(immediateLethal, 5, { type: 'Normal', eff: 1 }), true);
  assert.equal(immediateLethal.hp, 0);
  assert.equal(immediateLethal.dead, true, 'legacy damage callers still finalize lethal damage immediately');
  assert.deepEqual(defeatedIds, ['damage-immediate-lethal']);

  const deferredLethal = validActor('damage-deferred-lethal');
  deferredLethal.hp = 2;
  assert.equal(damage(deferredLethal, 5, { type: 'Normal', eff: 1, deferDefeat: true }), true);
  assert.equal(deferredLethal.hp, 0);
  assert.equal(deferredLethal.dead, false, 'transactional callers can defer lethal finalization');
  assert.deepEqual(defeatedIds, ['damage-immediate-lethal']);
  assert.equal(finalizePendingDefeat(deferredLethal), true);
  assert.equal(deferredLethal.dead, true);
  assert.equal(finalizePendingDefeat(deferredLethal), false, 'defeat finalization is idempotent');
  assert.deepEqual(defeatedIds, ['damage-immediate-lethal', 'damage-deferred-lethal']);

  const presentationFailure = new Error('wild-damage-presentation-failure');
  const { damageWild: throwingDamage, finalizePendingWildDefeat: finalizeThrowingDamage } = Function(
    'wildDamageTargetAvailable', 'ensureCaptureReferenceLevel', 'wildTypes', 'triggerMonsterAction',
    'spawnElementalFX', 'THREE', 'spawnDamageNumber', 'hitFlashGroup', 'triggerCameraShake',
    'playSFX', 'setTimeout', 'spawnRingPulse', 'defeatWild', 'runBestEffortCombatPresentation',
    `'use strict';${finalizePendingDefeatSource}${damageWildSource};return {damageWild,finalizePendingWildDefeat};`,
  )(
    () => true, () => {}, () => ['Normal'], () => {},
    () => { throw presentationFailure; },
    { Vector3: class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
    () => {}, () => {}, () => {}, () => {}, () => 0, () => {},
    target => { defeatedIds.push(target.id); target.dead = true; },
    bestEffort,
  );
  const throwingDeferred = validActor('damage-throwing-deferred');
  throwingDeferred.hp = 2;
  const throwingReceipt = { committed: false, damage: 0 };
  assert.equal(throwingDamage(throwingDeferred, 5, {
    type: 'Normal', eff: 1, deferDefeat: true, commitReceipt: throwingReceipt,
  }), true);
  assert.deepEqual(throwingReceipt, { committed: true, damage: 2 },
    'HP commit receipt is durable before the first throwable presentation hook');
  assert.equal(throwingDeferred.dead, false);
  assert.equal(finalizeThrowingDamage(throwingDeferred), true);
  assert.equal(throwingDeferred.dead, true);
  const throwingImmediate = validActor('damage-throwing-immediate');
  throwingImmediate.hp = 1;
  assert.equal(throwingDamage(throwingImmediate, 3, { type: 'Normal', eff: 1 }), true);
  assert.equal(throwingImmediate.dead, true,
    'legacy immediate damage finalizes even when presentation throws');

  const frozenCaptureActor = Object.freeze({
    ...validActor('frozen-capture-invalid'), hp: Number.NaN, capturing: true,
    labelEl: { remove() {} },
  });
  const captureProjectile = { type: 'capture', mesh: { visible: true }, onHit: () => { captureProjectile.callbackCount += 1; }, callbackCount: 0 };
  const cleanupCalls = [];
  const frozenHarness = Function(
    'actor', 'projectile', 'captureAttemptLedger', 'cancelCaptureAttempt', 'removeAndDispose', 'scene',
    'cancelOwnedAITarget', 'discardBattleEventsForTarget', 'clearWildAiTelegraph',
    'distanceTickScheduler', 'labelTickScheduler', 'removeWildLabel',
    `'use strict';const wilds=[actor],projectiles=[projectile];let activeCaptureAttempt={attemptId:'capture:frozen',wild:actor},captureSequence=null,wildPopulationRecoveryPending=false;${abortCaptureSource}${quarantineSource};return{run:()=>quarantineWildAIActor(actor),snapshot:()=>({activeCaptureAttempt,captureSequence,wilds:[...wilds],projectiles:[...projectiles],wildPopulationRecoveryPending})};`,
  )(
    frozenCaptureActor,
    captureProjectile,
    {},
    (_ledger, attemptId) => { cleanupCalls.push(`cancel:${attemptId}`); return { ok: true }; },
    (_scene, mesh) => { cleanupCalls.push(mesh === captureProjectile.mesh ? 'remove:projectile' : 'remove:actor'); mesh.visible = false; },
    {},
    id => { cleanupCalls.push(`owned:${id}`); return false; },
    id => { cleanupCalls.push(`ledger:${id}`); },
    () => { cleanupCalls.push('telegraph'); },
    { clear: id => cleanupCalls.push(`distance:${id}`) },
    { clear: id => cleanupCalls.push(`label:${id}`) },
    () => { cleanupCalls.push('label-remove'); },
  );
  assert.doesNotThrow(() => assert.equal(frozenHarness.run(), true),
    'frozen invalid actor cannot block capture/resource quarantine');
  const frozenSnapshot = frozenHarness.snapshot();
  assert.equal(frozenSnapshot.activeCaptureAttempt, null);
  assert.equal(frozenSnapshot.captureSequence, null);
  assert.deepEqual(frozenSnapshot.projectiles, []);
  assert.deepEqual(frozenSnapshot.wilds, []);
  assert.equal(frozenSnapshot.wildPopulationRecoveryPending, true);
  assert.equal(captureProjectile.callbackCount, 0, 'quarantine removes the projectile without invoking its stale callback');
  for (const expected of [
    'cancel:capture:frozen', 'remove:projectile', 'owned:frozen-capture-invalid',
    'ledger:frozen-capture-invalid', 'telegraph', 'distance:frozen-capture-invalid',
    'label:label:frozen-capture-invalid', 'remove:actor', 'label-remove',
  ]) assert.ok(cleanupCalls.includes(expected), `${expected} cleanup is attempted for a frozen actor`);

  const frozenInvalid = Object.freeze({ ...validActor('frozen-debug-invalid'), hp: Number.NaN });
  const debugActors = [frozenInvalid];
  const failSafeSweep = Function(
    'wilds', 'wildRuntimeActorIdsScratch', 'validateWildRuntimeActor', 'markWildRuntimeValidated',
    'recordWildAiTrace', 'quarantineWildAIActor', 'wildPopulationRecoveryPending',
    `'use strict';${sweepSource};return quarantineInvalidWildActors;`,
  )(
    debugActors,
    new Set(),
    validate,
    () => ({}),
    () => { throw new Error('malformed debug sink'); },
    actor => { actor.dead = true; return true; },
    false,
  );
  assert.doesNotThrow(() => failSafeSweep(), 'debug/quarantine failures cannot prevent invalid actor removal');
  assert.deepEqual(debugActors, []);
}

function assertIntegratedResetCauses(gameSource) {
  const resetCauseSource = functionSource(gameSource, 'wildEncounterResetCause');
  const preflightSource = functionSource(gameSource, 'preflightWildEncounterBoundaries');
  const run = ({ targetAvailable = true, targetDistance = 1, boss = false } = {}) => {
    const actor = {
      id: boss ? 'boss-reset-cause' : 'wild-reset-cause',
      dead: false, retired: false, capturing: false, engaged: true, boss,
      mesh: { position: { x: 0, z: 0 } }, home: { x: 0, z: 0 },
    };
    const target = { id: 'player:3', position: { x: targetDistance, z: 0 } };
    const resetReasons = [];
    const bossExitReasons = [];
    const preflight = Function(
      'wilds', 'target', 'selectWildAggressors', 'wildAiTargetAvailable', 'canCombatTargetWild',
      'wildUpdateScratch', 'shouldResetEncounter', 'distXZ', 'bossChallengeSession',
      'bossCombatAuthorized', 'exitBossChallenge', 'resetWild', 'ENCOUNTER_POLICY',
      `'use strict';let wildAiFrameTarget=target;${resetCauseSource};${preflightSource};return preflightWildEncounterBoundaries;`,
    )(
      [actor],
      target,
      () => new Set(),
      () => targetAvailable,
      () => true,
      { resetRequest: {} },
      shouldResetEncounter,
      (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
      { activeBossId: boss ? actor.id : null },
      (_session, actorId) => boss && actorId === actor.id,
      reason => { bossExitReasons.push(reason); return true; },
      (_actor, reason) => { resetReasons.push(reason); return true; },
      { leashRadius: 18, disengageRadius: 20 },
    );
    preflight();
    return { resetReasons, bossExitReasons };
  };
  assert.deepEqual(run({ targetAvailable: false }).resetReasons, ['target_invalid']);
  assert.deepEqual(run({ targetDistance: 20.001 }).resetReasons, ['outside_disengage']);
  assert.deepEqual(run({ targetDistance: 1 }).resetReasons, ['engagement_slot_lost']);
  assert.deepEqual(run({ targetDistance: 20.001, boss: true }).bossExitReasons, ['outside_disengage'],
    'Boss auto-exit preserves the integrated reset cause instead of collapsing to leash');
}

function assertCaptureResumePriorityHandoff(gameSource) {
  const selectSource = functionSource(gameSource, 'selectWildAggressors');
  const resetCauseSource = functionSource(gameSource, 'wildEncounterResetCause');
  const preflightSource = functionSource(gameSource, 'preflightWildEncounterBoundaries');
  const retainedStatus = { currentTimeSec: 7, statuses: [{ statusId: 'slow', expiresAtSec: 9 }] };
  const retainedContribution = Object.freeze({ damage: 11, ownerId: 'owned-1' });
  const contributions = new Map([
    ['W1', retainedContribution],
    ['W2', Object.freeze({ damage: 5, ownerId: 'owned-2' })],
    ['W3', Object.freeze({ damage: 3, ownerId: 'owned-3' })],
  ]);
  const wilds = [
    {
      id: 'W1', dead: false, retired: false, capturing: false, engaged: true,
      captureEngagementResumePending: true, hp: 37, maxHp: 100, statusState: retainedStatus,
      runtimeGeneration: 4, mesh: { position: { x: 5, z: 0 } }, home: { x: 5, z: 0 },
    },
    {
      id: 'W2', dead: false, retired: false, capturing: false, engaged: true,
      captureEngagementResumePending: false, hp: 80, maxHp: 80, statusState: { currentTimeSec: 2 },
      runtimeGeneration: 4, mesh: { position: { x: 2, z: 0 } }, home: { x: 2, z: 0 },
    },
    {
      id: 'W3', dead: false, retired: false, capturing: false, engaged: true,
      captureEngagementResumePending: false, hp: 60, maxHp: 60, statusState: { currentTimeSec: 3 },
      runtimeGeneration: 4, mesh: { position: { x: 3, z: 0 } }, home: { x: 3, z: 0 },
    },
  ];
  const target = { id: 'player:4', position: { x: 0, z: 0 } };
  const resetCalls = [];
  const preflight = Function(
    'wilds', 'target', 'contributions', 'resetCalls',
    'fillEngagedWildIds', 'ENCOUNTER_POLICY', 'shouldResetEncounter',
    `'use strict';
    const wildAggressorCandidates=[];
    const wildAggressorCandidatePool=[];
    const engagedWildIdsScratch=new Set();
    let wildAiFrameTarget=null;
    const zoneGeneration=4;
    const bossChallengeSession={activeBossId:null};
    const wildUpdateScratch={resetRequest:{
      engaged:false,targetValid:false,distanceToTarget:Infinity,distanceFromHome:Infinity,
      leashRadius:ENCOUNTER_POLICY.leashRadius,disengageRadius:ENCOUNTER_POLICY.disengageRadius,
    }};
    const resolveWildAiTarget=()=>target;
    const wildAiTargetAvailable=candidate=>candidate===target;
    const canCombatTargetWild=()=>true;
    const distXZ=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
    const bossCombatAuthorized=()=>false;
    const exitBossChallenge=()=>false;
    const resetWild=(actor,reason)=>{
      resetCalls.push([actor.id,reason]);
      actor.hp=actor.maxHp;
      actor.statusState={currentTimeSec:0,statuses:[]};
      actor.engaged=false;
      actor.captureEngagementResumePending=false;
      contributions.delete(actor.id);
      return true;
    };
    ${selectSource}
    ${resetCauseSource}
    ${preflightSource}
    return preflightWildEncounterBoundaries;`,
  )(
    wilds, target, contributions, resetCalls,
    fillEngagedWildIds, ENCOUNTER_POLICY, shouldResetEncounter,
  );
  const selected = preflight();
  assert.deepEqual([...selected], ['W1', 'W2'],
    'capture-resume priority wins the handoff slot before nearer already-engaged Wilds');
  assert.deepEqual(resetCalls, [['W3', 'engagement_slot_lost']]);
  assert.equal(wilds[0].captureEngagementResumePending, false,
    'resume priority is one-shot and clears only after W1 reacquires a slot');
  assert.equal(wilds[0].hp, 37, 'successful handoff preserves weakened capture HP');
  assert.equal(wilds[0].statusState, retainedStatus, 'successful handoff preserves the live status object');
  assert.deepEqual(wilds[0].statusState.statuses, [{ statusId: 'slow', expiresAtSec: 9 }]);
  assert.equal(contributions.get('W1'), retainedContribution,
    'successful handoff preserves the exact W1 battle contribution ledger entry');
  assert.equal(contributions.has('W3'), false, 'the unselected encounter alone is reset and discarded');
}

function runAutomaticBossExitPresentationProbe(gameSource, { entry, failAt }) {
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');
  const bossWildSource = functionSource(gameSource, 'bossChallengeWild');
  const exitSource = functionSource(gameSource, 'exitBossChallenge');
  const resetCauseSource = functionSource(gameSource, 'wildEncounterResetCause');
  const preflightSource = functionSource(gameSource, 'preflightWildEncounterBoundaries');
  const updateSource = functionSource(gameSource, 'updateWild');
  const boss = {
    id: `boss-auto-${entry}-${failAt}`,
    boss: true, dead: false, retired: false, capturing: false, engaged: true, combatEnabled: true,
    hp: 23, maxHp: 100, runtimeGeneration: 9,
    mesh: { position: { x: 1, z: 0 } }, home: { x: 1, z: 0 },
    statusState: { currentTimeSec: 4 }, state: 'attack_windup',
    aiState: { state: 'attack_windup', pendingAction: { token: 'boss-pending' } },
  };
  const target = { id: 'player:9', position: { x: 0, z: 0 } };
  const calls = [];
  const api = Function(
    'boss', 'target', 'entry', 'failAt', 'calls',
    'retreatBossChallenge', 'bossCombatAuthorized', 'shouldResetEncounter', 'ENCOUNTER_POLICY',
    `'use strict';
    const wilds=[boss];
    let bossChallengeSession=Object.freeze({activeBossId:boss.id,dismissedBossId:null});
    let nearbyBossChallengeId=null;
    const activeSummon={id:'owned-active'};
    const state={currentZone:'boss-zone'};
    const wildAiFrameTarget=target;
    const wildUpdateScratch={resetRequest:{
      engaged:false,targetValid:false,distanceToTarget:Infinity,distanceFromHome:Infinity,
      leashRadius:ENCOUNTER_POLICY.leashRadius,disengageRadius:ENCOUNTER_POLICY.disengageRadius,
    }};
    const selectWildAggressors=()=>new Set();
    const wildAiTargetAvailable=candidate=>candidate===target;
    const canCombatTargetWild=()=>true;
    const distXZ=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
    const abortCaptureSequence=actor=>{calls.push('abort-capture');actor.capturing=false;return true;};
    const resetWild=(actor,reason)=>{
      calls.push('reset:'+reason);
      actor.hp=actor.maxHp;actor.engaged=false;actor.combatEnabled=false;actor.state='wander';
      actor.aiState={state:'wander',pendingAction:null};
      return true;
    };
    const clearBossChallengeCombatEffects=()=>{calls.push('clear-effects');};
    const discardBattleEventsForTarget=id=>{calls.push('discard:'+id);};
    const cancelOwnedAIAction=()=>{calls.push('cancel-owned');return true;};
    const resetActiveBossChallengeStatus=()=>{calls.push('reset-owned-status');};
    const el=id=>{
      calls.push('dom:'+id);
      if(failAt==='dom')throw new Error('boss-exit-dom-failure');
      return{classList:{add(){calls.push('dom-hidden');}}};
    };
    const playBGM=()=>{calls.push('bgm');if(failAt==='bgm')throw new Error('boss-exit-bgm-failure');};
    const msg=()=>{calls.push('msg');if(failAt==='msg')throw new Error('boss-exit-msg-failure');};
    const wildDisplayName=actor=>actor.id;
    const wildFrameRuntimeUsable=()=>true;
    ${bestEffortSource}
    ${bossWildSource}
    ${exitSource}
    ${resetCauseSource}
    ${preflightSource}
    ${updateSource}
    return{
      run(){
        if(entry==='preflight')return preflightWildEncounterBoundaries();
        return updateWild(boss,.05,false,target,target.id,{control:{ok:true,canMove:true,canAttack:true}});
      },
      snapshot(){return{bossChallengeSession,nearbyBossChallengeId,calls:[...calls]};},
    };`,
  )(
    boss, target, entry, failAt, calls,
    retreatBossChallenge, bossCombatAuthorized, shouldResetEncounter, ENCOUNTER_POLICY,
  );
  const result = api.run();
  return { result, boss, ...api.snapshot() };
}

function assertAutomaticBossExitPresentationIsolation(gameSource) {
  for (const entry of ['preflight', 'frame']) {
    for (const failAt of ['dom', 'bgm', 'msg']) {
      let probe;
      assert.doesNotThrow(() => {
        probe = runAutomaticBossExitPresentationProbe(gameSource, { entry, failAt });
      }, `${entry} Boss auto-exit survives ${failAt} presentation failure`);
      assert.equal(probe.bossChallengeSession.activeBossId, null);
      assert.equal(probe.bossChallengeSession.dismissedBossId, probe.boss.id);
      assert.equal(probe.boss.capturing, false);
      assert.equal(probe.boss.hp, probe.boss.maxHp);
      assert.equal(probe.boss.engaged, false);
      assert.equal(probe.boss.combatEnabled, false);
      assert.equal(probe.boss.aiState.pendingAction, null);
      for (const expected of [
        'abort-capture', 'reset:engagement_slot_lost', 'clear-effects',
        `discard:${probe.boss.id}`, 'cancel-owned', 'reset-owned-status',
      ]) assert.ok(probe.calls.includes(expected), `${entry}/${failAt} commits ${expected} before presentation`);
      assert.ok(probe.calls.includes(failAt === 'dom' ? 'dom:bossRetreatBtn' : failAt),
        `${entry}/${failAt} reaches the injected failure`);
    }
  }
}

function assertCapturePausesWildLifecycle(gameSource) {
  const lifecycleSource = functionSource(gameSource, 'advanceWildLifecycle');
  const lifecycle = Function(
    'validateWildRuntimeActor',
    `'use strict';${lifecycleSource};return advanceWildLifecycle;`,
  )(() => true);
  const statusState = { currentTimeSec: 1, marker: 'unchanged' };
  const actor = { capturing: true, statusState, hp: 1, maxHp: 10 };
  assert.equal(lifecycle(actor, 1), false);
  assert.equal(actor.statusState, statusState, 'capture pauses DoT/status time until the transaction settles');
  assert.equal(actor.hp, 1);
}

export function assertWildAiRuntimeWiring(gameSource) {
  const createWild = functionSource(gameSource, 'createWild');
  const commitWild = functionSource(gameSource, 'commitWildAIState');
  const quarantineWild = functionSource(gameSource, 'quarantineWildAIActor');
  const cancelWild = functionSource(gameSource, 'cancelWildAIAction');
  const resetWild = functionSource(gameSource, 'resetWild');
  const clearWilds = functionSource(gameSource, 'clearWilds');
  const retireWild = functionSource(gameSource, 'retireWild');
  const executeCapture = functionSource(gameSource, 'executeCaptureThrow');
  const captureFail = functionSource(gameSource, 'finishCaptureFail');
  const startBoss = functionSource(gameSource, 'startBossChallenge');
  const spawnOwned = functionSource(gameSource, 'spawnOwned');
  const recall = functionSource(gameSource, 'recall');
  const faint = functionSource(gameSource, 'faintActive');
  const selectAggressors = functionSource(gameSource, 'selectWildAggressors');
  const materialize = functionSource(gameSource, 'materializeWildAiIntentTarget');
  const ownsIntent = functionSource(gameSource, 'wildAiStateOwnsIntent');
  const rejectIntent = functionSource(gameSource, 'rejectWildAiIntent');
  const recordOwnedTrace = functionSource(gameSource, 'recordOwnedAiTrace');
  const validateWildActor = functionSource(gameSource, 'validateWildRuntimeActor');
  const quarantineInvalid = functionSource(gameSource, 'quarantineInvalidWildActors');
  const preflightBoundaries = functionSource(gameSource, 'preflightWildEncounterBoundaries');
  const resetCause = functionSource(gameSource, 'wildEncounterResetCause');
  const advanceLifecycle = functionSource(gameSource, 'advanceWildLifecycle');
  const applyMotion = functionSource(gameSource, 'applyWildMotionAndPresentation');
  const cacheMotion = functionSource(gameSource, 'cacheWildAiMotion');
  const damageTargetAvailable = functionSource(gameSource, 'wildDamageTargetAvailable');
  const damageWild = functionSource(gameSource, 'damageWild');
  const finalizePendingDefeat = functionSource(gameSource, 'finalizePendingWildDefeat');
  const createTelegraph = functionSource(gameSource, 'createWildAiTelegraph');
  const updateWild = functionSource(gameSource, 'updateWild');
  const executor = functionSource(gameSource, 'executeWildAiIntent');
  const triggerMonsterAction = functionSource(gameSource, 'triggerMonsterAction');
  const animateMonster = functionSource(gameSource, 'animateMonster');
  const loop = functionSource(gameSource, 'loop');
  const livingWilds = functionSource(gameSource, 'livingWilds');
  const ensurePopulation = functionSource(gameSource, 'ensureWildPopulation');
  const saveEnvelope = functionSource(gameSource, 'currentSaveEnvelope');

  assert.match(gameSource, /from '\.\/wild-ai-resolver\.mjs'/);
  assert.match(createWild, /createMonsterAIState\(\{actorId:wildId,encounterId:aiEncounterId\}\)/);
  assert.match(createWild, /aiActionSequenceFloor:aiState\.nextActionSequence,aiTelegraphEffect:null,aiTelegraphTargetId:null,aiTelegraphYOffset:0,runtimeGeneration:zoneGeneration,retired:false,lastCommittedAiActionToken:null/);
  assert.match(createWild, /capturing:false,captureEngagementResumePending:false/);
  assert.match(commitWild, /canonical=validateMonsterAIState\(nextState\)/);
  assert.match(commitWild, /canonical\.nextActionSequence<floor/);
  assert.match(cancelWild, /nextActionSequence:floor/);
  assert.match(cancelWild, /quarantineWildAIActor\(w\)/);
  assert.match(quarantineWild, /w\.dead=true;w\.retired=true/);
  assert.match(quarantineWild, /w\.mesh=null/);
  assert.match(quarantineWild, /wilds\.indexOf\(w\)[\s\S]*?wilds\.splice\(index,1\)/);
  assert.match(quarantineWild, /wildPopulationRecoveryPending=true/);
  assert.match(quarantineWild, /abortCaptureSequence\(w\)/);
  assert.match(quarantineWild, /cancelOwnedAITarget\(id,'actor_quarantined'\)/);
  assert.match(quarantineInvalid, /validateWildRuntimeActor\(w\)/);
  assert.match(quarantineInvalid, /wildRuntimeActorIdsScratch\.has\(w\.id\)/);
  assert.match(quarantineInvalid, /duplicate_runtime_actor_id/);
  assert.match(quarantineInvalid, /typeof w!=='object'&&typeof w!=='function'/);
  assert.match(quarantineInvalid, /while\(staleIndex>=0\)\{wilds\.splice\(staleIndex,1\)/);
  assert.match(validateWildActor, /isEncounterStatusState\(w\.statusState\)/);
  assert.match(validateWildActor, /isCanonicalMonsterAIState\(aiState\)/);
  assert.match(validateWildActor, /w\.aiActionSequenceFloor===aiState\.nextActionSequence/);
  assert.match(validateWildActor, /Number\.isFinite\(w\.attackCd\)/);
  assert.match(validateWildActor, /Number\.isFinite\(w\.mesh\.userData\.monPhase\)/);
  assert.match(validateWildActor, /knownWildMonsterAction\(w\.mesh\.userData\.monAction\)/);
  assert.match(validateWildActor, /w\.mesh\.userData\.monActionTimer<=w\.mesh\.userData\.monActionDuration/);
  assert.match(validateWildActor, /knownWildMotionAction\(motion\.action\)/);
  assert.doesNotMatch(validateWildActor, /\[[^\]]+\]\.(?:every|includes)\(/,
    'per-frame Wild validation avoids allocating array literals');
  assert.match(validateWildActor, /!!motion&&knownWildMotionAction\(motion\.action\)/);
  assert.match(livingWilds, /!w\.dead&&!w\.retired/);
  assert.match(ensurePopulation, /if\(wildPopulationRecoveryPending\)\{wildPopulationRecoveryPending=false;ensureProgressionEncounter\(state\.currentZone\);\}/);
  assert.match(resetWild, /cancelWildAIAction\(w,resetReason,\{clearEngagement:true,encounterReset:true\}\)/);
  assert.match(resetWild, /w\.captureReferenceLevel=null;w\.captureEngagementResumePending=false/);
  assert.match(clearWilds, /cancelWildAIAction\(w,'zone_clear',\{retire:true,clearEngagement:true\}\)/);
  assert.match(retireWild, /cancelWildAIAction\(w,'actor_retired',\{retire:true,clearEngagement:true\}\)/);
  assert.ok(executeCapture.indexOf("cancelWildAIAction(t,'capture_started')") < executeCapture.indexOf('t.capturing=true'),
    'capture cancels pending Wild action before freezing the actor');
  assert.match(executeCapture, /if\(!cancelWildAIAction\(t,'capture_started'\)\)targetReady=false/);
  assert.match(executeCapture, /t\.captureEngagementResumePending=t\.engaged===true;t\.capturing=true/);
  assert.match(executeCapture, /if\(!targetReady\)\{abortCaptureSequence\(t\)/);
  assert.match(captureFail, /resumed=cancelWildAIAction\(w,'capture_failed_resume'\)/);
  assert.ok(captureFail.indexOf("resumed=cancelWildAIAction(w,'capture_failed_resume')") < captureFail.indexOf('w.engaged=true'),
    'capture failure must prove cancellation before resuming the actor');
  assert.match(startBoss, /if\(!cancelWildAIAction\(boss,'boss_challenge_start',\{clearEngagement:true\}\)\)\{/);
  assert.match(startBoss, /combatTargetDistance>ENCOUNTER_POLICY\.disengageRadius/);
  assert.ok(startBoss.indexOf('combatTargetDistance>ENCOUNTER_POLICY.disengageRadius') < startBoss.indexOf("cancelWildAIAction(boss,'boss_challenge_start'"),
    'Boss target range is checked before mutating the encounter session');
  assert.ok(startBoss.indexOf("if(!cancelWildAIAction(boss,'boss_challenge_start',{clearEngagement:true}))") < startBoss.indexOf('acceptBossChallenge'),
    'Boss cancellation must succeed before accepting the challenge');
  assert.match(spawnOwned, /runtimeEpoch:\+\+summonRuntimeEpoch/);
  assert.match(recall, /cancelWildAITarget\(ownedWildAiTargetId\(summon\),'owned_recall'\)/);
  assert.match(faint, /cancelWildAITarget\(ownedWildAiTargetId\(summon\),'owned_fainted'\)/);
  assert.match(selectAggressors, /candidate\.resumePriority=w\?\.captureEngagementResumePending===true/);
  assert.match(selectAggressors, /fillEngagedWildIds\(wildAggressorCandidates,ENCOUNTER_POLICY,engagedWildIdsScratch,bossChallengeSession\.activeBossId\)/);
  assert.match(materialize, /target\.id!==intent\.targetId/);
  assert.match(materialize, /intent\.actionToken===w\.lastCommittedAiActionToken/);
  assert.match(materialize, /!canEngage\|\|!canCombatTargetWild\(w\)/);
  assert.match(materialize, /distance>policy\.preferredRangeMaxM/);
  assert.match(materialize, /!control\.ok\|\|!control\.canAttack/);
  assert.match(materialize, /!Number\.isFinite\(control\.accuracyMultiplier\)/);
  assert.match(ownsIntent, /pendingAction\?\.token===intent\.actionToken/);
  assert.match(ownsIntent, /pendingAction\?\.issuedAtSec===intent\.issuedAtSec/);
  assert.match(ownsIntent, /pendingAction\?\.commandSource===intent\.commandSource/);
  assert.match(materialize, /intent\.commandSource!==policy\.commandSource/);
  assert.match(materialize, /intent\.issuedAtSec>w\.statusState\.currentTimeSec/);
  assert.match(recordOwnedTrace, /action==='basic_attack'&&reason==='runtime_commit'&&!rejected/);
  assert.match(createTelegraph, /try\{\s*const effect=spawnRingPulse\(position,color,options\)/);
  assert.match(createTelegraph, /if\(!effect\?\.mesh\|\|!effects\.includes\(effect\)\)return false/);
  assert.match(createTelegraph, /return setWildAiTelegraph\(w,effect,target\)/);
  assert.match(createTelegraph, /catch\{return false;\}/);
  assert.match(updateWild, /resolveWildMonsterAI\(fillWildAiRequest\(wildAiScratch,w,dt,canEngage,control,target\)\)/);
  assert.match(updateWild, /decision\.reason==='action_sequence_exhausted'\)quarantineWildAIActor\(w\);else cancelWildAIAction\(w,'resolver_rejected',\{clearEngagement:true\}\);return false/);
  assert.match(updateWild, /if\(decision\.transition\?\.toState==='alert'\)createWildAiTelegraph\(w,w\.mesh\.position/);
  assert.match(updateWild, /life:aiPolicy\.alertDurationSec,y:\.08,priority:'P0'/);
  assert.match(updateWild, /if\(decision\.transition\?\.toState==='attack_windup'\)\{/);
  assert.match(updateWild, /const telegraphReady=targetValid&&createWildAiTelegraph\(w,target\.position[\s\S]*?,target\)/);
  assert.match(updateWild, /if\(w\.boss&&!telegraphReady\)\{cancelWildAIAction\(w,'boss_attack_telegraph_unavailable'\);return false;\}/);
  assert.match(updateWild, /executeWildAiIntent\(w,decision,canEngage,frameTargetKey,frameRuntime\)/);
  assert.match(updateWild, /if\(!wildFrameRuntimeUsable\(w,frameRuntime\)\|\|w\.capturing\)return false/);
  assert.match(cacheMotion, /decision\?\.action==='wander'/);
  assert.match(advanceLifecycle, /advanceEncounterEffects\(w\.statusState,statusRequest\)/);
  assert.match(advanceLifecycle, /if\(w\?\.capturing\)return false/);
  assert.match(advanceLifecycle, /frameRuntime\?\?wildFrameRuntimeCache\.get\(w\)\?\?null/);
  assert.match(advanceLifecycle, /!wildFrameRuntimeUsable\(w,runtime\)&&!validateWildRuntimeActor\(w\)/);
  assert.match(advanceLifecycle, /runtime\.statusState=w\.statusState;runtime\.control=control;runtime\.selfModifiers=selfModifiers/);
  assert.match(advanceLifecycle, /w\.attackCd=tickCooldown\(w\.attackCd,cooldownElapsed\)/);
  assert.doesNotMatch(updateWild, /advanceEncounterEffects|tickCooldown|animateEntity|moveWildWithFieldCollision/);
  assert.match(applyMotion, /moveWildWithFieldCollision/);
  assert.doesNotMatch(`${updateWild}${applyMotion}`, /validateWildRuntimeActor|resolveCombatStatusRuntime|resolveActiveSelfStatusModifiers/);
  assert.match(applyMotion, /animateEntity\(w\.mesh,dt,moving/);
  assert.match(applyMotion, /animateMonster\(w\.mesh,dt,moving\)/);
  assert.match(updateWild, /const aiPolicy=wildAiPolicy\(w\)/);
  assert.match(updateWild, /life:aiPolicy\.windupDurationSec,y:\.08,priority:'P0'/);
  assert.match(updateWild, /createWildAiTelegraph\(w,target\.position[\s\S]*?,target\)/);
  assert.ok(updateWild.indexOf('createWildAiTelegraph(w,target.position')
    < updateWild.indexOf("triggerMonsterAction(w.mesh,'attack',aiPolicy.windupDurationSec)"),
  'replacing an expired alert handle cannot clear the new windup animation');
  assert.match(triggerMonsterAction, /monActionDuration=safeDuration/);
  assert.match(animateMonster, /u\.monActionTimer\/actionDuration/);
  assert.ok(executor.indexOf('w.lastCommittedAiActionToken=decision.intent.actionToken') < executor.indexOf('spawnElementalFX('));
  assert.ok(executor.indexOf('w.attackCd=wildAiPolicy(w).basicAttackCooldownSec') < executor.indexOf('spawnElementalFX('));
  assert.ok(executor.indexOf('settleWildAIIntent(w.aiState,decision.intent,true)') < executor.indexOf('wildDamage('));
  assert.ok(executor.indexOf('summon.inst.hp-=dmg') < executor.indexOf("runBestEffortCombatPresentation(()=>{spawnElementalFX(incomingType,impact,'impact',0.65);spawnDamageNumber(dmg"),
    'Owned HP commits before Wild impact presentation');
  assert.ok(executor.indexOf('commitWildAIState(w,settled.nextState)') < executor.indexOf('w.lastCommittedAiActionToken=decision.intent.actionToken'));
  const acceptedTelegraphClear = executor.lastIndexOf('clearWildAiTelegraph(w)');
  assert.ok(executor.indexOf('w.lastCommittedAiActionToken=decision.intent.actionToken') < acceptedTelegraphClear);
  assert.ok(executor.indexOf('w.attackCd=wildAiPolicy(w).basicAttackCooldownSec') < acceptedTelegraphClear);
  assert.ok(executor.indexOf('wildAiStateOwnsIntent(w,decision?.intent)') < executor.indexOf('materializeWildAiIntentTarget('));
  assert.match(executor, /reason:'stale_intent_ignored'/);
  assert.match(rejectIntent, /else cancelWildAIAction\(w,'invalid_rejected_intent_settlement',\{clearEngagement:true\}\)/);
  assert.match(executor, /cancelWildAIAction\(w,'invalid_accepted_intent_settlement',\{clearEngagement:true\}\)/);
  assert.match(loop, /wildLoopGeneration=zoneGeneration,wildLoopTargetKey=wildAiFrameTarget\?\.id\?\?null/);
  assert.equal((loop.match(/zoneGeneration!==wildLoopGeneration\|\|currentWildAiTargetKey\(\)!==wildLoopTargetKey/g) ?? []).length, 2);
  assert.match(loop, /w\.retired\|\|w\.runtimeGeneration!==wildLoopGeneration/);
  assert.match(loop, /const targetAvailable=wildAiTargetAvailable\(wildAiFrameTarget\)/);
  assert.match(loop, /const aiDistance=targetAvailable\?distXZ\(w\.mesh\.position,wildAiFrameTarget\.position\):Infinity/);
  assert.match(loop, /const urgentCancel=!!w\.aiState\?\.pendingAction&&\(!engagedWildIds\.has\(w\.id\)\|\|w\.aiState\.targetId!==wildLoopTargetKey\|\|!targetAvailable\)/);
  assert.match(loop, /distanceTickScheduler\.advance\(w\.id,aiDistance,dt,urgentCancel\)/);
  assert.match(loop, /const engagedWildIds=selectWildAggressors\(\);\s*syncWildAiTelegraphs\(wildAiFrameTarget\)/);
  const rootSweepIndex = loop.indexOf('quarantineInvalidWildActors();');
  const boundaryPreflightIndex = loop.indexOf('preflightWildEncounterBoundaries();');
  assert.ok(rootSweepIndex >= 0 && rootSweepIndex < loop.indexOf('updateWorldStream();'));
  assert.ok(boundaryPreflightIndex >= 0 && boundaryPreflightIndex < loop.indexOf('updateSkillFields(dt);'));
  assert.match(loop, /wildRuntimeFrameToken=wildRuntimeFrameToken>=Number\.MAX_SAFE_INTEGER\?1:wildRuntimeFrameToken\+1/);
  const lifecycleIndex = loop.indexOf('advanceWildLifecycle(w,dt)');
  assert.ok(lifecycleIndex >= 0 && lifecycleIndex < loop.indexOf('distanceTickScheduler.advance('));
  assert.match(loop, /const frameRuntime=advanceWildLifecycle\(w,dt\);\s*if\(!frameRuntime\)continue/);
  assert.match(loop, /if\(aiDt>0\)updateWild\(w,aiDt,engagedWildIds\.has\(w\.id\),wildAiFrameTarget,wildLoopTargetKey,frameRuntime\)/);
  assert.match(loop, /if\(!w\.retired&&w\.runtimeGeneration===wildLoopGeneration\)applyWildMotionAndPresentation\(w,dt,wildAiFrameTarget,wildLoopTargetKey,frameRuntime\)/);
  assert.match(preflightBoundaries, /resetRequest\.targetValid=targetValid/);
  assert.match(preflightBoundaries, /w\.capturing\|\|!w\.engaged/);
  assert.match(preflightBoundaries, /const resetCause=wildEncounterResetCause\(/);
  assert.match(preflightBoundaries, /resetWild\(w,resetCause\)/);
  assert.match(preflightBoundaries, /captureEngagementResumePending===true&&engagedWildIds\.has\(w\.id\)\)w\.captureEngagementResumePending=false/);
  const classifyReset = Function('ENCOUNTER_POLICY', `'use strict';${resetCause};return wildEncounterResetCause;`)(
    { leashRadius: 18, disengageRadius: 20 },
  );
  assert.equal(classifyReset({ assigned: true, targetAvailable: true, combatAuthorized: true, distanceToTarget: 5, distanceFromHome: 18.001 }), 'outside_leash');
  assert.equal(classifyReset({ assigned: false, targetAvailable: true, combatAuthorized: true, distanceToTarget: 1, distanceFromHome: 1 }), 'engagement_slot_lost');
  assert.equal(classifyReset({ assigned: true, targetAvailable: false, combatAuthorized: true, distanceToTarget: Infinity, distanceFromHome: 1 }), 'target_invalid');
  assert.equal(classifyReset({ assigned: true, targetAvailable: true, combatAuthorized: true, distanceToTarget: 20.001, distanceFromHome: 1 }), 'outside_disengage');
  assert.match(damageTargetAvailable, /distXZ\(w\.mesh\.position,w\.home\)>ENCOUNTER_POLICY\.leashRadius/);
  assert.match(damageTargetAvailable, /w\.dead\|\|w\.retired\|\|w\.capturing/);
  assert.match(damageWild, /wildDamageTargetAvailable\(w\)/);
  assert.ok(damageWild.indexOf('commitReceipt.committed=true;commitReceipt.damage=') < damageWild.indexOf("triggerMonsterAction(w.mesh,'hurt',0.22)"),
    'damage receipt commits before throwable presentation');
  assert.match(damageWild, /runBestEffortCombatPresentation\(\(\)=>\{/);
  assert.ok(damageWild.indexOf('w.hp=Math.max(0,w.hp-dmg)') < damageWild.indexOf('runBestEffortCombatPresentation(()=>'),
    'Wild HP commits before damage presentation');
  assert.match(damageWild, /if\(w\.hp<=0&&meta\.deferDefeat!==true\)finalizePendingWildDefeat\(w,meta\.rewardOwnerInstanceId\?\?null\)/);
  assert.match(finalizePendingDefeat, /if\(!w\|\|w\.dead\|\|!\(w\.hp<=0\)\)return false/);
  assert.match(finalizePendingDefeat, /defeatWild\(w,rewardOwnerInstanceId\);return true/);
  assert.doesNotMatch(saveEnvelope, /aiState|aiDebug|aiMotion|runtimeEpoch|lastCommittedAiActionToken|aiActionSequenceFloor|aiTelegraphEffect|aiTelegraphTargetId|aiTelegraphYOffset/);
  assert.doesNotMatch(updateWild, /currentUses|dispatchSkill|executeEquippedSkillCommand|useSkill\(|skillId/);

  assertScratchContract(gameSource);
  assertWildCancellationContract(gameSource);
  assertResetWildContract(gameSource);
  assertCancelTargetIterationContract(gameSource);
  assertTelegraphFollowContract(gameSource);
  assertWildTelegraphFailureContract(gameSource);
  assertCaptureFailureFailsClosed(gameSource);
  assertBossStartFailsClosed(gameSource);
  assertMaterializerContract(gameSource);
  assertExecutorContract(gameSource);
  assertBoundedEngagementDamage(gameSource);
  assertCapturingWildDoesNotReserveEngagementSlot(gameSource);
  assertWildRuntimeActorValidation(gameSource);
  assertIntegratedResetCauses(gameSource);
  assertCaptureResumePriorityHandoff(gameSource);
  assertAutomaticBossExitPresentationIsolation(gameSource);
  assertCapturePausesWildLifecycle(gameSource);
}

const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertWildAiRuntimeWiring(gameSource);
  console.log('V8.10 AI-2 Wild AI runtime wiring: PASS');
}
