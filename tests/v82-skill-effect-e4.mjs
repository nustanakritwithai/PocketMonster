import assert from 'node:assert/strict';
import { executeEquippedSkillCommand } from '../skill-command-runtime.mjs';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import {
  E4_MOBILITY_EFFECT_POLICY,
  E4_READY_SKILL_IDS,
  canExecuteE4SkillEffect,
  canExecuteReviewedSkillEffect,
  resolveE4SkillEffects,
  resolveReviewedSkillEffects,
  validateE4SkillEffectRequest,
  validateReviewedSkillEffectRequest,
} from '../skill-effect-runtime.mjs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';

function sequence(...values) {
  let index = 0;
  return () => values[index++];
}

function actor(overrides = {}) {
  const id = overrides.id ?? 'actor';
  return {
    id, level: 30, types: ['Ground'], position: { x: 0, z: 0 }, stats: { ATK: 100, SPATK: 100 },
    hp: 180, maxHp: 200, statusState: createEncounterStatusState({ encounterId: `owned:${id}`, nowSec: 0 }),
    critChancePct: 5, ...overrides,
  };
}

function target(id = 'enemy', position = { x: 5, z: 0 }, overrides = {}) {
  return {
    id, alive: true, targetable: true, level: 30, types: ['Normal'], position, stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: id, nowSec: 0 }), nowSec: 0, ...overrides,
  };
}

function command(skillId, targetKind, targets, overrides = {}) {
  return {
    ok: true, commandId: `cast:${skillId}`, castId: `cast:${skillId}`, skillId, targetKind,
    targetIds: targets.map(entry => entry.id), targetPoint: targetKind === 'EnemyArea' ? { x: 0, z: 0 } : targets[0].position,
    rangeM: 8, radiusM: targetKind === 'EnemyArea' ? 3.5 : 0, ...overrides,
  };
}

function hits(targets, overrides = {}) {
  return targets.map(entry => ({ targetId: entry.id, hit: true, fainted: false, ...overrides }));
}

const expectedIds = [
  'SK_NORMAL_06', 'SK_WATER_02', 'SK_WATER_06', 'SK_GROUND_02', 'SK_FLYING_01', 'SK_FLYING_04',
  'SK_FLYING_06', 'SK_DARK_02', 'SK_DARK_06', 'SK_LIGHT_02', 'SK_PSYCHIC_02', 'SK_BUG_02',
  'SK_DRAGON_02', 'SK_FIGHTING_06', 'SK_STEEL_02', 'SK_GHOST_02',
];
assert.deepEqual(E4_READY_SKILL_IDS, expectedIds);
assert.equal(new Set(E4_READY_SKILL_IDS).size, 16);
assert.equal(SKILL_CATALOG.every(skill => canExecuteReviewedSkillEffect(skill.id)), true);
assert.equal(canExecuteE4SkillEffect('SK_GROUND_02'), true);
assert.equal(canExecuteE4SkillEffect('SK_FIRE_01'), false);
assert.deepEqual(E4_MOBILITY_EFFECT_POLICY.movementDistanceM, { Burrow: 3, Dash: 3, Blink: 4 });
assert.equal(E4_MOBILITY_EFFECT_POLICY.knockbackDistanceM, 1.5);
assert.equal(E4_MOBILITY_EFFECT_POLICY.pullDistanceM, 2);
assert.equal(E4_MOBILITY_EFFECT_POLICY.chanceSource, 'workbook_effect_chance_pct');
assert.equal(E4_MOBILITY_EFFECT_POLICY.magnitudeSource, 'runtime_fallback_workbook_mechanic_without_distance_magnitude');

const digTarget = target();
const dig = resolveE4SkillEffects({
  command: command('SK_GROUND_02', 'NearestEnemy', [digTarget]), attacker: actor(), targets: [digTarget], hitResults: hits([digTarget]),
});
assert.equal(dig.ok, true);
assert.deepEqual(dig.movementResult, {
  skillId: 'SK_GROUND_02', actorId: 'actor', kind: 'movement', movementKind: 'Burrow', from: { x: 0, z: 0 },
  destination: { x: 3, z: 0 }, distanceM: 3, effectChancePct: 100, effectRoll: null, applied: true, reason: null,
});
assert.equal(dig.rngDraws, 0);

