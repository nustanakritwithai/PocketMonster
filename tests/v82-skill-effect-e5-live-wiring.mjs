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
    if (parameterDepth === 0) { open = source.indexOf('{', index); break; }
  }
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

function assertRejectedDamageCommit(source) {
  const stableIdSource = functionSource(source, 'stableCombatIdCompare');
  const presentationSource = functionSource(source, 'runBestEffortCombatPresentation');
  const acceptedSource = functionSource(source, 'applyAcceptedSkillCommand');
  const mobilitySource = functionSource(source, 'applyPlannedMobilityEffects');
  const closureSource = functionSource(source, 'applyPlannedClosureEffects');
  const pendingDefeatSource = functionSource(source, 'finalizePendingWildDefeat');
  const committedDefeatsSource = functionSource(source, 'finalizeCommittedWildDefeats');
  const logCommittedSource = functionSource(source, 'logCommittedSkillTargetEvents');
  const settleTransactionSource = functionSource(source, 'settleCommittedSkillBattleTransaction');
  class TestVector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new TestVector3(this.x, this.y, this.z); }
    add(other) { this.x += other.x; this.y += other.y; this.z += other.z; return this; }
  }
  const resetStatus = Object.freeze({ encounterId: 'target', generation: 'reset' });
  const stalePlannedStatus = Object.freeze({ encounterId: 'target', generation: 'stale-plan' });
  const target = {
    id: 'target', hp: 50, dead: false, statusState: Object.freeze({ encounterId: 'target', generation: 'cast' }),
    mesh: { position: new TestVector3(4, 0, 0), rotation: { y: 0 } },
  };
  const actor = {
    inst: { instanceId: 'actor', hp: 40, maxHp: 100, bond: 2 },
    mesh: { position: new TestVector3(0, 0, 0), rotation: { y: 0 } },
    skillCds: [], aiDecision: { action: 'attack' },
  };
  const originalAiDecision = actor.aiDecision;
  const rejectedPlan = Object.freeze({
    ok: true, effectMode: 'rejected-live-damage-regression', rngDraws: 4,
    targetResults: Object.freeze([Object.freeze({
      targetId: 'target', hit: true, damage: 25,
      damageResult: Object.freeze({ typeMultiplier: 1, stab: 1.2, critical: false }),
      nextStatusState: stalePlannedStatus,
      statusResults: Object.freeze([Object.freeze({ statusId: 'ST_POISON', applied: true })]),
    })]),
    actorResult: Object.freeze({ kind: 'independent-actor-effect' }),
    fieldResult: Object.freeze({ kind: 'independent-field-effect' }),
    movementResult: Object.freeze({ applied: true, destination: Object.freeze({ x: 7, z: 0 }) }),
    displacementResults: Object.freeze([Object.freeze({ applied: true, destination: Object.freeze({ x: 9, z: 0 }) })]),
    healModifierResult: Object.freeze({ applied: true, healRatio: 0.3, predictedHp: 48, healing: 8 }),
    summonResult: Object.freeze({ applied: true, summonId: 'stale-swarm' }),
    hitCount: 1, totalDamage: 25, statusAppliedCount: 1,
  });
  let currentPlan = rejectedPlan;
  const messages = [];
  const training = [];
  let actorEffects = 0;
  let fieldEffects = 0;
  let healEffects = 0;
  let swarms = 0;
  let mastery = 0;
  let masteryResult = null;
  let bondClamps = 0;
  let damageAttempts = 0;
  let damageMode = 'reject';
  const postCommitDamageFailure = new Error('post-commit-damage-failure');
  const firstPresentationFailure = new Error('first-manual-skill-presentation-failure');
  let pendingFirstPresentationFailures = 0;
  let presentationHookAttempts = 0;
  let defeatObserverActor = null;
  const damageMetas = [];
  const defeatSnapshots = [];
  const bindings = {
    resolveReviewedSkillEffects: () => currentPlan,
    canonicalSkillEffectRequest: () => Object.freeze({}),
    playSFX: () => {
      presentationHookAttempts += 1;
      if (pendingFirstPresentationFailures > 0) {
        pendingFirstPresentationFailures -= 1;
        throw firstPresentationFailure;
      }
    },
    playerVisual: Object.freeze({ play: () => {} }),
    triggerMonsterAction: () => {}, spawnElementalFX: () => {}, spawnSkillTrail: () => {},
    spawnSkillSprite: () => {}, spawnGroundDecal: () => {}, spawnAreaWave: () => {}, triggerCameraShake: () => {},
    damageWild: (world, damage, meta) => {
      damageAttempts += 1;
      damageMetas.push(meta);
      if (damageMode === 'commit' || damageMode === 'throw-after-commit') {
        const hpBefore = world.hp;
        world.hp = Math.max(0, world.hp - damage);
        Object.assign(meta.commitReceipt, { committed: true, damage: hpBefore - world.hp });
        if (damageMode === 'throw-after-commit') throw postCommitDamageFailure;
        return true;
      }
      world.statusState = resetStatus;
      world.mesh.position.x = 0;
      world.mesh.position.z = 0;
      return false;
    },
    effectLabel: () => ['ปกติ'], displayName: () => 'Tester', TYPE_TH: Object.freeze({ Ghost: 'ผี' }),
    msg: value => messages.push(value),
    logBattleEvent: (category, amount, meaningful, targetId, sourceInstanceId) => training.push({ category, amount, meaningful, targetId, sourceInstanceId }),
    applyPlannedActorEffect: (_actor, _move, _result, contributionEvents) => {
      actorEffects += 1;
      contributionEvents.push({ category: 'defense', amount: 4, meaningful: true });
      return 0;
    },
    activateSkillField: () => { fieldEffects += 1; },
    activateSkillSwarm: () => { swarms += 1; },
    spawnDamageNumber: () => { healEffects += 1; }, spawnHealSkillEffect: () => { healEffects += 1; },
    clampSkillEffectDestination: destination => destination, fieldBlocksPosition: () => false,
    spawnBurst: () => {}, typeFx: () => Object.freeze({ core: 0, accent: 0 }),
    awardAcceptedSkillMastery: (_actor, _move, result) => { mastery += 1; masteryResult = result; },
    clamp: value => { bondClamps += 1; return value; }, renderParty: () => {}, renderSkillButtons: () => {},
    defeatWild: (world, ownerId) => {
      const events = training.filter(event => event.targetId === world.id && event.sourceInstanceId === ownerId);
      for (let index = training.length - 1; index >= 0; index -= 1) {
        if (training[index].targetId === world.id) training.splice(index, 1);
      }
      defeatSnapshots.push({
        id: world.id,
        tier: world.tier,
        ownerId,
        events,
        actorEffects,
        fieldEffects,
        actorHp: defeatObserverActor?.inst.hp,
        bond: defeatObserverActor?.inst.bond,
        mastery,
        swarms,
        statusState: world.statusState,
      });
      world.dead = true;
    },
    THREE: Object.freeze({ Vector3: TestVector3, MathUtils: Object.freeze({ clamp: value => value }) }),
  };
  const names = Object.keys(bindings);
  const execute = Function(...names, `${stableIdSource}\n${presentationSource}\n${pendingDefeatSource}\n${committedDefeatsSource}\n${logCommittedSource}\n${settleTransactionSource}\n${mobilitySource}\n${closureSource}\nreturn (${acceptedSource});`)(
    ...names.map(name => bindings[name]),
  );
  const receipt = execute(
    actor, 0, Object.freeze({ skillId: 'SK_GHOST_05', name: 'Soul Drain', type: 'Ghost', power: 42 }),
    Object.freeze({ targetKind: 'EnemyArea', targetPoint: Object.freeze({ x: 4, z: 0 }), radiusM: 3.5, startCooldownSec: 7 }),
    Object.freeze([Object.freeze({ world: target })]),
  );

  assert.equal(target.statusState, resetStatus, 'damage rejection must preserve the reset status state');
  assert.deepEqual({ x: target.mesh.position.x, z: target.mesh.position.z }, { x: 0, z: 0 },
    'damage rejection must preserve the reset position instead of replaying displacement');
  assert.deepEqual({ x: actor.mesh.position.x, z: actor.mesh.position.z }, { x: 0, z: 0 },
    'damage rejection must not replay planned actor movement');
  assert.equal(actor.aiDecision, originalAiDecision,
    'damage rejection must preserve the actor AI decision when movement does not commit');
  assert.equal(actor.inst.hp, 40, 'damage-derived LifeSteal cannot heal after damage rejection');
  assert.equal(healEffects, 0);
  assert.equal(swarms, 0, 'damage-derived swarm cannot activate after damage rejection');
  assert.equal(training.length, 0, 'rejected planned damage cannot create training events');
  assert.equal(actor.inst.bond, 2, 'rejected planned damage cannot grant bond');
  assert.equal(bondClamps, 0);
  assert.equal(mastery, 0, 'rejected planned damage cannot grant mastery');
  assert.equal(actorEffects, 1, 'independent actor effects remain eligible after target damage rejection');
  assert.equal(fieldEffects, 1, 'independent field effects remain eligible after target damage rejection');
  assert.deepEqual(
    { hitCount: receipt.hitCount, totalDamage: receipt.totalDamage, statusAppliedCount: receipt.statusAppliedCount,
      mobilityAppliedCount: receipt.mobilityAppliedCount, closureAppliedCount: receipt.closureAppliedCount },
    { hitCount: 0, totalDamage: 0, statusAppliedCount: 0, mobilityAppliedCount: 0, closureAppliedCount: 0 },
  );
  assert.match(messages.at(-1), /โดน 0\/1 ตัว • รวม 0 Damage/,
    'combat message must report the live commit receipt instead of planned totals');
  assert.doesNotMatch(messages.at(-1), /Status|\-25/);

  currentPlan = Object.freeze({
    ok: true, effectMode: 'canonical-miss-reward-regression', rngDraws: 1,
    targetResults: Object.freeze([Object.freeze({
      targetId: 'target', hit: false, damage: 0,
      damageResult: Object.freeze({ typeMultiplier: 1.5, stab: 1.2, critical: false }),
      nextStatusState: resetStatus, statusResults: Object.freeze([]),
    })]),
    actorResult: null, fieldResult: null,
    movementResult: Object.freeze({ applied: false, destination: Object.freeze({ x: 0, z: 0 }) }),
    displacementResults: Object.freeze([Object.freeze({ applied: false, destination: Object.freeze({ x: 0, z: 0 }) })]),
    healModifierResult: null, summonResult: null,
    hitCount: 0, totalDamage: 0, statusAppliedCount: 0,
  });
  const missActor = {
    inst: { instanceId: 'miss-actor', hp: 40, maxHp: 100, bond: 2 },
    mesh: { position: new TestVector3(0, 0, 0), rotation: { y: 0 } },
    skillCds: [], aiDecision: { action: 'attack' },
  };
  const missReceipt = execute(
    missActor, 0, Object.freeze({ skillId: 'SK_GHOST_05', name: 'Soul Drain', type: 'Ghost', power: 42 }),
    Object.freeze({ targetKind: 'EnemyArea', targetPoint: Object.freeze({ x: 4, z: 0 }), radiusM: 3.5, startCooldownSec: 7 }),
    Object.freeze([Object.freeze({ world: target })]),
  );
  assert.equal(damageAttempts, 1, 'canonical RNG miss does not attempt live damage');
  assert.deepEqual(
    { hitCount: missReceipt.hitCount, totalDamage: missReceipt.totalDamage, statusAppliedCount: missReceipt.statusAppliedCount },
    { hitCount: 0, totalDamage: 0, statusAppliedCount: 0 },
  );
  assert.equal(missActor.inst.bond, 2.3, 'accepted canonical RNG miss preserves the original bond reward');
  assert.equal(bondClamps, 1);
  assert.equal(mastery, 0, 'canonical RNG miss grants zero Skill EXP/mastery');
  assert.equal(masteryResult, null);
  assert.equal(training.length, 0, 'canonical RNG miss cannot create damage training events');

  const resilientStatus = Object.freeze({ encounterId: 'target', generation: 'presentation-resilient-status' });
  target.hp = 50;
  target.dead = false;
  target.statusState = resetStatus;
  target.mesh.position.x = 4;
  target.mesh.position.z = 0;
  currentPlan = Object.freeze({
    ok: true, effectMode: 'first-presentation-failure-regression', rngDraws: 3,
    targetResults: Object.freeze([Object.freeze({
      targetId: 'target', hit: true, damage: 20,
      damageResult: Object.freeze({ typeMultiplier: 1, stab: 1.2, critical: false }),
      nextStatusState: resilientStatus,
      statusResults: Object.freeze([Object.freeze({ statusId: 'ST_POISON', applied: true })]),
    })]),
    actorResult: Object.freeze({ kind: 'independent-actor-effect' }),
    fieldResult: Object.freeze({ kind: 'independent-field-effect' }),
    movementResult: Object.freeze({ applied: true, destination: Object.freeze({ x: 7, z: 0 }) }),
    displacementResults: Object.freeze([Object.freeze({ applied: true, destination: Object.freeze({ x: 9, z: 0 }) })]),
    healModifierResult: Object.freeze({ applied: true, healRatio: 0.3 }),
    summonResult: Object.freeze({ applied: true, summonId: 'presentation-resilient-swarm' }),
    hitCount: 1, totalDamage: 20, statusAppliedCount: 1,
  });
  const resilientActor = {
    inst: { instanceId: 'resilient-actor', hp: 40, maxHp: 100, bond: 2 },
    mesh: { position: new TestVector3(0, 0, 0), rotation: { y: 0 } },
    skillCds: [], aiDecision: { action: 'attack' },
  };
  damageMode = 'commit';
  pendingFirstPresentationFailures = 1;
  presentationHookAttempts = 0;
  actorEffects = 0; fieldEffects = 0; healEffects = 0; swarms = 0;
  mastery = 0; masteryResult = null; bondClamps = 0; training.splice(0);
  const resilientReceipt = execute(
    resilientActor, 0, Object.freeze({ skillId: 'SK_GHOST_05', name: 'Soul Drain', type: 'Ghost', power: 42 }),
    Object.freeze({ targetKind: 'EnemyArea', targetPoint: Object.freeze({ x: 4, z: 0 }), radiusM: 3.5, startCooldownSec: 7 }),
    Object.freeze([Object.freeze({ world: target })]),
  );
  assert.equal(presentationHookAttempts, 1,
    'the injected failure is the first accepted manual-skill presentation hook');
  assert.equal(pendingFirstPresentationFailures, 0);
  assert.deepEqual(
    { hitCount: resilientReceipt.hitCount, totalDamage: resilientReceipt.totalDamage,
      statusAppliedCount: resilientReceipt.statusAppliedCount,
      mobilityAppliedCount: resilientReceipt.mobilityAppliedCount,
      closureAppliedCount: resilientReceipt.closureAppliedCount },
    { hitCount: 1, totalDamage: 20, statusAppliedCount: 1, mobilityAppliedCount: 2, closureAppliedCount: 2 },
    'the first presentation throw cannot block accepted damage, status, mobility, or closure receipts');
  assert.equal(target.hp, 30, 'accepted damage still commits after the first presentation throw');
  assert.strictEqual(target.statusState, resilientStatus,
    'accepted survivor status still commits after the first presentation throw');
  assert.deepEqual({ x: resilientActor.mesh.position.x, z: resilientActor.mesh.position.z }, { x: 7, z: 0 });
  assert.equal(resilientActor.aiDecision, null);
  assert.deepEqual({ x: target.mesh.position.x, z: target.mesh.position.z }, { x: 9, z: 0 });
  assert.equal(actorEffects, 1, 'independent actor effects still commit');
  assert.equal(fieldEffects, 1, 'field activation still commits');
  assert.equal(resilientActor.inst.hp, 46, 'damage-derived closure healing still commits');
  assert.equal(healEffects, 2, 'closure presentation remains best-effort after its HP commit');
  assert.equal(swarms, 1, 'swarm activation still commits');
  assert.equal(resilientActor.inst.bond, 2.3);
  assert.equal(mastery, 1, 'accepted mastery still commits');
  assert.strictEqual(masteryResult?.damage, 20);
  assert.ok(training.some(event => event.category === 'power' && event.amount === 20));
  assert.ok(training.some(event => event.category === 'spirit' && event.amount === 6));

  const throwingTarget = {
    id: 'lethal-presentation-throw', tier: 'normal', hp: 3, dead: false, statusState: null,
    mesh: { position: new TestVector3(2, 0, 0), rotation: { y: 0 } },
  };
  currentPlan = Object.freeze({
    ok: true, effectMode: 'presentation-throw-regression', rngDraws: 1,
    targetResults: Object.freeze([Object.freeze({
      targetId: throwingTarget.id, hit: true, damage: 20,
      damageResult: Object.freeze({ typeMultiplier: 1, stab: 1.2, critical: false }),
      nextStatusState: null, statusResults: Object.freeze([]),
    })]),
    actorResult: null, fieldResult: null,
    movementResult: Object.freeze({ applied: false, destination: Object.freeze({ x: 0, z: 0 }) }),
    displacementResults: Object.freeze([Object.freeze({ applied: false, destination: Object.freeze({ x: 0, z: 0 }) })]),
    healModifierResult: null, summonResult: null,
    hitCount: 1, totalDamage: 20, statusAppliedCount: 0,
  });
  const throwingActor = {
    inst: { instanceId: 'throwing-actor', hp: 40, maxHp: 100, bond: 2 },
    mesh: { position: new TestVector3(0, 0, 0), rotation: { y: 0 } },
    skillCds: [], aiDecision: { action: 'attack' },
  };
  damageMode = 'throw-after-commit';
  defeatObserverActor = throwingActor;
  training.splice(0); defeatSnapshots.splice(0);
  assert.throws(() => execute(
    throwingActor, 0, Object.freeze({ skillId: 'SK_GHOST_05', name: 'Soul Drain', type: 'Ghost', power: 42 }),
    Object.freeze({ targetKind: 'EnemyArea', targetPoint: Object.freeze({ x: 2, z: 0 }), radiusM: 3.5, startCooldownSec: 7 }),
    Object.freeze([Object.freeze({ world: throwingTarget })]),
  ), error => error === postCommitDamageFailure);
  assert.equal(throwingTarget.dead, true,
    'a lethal HP commit is finalized even when the damage hook fails after committing HP');
  assert.deepEqual(defeatSnapshots[0].events, [
    { category: 'power', amount: 3, meaningful: true, targetId: throwingTarget.id, sourceInstanceId: 'throwing-actor' },
    { category: 'technique', amount: 42, meaningful: true, targetId: throwingTarget.id, sourceInstanceId: 'throwing-actor' },
  ], 'the pre-presentation HP receipt preserves exact lethal contribution accounting');
  assert.deepEqual(training, [], 'exceptional lethal contribution is consumed and cannot leak');

  const lethalStatusA = Object.freeze({ encounterId: 'lethal-a', generation: 'committed-status' });
  const lethalStatusB = Object.freeze({ encounterId: 'lethal-b', generation: 'committed-status' });
  const lethalTargets = [
    { id: 'lethal-a', tier: 'normal', hp: 5, dead: false, statusState: null,
      mesh: { position: new TestVector3(3, 0, 0), rotation: { y: 0 } } },
    { id: 'lethal-b', tier: 'boss', hp: 5, dead: false, statusState: null,
      mesh: { position: new TestVector3(4, 0, 0), rotation: { y: 0 } } },
  ];
  currentPlan = Object.freeze({
    ok: true, effectMode: 'deferred-multi-kill-regression', rngDraws: 2,
    targetResults: Object.freeze(lethalTargets.map((entry, index) => Object.freeze({
      targetId: entry.id, hit: true, damage: 20,
      damageResult: Object.freeze({ typeMultiplier: 1, stab: 1.2, critical: false }),
      nextStatusState: index === 0 ? lethalStatusA : lethalStatusB,
      statusResults: Object.freeze([Object.freeze({ statusId: 'ST_POISON', applied: true })]),
    }))),
    actorResult: Object.freeze({ kind: 'committed-actor-effect' }),
    fieldResult: Object.freeze({ kind: 'committed-field-effect' }),
    movementResult: Object.freeze({ applied: false, destination: Object.freeze({ x: 0, z: 0 }) }),
    displacementResults: Object.freeze(lethalTargets.map(() => Object.freeze({ applied: true, destination: Object.freeze({ x: 9, z: 0 }) }))),
    healModifierResult: Object.freeze({ applied: true, healRatio: 0.3 }),
    summonResult: Object.freeze({ applied: true, summonId: 'committed-swarm' }),
    hitCount: 2, totalDamage: 40, statusAppliedCount: 2,
  });
  const lethalActor = {
    inst: { instanceId: 'lethal-actor', hp: 40, maxHp: 100, bond: 2 },
    mesh: { position: new TestVector3(0, 0, 0), rotation: { y: 0 } },
    skillCds: [], aiDecision: { action: 'attack' },
  };
  damageMode = 'commit';
  defeatObserverActor = lethalActor;
  actorEffects = 0; fieldEffects = 0; healEffects = 0; swarms = 0;
  mastery = 0; masteryResult = null; bondClamps = 0; training.splice(0); defeatSnapshots.splice(0);
  const lethalReceipt = execute(
    lethalActor, 0, Object.freeze({ skillId: 'SK_GHOST_05', name: 'Soul Drain', type: 'Ghost', power: 42 }),
    Object.freeze({ targetKind: 'EnemyArea', targetPoint: Object.freeze({ x: 3, z: 0 }), radiusM: 3.5, startCooldownSec: 7 }),
    Object.freeze(lethalTargets.map(world => Object.freeze({ world }))),
  );
  assert.deepEqual(
    { hitCount: lethalReceipt.hitCount, totalDamage: lethalReceipt.totalDamage,
      statusAppliedCount: lethalReceipt.statusAppliedCount, mobilityAppliedCount: lethalReceipt.mobilityAppliedCount,
      closureAppliedCount: lethalReceipt.closureAppliedCount },
    { hitCount: 2, totalDamage: 10, statusAppliedCount: 0, mobilityAppliedCount: 0, closureAppliedCount: 2 },
    'manual killing receipt uses actual overkill-clamped damage and committed effects');
  assert.deepEqual(lethalTargets.map(entry => ({ x: entry.mesh.position.x, z: entry.mesh.position.z })), [
    { x: 3, z: 0 }, { x: 4, z: 0 },
  ], 'pending-defeat targets cannot receive stale survivor-only displacement');
  assert.deepEqual(defeatSnapshots.map(snapshot => snapshot.id), ['lethal-a', 'lethal-b'],
    'multi-kill finalization preserves canonical command target order');
  assert.deepEqual(defeatSnapshots.map(snapshot => snapshot.ownerId), ['lethal-actor', 'lethal-actor']);
  assert.deepEqual(defeatSnapshots[0].events, [
    { category: 'power', amount: 5, meaningful: true, targetId: 'lethal-a', sourceInstanceId: 'lethal-actor' },
    { category: 'technique', amount: 21, meaningful: true, targetId: 'lethal-a', sourceInstanceId: 'lethal-actor' },
    { category: 'defense', amount: 2, meaningful: true, targetId: 'lethal-a', sourceInstanceId: 'lethal-actor' },
    { category: 'spirit', amount: 1.5, meaningful: true, targetId: 'lethal-a', sourceInstanceId: 'lethal-actor' },
  ], 'each lethal target receives only its scoped share of actual cast contribution');
  assert.deepEqual(defeatSnapshots[1].events, [
    { category: 'power', amount: 5, meaningful: true, targetId: 'lethal-b', sourceInstanceId: 'lethal-actor' },
    { category: 'technique', amount: 21, meaningful: true, targetId: 'lethal-b', sourceInstanceId: 'lethal-actor' },
    { category: 'defense', amount: 2, meaningful: true, targetId: 'lethal-b', sourceInstanceId: 'lethal-actor' },
    { category: 'spirit', amount: 1.5, meaningful: true, targetId: 'lethal-b', sourceInstanceId: 'lethal-actor' },
  ], 'area technique and actor/closure contribution split without duplicating the cast budget');
  assert.deepEqual(training, [], 'the killing contribution is consumed and cannot leak to a later victory');
  assert.deepEqual(defeatSnapshots.map(snapshot => ({
    actorEffects: snapshot.actorEffects, fieldEffects: snapshot.fieldEffects, actorHp: snapshot.actorHp,
    bond: snapshot.bond, mastery: snapshot.mastery, swarms: snapshot.swarms,
  })), [
    { actorEffects: 1, fieldEffects: 1, actorHp: 43, bond: 2.3, mastery: 1, swarms: 1 },
    { actorEffects: 1, fieldEffects: 1, actorHp: 43, bond: 2.3, mastery: 1, swarms: 1 },
  ], 'defeat/save runs only after actor, field, closure, bond, and mastery mutations commit');
  assert.equal(defeatSnapshots[0].statusState, null,
    'pending-defeat targets cannot receive stale survivor-only status state');
  assert.equal(defeatSnapshots[1].statusState, null);
  assert.deepEqual(lethalTargets.map(entry => entry.dead), [true, true]);
  for (const meta of damageMetas.slice(-2)) assert.equal(meta.deferDefeat, true);

  const forwardRewardOrder = defeatSnapshots.map(snapshot => ({
    id: snapshot.id, tier: snapshot.tier, ownerId: snapshot.ownerId, events: snapshot.events,
  }));
  const reversedTargets = [
    { id: 'lethal-b', tier: 'boss', hp: 5, dead: false, statusState: null,
      mesh: { position: new TestVector3(4, 0, 0), rotation: { y: 0 } } },
    { id: 'lethal-a', tier: 'normal', hp: 5, dead: false, statusState: null,
      mesh: { position: new TestVector3(3, 0, 0), rotation: { y: 0 } } },
  ];
  currentPlan = Object.freeze({
    ...currentPlan,
    targetResults: Object.freeze([...currentPlan.targetResults].reverse()),
    displacementResults: Object.freeze([...currentPlan.displacementResults].reverse()),
  });
  const reversedActor = {
    inst: { instanceId: 'lethal-actor', hp: 40, maxHp: 100, bond: 2 },
    mesh: { position: new TestVector3(0, 0, 0), rotation: { y: 0 } },
    skillCds: [], aiDecision: { action: 'attack' },
  };
  defeatObserverActor = reversedActor;
  actorEffects = 0; fieldEffects = 0; healEffects = 0; swarms = 0;
  mastery = 0; masteryResult = null; bondClamps = 0; training.splice(0); defeatSnapshots.splice(0);
  execute(
    reversedActor, 0, Object.freeze({ skillId: 'SK_GHOST_05', name: 'Soul Drain', type: 'Ghost', power: 42 }),
    Object.freeze({ targetKind: 'EnemyArea', targetPoint: Object.freeze({ x: 3, z: 0 }), radiusM: 3.5, startCooldownSec: 7 }),
    Object.freeze(reversedTargets.map(world => Object.freeze({ world }))),
  );
  assert.deepEqual(defeatSnapshots.map(snapshot => ({
    id: snapshot.id, tier: snapshot.tier, ownerId: snapshot.ownerId, events: snapshot.events,
  })), forwardRewardOrder,
  'swapping normal/Boss area target order preserves stable defeat order and identical scoped reward inputs');
  assert.deepEqual(training, []);
}

