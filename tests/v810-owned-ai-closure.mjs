import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function assertOwnedTargetEpochContract(gameSource) {
  const source = functionSource(gameSource, 'ownedWildAiTargetId');
  const resolveId = activeSummon => Function(
    'activeSummon',
    `'use strict';${source};return ownedWildAiTargetId;`,
  )(activeSummon);
  const first = { inst: { instanceId: 'same-owned' }, runtimeEpoch: 4 };
  const second = { inst: { instanceId: 'same-owned' }, runtimeEpoch: 5 };
  assert.equal(resolveId(first)(), 'owned:same-owned:4');
  assert.equal(resolveId(second)(), 'owned:same-owned:5');
  assert.notEqual(resolveId(first)(), resolveId(second)(), 're-summon gets a distinct target identity');
  for (const malformed of [
    null,
    {},
    { inst: { instanceId: 'same-owned' }, runtimeEpoch: 1.5 },
    { inst: { instanceId: 'same-owned' }, runtimeEpoch: Number.NaN },
  ]) assert.equal(resolveId(malformed)(), null);
}

function assertSessionTraceContract(gameSource) {
  const source = functionSource(gameSource, 'appendMonsterAiSessionTrace');
  const session = { events: [] };
  const append = Function(
    'monsterAiDebugSession',
    'MONSTER_AI_SESSION_TRACE_LIMIT',
    `'use strict';${source};return appendMonsterAiSessionTrace;`,
  )(session, 3);
  const events = Array.from({ length: 5 }, (_, index) => ({ actorId: `actor-${index}` }));
  for (const event of events) append(event);
  assert.deepEqual(session.events, events.slice(2), 'session trace is a bounded FIFO');
  const disabled = Function(
    'monsterAiDebugSession',
    'MONSTER_AI_SESSION_TRACE_LIMIT',
    `'use strict';${source};return appendMonsterAiSessionTrace;`,
  )(null, 3);
  assert.doesNotThrow(() => disabled(events[0]));
}

function assertSessionMetricsContract(gameSource) {
  const source = functionSource(gameSource, 'publishMonsterAiMetrics');
  const session = { actors: [] };
  const publish = Function(
    'monsterAiDebugSession', 'MONSTER_AI_SESSION_ACTOR_LIMIT',
    `'use strict';${source};return publishMonsterAiMetrics;`,
  )(session, 3);
  const metrics = index => ({
    decisionCount: index,
    transitionCount: index + 1,
    targetSwitchCount: index + 2,
    rejectedIntentCount: index + 3,
    resetCount: index + 4,
    avgDecisionMs: index + 5,
    maxDecisionMs: index + 6,
  });
  for (let index = 0; index < 5; index += 1) publish(`actor-${index}`, 'wild', metrics(index));
  assert.deepEqual(session.actors.map(entry => entry.actorId), ['actor-2', 'actor-3', 'actor-4'],
    'inspectable actor metrics use a bounded recent-actor FIFO');
  assert.deepEqual(session.actors.at(-1), { actorId: 'actor-4', kind: 'wild', ...metrics(4) });
}

function assertWildDecisionMetricContract(gameSource) {
  const source = functionSource(gameSource, 'recordWildAiTrace');
  const sessionEvents = [];
  const published = [];
  const record = Function(
    'MONSTER_AI_DEBUG',
    'MONSTER_AI_TRACE_LIMIT',
    'appendMonsterAiSessionTrace',
    'publishMonsterAiMetrics',
    `'use strict';${source};return recordWildAiTrace;`,
  )(true, 4, event => sessionEvents.push(event), (actor,kind,metrics)=>published.push({actor,kind,resetCount:metrics.resetCount}));
  const wild = {
    id: 'wild-1',
    state: 'chase',
    aiState: { targetId: 'player:1' },
    statusState: { currentTimeSec: 1 },
  };
  record(wild, { fromState: 'alert', toState: 'chase', targetId: 'player:1', reason: 'decision', durationMs: 8, decision: true });
  record(wild, { fromState: 'chase', toState: 'wander', targetId: null, reason: 'lifecycle_cancel', durationMs: 0 });
  record(wild, { fromState: 'chase', toState: 'wander', targetId: null, reason: 'encounter_reset:outside_leash', durationMs: 0, reset: true });
  assert.equal(wild.aiDebug.eventCount, 3);
  assert.equal(wild.aiDebug.decisionCount, 1, 'lifecycle traces do not inflate resolver call metrics');
  assert.equal(wild.aiDebug.avgDecisionMs, 8, 'lifecycle traces do not dilute decision timing');
  assert.equal(wild.aiDebug.maxDecisionMs, 8);
  assert.equal(wild.aiDebug.resetCount, 1, 'a committed encounter reset increments exactly once');
  assert.equal(sessionEvents.length, 3);
  assert.deepEqual(published.at(-1), { actor: 'wild-1', kind: 'wild', resetCount: 1 });
}