const blinkTarget = target('blink-target', { x: 10, z: 0 });
const blink = resolveE4SkillEffects({
  command: command('SK_DARK_02', 'NearestEnemy', [blinkTarget]), attacker: actor({ types: ['Dark'] }),
  targets: [blinkTarget], hitResults: hits([blinkTarget]),
});
assert.deepEqual(blink.movementResult.destination, { x: 4, z: 0 });

const airTargets = [target('air-a', { x: 0, z: 2 }), target('air-b', { x: 1, z: 2 })];
const airCommand = command('SK_FLYING_04', 'EnemyArea', airTargets, { targetPoint: { x: 0, z: 5 } });
const airApplied = resolveE4SkillEffects({
  command: airCommand, attacker: actor({ types: ['Flying'] }), targets: airTargets, hitResults: hits(airTargets),
}, { rng: sequence(0.19) });
assert.equal(airApplied.movementResult.applied, true);
assert.deepEqual(airApplied.movementResult.destination, { x: 0, z: 3 });
assert.equal(airApplied.rngDraws, 1);
const airFailed = resolveE4SkillEffects({
  command: airCommand, attacker: actor({ types: ['Flying'] }), targets: airTargets, hitResults: hits(airTargets),
}, { rng: sequence(0.2) });
assert.equal(airFailed.movementResult.applied, false);
assert.equal(airFailed.movementResult.reason, 'effect_roll_failed');
const airMissed = resolveE4SkillEffects({
  command: airCommand, attacker: actor({ types: ['Flying'] }), targets: airTargets,
  hitResults: hits(airTargets, { hit: false }),
});
assert.equal(airMissed.movementResult.reason, 'attack_missed');
assert.equal(airMissed.rngDraws, 0);

const pushTarget = target('push', { x: 2, z: 0 });
const push = resolveE4SkillEffects({
  command: command('SK_WATER_02', 'NearestEnemy', [pushTarget]), attacker: actor({ types: ['Water'] }),
  targets: [pushTarget], hitResults: hits([pushTarget]),
});
assert.equal(push.displacementResults[0].applied, true);
assert.deepEqual(push.displacementResults[0].destination, { x: 3.5, z: 0 });

const pullTarget = target('pull', { x: 4, z: 0 });
const pull = resolveE4SkillEffects({
  command: command('SK_DARK_06', 'EnemyArea', [pullTarget]), attacker: actor({ position: { x: -2, z: 0 }, types: ['Dark'] }),
  targets: [pullTarget], hitResults: hits([pullTarget]),
}, { rng: sequence(0.49) });
assert.equal(pull.displacementResults[0].applied, true);
assert.deepEqual(pull.displacementResults[0].destination, { x: 2, z: 0 });
assert.equal(pull.rngDraws, 1);

const centered = target('centered', { x: 0, z: 0 });
const areaKnockback = resolveE4SkillEffects({
  command: command('SK_NORMAL_06', 'EnemyArea', [centered]), attacker: actor({ position: { x: -2, z: 0 }, types: ['Normal'] }),
  targets: [centered], hitResults: hits([centered]),
}, { rng: sequence(0.1) });
assert.deepEqual(areaKnockback.displacementResults[0].destination, { x: 1.5, z: 0 });

const gust = resolveE4SkillEffects({
  command: command('SK_FLYING_01', 'NearestEnemy', [pushTarget]), attacker: actor({ types: ['Flying'] }),
  targets: [pushTarget], hitResults: hits([pushTarget]),
});
assert.equal(gust.displacementResults[0].applied, false);
assert.equal(gust.displacementResults[0].reason, 'effect_chance_zero');
assert.equal(gust.rngDraws, 0);
const fainted = resolveE4SkillEffects({
  command: command('SK_WATER_02', 'NearestEnemy', [pushTarget]), attacker: actor({ types: ['Water'] }),
  targets: [pushTarget], hitResults: hits([pushTarget], { fainted: true }),
});
assert.equal(fainted.displacementResults[0].reason, 'target_fainted');

