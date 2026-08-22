import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeInstance } from '../monster-instance.mjs';
import { SKILL_CATALOG, SKILL_TARGET_GEOMETRY } from '../skill-catalog.mjs';
import { getSkill, learnSkill } from '../skill-progression.mjs';
import {
  commandTargetKind,
  commitEquippedSkillCommand,
  resolveEquippedSkillCommand,
  resolveSkillCommand,
} from '../targeting-resolver.mjs';

const actor = Object.freeze({ id: 'player-mon', alive: true, position: Object.freeze({ x: 0, z: 0 }) });
const resources = Object.freeze({ currentUses: 5, cooldownRemainingSec: 0 });
assert.equal(resolveSkillCommand({
  commandId: 'actor-liveness-required', skillId: 'SK_NORMAL_03',
  actor: { id: 'player-mon', position: { x: 0, z: 0 } }, ...resources,
}).reason, 'invalid_actor', 'actor liveness must be explicit and fail closed');

assert.deepEqual(
  Object.fromEntries(Object.entries(SKILL_TARGET_GEOMETRY).map(([targetType, geometry]) => [targetType, geometry])),
  {
    NearestEnemy: { rangeM: 2.2, radiusM: 0.8 },
    Self: { rangeM: 0, radiusM: 0 },
    EnemyArea: { rangeM: 7.5, radiusM: 3.5 },
    GroundPoint: { rangeM: 5, radiusM: 0 },
  },
);
for (const skill of SKILL_CATALOG) {
  assert.equal(commandTargetKind(skill.id), skill.targetType, `${skill.id} uses Skill_Master.TargetType verbatim`);
  assert.ok(SKILL_TARGET_GEOMETRY[skill.targetType], `${skill.id} has Skill_Advanced geometry`);
  assert.equal('rangeM' in skill, false, `${skill.id} leaves Skill_Master provenance unchanged`);
  assert.equal('radiusM' in skill, false, `${skill.id} leaves Skill_Master provenance unchanged`);
}
assert.deepEqual(
  Object.fromEntries([...new Set(SKILL_CATALOG.map(skill => skill.targetType))]
    .map(targetType => [targetType, SKILL_CATALOG.filter(skill => skill.targetType === targetType).length])),
  { NearestEnemy: 36, Self: 20, EnemyArea: 51, GroundPoint: 1 },
  'all 108 Skill_Master TargetType rows retain the workbook distribution',
);

const self = resolveSkillCommand({
  commandId: 'cmd-self', skillId: 'SK_NORMAL_03', actor, enemies: 'ignored-for-self', ...resources,
});
assert.equal(self.ok, true);
assert.equal(self.targetKind, 'Self');
assert.deepEqual(self.targetIds, ['player-mon']);
assert.equal(self.rangeM, 0, 'Self accepts canonical zero range');

const nearestEnemies = [
  { id: 'equal-z', alive: true, targetable: true, position: { x: 0, z: 2 } },
  { id: 'equal-a', alive: true, targetable: true, position: { x: 2, z: 0 } },
  { id: 'outside', alive: true, targetable: true, position: { x: 2.21, z: 0 } },
  { id: 'dead', alive: false, targetable: true, position: { x: 0.5, z: 0 } },
];
const nearest = resolveSkillCommand({
  commandId: 'cmd-nearest', skillId: 'SK_FIRE_01', actor, enemies: nearestEnemies, ...resources,
});
assert.equal(nearest.ok, true);
assert.equal(nearest.targetKind, 'NearestEnemy');
assert.deepEqual(nearest.targetIds, ['equal-a'], 'distance ties use stable enemy ID ordering');
assert.equal(nearest.rangeM, 2.2);
const nearestPermuted = resolveSkillCommand({
  commandId: 'cmd-nearest-permuted', skillId: 'SK_FIRE_01', actor,
  enemies: [...nearestEnemies].reverse(), ...resources,
});
assert.deepEqual(nearestPermuted.targetIds, nearest.targetIds, 'input permutation cannot change the selected target');