function assertTraceFailureIsolation(gameSource) {
  const wildSource = functionSource(gameSource, 'recordWildAiTrace');
  const ownedSource = functionSource(gameSource, 'recordOwnedAiTrace');
  const makeWildRecorder = (append, publish) => Function(
    'MONSTER_AI_DEBUG',
    'MONSTER_AI_TRACE_LIMIT',
    'appendMonsterAiSessionTrace',
    'publishMonsterAiMetrics',
    `'use strict';${wildSource};return recordWildAiTrace;`,
  )(true, 4, append, publish);
  const makeOwnedRecorder = (append, publish) => Function(
    'MONSTER_AI_DEBUG',
    'MONSTER_AI_TRACE_LIMIT',
    'appendMonsterAiSessionTrace',
    'publishMonsterAiMetrics',
    'ownedWildAiTargetId',
    `'use strict';${ownedSource};return recordOwnedAiTrace;`,
  )(true, 4, append, publish, actor => `owned:${actor.inst.instanceId}:${actor.runtimeEpoch}`);
  const frozenWildDebug = Object.freeze({
    eventCount: 0, decisionCount: 0, transitionCount: 0, targetSwitchCount: 0,
    rejectedIntentCount: 0, resetCount: 0, avgDecisionMs: 0, maxDecisionMs: 0,
    trace: Object.freeze([]),
  });
  const frozenOwnedDebug = Object.freeze({
    decisionCount: 0, transitionCount: 0, targetSwitchCount: 0,
    rejectedIntentCount: 0, resetCount: 0, attackCount: 0,
    avgDecisionMs: 0, maxDecisionMs: 0, trace: Object.freeze([]),
  });
  const wild = {
    id: 'wild-frozen-debug', state: 'chase', aiState: { targetId: 'player:1' },
    statusState: { currentTimeSec: 2 }, aiDebug: frozenWildDebug,
  };
  const owned = {
    inst: { instanceId: 'owned-frozen-debug' }, runtimeEpoch: 7,
    aiDecision: { action: 'basic_attack', targetId: 'wild-1' },
    statusState: { currentTimeSec: 2 }, aiDebug: frozenOwnedDebug,
  };
  assert.doesNotThrow(() => makeWildRecorder(() => {}, () => {})(wild, {
    fromState: 'alert', toState: 'chase', targetId: 'player:1', decision: true,
  }), 'Wild debug telemetry is observational when aiDebug is frozen');
  assert.doesNotThrow(() => makeOwnedRecorder(() => {}, () => {})(owned, {
    fromState: 'chase', toState: 'basic_attack', targetId: 'wild-1', decision: true,
  }), 'Owned debug telemetry is observational when aiDebug is frozen');
  assert.equal(wild.aiDebug, frozenWildDebug);
  assert.equal(owned.aiDebug, frozenOwnedDebug);

  const sinkFailure = new Error('debug-session-sink-failure');
  const throwSink = () => { throw sinkFailure; };
  for (const [label, makeRecorder, actor, event] of [
    ['Wild', makeWildRecorder, { id: 'wild-sink', state: 'alert', aiState: { targetId: 'player:1' }, statusState: { currentTimeSec: 3 } },
      { fromState: 'wander', toState: 'alert', targetId: 'player:1', decision: true }],
    ['Owned', makeOwnedRecorder, { inst: { instanceId: 'owned-sink' }, runtimeEpoch: 8, statusState: { currentTimeSec: 3 } },
      { fromState: 'idle', toState: 'move', targetId: 'wild-2', action: 'move', decision: true }],
  ]) {
    assert.doesNotThrow(() => makeRecorder(throwSink, () => {})(actor, event),
      `${label} trace contains a throwing session-event sink`);
    delete actor.aiDebug;
    assert.doesNotThrow(() => makeRecorder(() => {}, throwSink)(actor, event),
      `${label} trace contains a throwing session-metrics sink`);
  }
  const getterFailure = new Error('debug-default-getter-failure');
  const throwingActor = new Proxy({}, { get() { throw getterFailure; } });
  const throwingOptions = new Proxy({}, { get() { throw getterFailure; } });
  assert.doesNotThrow(() => makeWildRecorder(() => {}, () => {})(throwingActor),
    'Wild default trace reads are inside the telemetry isolation boundary');
  assert.doesNotThrow(() => makeOwnedRecorder(() => {}, () => {})(throwingActor),
    'Owned default trace reads are inside the telemetry isolation boundary');
  assert.doesNotThrow(() => makeWildRecorder(() => {}, () => {})({ id: 'wild-options' }, throwingOptions));
  assert.doesNotThrow(() => makeOwnedRecorder(() => {}, () => {})({ inst: { instanceId: 'owned-options' }, runtimeEpoch: 9 }, throwingOptions));
}

function assertOwnedCancellationContract(gameSource) {
  const cancelSource = functionSource(gameSource, 'cancelOwnedAIAction');
  const targetSource = functionSource(gameSource, 'cancelOwnedAITarget');
  const records = [];
  const owned = {
    target: { id: 'wild-1' },
    aiDecision: { ok: true, action: 'move', targetId: 'wild-1' },
    aiDecisionElapsed: 0.75,
    statusState: { currentTimeSec: 2 },
  };
  const cancel = Function(
    'recordOwnedAiTrace',
    `'use strict';${cancelSource};return cancelOwnedAIAction;`,
  )( (_actor, event) => records.push(event) );
  assert.equal(cancel(owned, 'test_cancel'), true);
  assert.equal(owned.target, null);
  assert.equal(owned.aiDecision, null);
  assert.equal(owned.aiDecisionElapsed, 0);
  assert.deepEqual(records, [{
    fromState: 'move', toState: 'idle', targetId: 'wild-1', action: 'idle',
    reason: 'test_cancel', timeSec: 2, rejected: true,
  }]);

  let activeSummon = {
    aiDecision: { ok: true, action: 'basic_attack', targetId: 'wild-2' },
  };
  const calls = [];
  const cancelTarget = Function(
    'activeSummon',
    'cancelOwnedAIAction',
    `'use strict';${targetSource};return cancelOwnedAITarget;`,
  )(activeSummon, (actor, reason) => { calls.push({ actor, reason }); return true; });
  assert.equal(cancelTarget('wild-1', 'wrong'), false);
  assert.equal(cancelTarget('wild-2', 'matched'), true);
  assert.deepEqual(calls, [{ actor: activeSummon, reason: 'matched' }]);
  activeSummon = null;
}