function assertScopedBattleLedger(source) {
  const targetIdSource = functionSource(source, 'battleEventTargetId');
  const ownerIdSource = functionSource(source, 'battleEventSourceInstanceId');
  const logSource = functionSource(source, 'logBattleEvent');
  const consumeSource = functionSource(source, 'consumeBattleEventsForTarget');
  const discardTargetSource = functionSource(source, 'discardBattleEventsForTarget');
  const discardOwnerSource = functionSource(source, 'discardBattleEventsForSource');
  const pendingSource = functionSource(source, 'finalizePendingWildDefeat');
  const attributedDamageSource = functionSource(source, 'commitAttributedWildDamage');
  const ledger = [];
  const api = Function(
    'battleEventLog', 'TRAINING_LINES',
    `'use strict';${targetIdSource}${ownerIdSource}${logSource}${consumeSource}${discardTargetSource}${discardOwnerSource};return {logBattleEvent,consumeBattleEventsForTarget,discardBattleEventsForTarget,discardBattleEventsForSource};`,
  )(ledger, ['power', 'defense', 'speed', 'technique', 'spirit']);
  api.logBattleEvent('power', 7, true, 'wild-shared', 'owner-a');
  api.logBattleEvent('power', 5, true, 'wild-shared', 'owner-b');
  api.logBattleEvent('technique', 3, true, 'wild-other', 'owner-a');
  api.logBattleEvent('spirit', 99, true, null, 'owner-a');
  api.logBattleEvent('spirit', 88, true, 'wild-shared', null);
  assert.equal(ledger.length, 3, 'reward ledger rejects every event missing target or contributor scope');
  assert.deepEqual(api.consumeBattleEventsForTarget('wild-shared', 'owner-b'), [
    { category: 'power', amount: 5, meaningful: true, targetId: 'wild-shared', sourceInstanceId: 'owner-b' },
  ], 'owner B cannot consume owner A contribution after a switch');
  assert.deepEqual(ledger.map(event => [event.targetId, event.sourceInstanceId]), [
    ['wild-shared', 'owner-a'], ['wild-other', 'owner-a'],
  ], 'exact owner consumption leaves the other contributor ledger intact');
  assert.equal(api.discardBattleEventsForSource('owner-a'), 2, 'recall/faint discards only the old contributor ledger');
  assert.deepEqual(ledger, []);
  api.logBattleEvent('power', 4, true, 'wild-field', 'owner-a');
  assert.deepEqual(api.consumeBattleEventsForTarget('wild-field', 'owner-a').map(event => event.amount), [4],
    'a persistent field may create a new owner-A event after recall cleanup');

  const attributedLedger = [];
  const defeatSnapshots = [];
  let throwAttributedPresentation = false;
  const attributedPresentationFailure = new Error('attributed-presentation-failure');
  const commit = Function(
    'battleEventLog', 'TRAINING_LINES', 'damageWild', 'defeatWild',
    `'use strict';${logSource}${pendingSource}${attributedDamageSource};return commitAttributedWildDamage;`,
  )(
    attributedLedger,
    ['power', 'defense', 'speed', 'technique', 'spirit'],
    (target, damage, meta) => {
      assert.equal(meta.deferDefeat, true);
      const hpBefore = target.hp;
      target.hp = Math.max(0, target.hp - damage);
      Object.assign(meta.commitReceipt, { committed: true, damage: hpBefore - target.hp });
      if (throwAttributedPresentation) throw attributedPresentationFailure;
      return true;
    },
    (target, ownerId) => { defeatSnapshots.push({ ownerId, events: attributedLedger.splice(0) }); target.dead = true; },
  );
  const fieldTarget = { id: 'wild-field-kill', hp: 3, dead: false };
  assert.equal(commit(fieldTarget, 9, { type: 'Fire', eff: 1 }, 'owner-a'), true);
  assert.equal(fieldTarget.dead, true);
  assert.deepEqual(defeatSnapshots, [{ ownerId: 'owner-a', events: [
    { category: 'power', amount: 3, meaningful: true, targetId: 'wild-field-kill', sourceInstanceId: 'owner-a' },
  ] }], 'persistent field killing damage rewards its cast owner, not the current summon');
  throwAttributedPresentation = true;
  const throwingFieldTarget = { id: 'wild-field-throw', hp: 2, dead: false };
  assert.throws(() => commit(throwingFieldTarget, 9, { type: 'Fire', eff: 1 }, 'owner-a'),
    error => error === attributedPresentationFailure);
  assert.equal(throwingFieldTarget.dead, true,
    'field/swarm killing damage finalizes from its HP receipt when presentation throws');
  assert.deepEqual(defeatSnapshots.at(-1), { ownerId: 'owner-a', events: [
    { category: 'power', amount: 2, meaningful: true, targetId: 'wild-field-throw', sourceInstanceId: 'owner-a' },
  ] });
  throwAttributedPresentation = false;
  const unknownOwnerTarget = { id: 'wild-unknown-owner', hp: 1, dead: false };
  commit(unknownOwnerTarget, 2, { type: 'Fire', eff: 1 }, null);
  assert.deepEqual(defeatSnapshots.at(-1), { ownerId: null, events: [] },
    'missing field/status ownership fails closed instead of falling back to the active summon');
}