const areaEnemies = [
  { id: 'anchor', alive: true, targetable: true, position: { x: 2, z: 0 } },
  { id: 'inside', alive: true, targetable: true, position: { x: 5.4, z: 0 } },
  { id: 'outside-radius', alive: true, targetable: true, position: { x: 5.6, z: 0 } },
];
const area = resolveSkillCommand({
  commandId: 'cmd-area', skillId: 'SK_FIRE_04', actor, enemies: areaEnemies, ...resources,
});
assert.equal(area.ok, true);
assert.equal(area.targetKind, 'EnemyArea');
assert.deepEqual(area.targetIds, ['anchor', 'inside'], 'area hits use RadiusM around the nearest in-range anchor');
assert.deepEqual(area.targetPoint, { x: 2, z: 0 });
assert.equal(area.rangeM, 7.5);
assert.equal(area.radiusM, 3.5);
areaEnemies[0].position.x = 99;
areaEnemies.reverse();
assert.deepEqual(area.targetIds, ['anchor', 'inside'], 'resolved target IDs are immutable snapshots');
assert.deepEqual(area.targetPoint, { x: 2, z: 0 }, 'resolved anchor is detached from mutable world input');
assert.equal(Object.isFrozen(area.targetIds), true);
assert.equal(Object.isFrozen(area.targetPoint), true);

const groundInput = { x: 3, z: 4 };
const ground = resolveSkillCommand({
  commandId: '  cmd-ground  ', skillId: 'SK_ICE_04', actor, groundPoint: groundInput, ...resources,
});
assert.equal(ground.ok, true);
assert.equal(ground.commandId, 'cmd-ground');
assert.equal(ground.castId, 'cmd-ground');
assert.deepEqual(ground.targetPoint, { x: 3, z: 4 });
groundInput.x = 0;
assert.deepEqual(ground.targetPoint, { x: 3, z: 4 }, 'resolved ground point is detached from mutable UI input');
assert.deepEqual(ground.targetIds, []);
assert.equal(resolveSkillCommand({
  commandId: 'cmd-ground-far', skillId: 'SK_ICE_04', actor,
  groundPoint: { x: 5.01, z: 0 }, ...resources,
}).reason, 'ground_point_out_of_range');

assert.equal(resolveSkillCommand({
  commandId: 'caller-range-ignored', skillId: 'SK_FIRE_01', actor,
  enemies: [{ id: 'too-far', alive: true, targetable: true, position: { x: 3, z: 0 } }],
  range: 999, ...resources,
}).reason, 'no_valid_target', 'callers cannot inject range');
assert.equal(resolveSkillCommand({
  commandId: 'duplicate-enemy', skillId: 'SK_FIRE_01', actor,
  enemies: [nearestEnemies[0], { ...nearestEnemies[0] }], ...resources,
}).reason, 'duplicate_enemy_id');
assert.equal(resolveSkillCommand({
  commandId: 'targetability-required', skillId: 'SK_FIRE_01', actor,
  enemies: [{ id: 'missing-targetable', alive: true, position: { x: 1, z: 0 } }], ...resources,
}).reason, 'no_valid_target', 'enemy targetability must be explicit and fail closed');
assert.equal(resolveSkillCommand({
  commandId: 'cooldown', skillId: 'SK_FIRE_01', actor, enemies: nearestEnemies,
  currentUses: 5, cooldownRemainingSec: 0.1,
}).reason, 'cooldown_active');
assert.equal(resolveSkillCommand({
  commandId: 'uses', skillId: 'SK_FIRE_01', actor, enemies: nearestEnemies,
  currentUses: 0, cooldownRemainingSec: 0,
}).reason, 'no_uses');