function assertOwnedInvalidStatusFailsClosed(gameSource) {
  const updateSource = functionSource(gameSource, 'updateOwned');
  const cancelSource = functionSource(gameSource, 'cancelOwnedAIAction');
  const actor = {
    inst: { instanceId: 'owned-invalid', speciesId: 'species', hp: 20, maxHp: 20 },
    statusState: null,
    target: { id: 'wild-1' },
    aiDecision: { action: 'basic_attack', targetId: 'wild-1' },
    aiDecisionElapsed: 0.5,
  };
  const update = Function(
    'activeSummon', 'spById', 'isEncounterStatusState', 'recordOwnedAiTrace',
    `'use strict';${cancelSource}${updateSource};return updateOwned;`,
  )(actor, { species: {} }, () => false, () => {});
  assert.doesNotThrow(() => update(1 / 60));
  assert.equal(actor.inst.hp, 20, 'invalid status state cannot reach damage or lifecycle mutation');
  assert.equal(actor.target, null);
  assert.equal(actor.aiDecision, null);
  assert.equal(actor.aiDecisionElapsed, 0, 'invalid status state clears Owned decision cadence');
}

function assertOwnedBasicDamageTransaction(gameSource) {
  const commitSource = functionSource(gameSource, 'commitOwnedBasicDamage');
  const finalizeSource = functionSource(gameSource, 'finalizePendingWildDefeat');
  const logSource = functionSource(gameSource, 'logBattleEvent');
  const events = [];
  const defeatSnapshots = [];
  const damageMetas = [];
  let damageAccepted = true;
  let throwAfterDamageCommit = false;
  const presentationFailure = new Error('owned-basic-presentation-failure');
  const commit = Function(
    'battleEventLog', 'TRAINING_LINES', 'damageWild', 'defeatWild',
    `'use strict';${logSource}${finalizeSource}${commitSource};return commitOwnedBasicDamage;`,
  )(
    events,
    ['power', 'defense', 'speed', 'technique', 'spirit'],
    (target, damage, meta) => {
      damageMetas.push(meta);
      if (!damageAccepted) return false;
      const hpBefore = target.hp;
      target.hp = Math.max(0, target.hp - damage);
      Object.assign(meta.commitReceipt, { committed: true, damage: hpBefore - target.hp });
      if (throwAfterDamageCommit) throw presentationFailure;
      return true;
    },
    target => {
      defeatSnapshots.push({ id: target.id, events: events.splice(0) });
      target.dead = true;
    },
  );
  const basic = { type: 'Fire', sourceInstanceId: 'owned-a' };
  const first = { id: 'wild-first', hp: 5, dead: false };
  assert.equal(commit(first, { damage: 12, eff: 2 }, basic), true);
  assert.equal(first.hp, 0);
  assert.equal(first.dead, true, 'a committed killing Basic finalizes after contribution logging');
  assert.deepEqual(defeatSnapshots, [{ id: 'wild-first', events: [{ category: 'power', amount: 5, meaningful: true, targetId: 'wild-first', sourceInstanceId: 'owned-a' }] }],
    'Owned Basic records actual overkill-clamped damage before defeat consumes growth events');
  assert.deepEqual(events, [], 'a killing contribution cannot leak beyond its victory');

  damageAccepted = false;
  const rejected = { id: 'wild-rejected', hp: 4, dead: false };
  assert.equal(commit(rejected, { damage: 9, eff: 1 }, basic), false);
  assert.equal(rejected.hp, 4);
  assert.equal(rejected.dead, false);
  assert.deepEqual(events, [], 'a rejected live damage commit cannot ghost-log contribution');
  assert.equal(defeatSnapshots.length, 1, 'a rejected live damage commit cannot finalize defeat');

  damageAccepted = true;
  const second = { id: 'wild-second', hp: 4, dead: false };
  assert.equal(commit(second, { damage: 4, eff: 1 }, basic), true);
  assert.deepEqual(defeatSnapshots[1], { id: 'wild-second', events: [{ category: 'power', amount: 4, meaningful: true, targetId: 'wild-second', sourceInstanceId: 'owned-a' }] },
    'the next victory consumes only its own committed contribution');
  assert.deepEqual(events, []);
  throwAfterDamageCommit = true;
  const throwing = { id: 'wild-throwing', hp: 2, dead: false };
  assert.throws(() => commit(throwing, { damage: 8, eff: 1 }, basic), error => error === presentationFailure);
  assert.equal(throwing.dead, true, 'Owned Basic finalizes a lethal HP receipt even when hit presentation throws');
  assert.deepEqual(defeatSnapshots[2], { id: 'wild-throwing', events: [{ category: 'power', amount: 2, meaningful: true, targetId: 'wild-throwing', sourceInstanceId: 'owned-a' }] });
  assert.deepEqual(events, []);
  assert.equal(damageMetas.length, 4);
  for (const meta of damageMetas) assert.equal(meta.deferDefeat, true,
    'Owned Basic explicitly owns defeat finalization until its contribution is logged');
  for (const meta of damageMetas) assert.equal(typeof meta.commitReceipt, 'object',
    'Owned Basic exposes the HP commit before any presentation failure');
}

