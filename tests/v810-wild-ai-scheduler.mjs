import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDistanceTickScheduler } from '../performance-runtime.mjs';
import { WILD_BASIC_AI_POLICY } from '../runtime-policies.mjs';
import {
  createMonsterAIState,
  resolveWildMonsterAI,
  settleWildAIIntent,
} from '../wild-ai-resolver.mjs';

function simulateOneSecond(createScheduler) {
  const scheduler = createScheduler({
    nearDistance: 12,
    midDistance: 24,
    nearHz: 20,
    midHz: 10,
    farHz: 4,
    maxStep: 0.25,
  });
  const encounterId = 'zone:1:grass';
  const actorId = 'wild-1';
  const targetId = 'player:1';
  let state = createMonsterAIState({ actorId, encounterId });
  let engaged = false;
  let cooldownSec = 0;
  let resolverCalls = 0;
  let damageCount = 0;
  let firstIntentAtSec = null;
  const frameDt = 1 / 60;
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
  for (let frame = 1; frame <= 60; frame += 1) {
    const nowSec = frame * frameDt;
    const aiDt = scheduler.advance(actorId, 1, frameDt, false);
    if (aiDt <= 0) continue;
    resolverCalls += 1;
    cooldownSec = Math.max(0, cooldownSec - aiDt);
    const decision = resolveWildMonsterAI({
      state,
      snapshot: {
        nowSec,
        dtSec: aiDt,
        self: {
          id: actorId,
          encounterId,
          alive: true,
          capturing: false,
          engaged,
          hp: 10,
          maxHp: 10,
          position: { x: 0, z: 0 },
          home: { x: 0, z: 0 },
          attackReady: cooldownSec <= 0,
          canMove: true,
          canAttack: true,
          forcedRetreat: false,
        },
        targets: [target],
        profile: WILD_BASIC_AI_POLICY,
      },
      canEngage: true,
    });
    assert.equal(decision.ok, true);
    state = decision.nextState;
    if (decision.targetId !== null) engaged = true;
    if (decision.action !== 'basic_attack') continue;
    const settled = settleWildAIIntent(state, decision.intent, true);
    assert.equal(settled.ok, true);
    state = settled.nextState;
    cooldownSec = WILD_BASIC_AI_POLICY.basicAttackCooldownSec;
    damageCount += 1;
    firstIntentAtSec ??= nowSec;
  }
  return { resolverCalls, damageCount, firstIntentAtSec, state, cooldownSec };
}

export function assertWildAiSchedulerCadence(createScheduler = createDistanceTickScheduler) {
  const result = simulateOneSecond(createScheduler);
  assert.ok(result.resolverCalls >= 19 && result.resolverCalls <= 21,
    `near scheduler resolves around 20 Hz, received ${result.resolverCalls}`);
  assert.ok(result.resolverCalls < 30, 'engaged/pending AI is not resolved at the 60 Hz render rate');
  assert.equal(result.damageCount, 1, 'accepted Basic intent commits damage exactly once in the window');
  assert.ok(result.firstIntentAtSec !== null);
  const minimumReactionSec = WILD_BASIC_AI_POLICY.alertDurationSec + WILD_BASIC_AI_POLICY.windupDurationSec;
  assert.ok(result.firstIntentAtSec + Number.EPSILON >= minimumReactionSec,
    'scheduler never shortens alert plus windup fairness time');
  assert.ok(result.firstIntentAtSec <= minimumReactionSec + 0.16,
    'near cadence adds at most a small bounded quantization delay');

  const urgent = createScheduler({ nearHz: 20, midHz: 10, farHz: 4 });
  assert.equal(urgent.advance('cancel', 1, 1 / 60, false), 0);
  assert.equal(urgent.advance('cancel', 1, 1 / 60, true), 1 / 60,
    'urgent invalidation clears backlog and cancels on the current frame without fast-forwarding state');

  for (const fps of [30, 45, 60]) {
    for (const hz of [20, 24, 30]) {
      const scheduler = createScheduler({ nearHz: hz, midHz: 10, farHz: 4 });
      let calls = 0;
      for (let frame = 0; frame < fps * 10; frame += 1) {
        if (scheduler.advance(`${fps}:${hz}`, 1, 1 / fps, false) > 0) calls += 1;
      }
      assert.ok(Math.abs(calls - hz * 10) <= 1,
        `${fps} FPS preserves ${hz} Hz cadence without quantizing down (received ${calls / 10} Hz)`);
    }
  }

  const bandTransition = createScheduler({
    nearDistance: 12,
    midDistance: 24,
    nearHz: 20,
    midHz: 10,
    farHz: 4,
  });
  const transitionFrames = [];
  for (let frame = 0; frame < 14; frame += 1) {
    bandTransition.advance('far-to-near', 30, 1 / 60, false);
  }
  for (let frame = 0; frame < 60; frame += 1) {
    if (bandTransition.advance('far-to-near', 1, 1 / 60, false) > 0) transitionFrames.push(frame);
  }
  assert.ok(transitionFrames.length <= 21,
    `far-to-near transition stays bounded by near cadence (received ${transitionFrames.length} calls)`);
  let longestConsecutiveRun = 0;
  let consecutiveRun = 0;
  let previousFrame = -2;
  for (const frame of transitionFrames) {
    consecutiveRun = frame === previousFrame + 1 ? consecutiveRun + 1 : 1;
    longestConsecutiveRun = Math.max(longestConsecutiveRun, consecutiveRun);
    previousFrame = frame;
  }
  assert.ok(longestConsecutiveRun <= 2,
    `far cadence backlog cannot burst across several consecutive near frames (run ${longestConsecutiveRun})`);
}

export function assertSchedulerRuntimeSource(gameSource) {
  const loopStart = gameSource.indexOf('function loop(');
  assert.ok(loopStart >= 0);
  const loop = gameSource.slice(loopStart);
  assert.match(loop, /const aiDistance=targetAvailable\?distXZ\(w\.mesh\.position,wildAiFrameTarget\.position\):Infinity/);
  assert.match(loop, /const urgentCancel=!!w\.aiState\?\.pendingAction&&\(!engagedWildIds\.has\(w\.id\)\|\|w\.aiState\.targetId!==wildLoopTargetKey\|\|!targetAvailable\)/);
  assert.match(loop, /distanceTickScheduler\.advance\(w\.id,aiDistance,dt,urgentCancel\)/);
  assert.doesNotMatch(loop, /distanceTickScheduler\.advance\(w\.id,aiDistance,dt,true\)/);
}

const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertWildAiSchedulerCadence();
  assertSchedulerRuntimeSource(gameSource);
  console.log('V8.10 AI scheduler cadence and fairness: PASS');
}
