import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeEquippedSkillCommand } from '../skill-command-runtime.mjs';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import { SKILL_EFFECT_COVERAGE_CONTRACT } from '../skill-effect-contract.mjs';
import * as currentRuntime from '../skill-effect-runtime.mjs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';

function sequence(...values) {
  let index = 0;
  return () => values[index++];
}

function combatActor(skill, id = `actor:${skill.id}`, overrides = {}) {
  return {
    id, level: 30, types: [skill.runtimeType], position: { x: 0, z: 0 }, stats: { ATK: 100, SPATK: 100 },
    hp: 8000, maxHp: 10000, statusState: createEncounterStatusState({ encounterId: id, nowSec: 0 }),
    critChancePct: 5, ...overrides,
  };
}

function combatTarget(id, position, overrides = {}) {
  return {
    id, alive: true, targetable: true, level: 30, types: ['Normal'], position,
    stats: { DEF: 100, SPDEF: 100 }, hp: 10000, maxHp: 10000,
    statusState: createEncounterStatusState({ encounterId: id, nowSec: 0 }), nowSec: 0, ...overrides,
  };
}

function manualCommand(skill, targets, overrides = {}) {
  return {
    ok: true, commandId: `cast:${skill.id}`, castId: `cast:${skill.id}`, skillId: skill.id, targetKind: skill.targetType,
    targetIds: targets.map(target => target.id), targetPoint: { x: 1, z: 0 }, rangeM: 8,
    radiusM: skill.targetType === 'EnemyArea' ? 3.5 : 0, ...overrides,
  };
}

function directHitResults(targets, damage = 100) {
  return targets.map(target => ({ targetId: target.id, hit: true, damage, fainted: false }));
}

function assertResidualClosure(runtime) {
  assert.deepEqual(runtime.E5_READY_SKILL_IDS, ['SK_BUG_06', 'SK_GHOST_05']);
  assert.equal(runtime.canExecuteE5SkillEffect('SK_BUG_06'), true);
  assert.equal(runtime.canExecuteE5SkillEffect('SK_GHOST_05'), true);
  assert.equal(runtime.canExecuteE5SkillEffect('SK_FIRE_01'), false);
  assert.equal(runtime.E5_CLOSURE_EFFECT_POLICY.lifeStealDamageRatio, 0.3);
  assert.equal(runtime.E5_CLOSURE_EFFECT_POLICY.summonCount, 3);
  assert.equal(runtime.E5_CLOSURE_EFFECT_POLICY.summonDurationSec, 6);
  assert.equal(runtime.E5_CLOSURE_EFFECT_POLICY.summonTickIntervalSec, 1.5);
  assert.equal(runtime.E5_CLOSURE_EFFECT_POLICY.summonTickDamageRatio, 0.15);
  assert.equal(runtime.E5_CLOSURE_EFFECT_POLICY.magnitudeSource,
    'runtime_fallback_workbook_mechanic_without_heal_or_summon_magnitude');

  const bug = SKILL_CATALOG.find(skill => skill.id === 'SK_BUG_06');
  const bugTargets = [combatTarget('bug-a', { x: 1, z: 0 }), combatTarget('bug-b', { x: 1.5, z: 0 })];
  const bugResult = runtime.resolveE5SkillEffects({
    command: manualCommand(bug, bugTargets), attacker: combatActor(bug), targets: bugTargets,
    hitResults: directHitResults(bugTargets),
  }, { rng: sequence(0.49) });
  assert.equal(bugResult.ok, true);
  assert.deepEqual(bugResult.summonResult, {
    summonId: 'swarm:cast:SK_BUG_06', skillId: 'SK_BUG_06', actorId: 'actor:SK_BUG_06', kind: 'summon',
    center: { x: 1, z: 0 }, radiusM: 3.5, summonCount: 3, durationSec: 6, tickIntervalSec: 1.5,
    tickDamageRatio: 0.15, effectChancePct: 50, effectRoll: 0.49, applied: true, reason: null,
  });
  const bugFailed = runtime.resolveE5SkillEffects({
    command: manualCommand(bug, bugTargets), attacker: combatActor(bug), targets: bugTargets,
    hitResults: directHitResults(bugTargets),
  }, { rng: sequence(0.5) });
  assert.equal(bugFailed.summonResult.applied, false);
  assert.equal(bugFailed.summonResult.reason, 'effect_roll_failed');

  const ghost = SKILL_CATALOG.find(skill => skill.id === 'SK_GHOST_05');
  const ghostTarget = combatTarget('ghost-target', { x: 1, z: 0 });
  const ghostActor = combatActor(ghost, 'ghost-actor', { hp: 100, maxHp: 200 });
  const drain = runtime.resolveE5SkillEffects({
    command: manualCommand(ghost, [ghostTarget]), attacker: ghostActor, targets: [ghostTarget],
    hitResults: directHitResults([ghostTarget]),
  }, { rng: sequence(0.34) });
  assert.deepEqual(drain.healModifierResult, {
    skillId: 'SK_GHOST_05', actorId: 'ghost-actor', kind: 'heal_modifier', damageBasis: 100, healRatio: 0.3,
    requestedHealing: 30, healing: 30, predictedHp: 130, effectChancePct: 35, effectRoll: 0.34,
    applied: true, reason: null,
  });
  const overkillTarget = combatTarget('overkill', { x: 1, z: 0 }, { hp: 10, maxHp: 100 });
  const overkill = runtime.resolveE5SkillEffects({
    command: manualCommand(ghost, [overkillTarget]), attacker: ghostActor, targets: [overkillTarget],
    hitResults: directHitResults([overkillTarget], 100),
  }, { rng: sequence(0) });
  assert.equal(overkill.healModifierResult.damageBasis, 10);
  assert.equal(overkill.healModifierResult.healing, 3, 'life steal uses actual capped damage instead of overkill damage');
  const fullHealth = runtime.resolveE5SkillEffects({
    command: manualCommand(ghost, [ghostTarget]), attacker: combatActor(ghost, 'full', { hp: 200, maxHp: 200 }),
    targets: [ghostTarget], hitResults: directHitResults([ghostTarget]),
  }, { rng: sequence(0) });
  assert.equal(fullHealth.healModifierResult.applied, false);
  assert.equal(fullHealth.healModifierResult.reason, 'already_full_health');
  const noDamage = runtime.resolveE5SkillEffects({
    command: manualCommand(ghost, [ghostTarget]), attacker: ghostActor, targets: [ghostTarget],
    hitResults: directHitResults([ghostTarget], 0),
  });
  assert.equal(noDamage.healModifierResult.reason, 'no_damage');
  assert.equal(noDamage.rngDraws, 0);
}