function assertOwnedBasicImpactPresentationTransaction(gameSource) {
  const updateSource = functionSource(gameSource, 'updateOwned');
  const commitSource = functionSource(gameSource, 'commitOwnedBasicDamage');
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');
  const order = [];
  const counts = { damage: 0, contribution: 0, finalize: 0, impact: 0, trace: 0 };
  const target = {
    id: 'wild-impact', hp: 4, dead: false,
    mesh: { position: { x: 2, y: 0, z: 0 } },
  };
  const actor = {
    inst: {
      instanceId: 'owned-impact', speciesId: 'owned-species', hp: 10, maxHp: 10,
      fainted: false, spd: 4,
    },
    mesh: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } },
    target, runtimeEpoch: 4, attackCd: 0, skillCds: [0, 0, 0, 0], skillUiElapsed: 0,
    aiDecisionElapsed: 0,
    aiDecision: { ok: true, action: 'basic_attack', targetId: target.id },
    statusState: { currentTimeSec: 1, ended: false },
  };
  const impactScratch = {
    x: 0, y: 0, z: 0,
    copy(position) { this.x = position.x; this.y = position.y; this.z = position.z; return this; },
  };
  const api = Function(
    'activeSummon', 'spById', 'isEncounterStatusState', 'cancelOwnedAIAction',
    'advanceEncounterEffects', 'resolveActiveSelfStatusModifiers', 'resolveCombatStatusRuntime',
    'tickCooldown', 'shouldRunOwnedCadence', 'qualityProfile', 'materializeOwnedBasicAiTarget',
    'OWNED_BASIC_AI_POLICY', 'recordOwnedAiTrace', 'triggerMonsterAction',
    'ownedBasicAiImpactScratch', 'monsterDamage', 'damageWild', 'logBattleEvent',
    'finalizePendingWildDefeat', 'monsterTypes', 'spawnElementalFX', 'animateEntity',
    'animateMonster',
    `'use strict';${bestEffortSource}${commitSource}${updateSource};return {updateOwned,getActor:()=>activeSummon};`,
  )(
    actor,
    { 'owned-species': { types: ['Fire'] } },
    status => status === actor.statusState,
    () => false,
    () => ({ ok: false }),
    () => ({ ok: true, attackMultiplier: 1, speedMultiplier: 1, critChancePct: 0 }),
    () => ({
      ok: true, canMove: true, canAttack: true, forcedRetreat: false,
      accuracyMultiplier: 1, cooldownRecoveryMultiplier: 1,
    }),
    value => value,
    () => false,
    { nearAiHz: 10 },
    () => target,
    { basicAttackCooldownSec: 1.25, basicAttackPower: 12, commandSource: 'owned_basic_ai' },
    (_source, event) => {
      if (event.reason === 'runtime_commit') { counts.trace += 1; order.push('trace-commit'); }
    },
    () => { order.push('attack-presentation'); },
    impactScratch,
    () => ({ damage: 4, eff: 1 }),
    (liveTarget, damage, meta) => {
      counts.damage += 1; order.push('damage-commit');
      const hpBefore = liveTarget.hp;
      liveTarget.hp = Math.max(0, liveTarget.hp - damage);
      Object.assign(meta.commitReceipt, { committed: true, damage: hpBefore - liveTarget.hp });
      return true;
    },
    (_category, amount, _meaningful, targetId, sourceInstanceId) => {
      counts.contribution += 1; order.push('contribution-commit');
      assert.deepEqual({ amount, targetId, sourceInstanceId }, {
        amount: 4, targetId: target.id, sourceInstanceId: actor.inst.instanceId,
      });
    },
    liveTarget => {
      counts.finalize += 1; order.push('defeat-finalize');
      if (liveTarget.hp <= 0 && !liveTarget.dead) liveTarget.dead = true;
      return liveTarget.dead;
    },
    () => ['Fire'],
    () => {
      counts.impact += 1; order.push('impact-vfx');
      throw new Error('owned-basic-impact-vfx-failure');
    },
    () => {},
    () => {},
  );

  let escaped = null;
  try { api.updateOwned(0); } catch (error) { escaped = error; }
  assert.equal(escaped, null, 'Owned Basic impact VFX is best-effort after gameplay commits');
  assert.equal(api.getActor(), actor);
  assert.equal(actor.attackCd, 1.25, 'VFX failure cannot roll back the accepted attack cooldown');
  assert.equal(target.hp, 0);
  assert.equal(target.dead, true);
  assert.deepEqual(counts, { damage: 1, contribution: 1, finalize: 1, impact: 1, trace: 1 },
    'VFX failure neither retries nor rolls back committed Owned Basic gameplay');
  assert.ok(order.indexOf('damage-commit') < order.indexOf('impact-vfx'),
    'impact VFX cannot occur until live damage commits');
  assert.ok(order.indexOf('defeat-finalize') < order.indexOf('impact-vfx'),
    'contribution and defeat settlement finish before impact presentation');
}