function assertStableSwarmTargeting(source) {
  const stableIdSource = functionSource(source, 'stableCombatIdCompare');
  const presentationSource = functionSource(source, 'runBestEffortCombatPresentation');
  const updateSource = functionSource(source, 'updateSkillSwarms');
  class TestVector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new TestVector3(this.x, this.y, this.z); }
    add(other) { this.x += other.x; this.y += other.y; this.z += other.z; return this; }
  }
  const liveSkillSwarms = [];
  const wilds = [];
  const committedTargetIds = [];
  const api = Function(
    'liveSkillSwarms', 'wilds', 'distXZ', 'canCombatTargetWild', 'wildTypes',
    'resolveWorkbookDirectDamage', 'commitAttributedWildDamage', 'spawnElementalFX', 'THREE',
    `'use strict';${stableIdSource}${presentationSource}${updateSource};return {stableCombatIdCompare,updateSkillSwarms};`,
  )(
    liveSkillSwarms,
    wilds,
    (left, right) => Math.hypot(left.x - right.x, left.z - right.z),
    () => true,
    () => ['Normal'],
    () => Object.freeze({ ok: true, hit: true, damage: 10, typeMultiplier: 1 }),
    target => { committedTargetIds.push(target.id); return true; },
    () => {},
    Object.freeze({ Vector3: TestVector3 }),
  );
  assert.equal(api.stableCombatIdCompare('wild-Z', 'wild-a'), -1,
    'stable combat IDs use code-unit order instead of host locale collation');
  const candidate = id => ({
    id, dead: false, capturing: false, level: 5, hp: 20, maxHp: 20, def: 10, spDef: 10,
    statusState: { currentTimeSec: 0 }, mesh: { position: new TestVector3(1, 0, 0) },
  });
  const runOrder = ids => {
    liveSkillSwarms.length = 0;
    wilds.splice(0, wilds.length, ...ids.map(candidate));
    committedTargetIds.length = 0;
    liveSkillSwarms.push({
      skillId: 'SK_BUG_06', center: Object.freeze({ x: 0, z: 0 }), radiusM: 3,
      ageSec: 0, nextTickSec: 1.5, durationSec: 6, tickIntervalSec: 1.5, tickDamageRatio: 0.15,
      attacker: Object.freeze({ id: 'owner-a' }), attackerNowSec: 0, runtimeType: 'Bug',
    });
    api.updateSkillSwarms(1.5);
    return [...committedTargetIds];
  };
  assert.deepEqual(runOrder(['wild-a', 'wild-Z']), ['wild-Z']);
  assert.deepEqual(runOrder(['wild-Z', 'wild-a']), ['wild-Z'],
    'reversing equal-distance wild input preserves the stable-ID swarm target');
}