assert.equal(validateE4SkillEffectRequest({
  command: command('SK_GROUND_02', 'NearestEnemy', [digTarget]), attacker: actor({ position: null }), targets: [digTarget],
}).reason, 'invalid_actor_position');
assert.equal(validateE4SkillEffectRequest({
  command: command('SK_GROUND_02', 'NearestEnemy', [digTarget]), attacker: actor(), targets: [{ ...digTarget, position: null }],
}).reason, 'invalid_target_positions');
assert.equal(resolveE4SkillEffects({
  command: command('SK_GROUND_02', 'NearestEnemy', [digTarget]), attacker: actor(), targets: [digTarget], hitResults: [],
}).reason, 'invalid_hit_results');

const integratedActor = actor({ types: ['Ground'] });
const integratedCommand = command('SK_GROUND_02', 'NearestEnemy', [digTarget]);
const integrated = resolveReviewedSkillEffects({
  command: integratedCommand, attacker: integratedActor, targets: [digTarget], nowSec: 0,
}, { rng: sequence(0, 1, 0.5) });
assert.equal(integrated.ok, true);
assert.deepEqual(integrated.activeComponentKinds, ['direct_damage', 'movement']);
assert.deepEqual(integrated.deferredComponentKinds, []);
assert.equal(integrated.movementResult.applied, true);

const instance = {
  instanceId: 'atomic-mobility', speciesId: 'groundslime',
  skills: [
    { skillId: 'SK_GROUND_02', slot: 's1', currentUses: 16 },
    { skillId: 'SK_GROUND_01', slot: 's2', currentUses: 28 },
    { skillId: 'SK_GROUND_03', slot: 's3', currentUses: 12 },
    { skillId: 'SK_GROUND_04', slot: 's4', currentUses: 10 },
  ],
};
const atomicTarget = target('atomic-enemy', { x: 2, z: 0 });
const actorSnapshot = { id: instance.instanceId, alive: true, position: { x: 0, z: 0 } };
const enemySnapshot = { id: atomicTarget.id, alive: true, targetable: true, position: atomicTarget.position };
let effectCommits = 0;
let cooldownCommits = 0;
const execute = () => executeEquippedSkillCommand(instance, {
  slot: 's1', commandId: 'atomic-mobility-cast', actor: actorSnapshot, enemies: [enemySnapshot], cooldownRemainingSec: 0,
}, {
  materializeTargets: () => [atomicTarget],
  canApply: resolvedCommand => validateReviewedSkillEffectRequest({
    command: resolvedCommand, attacker: { ...integratedActor, id: instance.instanceId }, targets: [atomicTarget], nowSec: 0,
  }).ok,
  applyAccepted: resolvedCommand => {
    const result = resolveReviewedSkillEffects({
      command: resolvedCommand, attacker: { ...integratedActor, id: instance.instanceId }, targets: [atomicTarget], nowSec: 0,
    }, { rng: sequence(0, 1, 0.5) });
    assert.equal(result.ok, true);
    effectCommits += 1;
    cooldownCommits += 1;
    return result;
  },
});
const firstExecution = execute();
assert.equal(firstExecution.ok, true, JSON.stringify(firstExecution));
assert.equal(instance.skills[0].currentUses, 15);
assert.equal(effectCommits, 1);
assert.equal(cooldownCommits, 1);
assert.equal(execute().reason, 'duplicate_cast');
assert.equal(instance.skills[0].currentUses, 15);
assert.equal(effectCommits, 1);
assert.equal(cooldownCommits, 1);

console.log('V8.2 E4 canonical Movement/Displacement: PASS (16 skills, exactly-once command boundary)');