function assertFaintPresentationIsolation(gameSource) {
  const faintSource = functionSource(gameSource, 'faintActive');
  const cancelSource = functionSource(gameSource, 'cancelOwnedAIAction');
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');
  const calls = [];
  const originalStatus = { currentTimeSec: 6, ended: false };
  const endedStatus = { currentTimeSec: 6, ended: true };
  const mesh = { position: { clone() { return { add() { return this; } }; } } };
  const summon = {
    inst: { instanceId: 'owned-faint', hp: 9, fainted: false },
    mesh, runtimeEpoch: 11, statusState: originalStatus,
    target: { id: 'wild-faint' },
    aiDecision: { ok: true, action: 'basic_attack', targetId: 'wild-faint' },
    aiDecisionElapsed: 0.7,
  };
  const pending = { instanceId: 'pending-owned' };
  const api = Function(
    'activeSummon', 'pendingSummon', 'summonCooldownUntil', 'clearSkillSwarms',
    'discardBattleEventsForSource', 'recordOwnedAiTrace', 'cancelWildAITarget',
    'ownedWildAiTargetId', 'endEncounterEffects', 'removeAndDispose', 'scene',
    'removeSceneRole', 'syncHubCompanion', 'Date', 'saveGame', 'displayName',
    'playSFX',
    `'use strict';${cancelSource}${bestEffortSource}${faintSource};return {faintActive,state:()=>({activeSummon,pendingSummon,summonCooldownUntil})};`,
  )(
    summon,
    pending,
    0,
    () => { calls.push('clear-skills'); },
    sourceId => { calls.push(`discard:${sourceId}`); },
    (_actor, event) => { calls.push(`owned-trace:${event.reason}`); },
    (targetId, reason) => { calls.push(`wild-cancel:${targetId}:${reason}`); return 1; },
    actor => `owned:${actor.inst.instanceId}:${actor.runtimeEpoch}`,
    (status, options) => {
      calls.push('end-status');
      assert.equal(status, originalStatus);
      assert.deepEqual(options, { nowSec: 6 });
      return endedStatus;
    },
    (_scene, removedMesh) => { calls.push('remove-mesh'); assert.equal(removedMesh, mesh); },
    {},
    role => { calls.push(`remove-role:${role}`); throw new Error('remove-role-failure'); },
    () => { calls.push('sync-companion'); throw new Error('sync-companion-failure'); },
    { now: () => 1200 },
    show => { calls.push(`save:${show}`); throw new Error('save-failure'); },
    () => 'Owned Faint',
    () => { calls.push('presentation-throw'); throw new Error('faint-presentation-failure'); },
  );

  assert.doesNotThrow(() => api.faintActive());
  assert.deepEqual(api.state(), {
    activeSummon: null, pendingSummon: null, summonCooldownUntil: 2000,
  });
  assert.equal(summon.inst.hp, 0);
  assert.equal(summon.inst.fainted, true);
  assert.equal(summon.target, null);
  assert.equal(summon.aiDecision, null);
  assert.equal(summon.aiDecisionElapsed, 0);
  assert.equal(summon.statusState, endedStatus);
  assert.deepEqual(calls.slice(0, 10), [
    'clear-skills', 'discard:owned-faint', 'owned-trace:owned_fainted',
    'wild-cancel:owned:owned-faint:11:owned_fainted', 'end-status', 'remove-mesh',
    'remove-role:activeSummon', 'sync-companion', 'save:false', 'presentation-throw',
  ], 'faint cleanup and save commit completely before fallible presentation begins');
}

function assertRecallPresentationIsolation(gameSource) {
  const recallSource = functionSource(gameSource, 'recall');
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');
  const calls = [];
  const endedStatus = { currentTimeSec: 4, ended: true };
  const mesh = { position: { clone() { return { add() { return this; } }; } } };
  const summon = {
    inst: { instanceId: 'owned-recall' }, mesh, runtimeEpoch: 12,
    statusState: { currentTimeSec: 4, ended: false },
    target: { id: 'wild-recall' }, aiDecision: { action: 'basic_attack', targetId: 'wild-recall' },
  };
  const api = Function(
    'activeSummon', 'pendingSummon', 'summonCooldownUntil', 'clearProjectiles',
    'removeSceneRole', 'msg', 'clearSkillSwarms', 'discardBattleEventsForSource',
    'displayName', 'cancelOwnedAIAction', 'cancelWildAITarget', 'ownedWildAiTargetId',
    'endEncounterEffects', 'removeAndDispose', 'scene', 'state', 'markStarterJourney',
    'syncHubCompanion', 'Date', 'playerVisual', 'THREE', 'spawnRingPulse', 'spawnBurst',
    'renderParty', 'renderSkillButtons', 'renderHUD',
    `'use strict';${bestEffortSource}${recallSource};return {recall,state:()=>({activeSummon,pendingSummon,summonCooldownUntil})};`,
  )(
    summon, null, 0, () => {}, role => calls.push(`remove-role:${role}`), () => {},
    () => calls.push('clear-skills'), sourceId => calls.push(`discard:${sourceId}`), () => 'Owned Recall',
    actor => { calls.push('cancel-owned'); actor.target = null; actor.aiDecision = null; return true; },
    (targetId, reason) => { calls.push(`cancel-wild:${targetId}:${reason}`); return 1; },
    actor => `owned:${actor.inst.instanceId}:${actor.runtimeEpoch}`,
    () => { calls.push('end-status'); return endedStatus; },
    (_scene, removedMesh) => { calls.push('remove-mesh'); assert.equal(removedMesh, mesh); }, {},
    { currentZone: 'rocky-canyon' }, () => {}, () => calls.push('sync-companion'), { now: () => 2000 },
    { play() { calls.push('presentation-throw'); throw new Error('recall-presentation-failure'); } },
    { Vector3: class {} }, () => {}, () => {}, () => {}, () => {}, () => {},
  );
  assert.doesNotThrow(() => api.recall(true, true));
  assert.deepEqual(api.state(), { activeSummon: null, pendingSummon: null, summonCooldownUntil: 3000 });
  assert.equal(summon.target, null);
  assert.equal(summon.aiDecision, null);
  assert.equal(summon.statusState, endedStatus);
  assert.deepEqual(calls, [
    'clear-skills', 'discard:owned-recall', 'cancel-owned',
    'cancel-wild:owned:owned-recall:12:owned_recall', 'end-status', 'remove-mesh',
    'remove-role:activeSummon', 'sync-companion', 'presentation-throw',
  ], 'recall retires the exact runtime target before fallible presentation');
}

function assertOwnedStatusLethalPresentationIsolation(gameSource) {
  const updateSource = functionSource(gameSource, 'updateOwned');
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');
  const calls = [];
  const actor = {
    inst: { instanceId: 'owned-status-lethal', speciesId: 'species', hp: 3, maxHp: 10, fainted: false },
    mesh: { position: { x: 1, y: 0, z: 2 } },
    statusState: { currentTimeSec: 2, ended: false },
  };
  const impact = { x: 0, y: 0, z: 0, copy(position) { Object.assign(this, position); return this; } };
  const api = Function(
    'actor', 'calls', 'spById', 'isEncounterStatusState', 'advanceEncounterEffects',
    'statusDamageType', 'monsterTypes', 'ownedBasicAiImpactScratch', 'spawnDamageNumber',
    `'use strict';let activeSummon=actor;const faintActive=()=>{calls.push('faint');actor.inst.hp=0;actor.inst.fainted=true;activeSummon=null;};${bestEffortSource}${updateSource};return{updateOwned,getActive:()=>activeSummon};`,
  )(
    actor, calls, { species: {} }, () => true,
    () => ({ ok: true, state: { currentTimeSec: 2.1, ended: false }, damage: 3, targetHp: 0, ticks: [], fainted: true }),
    () => 'Fire', () => ['Fire'], impact,
    () => { calls.push('presentation-throw'); throw new Error('status-hit-presentation-failure'); },
  );
  assert.doesNotThrow(() => api.updateOwned(0.1));
  assert.equal(api.getActive(), null, 'lethal status damage retires Owned before hit presentation');
  assert.equal(actor.inst.hp, 0);
  assert.equal(actor.inst.fainted, true);
  assert.deepEqual(calls, ['faint', 'presentation-throw']);
}

