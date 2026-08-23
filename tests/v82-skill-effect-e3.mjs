import assert from 'node:assert/strict';
import { executeEquippedSkillCommand } from '../skill-command-runtime.mjs';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import {
  E3_FIELD_EFFECT_POLICY,
  E3_READY_SKILL_IDS,
  REVIEWED_SKILL_EFFECT_IDS,
  canExecuteE3SkillEffect,
  canExecuteReviewedSkillEffect,
  resolveE3SkillEffects,
  resolveReviewedSkillEffects,
  validateE3SkillEffectRequest,
  validateReviewedSkillEffectRequest,
} from '../skill-effect-runtime.mjs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';

function sequence(...values) {
  let index = 0;
  return () => values[index++];
}

function actor(id = 'actor-1', position = { x: 0, z: 0 }) {
  return {
    id,
    level: 30,
    types: ['Ice'],
    position,
    stats: { ATK: 100, SPATK: 100 },
    hp: 150,
    maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: `owned:${id}`, nowSec: 0 }),
    critChancePct: 5,
  };
}

function wallCommand(overrides = {}) {
  return {
    ok: true,
    commandId: 'wall-cast',
    castId: 'wall-cast',
    skillId: 'SK_ICE_04',
    targetKind: 'GroundPoint',
    targetIds: [],
    targetPoint: { x: 3, z: 4 },
    rangeM: 5,
    radiusM: 0,
    ...overrides,
  };
}

assert.deepEqual(E3_READY_SKILL_IDS, ['SK_ICE_04', 'SK_ROCK_05']);
assert.equal(REVIEWED_SKILL_EFFECT_IDS.length, 108);
assert.equal(new Set(REVIEWED_SKILL_EFFECT_IDS).size, 108);
assert.equal(SKILL_CATALOG.every(skill => canExecuteReviewedSkillEffect(skill.id)), true,
  'no valid workbook skill remains not_ready after E3');
assert.equal(canExecuteE3SkillEffect('SK_ICE_04'), true);
assert.equal(canExecuteE3SkillEffect('SK_ROCK_05'), true);
assert.equal(canExecuteE3SkillEffect('SK_FIRE_01'), false);
assert.equal(E3_FIELD_EFFECT_POLICY.wallDurationSec, 5);
assert.equal(E3_FIELD_EFFECT_POLICY.hazardDurationSec, 4);
assert.equal(E3_FIELD_EFFECT_POLICY.hazardTickIntervalSec, 1);
assert.equal(E3_FIELD_EFFECT_POLICY.hazardTickDamageRatio, 0.2);
assert.equal(E3_FIELD_EFFECT_POLICY.magnitudeSource, 'runtime_fallback_workbook_mechanic_without_duration_or_tick_magnitude');

const wall = resolveE3SkillEffects({ command: wallCommand(), attacker: actor() });
assert.equal(wall.ok, true);
assert.deepEqual(wall.fieldResult, {
  fieldId: 'field:wall-cast',
  skillId: 'SK_ICE_04',
  kind: 'wall',
  center: { x: 3, z: 4 },
  normal: { x: 0.6, z: 0.8 },
  tangent: { x: -0.8, z: 0.6 },
  durationSec: 5,
  lengthM: 3,
  thicknessM: 0.6,
  collisionTargets: 'wild_enemies',
});
assert.equal(Object.isFrozen(wall.fieldResult), true);
assert.equal(Object.isFrozen(wall.fieldResult.center), true);

const fallbackDirection = resolveE3SkillEffects({
  command: wallCommand({ targetPoint: { x: 0, z: 0 } }), attacker: actor(),
});
assert.deepEqual(fallbackDirection.fieldResult.normal, { x: 0, z: -1 });
assert.deepEqual(fallbackDirection.fieldResult.tangent, { x: 1, z: 0 });
assert.equal(validateE3SkillEffectRequest({ command: wallCommand({ targetPoint: { x: Number.NaN, z: 0 } }), attacker: actor() }).reason, 'invalid_target_point');
assert.equal(validateE3SkillEffectRequest({ command: wallCommand({ castId: '', commandId: '' }), attacker: actor() }).reason, 'invalid_cast_id');

const rockActor = { ...actor('rock-actor'), types: ['Rock'] };
const rockTarget = {
  id: 'enemy-1', level: 30, types: ['Normal'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200,
  statusState: createEncounterStatusState({ encounterId: 'enemy-1', nowSec: 0 }), nowSec: 0,
};
const rockCommand = {
  ok: true, commandId: 'rock-field', castId: 'rock-field', skillId: 'SK_ROCK_05', targetKind: 'EnemyArea',
  targetIds: ['enemy-1'], targetPoint: { x: 2, z: 0 }, rangeM: 7.5, radiusM: 3.5,
};
const rockRequest = { command: rockCommand, attacker: rockActor, targets: [rockTarget], nowSec: 0 };
assert.equal(validateReviewedSkillEffectRequest(rockRequest).ok, true);
const rock = resolveReviewedSkillEffects(rockRequest, { rng: sequence(0, 0.5) });
assert.equal(rock.ok, true);
assert.ok(rock.totalDamage > 0);
assert.deepEqual(rock.fieldResult, {
  fieldId: 'field:rock-field', skillId: 'SK_ROCK_05', kind: 'hazard', center: { x: 2, z: 0 }, radiusM: 3.5,
  durationSec: 4, tickIntervalSec: 1, tickDamageRatio: 0.2,
});
assert.deepEqual(rock.activeComponentKinds, ['direct_damage', 'field']);
assert.deepEqual(rock.deferredComponentKinds, []);

const instance = {
  instanceId: 'atomic-wall', speciesId: 'frostowl',
  skills: [
    { skillId: 'SK_ICE_04', slot: 's1', currentUses: 10 },
    { skillId: 'SK_ICE_01', slot: 's2', currentUses: 28 },
    { skillId: 'SK_ICE_02', slot: 's3', currentUses: 16 },
    { skillId: 'SK_ICE_03', slot: 's4', currentUses: 10 },
  ],
};
const atomicPosition = { id: instance.instanceId, alive: true, position: { x: 0, z: 0 } };
const effectActor = actor(instance.instanceId);
let fieldCommits = 0;
let cooldownCommits = 0;
const execute = () => executeEquippedSkillCommand(instance, {
  slot: 's1', commandId: 'atomic-wall-cast', actor: atomicPosition, enemies: [], groundPoint: { x: 3, z: 0 }, cooldownRemainingSec: 0,
}, {
  materializeTargets: () => [],
  canApply: command => validateReviewedSkillEffectRequest({ command, attacker: effectActor, targets: [], nowSec: 0 }).ok,
  applyAccepted: command => {
    const result = resolveReviewedSkillEffects({ command, attacker: effectActor, targets: [], nowSec: 0 });
    assert.equal(result.ok, true);
    fieldCommits += 1;
    cooldownCommits += 1;
    return result;
  },
});
const accepted = execute();
assert.equal(accepted.ok, true);
assert.equal(instance.skills[0].currentUses, 9);
assert.equal(fieldCommits, 1);
assert.equal(cooldownCommits, 1);
const replay = execute();
assert.equal(replay.reason, 'duplicate_cast');
assert.equal(instance.skills[0].currentUses, 9);
assert.equal(fieldCommits, 1);
assert.equal(cooldownCommits, 1);

console.log('V8.2 E3 canonical GroundPoint/Field: PASS (108/108 live, wall + hazard)');