const instance = normalizeInstance({ instanceId: 'targeting-caster', speciesId: 'flameling', skills: [] }, { now: 1 });
learnSkill(instance, { skillId: 'SK_FIRE_01', slot: 's1' });
const instanceActor = { ...actor, id: instance.instanceId };
const acceptedCommand = resolveEquippedSkillCommand(instance, {
  slot: 's1', commandId: 'cast-target-001', actor: instanceActor, enemies: nearestEnemies,
  cooldownRemainingSec: 0,
});
assert.equal(acceptedCommand.skillId, 'SK_FIRE_01', 'equipped slot owns the command SkillID');
const consumed = commitEquippedSkillCommand(instance, acceptedCommand);
assert.equal(consumed.currentUses, 27);
assert.equal(commitEquippedSkillCommand(instance, acceptedCommand).reason, 'duplicate_cast', 'commandId composes with the A17 cast replay guard');
assert.equal(getSkill(instance, 'SK_FIRE_01').currentUses, 27);
assert.equal(resolveEquippedSkillCommand(instance, {
  slot: 's1', commandId: 'cast-target-001', actor: instanceActor, enemies: [],
}).reason, 'duplicate_cast', 'committed replay is rejected before world/Uses validation');
learnSkill(instance, { skillId: 'SK_FIRE_04', slot: 's2' });
assert.equal(resolveEquippedSkillCommand(instance, {
  slot: 's2', commandId: 'cast-target-001', actor: instanceActor, enemies: nearestEnemies,
}).reason, 'duplicate_cast', 'one command ID cannot be reused across equipped skills');
assert.equal(getSkill(instance, 'SK_FIRE_04').currentUses, 10);

const preparedRace = normalizeInstance({ instanceId: 'prepared-race', speciesId: 'flameling', skills: [] }, { now: 1 });
learnSkill(preparedRace, { skillId: 'SK_FIRE_01', slot: 's1' });
learnSkill(preparedRace, { skillId: 'SK_FIRE_04', slot: 's2' });
const raceActor = { ...actor, id: preparedRace.instanceId };
const firstPrepared = resolveEquippedSkillCommand(preparedRace, {
  slot: 's1', commandId: 'prepared-same-id', actor: raceActor, enemies: nearestEnemies,
});
const secondPrepared = resolveEquippedSkillCommand(preparedRace, {
  slot: 's2', commandId: 'prepared-same-id', actor: raceActor, enemies: nearestEnemies,
});
assert.equal(firstPrepared.ok, true);
assert.equal(secondPrepared.ok, true);
assert.equal(commitEquippedSkillCommand(preparedRace, firstPrepared).ok, true);
assert.equal(commitEquippedSkillCommand(preparedRace, secondPrepared).reason, 'duplicate_cast',
  'commit closes the same-ID pre-resolution race across skills');
assert.equal(getSkill(preparedRace, 'SK_FIRE_04').currentUses, 10);

const beforeRejected = getSkill(instance, 'SK_FIRE_01').currentUses;
const rejectedCommand = resolveEquippedSkillCommand(instance, {
  slot: 's1', commandId: 'cast-target-rejected', actor: instanceActor, enemies: [],
  cooldownRemainingSec: 0,
});
assert.equal(rejectedCommand.ok, false);
assert.equal(commitEquippedSkillCommand(instance, rejectedCommand).reason, 'invalid_command');
assert.equal(getSkill(instance, 'SK_FIRE_01').currentUses, beforeRejected, 'rejected targeting consumes zero uses');

assert.equal(resolveEquippedSkillCommand(instance, {
  slot: 's3', commandId: 'not-equipped', actor: instanceActor, enemies: nearestEnemies,
}).reason, 'not_equipped');
assert.equal(resolveEquippedSkillCommand(instance, {
  slot: 's1', commandId: 'actor-mismatch', actor, enemies: nearestEnemies,
}).reason, 'actor_mismatch');
assert.equal(commitEquippedSkillCommand(
  normalizeInstance({ instanceId: 'other', speciesId: 'flameling', skills: [] }, { now: 1 }),
  acceptedCommand,
).reason, 'invalid_command', 'prepared commands are bound to the exact owner instance');
assert.equal(commitEquippedSkillCommand(instance, {
  ok: true, skillId: 'SK_FIRE_01', castId: 'forged-command',
}).reason, 'invalid_command', 'callers cannot forge a consumable targeting command');

assert.equal('damage' in area, false, 'targeting never resolves damage');
const uiSource = readFileSync(new URL('../combat-ui-view-model.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(uiSource, /resolveSkillCommand\s*\(/, 'UI presentation cannot resolve gameplay targets or hits');

console.log('V8.1 targeting command resolver: PASS (108/108 target and geometry rows)');