function assertWildTargetCancellationContract(gameSource) {
  const source = functionSource(gameSource, 'cancelWildAITarget');
  const wilds = [
    { id: 'one', aiState: { targetId: 'owned:same:1' } },
    { id: 'two', aiState: { targetId: 'owned:same:2' } },
    { id: 'three', aiState: { targetId: 'owned:same:1' } },
  ];
  const calls = [];
  const cancelTarget = Function(
    'wilds',
    'cancelWildAIAction',
    `'use strict';${source};return cancelWildAITarget;`,
  )(wilds, (wild, reason) => { calls.push({ id: wild.id, reason }); });
  assert.equal(cancelTarget('owned:same:1', 'epoch_retired'), 2);
  assert.deepEqual(calls, [
    { id: 'three', reason: 'epoch_retired' },
    { id: 'one', reason: 'epoch_retired' },
  ]);
  assert.equal(cancelTarget(null, 'invalid'), 0);
}

function assertSummonProjectileSettlement(gameSource) {
  const summonThrowSource = functionSource(gameSource, 'summonThrow');
  const spawnOwnedSource = functionSource(gameSource, 'spawnOwned');
  const updateProjectilesSource = functionSource(gameSource, 'updateProjectiles');
  const bestEffortSource = functionSource(gameSource, 'runBestEffortCombatPresentation');

  const order = [];
  const projectileMesh = {
    userData: { spin: true },
    position: { y: 0, lerpVectors() { return this; }, clone() { return this; } },
    rotation: { x: 0, y: 0 },
  };
  const projectile = {
    mesh: projectileMesh, type: 'summon', color: 1,
    start: {}, end: { x: 1, y: 0, z: 1 }, t: 0, duration: 1, lastTrail: 1,
    onHit() { order.push('callback'); return true; },
  };
  const projectiles = [projectile];
  const update = Function(
    'projectiles', 'pendingSummon', 'removeAndDispose', 'scene', 'abortCaptureSequence',
    'runBestEffortCombatPresentation', 'getInst', 'monsterTypes', 'spawnElementalFX',
    'spawnBurst', 'safeVec3',
    `'use strict';${bestEffortSource}${updateProjectilesSource};return updateProjectiles;`,
  )(
    projectiles, { instanceId: 'owned-1' },
    (_scene, mesh) => { assert.equal(mesh, projectileMesh); order.push('remove'); }, {}, () => {},
    undefined, () => null, () => ['Normal'], () => {},
    () => { order.push('arrival-vfx'); throw new Error('arrival-vfx-failure'); }, value => value,
  );
  assert.doesNotThrow(() => update(1));
  assert.deepEqual(projectiles, []);
  assert.deepEqual(order, ['remove', 'callback', 'arrival-vfx'],
    'summon projectile cleanup and gameplay callback settle before fallible arrival VFX');

  const provisionalMesh = {
    userData: {}, position: { y: 0, copy() { return this; } },
  };
  const provisionalCalls = [];
  const spawnApi = Function(
    'clearHubCompanion', 'removeSceneRole', 'spById', 'monsterMesh', 'scene',
    'setupMonsterMotion', 'removeAndDispose', 'MANUAL_SKILL_SLOTS',
    'createEncounterStatusState', 'clamp', 'runBestEffortCombatPresentation',
    'spawnElementalFX', 'monsterTypes', 'THREE', 'msg', 'displayName',
    'renderParty', 'renderSkillButtons', 'renderHUD',
    `'use strict';let activeSummon=null,summonRuntimeEpoch=0;${bestEffortSource}${spawnOwnedSource};return{spawnOwned,getActive:()=>activeSummon};`,
  )(
    () => {}, () => {}, { species: {} }, () => provisionalMesh,
    { add(mesh) { provisionalCalls.push(['add', mesh]); } },
    () => { throw new Error('setup-failure'); },
    (_scene, mesh) => provisionalCalls.push(['remove', mesh]), [0, 1, 2, 3],
    () => ({}), value => value, undefined, () => {}, () => ['Normal'],
    { Vector3: class {} }, () => {}, () => 'Owned', () => {}, () => {}, () => {},
  );
  assert.equal(spawnApi.spawnOwned({ instanceId: 'owned-1', speciesId: 'species', bond: 0 }, { clone() { return this; } }), false);
  assert.equal(spawnApi.getActive(), null);
  assert.deepEqual(provisionalCalls, [['add', provisionalMesh], ['remove', provisionalMesh]],
    'a partially attached Owned mesh is removed before summon failure returns');

  let hitCallback = null;
  const summonInst = { instanceId: 'owned-1', hp: 10, fainted: false };
  const summonApi = Function(
    'inst', 'throwProjectile', 'spawnOwned', 'selectedInstance', 'msg', 'displayName',
    'player', 'forward', 'runBestEffortCombatPresentation', 'playerVisual',
    'clearHubCompanion',
    `'use strict';let activeCaptureAttempt=null,captureSequence=null,summonCooldownUntil=0,activeSummon=null,pendingSummon=null;const state={currentZone:'grass-meadow'};${bestEffortSource}${summonThrowSource};return{summonThrow,pending:()=>pendingSummon};`,
  )(
    summonInst,
    (_type, _end, callback) => { hitCallback = callback; return true; },
    () => false, () => summonInst, () => {}, () => 'Owned',
    { position: { clone() { return { y: 0, add() { return this; } }; } } },
    () => ({ multiplyScalar() { return this; } }), undefined,
    { play() {} }, () => {},
  );
  summonApi.summonThrow();
  assert.deepEqual(summonApi.pending(), { instanceId: 'owned-1' });
  assert.equal(hitCallback(), false);
  assert.equal(summonApi.pending(), null,
    'failed spawn settlement clears pendingSummon in the projectile callback finally path');
}