function assertFailedCapturePreservesBattleLedger(source) {
  const executeCapture = functionSource(source, 'executeCaptureThrow');
  const finishCaptureFail = functionSource(source, 'finishCaptureFail');
  const retireWild = functionSource(source, 'retireWild');
  assert.doesNotMatch(executeCapture, /discardBattleEventsForTarget/,
    'capture start pauses the encounter without erasing committed contribution');
  assert.doesNotMatch(finishCaptureFail, /discardBattleEventsForTarget/,
    'failed capture resumes the same encounter ledger');
  assert.match(retireWild, /discardBattleEventsForTarget\(w\?\.id\)/,
    'successful capture retirement still discards the retired target ledger');

  const targetIdSource = functionSource(source, 'battleEventTargetId');
  const ownerIdSource = functionSource(source, 'battleEventSourceInstanceId');
  const logSource = functionSource(source, 'logBattleEvent');
  const consumeSource = functionSource(source, 'consumeBattleEventsForTarget');
  const presentationSource = functionSource(source, 'runBestEffortCombatPresentation');
  const ledger = [];
  const api = Function(
    'battleEventLog', 'TRAINING_LINES',
    `'use strict';${targetIdSource}${ownerIdSource}${logSource}${consumeSource};return {logBattleEvent,consumeBattleEventsForTarget};`,
  )(ledger, ['power', 'defense', 'speed', 'technique', 'spirit']);
  const wild = {
    id: 'capture-fail-target', dead: false, capturing: true, engaged: true,
    aiState: { state: 'wander' },
    mesh: { visible: false, position: { x: 0, z: 0, copy(pos) { this.x = pos.x; this.z = pos.z; } }, rotation: { z: 1 } },
  };
  api.logBattleEvent('power', 4, true, wild.id, 'owner-a');
  const fail = Function(
    'playSFX', 'spawnCaptureResultEffect', 'removeAndDispose', 'scene', 'cancelWildAIAction',
    'msg', 'renderHUD', 'saveGame',
    `'use strict';${presentationSource}${finishCaptureFail};return finishCaptureFail;`,
  )(
    () => {}, () => {}, () => {}, {}, actor => { actor.aiState = { state: 'wander' }; return true; },
    () => {}, () => {}, () => {},
  );
  fail({
    wild, ballMesh: null, pos: { x: 0, z: 0 }, resolution: { reason: 'capture_failed' },
    name: 'Wild', chance: 0.5,
  });
  assert.equal(wild.capturing, false);
  assert.equal(wild.engaged, true);
  assert.deepEqual(ledger.map(event => event.amount), [4],
    'damage contribution before a failed capture remains in the encounter');
  api.logBattleEvent('power', 6, true, wild.id, 'owner-a');
  const resumedEvents = api.consumeBattleEventsForTarget(wild.id, 'owner-a');
  assert.deepEqual(resumedEvents.map(event => event.amount), [4, 6]);
  assert.equal(resumedEvents.reduce((sum, event) => sum + event.amount, 0), 10,
    'damage before and after failed capture matches the no-capture encounter baseline');
}