function receiptForComponent(application, component, command) {
  if (['direct_damage', 'attack_modifier', 'damage_modifier', 'damage_shape'].includes(component.kind)) {
    return application.targetResults.length === command.targetIds.length;
  }
  if (component.kind === 'status') {
    if (component.targetChannel === 'actor') return Array.isArray(application.actorResult?.statusResults);
    return application.targetResults.length === command.targetIds.length
      && application.targetResults.every(target => Array.isArray(target.statusResults));
  }
  if (component.kind === 'self_heal') return application.actorResult?.requestedHealing > 0;
  if (component.kind === 'field') return application.fieldResult?.kind === 'wall' || application.fieldResult?.kind === 'hazard';
  if (component.kind === 'movement') return application.movementResult?.kind === 'movement';
  if (component.kind === 'displacement') return application.displacementResults.length === command.targetIds.length;
  if (component.kind === 'summon') return application.summonResult?.kind === 'summon';
  if (component.kind === 'heal_modifier') return application.healModifierResult?.kind === 'heal_modifier'
    && application.healing === application.healModifierResult.healing;
  return false;
}

export function assertSkillEffectClosure(runtime, { gameSource, packageJson } = {}) {
  assertResidualClosure(runtime);
  assert.equal(SKILL_CATALOG.length, 108);
  assert.equal(SKILL_EFFECT_COVERAGE_CONTRACT.length, 108);
  assert.equal(new Set(SKILL_CATALOG.map(skill => skill.id)).size, 108);
  const rowsById = new Map(SKILL_EFFECT_COVERAGE_CONTRACT.map(row => [row.skillId, row]));
  const componentCounts = new Map();
  let totalEffectCommits = 0;
  let totalCooldownCommits = 0;

  for (const skill of SKILL_CATALOG) {
    assert.equal(runtime.canExecuteReviewedSkillEffect(skill.id), true, `${skill.id} must not be not_ready`);
    const instanceId = `closure:${skill.id}`;
    const instance = {
      instanceId,
      skills: [{ skillId: skill.id, slot: 's1', currentUses: skill.maxUses }],
    };
    const actorSnapshot = { id: instanceId, alive: true, targetable: true, position: { x: 0, z: 0 } };
    const liveTargets = [
      combatTarget(`enemy-a:${skill.id}`, { x: 1, z: 0 }),
      combatTarget(`enemy-b:${skill.id}`, { x: 1.25, z: 0 }),
    ];
    const enemies = liveTargets.map(target => ({ id: target.id, alive: true, targetable: true, position: target.position }));
    let effectCommits = 0;
    let cooldownCommits = 0;
    let acceptedApplication = null;

    const effectRequest = (command, materialized) => ({
      command,
      attacker: combatActor(skill, instanceId),
      targets: command.targetKind === 'Self' || command.targetKind === 'GroundPoint' ? [] : materialized,
      nowSec: 0,
    });
    const execute = () => executeEquippedSkillCommand(instance, {
      slot: 's1', commandId: `closure-cast:${skill.id}`, actor: actorSnapshot, enemies,
      groundPoint: { x: 1, z: 0 }, cooldownRemainingSec: 0,
    }, {
      materializeTargets: command => command.targetKind === 'Self'
        ? [actorSnapshot]
        : command.targetIds.map(targetId => liveTargets.find(target => target.id === targetId)),
      canApply: (command, materialized) => runtime.validateReviewedSkillEffectRequest(effectRequest(command, materialized)),
      applyAccepted: (command, materialized) => {
        effectCommits += 1;
        cooldownCommits += 1;
        acceptedApplication = runtime.resolveReviewedSkillEffects(effectRequest(command, materialized), { rng: () => 0 });
        assert.equal(acceptedApplication.ok, true, `${skill.id} canonical application must resolve`);
        return acceptedApplication;
      },
    });

    const accepted = execute();
    assert.equal(accepted.ok, true, `${skill.id} valid skill must execute instead of ${accepted.reason}`);
    assert.notEqual(accepted.reason, 'not_ready');
    assert.equal(instance.skills[0].currentUses, skill.maxUses - 1, `${skill.id} consumes exactly one Use`);
    assert.equal(effectCommits, 1, `${skill.id} applies exactly once`);
    assert.equal(cooldownCommits, 1, `${skill.id} starts cooldown exactly once`);
    assert.deepEqual(acceptedApplication.activeComponentKinds, rowsById.get(skill.id).components.map(component => component.kind));
    assert.deepEqual(acceptedApplication.deferredComponentKinds, [], `${skill.id} has no deferred effect component`);
    for (const component of rowsById.get(skill.id).components) {
      assert.equal(receiptForComponent(acceptedApplication, component, accepted.command), true,
        `${skill.id} must emit a canonical ${component.kind} receipt`);
      componentCounts.set(component.kind, (componentCounts.get(component.kind) ?? 0) + 1);
    }

    const replay = execute();
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, 'duplicate_cast', `${skill.id} replay must be rejected`);
    assert.equal(instance.skills[0].currentUses, skill.maxUses - 1, `${skill.id} replay cannot consume Uses`);
    assert.equal(effectCommits, 1, `${skill.id} replay cannot apply effects`);
    assert.equal(cooldownCommits, 1, `${skill.id} replay cannot restart cooldown`);
    totalEffectCommits += effectCommits;
    totalCooldownCommits += cooldownCommits;
  }

  assert.equal(totalEffectCommits, 108);
  assert.equal(totalCooldownCommits, 108);
  assert.deepEqual(Object.fromEntries(componentCounts), {
    direct_damage: 87, attack_modifier: 2, status: 68, displacement: 8, damage_shape: 4,
    self_heal: 2, field: 2, movement: 8, damage_modifier: 4, summon: 1, heal_modifier: 1,
  });

  if (gameSource !== undefined) {
    const applyStart = gameSource.indexOf('function applyAcceptedSkillCommand(');
    const applyEnd = gameSource.indexOf('\nfunction skillFailureMessage(', applyStart);
    const applySource = gameSource.slice(applyStart, applyEnd);
    assert.ok(applyStart >= 0 && applyEnd > applyStart);
    assert.equal((applySource.match(/a\.skillCds\[index\]=command\.startCooldownSec/g) ?? []).length, 1,
      'live accepted adapter owns exactly one cooldown commit');
    assert.match(applySource, /applyPlannedClosureEffects\(a,move,planned\.healModifierResult,planned\.summonResult,actualTotalDamage,effectRequest\.attacker,effectRequest\.nowSec,contributionEvents\)/);
    assert.match(applySource, /hitCount:actualHitCount,totalDamage:actualTotalDamage,statusAppliedCount:actualStatusAppliedCount/);
    assert.doesNotMatch(gameSource.slice(gameSource.indexOf('function updateSkillSwarms('), gameSource.indexOf('\nfunction canApplyLiveSkill(')),
      /executeEquippedSkillCommand|consumeSkillUse|skillCds|currentUses/,
      'summon ticks cannot recommit command resources');
  }
  if (packageJson !== undefined) {
    const parsed = JSON.parse(packageJson);
    assert.match(parsed.scripts['test:v82:skill-effects:e5'], /v82-skill-effect-e5\.mjs/);
    assert.match(parsed.scripts.ci, /test:v82:skill-effects:e5/);
  }
}

const root = new URL('../', import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertSkillEffectClosure(currentRuntime, {
    gameSource: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
    packageJson: fs.readFileSync(new URL('package.json', root), 'utf8'),
  });
  console.log('V8.2 E5 108-skill effect closure: PASS (all components live; replay/Uses/Cooldown exactly once)');
}