export function assertOwnedAiClosure(gameSource) {
  const debugSession = functionSource(gameSource, 'appendMonsterAiSessionTrace');
  const recordWild = functionSource(gameSource, 'recordWildAiTrace');
  const recordOwned = functionSource(gameSource, 'recordOwnedAiTrace');
  const cancelOwned = functionSource(gameSource, 'cancelOwnedAIAction');
  const clearWilds = functionSource(gameSource, 'clearWilds');
  const retireWild = functionSource(gameSource, 'retireWild');
  const resetWild = functionSource(gameSource, 'resetWild');
  const startBoss = functionSource(gameSource, 'startBossChallenge');
  const exitBoss = functionSource(gameSource, 'exitBossChallenge');
  const executeCapture = functionSource(gameSource, 'executeCaptureThrow');
  const summonThrow = functionSource(gameSource, 'summonThrow');
  const spawnOwned = functionSource(gameSource, 'spawnOwned');
  const updateProjectiles = functionSource(gameSource, 'updateProjectiles');
  const recall = functionSource(gameSource, 'recall');
  const faint = functionSource(gameSource, 'faintActive');
  const switchZone = functionSource(gameSource, 'switchZone');
  const updateOwned = functionSource(gameSource, 'updateOwned');
  const commitOwnedDamage = functionSource(gameSource, 'commitOwnedBasicDamage');
  const saveEnvelope = functionSource(gameSource, 'currentSaveEnvelope');

  assert.match(gameSource, /const MONSTER_AI_DEBUG=new URLSearchParams\(location\.search\)\.get\('debugAI'\)==='1'/);
  assert.match(gameSource, /const MONSTER_AI_SESSION_TRACE_LIMIT=160/);
  assert.match(gameSource, /const MONSTER_AI_SESSION_ACTOR_LIMIT=32/);
  assert.match(gameSource, /events:\[\],actors:\[\]/);
  assert.match(gameSource, /if\(monsterAiDebugSession\)globalThis\.__MONSTER_AI_DEBUG__=monsterAiDebugSession/);
  assert.match(debugSession, /events\.length>MONSTER_AI_SESSION_TRACE_LIMIT/);
  for (const traceSource of [recordWild, recordOwned]) {
    assert.match(traceSource, /actorId/);
    assert.match(traceSource, /fromState/);
    assert.match(traceSource, /toState/);
    assert.match(traceSource, /targetId/);
    assert.match(traceSource, /action/);
    assert.match(traceSource, /reason/);
    assert.match(traceSource, /time:timeSec/);
    assert.match(traceSource, /appendMonsterAiSessionTrace\(event\)/);
    assert.match(traceSource, /publishMonsterAiMetrics\(/);
  }
  assert.match(recordOwned, /metrics\.trace\.length>MONSTER_AI_TRACE_LIMIT/);
  assert.match(recordWild, /if\(decision\)\{metrics\.decisionCount\+\+/);
  assert.match(recordWild, /if\(reset\)metrics\.resetCount\+\+/);
  assert.match(cancelOwned, /a\.target=null;a\.aiDecision=null;a\.aiDecisionElapsed=0/);
  assert.match(clearWilds, /cancelOwnedAITarget\(w\?\.id,'zone_clear'\)/);
  assert.match(retireWild, /cancelOwnedAITarget\(w\?\.id,'actor_retired'\)/);
  assert.match(resetWild, /cancelOwnedAITarget\(w\.id,resetReason\)/);
  assert.match(startBoss, /cancelOwnedAIAction\(activeSummon,'boss_challenge_start'\)/);
  assert.match(exitBoss, /cancelOwnedAIAction\(activeSummon,'boss_challenge_exit'\)/);
  assert.ok(executeCapture.indexOf("cancelOwnedAITarget(t.id,'capture_started')")
    < executeCapture.indexOf('t.capturing=true'), 'capture cancels Owned decision before target freeze');
  assert.match(spawnOwned, /runtimeEpoch:\+\+summonRuntimeEpoch/);
  assert.match(summonThrow, /try\{spawned=spawnOwned\(inst,end\);\}finally\{pendingSummon=null;\}/);
  assert.ok(updateProjectiles.indexOf('p.onHit?.()') < updateProjectiles.indexOf("runBestEffortCombatPresentation(()=>spawnBurst(safeVec3(p.end)"),
    'summon arrival commits its callback before best-effort VFX');
  assert.ok(spawnOwned.indexOf('setupMonsterMotion(mesh,sp,inst)') < spawnOwned.indexOf('activeSummon=summon'),
    'Owned runtime publishes only after provisional scene setup succeeds');
  assert.match(spawnOwned, /catch\{if\(mesh\)try\{removeAndDispose\(scene,mesh\);\}catch\{\}return false;\}/);
  assert.match(recall, /cancelOwnedAIAction\(summon,'owned_recall'\)/);
  assert.match(recall, /cancelWildAITarget\(ownedWildAiTargetId\(summon\),'owned_recall'\)/);
  assert.ok(recall.indexOf('activeSummon=null') < recall.indexOf("playerVisual.play('recall'"),
    'recall retires the active runtime before presentation');
  assert.match(faint, /const summon=activeSummon,inst=summon\.inst,mesh=summon\.mesh/);
  assert.match(faint, /try\{cancelOwnedAIAction\(summon,'owned_fainted'\);\}catch\{\}/);
  assert.match(faint, /try\{cancelWildAITarget\(ownedWildAiTargetId\(summon\),'owned_fainted'\);\}catch\{\}/);
  const faintCleanup = faint.indexOf('activeSummon=null;pendingSummon=null;summonCooldownUntil=Date.now()+800');
  const faintSave = faint.indexOf('saveGame(false)');
  const faintPresentation = faint.indexOf('runBestEffortCombatPresentation(');
  assert.ok(faintCleanup >= 0 && faintCleanup < faintSave && faintSave < faintPresentation,
    'faint commits runtime retirement and persistence before best-effort presentation');
  assert.match(faint, /try\{removeSceneRole\('activeSummon'\);\}catch\{\}/);
  assert.match(faint, /try\{syncHubCompanion\(\);\}catch\{\}/);
  assert.match(faint, /try\{saveGame\(false\);\}catch\{\}/);
  assert.ok(switchZone.indexOf('zoneGeneration++') < switchZone.indexOf('recall(false,false)'),
    'zone generation retires old target identity before recall');
  assert.match(updateOwned, /decisionStarted=MONSTER_AI_DEBUG\?performance\.now\(\):0/);
  assert.match(updateOwned, /if\(!isEncounterStatusState\(a\.statusState\)\|\|a\.statusState\.ended\)\{cancelOwnedAIAction\(a,'invalid_status_context'\);return;\}/);
  assert.match(updateOwned, /recordOwnedAiTrace\(a,\{fromState:previousDecision/);
  assert.match(updateOwned, /cancelOwnedAIAction\(a,'runtime_revalidation_rejected'\)/);
  assert.match(updateOwned, /cancelOwnedAIAction\(a,'pre_damage_revalidation_rejected'\)/);
  assert.match(updateOwned, /decision\.action==='move'&&control\.ok&&control\.canMove/);
  assert.match(updateOwned, /decision\.action==='basic_attack'&&a\.attackCd<=0&&!a\.inst\.fainted&&a\.inst\.hp>0&&control\.ok&&control\.canAttack/);
  assert.doesNotMatch(updateOwned, /!control\.ok\|\|control\.canMove|!control\.ok\|\|control\.canAttack/);
  const cooldownCommit = updateOwned.indexOf('a.attackCd=OWNED_BASIC_AI_POLICY.basicAttackCooldownSec');
  const traceCommit = updateOwned.indexOf("reason:'runtime_commit'");
  const firstEffect = updateOwned.indexOf("triggerMonsterAction(a.mesh,'attack',0.22)");
  assert.ok(cooldownCommit >= 0 && cooldownCommit < traceCommit && traceCommit < firstEffect,
    'Owned Basic claims cooldown and trace before its first presentation/damage side effect');
  assert.doesNotMatch(saveEnvelope, /aiState|aiDebug|runtimeEpoch|lastCommittedAiActionToken|aiActionSequenceFloor|aiTelegraphEffect|aiTelegraphTargetId|aiTelegraphYOffset|monsterAiDebugSession/);
  assert.doesNotMatch(updateOwned, /useSkill\(|dispatchSkill\(|executeEquippedSkillCommand|currentUses|skillId/);
  assert.match(updateOwned, /commitOwnedBasicDamage\(liveTarget,res,basic\)/);
  assert.match(updateOwned, /sourceInstanceId:a\.inst\.instanceId/);
  const ownedBasicDamageCommit = updateOwned.indexOf('commitOwnedBasicDamage(liveTarget,res,basic)');
  const ownedBasicImpact = updateOwned.indexOf("spawnElementalFX(monsterTypes(a.inst)[0],ownedBasicAiImpactScratch,'impact',0.62)");
  assert.ok(ownedBasicDamageCommit >= 0 && ownedBasicDamageCommit < ownedBasicImpact,
    'Owned Basic impact VFX starts only after the live damage transaction returns committed');
  assert.match(commitOwnedDamage, /damageWild\(liveTarget,res\.damage,\{type:basic\.type,eff:res\.eff,deferDefeat:true,commitReceipt\}\)/);
  assert.match(commitOwnedDamage, /finally\{if\(commitReceipt\.committed\)/,
    'Owned Basic settlement observes the pre-presentation HP receipt');
  assert.match(commitOwnedDamage, /try\{logBattleEvent\('power',commitReceipt\.damage,true,liveTarget\.id,basic\.sourceInstanceId\);\}finally\{finalizePendingWildDefeat\(liveTarget,basic\.sourceInstanceId\);\}/);

  assertOwnedTargetEpochContract(gameSource);
  assertSessionTraceContract(gameSource);
  assertSessionMetricsContract(gameSource);
  assertWildDecisionMetricContract(gameSource);
  assertTraceFailureIsolation(gameSource);
  assertOwnedCancellationContract(gameSource);
  assertOwnedInvalidStatusFailsClosed(gameSource);
  assertOwnedBasicDamageTransaction(gameSource);
  assertOwnedBasicImpactPresentationTransaction(gameSource);
  assertFaintPresentationIsolation(gameSource);
  assertRecallPresentationIsolation(gameSource);
  assertOwnedStatusLethalPresentationIsolation(gameSource);
  assertWildTargetCancellationContract(gameSource);
  assertSummonProjectileSettlement(gameSource);
}

const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertOwnedAiClosure(gameSource);
  console.log('V8.10 AI-3 Owned AI lifecycle and debug trace: PASS');
}
