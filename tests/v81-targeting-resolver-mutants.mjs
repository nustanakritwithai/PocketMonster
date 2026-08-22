import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../targeting-resolver.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, tag) {
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function assertTargetingContract(module) {
  const {
    commandTargetKind,
    commitEquippedSkillCommand,
    resolveEquippedSkillCommand,
    resolveSkillCommand,
  } = module;
  const actor = { id: 'actor', alive: true, position: { x: 0, z: 0 } };
  const resources = { currentUses: 5, cooldownRemainingSec: 0 };
  assert.equal(commandTargetKind('SK_NORMAL_04'), 'EnemyArea');
  assert.equal(resolveSkillCommand({
    commandId: 'actor-live', skillId: 'SK_NORMAL_03',
    actor: { id: 'actor', position: { x: 0, z: 0 } }, ...resources,
  }).reason, 'invalid_actor');

  const tied = [
    { id: 'z', alive: true, targetable: true, position: { x: 0, z: 2 } },
    { id: 'a', alive: true, targetable: true, position: { x: 2, z: 0 } },
  ];
  assert.deepEqual(resolveSkillCommand({
    commandId: 'near', skillId: 'SK_FIRE_01', actor, enemies: tied, ...resources,
  }).targetIds, ['a']);
  assert.deepEqual(resolveSkillCommand({
    commandId: 'near-reverse', skillId: 'SK_FIRE_01', actor, enemies: [...tied].reverse(), ...resources,
  }).targetIds, ['a']);

  assert.equal(resolveSkillCommand({
    commandId: 'range', skillId: 'SK_FIRE_01', actor,
    enemies: [{ id: 'far', alive: true, targetable: true, position: { x: 3, z: 0 } }], ...resources,
  }).reason, 'no_valid_target');
  const area = resolveSkillCommand({
    commandId: 'area', skillId: 'SK_FIRE_04', actor,
    enemies: [
      { id: 'anchor', alive: true, targetable: true, position: { x: 2, z: 0 } },
      { id: 'inside', alive: true, targetable: true, position: { x: 5.4, z: 0 } },
      { id: 'outside', alive: true, targetable: true, position: { x: 5.6, z: 0 } },
    ], ...resources,
  });
  assert.deepEqual(area.targetIds, ['anchor', 'inside']);
  assert.equal(resolveSkillCommand({
    commandId: 'ground', skillId: 'SK_ICE_04', actor, groundPoint: { x: 5.01, z: 0 }, ...resources,
  }).reason, 'ground_point_out_of_range');
  assert.equal(resolveSkillCommand({
    commandId: 'dupe', skillId: 'SK_FIRE_01', actor,
    enemies: [tied[0], { ...tied[0] }], ...resources,
  }).reason, 'duplicate_enemy_id');
  assert.equal(resolveSkillCommand({
    commandId: 'targetable', skillId: 'SK_FIRE_01', actor,
    enemies: [{ id: 'missing-targetable', alive: true, position: { x: 1, z: 0 } }], ...resources,
  }).reason, 'no_valid_target');

  const instance = {
    instanceId: 'actor', speciesId: 'flameling',
    skills: [{ skillId: 'SK_FIRE_01', slot: 's1', currentUses: 3 }],
  };
  const equipped = resolveEquippedSkillCommand(instance, {
    slot: 's1', commandId: 'equipped', actor, enemies: tied,
  });
  assert.equal(equipped.ok, true);
  assert.equal(equipped.skillId, 'SK_FIRE_01');
  assert.equal(commitEquippedSkillCommand(instance, equipped).currentUses, 2);
  assert.equal(commitEquippedSkillCommand(instance, equipped).reason, 'duplicate_cast');
  assert.equal(resolveEquippedSkillCommand(instance, {
    slot: 's1', commandId: 'equipped', actor, enemies: [],
  }).reason, 'duplicate_cast');
  assert.equal(commitEquippedSkillCommand(instance, {
    ok: true, skillId: 'SK_FIRE_01', castId: 'forged-command',
  }).reason, 'invalid_command');
  assert.equal(resolveEquippedSkillCommand(instance, {
    slot: 's2', commandId: 'empty', actor, enemies: tied,
  }).reason, 'not_equipped');
  assert.equal(resolveEquippedSkillCommand(instance, {
    slot: 's1', commandId: 'wrong-actor', actor: { ...actor, id: 'other' }, enemies: tied,
  }).reason, 'actor_mismatch');
  instance.skills.push({ skillId: 'SK_FIRE_04', slot: 's2', currentUses: 10 });
  assert.equal(resolveEquippedSkillCommand(instance, {
    slot: 's2', commandId: 'equipped', actor, enemies: tied,
  }).reason, 'duplicate_cast');
  assert.equal(instance.skills[1].currentUses, 10);

  const race = {
    instanceId: 'race', speciesId: 'flameling',
    skills: [
      { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 3 },
      { skillId: 'SK_FIRE_04', slot: 's2', currentUses: 10 },
    ],
  };
  const raceActor = { ...actor, id: 'race' };
  const preparedOne = resolveEquippedSkillCommand(race, {
    slot: 's1', commandId: 'race-id', actor: raceActor, enemies: tied,
  });
  const preparedTwo = resolveEquippedSkillCommand(race, {
    slot: 's2', commandId: 'race-id', actor: raceActor, enemies: tied,
  });
  assert.equal(commitEquippedSkillCommand(race, preparedOne).ok, true);
  assert.equal(commitEquippedSkillCommand(race, preparedTwo).reason, 'duplicate_cast');
  assert.equal(race.skills[1].currentUses, 10);
}

assertTargetingContract(await loadSource(originalSource, 'targeting-current'));

const mutants = [
  ['application mode overrides TargetType', 'return skillCatalogEntry(skillId)?.targetType ?? null;', "return skillCatalogEntry(skillId)?.applicationMode ?? null;"],
  ['resolver uses application mode', 'const targetKind = skill.targetType;', 'const targetKind = skill.applicationMode;'],
  ['restore injected range six', 'enemy.distance <= geometry.rangeM', 'enemy.distance <= 6'],
  ['use cast range as area radius', 'enemy.distance <= geometry.radiusM', 'enemy.distance <= geometry.rangeM'],
  ['remove deterministic tie break', 'left.distance - right.distance || left.id.localeCompare(right.id)', 'left.distance - right.distance'],
  ['allow duplicate enemy IDs', "if (ids.has(enemy.id)) return result(false, 'duplicate_enemy_id', { enemyId: enemy.id });", 'if (false) return result(false);'],
  ['allow out-of-range ground point', 'distance(actor.position, groundPoint) > geometry.rangeM', 'distance(actor.position, groundPoint) > 999'],
  ['allow missing actor liveness', 'actor.alive !== true', 'actor.alive === false'],
  ['allow missing enemy targetability', 'enemy.alive !== true || enemy.targetable !== true', 'enemy.alive === false || enemy.targetable === false'],
  ['allow actor mismatch', 'if (!actor || actor.id !== instance.instanceId) {', 'if (!actor || false) {'],
  ['select unequipped fallback', "if (!equipped?.skill) return result(false, 'not_equipped', { slot });", "if (!equipped?.skill) return resolveSkillCommand({ commandId, skillId: 'SK_FIRE_01', actor, enemies, currentUses: 1, cooldownRemainingSec });"],
  ['allow forged commit', '|| PREPARED_COMMAND_INSTANCES.get(command) !== instance)', '|| false)'],
  ['bypass resolved replay ledger', "if (replayId && committedCommandIds(instance)?.has(replayId)) {", 'if (false) {'],
  ['bypass commit replay ledger', "if (committedCommandIds(instance)?.has(command.castId)) {", 'if (false) {'],
  ['forget committed command ID', 'if (consumption.ok) committedCommandIds(instance, true).add(command.castId);', 'if (false) committedCommandIds(instance, true).add(command.castId);'],
];

for (const [name, before, after] of mutants) {
  const source = originalSource.replace(before, after);
  assert.notEqual(source, originalSource, `${name} mutation must alter source`);
  const module = await loadSource(source, `targeting-mutant-${name.replaceAll(' ', '-')}`);
  assert.throws(() => assertTargetingContract(module), undefined, `${name} must be killed`);
}

console.log(`V8.1 targeting resolver mutants: PASS (${mutants.length}/${mutants.length} killed)`);