export function assertE5LiveWiring(source) {
  const accepted = functionSource(source, 'applyAcceptedSkillCommand');
  const closure = functionSource(source, 'applyPlannedClosureEffects');
  const activate = functionSource(source, 'activateSkillSwarm');
  const update = functionSource(source, 'updateSkillSwarms');
  const switchZone = functionSource(source, 'switchZone');
  const recall = functionSource(source, 'recall');
  const faint = functionSource(source, 'faintActive');
  const loop = functionSource(source, 'loop');
  const fieldUpdate = functionSource(source, 'updateSkillFields');
  const swarmUpdate = functionSource(source, 'updateSkillSwarms');
  const defeat = functionSource(source, 'defeatWild');
  const logEvent = functionSource(source, 'logBattleEvent');
  assertStableSwarmTargeting(source);

  const planAt = accepted.indexOf('const planned=resolveReviewedSkillEffects(');
  const cooldownAt = accepted.indexOf('a.skillCds[index]=command.startCooldownSec;');
  const closureAt = accepted.indexOf('applyPlannedClosureEffects(a,move,planned.healModifierResult,planned.summonResult,actualTotalDamage,effectRequest.attacker,effectRequest.nowSec,contributionEvents)');
  assert.ok(planAt >= 0 && cooldownAt > planAt && closureAt > cooldownAt,
    'closure effects plan before the sole cooldown commit and mutate only after acceptance');
  assert.equal((accepted.match(/a\.skillCds\[index\]=command\.startCooldownSec/g) ?? []).length, 1);
  assert.match(accepted, /closureAppliedCount/);

  assert.match(closure, /if\(!\(committedDamage>0\)\)return appliedCount/,
    'damage-derived closure requires at least one live committed damage point');
  assert.match(closure, /requestedHealing=Math\.max\(1,Math\.round\(committedDamage\*healModifierResult\.healRatio\)\)/,
    'LifeSteal recomputes healing from live committed damage');
  assert.match(closure, /a\.inst\.hp\+=healing/);
  assert.match(closure, /label:'DRAIN'/);
  assert.match(closure, /activateSkillSwarm\(a,move,summonResult,attackerSnapshot,attackerNowSec\)/);
  assert.doesNotMatch(closure, /executeEquippedSkillCommand|consumeSkillUse|skillCds|currentUses/);

  assert.match(source, /const liveSkillSwarms=\[\]/);
  assert.match(activate, /nextTickSec:summonResult\.tickIntervalSec/);
  assert.match(activate, /attacker:attackerSnapshot/,
    'summon stores the cast-time canonical attacker snapshot');
  assert.match(activate, /attackerNowSec/);
  assert.match(update, /for\(let wildIndex=0;wildIndex<wilds\.length;wildIndex\+\+\)/,
    'summon targeting reuses the live array without a per-tick clone');
  assert.doesNotMatch(update, /\[\.\.\.wilds\]/);
  assert.match(update, /distance>swarm\.radiusM\|\|distance>nearestDistance/);
  assert.match(update, /stableCombatIdCompare\(candidate\.id,target\.id\)>=0/,
    'equal-distance swarm targets use locale-independent stable-ID tie-breaking');
  assert.match(update, /resolveWorkbookDirectDamage\(\{skillId:swarm\.skillId/);
  assert.match(update, /Math\.round\(resolved\.damage\*swarm\.tickDamageRatio\)/);
  assert.match(update, /swarm\.nextTickSec\+=swarm\.tickIntervalSec/);
  assert.doesNotMatch(update, /executeEquippedSkillCommand|consumeSkillUse|skillCds|currentUses/,
    'summon ticks cannot recommit Uses or Cooldown');

  assert.match(switchZone, /clearSkillSwarms\(\)/);
  assert.match(recall, /clearSkillSwarms\(\)/);
  assert.match(faint, /clearSkillSwarms\(\)/);
  assert.match(loop, /updateSkillSwarms\(dt\)/);
  assert.match(fieldUpdate, /commitAttributedWildDamage\(w,damage,\{type:field\.runtimeType,eff:resolved\.typeMultiplier\?\?1,statusDamage:true\},field\.attacker\?\.id\?\?null\)/);
  assert.match(swarmUpdate, /commitAttributedWildDamage\(target,damage,\{type:swarm\.runtimeType,eff:resolved\.typeMultiplier\?\?1,statusDamage:true\},swarm\.attacker\?\.id\?\?null\)/);
  assert.match(recall, /discardBattleEventsForSource\(inst\.instanceId\)/,
    'Recall discards the snapshot-local contributor before activeSummon is released');
  assert.match(faint, /discardBattleEventsForSource\(inst\.instanceId\)/);
  assert.match(defeat, /rewardInst=rewardOwnerId\?getInst\(rewardOwnerId\):null/);
  assert.match(defeat, /consumeBattleEventsForTarget\(w\.id,rewardOwnerId\)/);
  assert.match(defeat, /discardBattleEventsForTarget\(w\.id\)/);
  assert.match(logEvent, /typeof targetId==='string'&&targetId&&typeof sourceInstanceId==='string'&&sourceInstanceId/);
  assert.match(accepted, /hitCount:actualHitCount,totalDamage:actualTotalDamage,statusAppliedCount:actualStatusAppliedCount/,
    'accepted receipt exposes live committed totals');
  assert.match(accepted, /if\(!requiresTargetDamage\|\|planned\.hitCount===0\|\|actualHitCount>0\)a\.inst\.bond=/,
    'canonical misses keep accepted bond while rejected planned hits grant none');
  assert.match(accepted, /if\(!requiresTargetDamage\|\|actualHitCount>0\)awardAcceptedSkillMastery/,
    'target skills require an actual live hit before granting Skill EXP/mastery');
  assertRejectedDamageCommit(source);
  assertScopedBattleLedger(source);
  assertFailedCapturePreservesBattleLedger(source);
}

const source = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertE5LiveWiring(source);
  console.log('V8.2 E5 live SummonSwarm/LifeSteal wiring: PASS');
}
