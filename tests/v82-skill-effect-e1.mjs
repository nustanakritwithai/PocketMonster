import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SKILL_EFFECT_COVERAGE_CONTRACT, skillEffectCoverageEntry } from '../skill-effect-contract.mjs';
import { SKILL_CATALOG, skillCatalogEntry } from '../skill-catalog.mjs';
import {
  DAMAGE_STATUS_MODIFIERS,
  E1_READY_SKILL_IDS,
  SKILL_DAMAGE_PROFILES,
  WORKBOOK_DAMAGE_RULES,
  canExecuteE1SkillEffect,
  resolveE1SkillEffects,
  resolveWorkbookDirectDamage,
  skillDamageProfile,
  validateE1SkillEffectRequest,
} from '../skill-effect-runtime.mjs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';
import { executeEquippedSkillCommand } from '../skill-command-runtime.mjs';
import { RUNTIME_TYPES, typeEffectiveness } from '../type-catalog.mjs';

function sequence(...values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, `unexpected RNG draw ${index + 1}`);
    return values[index++];
  };
}

function neutralDefenderType(attackingType) {
  return RUNTIME_TYPES.find(type => type !== 'Dark' && typeEffectiveness(attackingType, [type]) === 1);
}

function combatants(profile, overrides = {}) {
  const targetType = overrides.targetType ?? neutralDefenderType(profile.runtimeType);
  const attacker = {
    id: 'actor-1',
    level: 30,
    types: [profile.runtimeType],
    stats: { ATK: 100, SPATK: 100 },
    critChancePct: 5,
    ...overrides.attacker,
  };
  const defender = {
    id: 'target-1',
    level: 30,
    types: [targetType],
    stats: { DEF: 100, SPDEF: 100 },
    hp: 200,
    maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: 'target-1', nowSec: 0 }),
    ...overrides.defender,
  };
  return { attacker, defender };
}

function damageRng(skill, profile, varianceRoll = 0.5) {
  const rolls = [];
  if (skill.accuracy < 100) rolls.push(0);
  if (profile.canCrit) rolls.push(1);
  rolls.push(varianceRoll);
  return sequence(...rolls);
}

assert.equal(SKILL_DAMAGE_PROFILES.length, 108, 'all 108 skills have a workbook damage profile');
assert.equal(new Set(SKILL_DAMAGE_PROFILES.map(profile => profile.skillId)).size, 108);
assert.deepEqual(SKILL_DAMAGE_PROFILES.map(profile => profile.skillId), SKILL_CATALOG.map(skill => skill.id));
assert.equal(SKILL_DAMAGE_PROFILES.filter(profile => profile.directDamage).length, 87);
assert.equal(SKILL_DAMAGE_PROFILES.filter(profile => profile.canCrit).length, 70);
assert.equal(SKILL_DAMAGE_PROFILES.filter(profile => profile.hitCount === 3).length, 5);
assert.equal(SKILL_DAMAGE_PROFILES.every(profile => profile.formulaVersion === 'DMG_v1.0'), true);
assert.equal(Object.isFrozen(SKILL_DAMAGE_PROFILES), true);
assert.equal(Object.isFrozen(SKILL_DAMAGE_PROFILES[0]), true);
assert.equal(DAMAGE_STATUS_MODIFIERS.length, 11, 'all workbook damage/status modifier rows are normalized');
assert.equal(skillDamageProfile('SK_UNKNOWN_99'), null);

const profileDigest = createHash('sha256').update(JSON.stringify(SKILL_DAMAGE_PROFILES)).digest('hex');
assert.equal(profileDigest, '1899d205b32083ddc1be450c7475b01a84fea8463d2fed460618c9ccccb9a658', 'damage profiles stay tied to the reviewed workbook');

assert.equal(E1_READY_SKILL_IDS.length, 87, 'E1 activates the DirectDamage component of all 87 damaging skills');
assert.equal(new Set(E1_READY_SKILL_IDS).size, 87);
assert.equal(E1_READY_SKILL_IDS.reduce(
  (count, skillId) => {
    const row = skillEffectCoverageEntry(skillId);
    return count + (row.components.some(component => component.kind === 'status'
      && component.targetChannel === 'command_targets') ? row.statusLinkIds.length : 0);
  },
  0,
), 44, 'E1 covers all 44 enemy-status link executions');
assert.equal(E1_READY_SKILL_IDS.every(skillId => skillDamageProfile(skillId).directDamage), true);
assert.equal(canExecuteE1SkillEffect('SK_FIRE_01'), true);
assert.equal(canExecuteE1SkillEffect('SK_NORMAL_03'), false, 'self buff remains reserved for E2');
assert.equal(canExecuteE1SkillEffect('SK_ICE_04'), false, 'GroundPoint field remains reserved for E3');
assert.equal(canExecuteE1SkillEffect('SK_GROUND_02'), true, 'movement skills receive canonical damage now and movement later');
assert.equal(canExecuteE1SkillEffect('SK_UNKNOWN_99'), false);

for (const profile of SKILL_DAMAGE_PROFILES.filter(row => row.directDamage && row.armorPiercePct === 0)) {
  const skill = skillCatalogEntry(profile.skillId);
  const { attacker, defender } = combatants(profile);
  const result = resolveWorkbookDirectDamage(
    { skillId: profile.skillId, attacker, defender, nowSec: 0 },
    { rng: damageRng(skill, profile) },
  );
  assert.equal(result.ok, true, profile.skillId);
  assert.equal(result.damage, profile.referenceDamageLv30, `${profile.skillId} matches workbook Lv30 reference`);
  assert.equal(result.hitCount, profile.hitCount);
  if (profile.hitCount > 1) assert.equal(result.damage < profile.referenceDamageLv30 * profile.hitCount, true, 'HitCount does not multiply the total budget');
}

const armorProfile = skillDamageProfile('SK_FIGHTING_01');
const armorActors = combatants(armorProfile);
const armor = resolveWorkbookDirectDamage(
  { skillId: armorProfile.skillId, ...armorActors, nowSec: 0 },
  { rng: damageRng(skillCatalogEntry(armorProfile.skillId), armorProfile) },
);
assert.equal(armor.ok, true);
assert.equal(armor.armorPiercePct, 25);
assert.equal(armor.effectiveDefense, 75);
assert.ok(armor.damage > armorProfile.referenceDamageLv30, 'ArmorPierce affects the live formula');

const lightProfile = skillDamageProfile('SK_LIGHT_01');
const versusDark = combatants(lightProfile, { targetType: 'Dark' });
const light = resolveWorkbookDirectDamage(
  { skillId: lightProfile.skillId, ...versusDark, nowSec: 0 },
  { rng: damageRng(skillCatalogEntry(lightProfile.skillId), lightProfile) },
);
assert.equal(light.conditionalMultiplier, 1.25, 'BonusVsDark uses the workbook +25% layer');

const specialProfile = skillDamageProfile('SK_FIRE_04');
const special = combatants(specialProfile, {
  attacker: { stats: { ATK: 5, SPATK: 140 } },
  defender: { stats: { DEF: 5, SPDEF: 70 } },
});
const specialDamage = resolveWorkbookDirectDamage(
  { skillId: specialProfile.skillId, ...special, nowSec: 0 },
  { rng: damageRng(skillCatalogEntry(specialProfile.skillId), specialProfile) },
);
assert.equal(specialDamage.effectiveAttack, 140);
assert.equal(specialDamage.effectiveDefense, 70);

const statusModified = combatants(skillDamageProfile('SK_NORMAL_01'), {
  attacker: { activeStatusIds: ['ST_ATK_UP', 'ST_CRIT_UP'], critChancePct: 5 },
  defender: {
    activeStatusIds: ['ST_DEF_UP', 'ST_VULNERABLE'],
    statusState: createEncounterStatusState({ encounterId: 'target-1', nowSec: 0 }),
  },
});
const modifiedDamage = resolveWorkbookDirectDamage(
  { skillId: 'SK_NORMAL_01', ...statusModified, nowSec: 0 },
  { rng: sequence(0.1, 0.5) },
);
assert.equal(modifiedDamage.attackModifier, 1.15);
assert.equal(modifiedDamage.defenseModifier, 1.15);
assert.equal(modifiedDamage.critChancePct, 20);
assert.equal(modifiedDamage.critical, true);
assert.equal(modifiedDamage.damageTakenMultiplier, 1.15);

const controlProfile = skillDamageProfile('SK_FIRE_05');
const control = combatants(controlProfile, { attacker: { critChancePct: 80 } });
const controlDamage = resolveWorkbookDirectDamage(
  { skillId: controlProfile.skillId, ...control, nowSec: 0 },
  { rng: sequence(0, 0.5) },
);
assert.equal(controlDamage.critical, false, 'Control damage cannot crit');
assert.equal(controlDamage.critChancePct, 0);
assert.equal(controlDamage.rngDraws, 2, 'Control accuracy + variance do not consume a crit roll');

const immuneProfile = skillDamageProfile('SK_ELECTRIC_01');
const immune = combatants(immuneProfile, { targetType: 'Ground' });
const immuneDamage = resolveWorkbookDirectDamage(
  { skillId: immuneProfile.skillId, ...immune, nowSec: 0 },
  { rng: sequence(0) },
);
assert.equal(immuneDamage.reason, 'type_immune');
assert.equal(immuneDamage.damage, 0);
assert.equal(immuneDamage.rngDraws, 0, '100% accurate immune damage consumes no irrelevant crit/variance rolls');

function command(skillId, targets) {
  const skill = skillCatalogEntry(skillId);
  return Object.freeze({
    ok: true,
    commandId: `cmd-${skillId}`,
    castId: `cmd-${skillId}`,
    skillId,
    targetKind: skill.targetType,
    targetIds: Object.freeze(targets.map(target => target.id)),
  });
}

function resolveSkill(skillId, targets, attacker, rolls, nowSec = 0) {
  return resolveE1SkillEffects({ command: command(skillId, targets), attacker, targets, nowSec }, { rng: sequence(...rolls) });
}

const burnProfile = skillDamageProfile('SK_FIRE_01');
const burnWorld = combatants(burnProfile);
const burn = resolveSkill('SK_FIRE_01', [burnWorld.defender], burnWorld.attacker, [1, 0.5, 0]);
assert.equal(burn.ok, true);
assert.equal(burn.effectMode, 'canonical_e1_direct_status');
assert.equal(burn.statusAppliedCount, 1);
assert.equal(burn.targetResults[0].statusResults[0].statusId, 'ST_BURN');
assert.equal(burn.targetResults[0].nextStatusState.statuses[0].statusId, 'ST_BURN');
assert.equal(burn.targetResults[0].nextStatusState.statuses[0].nextTickAtSec, 1, 'Burn never ticks instantly');

const selfCompositeProfile = skillDamageProfile('SK_NORMAL_05');
const selfCompositeWorld = combatants(selfCompositeProfile);
const selfComposite = resolveSkill('SK_NORMAL_05', [selfCompositeWorld.defender], selfCompositeWorld.attacker, [0, 0.5]);
assert.equal(selfComposite.ok, true);
assert.deepEqual(selfComposite.activeComponentKinds, ['direct_damage']);
assert.deepEqual(selfComposite.deferredComponentKinds, ['status']);
assert.deepEqual(selfComposite.targetResults[0].statusResults, [], 'self status never leaks onto the enemy during E1');

const movementProfile = skillDamageProfile('SK_GROUND_02');
const movementWorld = combatants(movementProfile);
const movementDamage = resolveSkill('SK_GROUND_02', [movementWorld.defender], movementWorld.attacker, [0, 1, 0.5]);
assert.equal(movementDamage.ok, true);
assert.deepEqual(movementDamage.activeComponentKinds, ['direct_damage']);
assert.deepEqual(movementDamage.deferredComponentKinds, ['movement']);

const poisonProfile = skillDamageProfile('SK_POISON_01');
const poisonWorld = combatants(poisonProfile);
const poisonFirst = resolveSkill('SK_POISON_01', [poisonWorld.defender], poisonWorld.attacker, [1, 0.5, 0]);
const poisonTarget = { ...poisonWorld.defender, statusState: poisonFirst.targetResults[0].nextStatusState };
const poisonSecond = resolveSkill('SK_POISON_01', [poisonTarget], poisonWorld.attacker, [1, 0.5, 0], 0.1);
assert.equal(poisonSecond.targetResults[0].nextStatusState.statuses[0].stacks, 2, 'resolver/lifecycle integration adds exactly one Poison stack');

const dragonProfile = skillDamageProfile('SK_DRAGON_04');
const dragonWorld = combatants(dragonProfile);
const dragon = resolveSkill('SK_DRAGON_04', [dragonWorld.defender], dragonWorld.attacker, [0, 1, 0.5, 0, 0]);
assert.equal(dragon.ok, true);
assert.deepEqual(dragon.targetResults[0].statusResults.map(status => status.statusId), ['ST_BURN', 'ST_PARALYZE']);
assert.equal(dragon.statusAppliedCount, 2);

const fireImmuneWorld = combatants(burnProfile, { targetType: 'Fire' });
const fireImmune = resolveSkill('SK_FIRE_01', [fireImmuneWorld.defender], fireImmuneWorld.attacker, [1, 0.5]);
assert.equal(fireImmune.ok, true);
assert.equal(fireImmune.targetResults[0].statusResults[0].reason, 'type_immune');
assert.equal(fireImmune.statusAppliedCount, 0);

const lethalWorld = combatants(burnProfile, { defender: { hp: 1, maxHp: 200 } });
const lethal = resolveSkill('SK_FIRE_01', [lethalWorld.defender], lethalWorld.attacker, [1, 0.5]);
assert.equal(lethal.targetResults[0].fainted, true);
assert.equal(lethal.targetResults[0].statusResults[0].reason, 'target_fainted');
assert.strictEqual(lethal.targetResults[0].nextStatusState, lethalWorld.defender.statusState);

const missWorld = combatants(specialProfile);
const miss = resolveSkill('SK_FIRE_04', [missWorld.defender], missWorld.attacker, [1]);
assert.equal(miss.ok, true);
assert.equal(miss.targetResults[0].hit, false);
assert.equal(miss.targetResults[0].damage, 0);
assert.equal(miss.targetResults[0].statusResults[0].reason, 'attack_missed');
assert.equal(miss.rngDraws, 1);

const areaProfile = skillDamageProfile('SK_FIRE_05');
const areaA = combatants(areaProfile).defender;
const areaB = { ...combatants(areaProfile).defender, id: 'target-2', statusState: createEncounterStatusState({ encounterId: 'target-2', nowSec: 0 }) };
const areaActor = combatants(areaProfile).attacker;
const area = resolveSkill('SK_FIRE_05', [areaA, areaB], areaActor, [0, 0.5, 0, 0, 0.5, 0]);
assert.equal(area.ok, true);
assert.deepEqual(area.targetResults.map(target => target.targetId), ['target-1', 'target-2']);
assert.equal(area.statusAppliedCount, 2);
assert.equal(area.totalDamage, area.targetResults[0].damage + area.targetResults[1].damage);

assert.equal(validateE1SkillEffectRequest({
  command: command('SK_FIRE_01', [burnWorld.defender]),
  attacker: burnWorld.attacker,
  targets: [burnWorld.defender],
  nowSec: 0,
}).ok, true);
assert.equal(validateE1SkillEffectRequest({
  command: { ...command('SK_FIRE_01', [burnWorld.defender]), targetIds: ['substitute'] },
  attacker: burnWorld.attacker,
  targets: [burnWorld.defender],
  nowSec: 0,
}).reason, 'target_mismatch');
assert.equal(resolveE1SkillEffects({
  command: { ok: true, skillId: 'SK_NORMAL_03', targetKind: 'Self', targetIds: ['actor-1'] },
  attacker: burnWorld.attacker,
  targets: [burnWorld.defender],
  nowSec: 0,
}, { rng: () => 0 }).reason, 'effect_not_ready');

const atomicInstance = {
  instanceId: 'atomic-actor',
  speciesId: 'flameling',
  skills: [
    { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 28 },
    { skillId: 'SK_FIRE_02', slot: 's2', currentUses: 16 },
    { skillId: 'SK_FIRE_03', slot: 's3', currentUses: 10 },
    { skillId: 'SK_FIRE_04', slot: 's4', currentUses: 10 },
  ],
};
const atomicActor = { id: atomicInstance.instanceId, alive: true, position: { x: 0, z: 0 } };
const atomicEnemy = { id: 'atomic-target', alive: true, targetable: true, position: { x: 1, z: 0 } };
const atomicEffectActor = {
  id: atomicInstance.instanceId, level: 30, types: ['Fire'], stats: { ATK: 100, SPATK: 100 }, critChancePct: 5,
};
let atomicEffectTarget = {
  id: atomicEnemy.id, level: 30, types: ['Normal'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200,
  statusState: createEncounterStatusState({ encounterId: atomicEnemy.id, nowSec: 0 }),
};
let effectCommits = 0;
let cooldownCommits = 0;
const executeAtomic = () => executeEquippedSkillCommand(atomicInstance, {
  slot: 's1', commandId: 'atomic-cast-1', actor: atomicActor, enemies: [atomicEnemy], cooldownRemainingSec: 0,
}, {
  materializeTargets: () => [{ ...atomicEnemy, world: atomicEffectTarget }],
  canApply: commandValue => validateE1SkillEffectRequest({
    command: commandValue, attacker: atomicEffectActor, targets: [atomicEffectTarget], nowSec: 0,
  }),
  applyAccepted: commandValue => {
    const applied = resolveE1SkillEffects({
      command: commandValue, attacker: atomicEffectActor, targets: [atomicEffectTarget], nowSec: 0,
    }, { rng: sequence(1, 0.5, 0) });
    assert.equal(applied.ok, true);
    effectCommits += 1;
    cooldownCommits += 1;
    atomicEffectTarget = {
      ...atomicEffectTarget,
      hp: applied.targetResults[0].predictedHp,
      statusState: applied.targetResults[0].nextStatusState,
    };
    return applied;
  },
});
const atomicFirst = executeAtomic();
const atomicReplay = executeAtomic();
assert.equal(atomicFirst.ok, true);
assert.equal(atomicReplay.reason, 'duplicate_cast');
assert.equal(atomicInstance.skills[0].currentUses, 27, 'accepted E1 cast commits Uses exactly once');
assert.equal(effectCommits, 1, 'accepted E1 effects commit exactly once');
assert.equal(cooldownCommits, 1, 'accepted E1 cooldown starts exactly once');
assert.equal(atomicEffectTarget.statusState.statuses.filter(status => status.statusId === 'ST_BURN').length, 1,
  'replay cannot apply Status twice');

assert.equal(SKILL_EFFECT_COVERAGE_CONTRACT.length, 108, 'E1 does not alter E0 coverage');
assert.deepEqual(WORKBOOK_DAMAGE_RULES, {
  formulaVersion: 'DMG_v1.0', levelMin: 1, levelCap: 60, levelScaleDivisor: 5,
  baseFormulaDivisor: 50, baseDamageFlat: 2, stabMultiplier: 1.2,
  criticalMultiplier: 1.5, baseCritChancePct: 5, critChanceCapPct: 80,
  varianceMin: 0.9, varianceMax: 1, variancePreview: 0.95,
  minimumSuccessfulDamage: 1, statModifierMin: 0.25, statModifierMax: 2.5,
  damageTakenMin: 0.25, damageTakenMax: 3, armorPierceCapPct: 50,
  bonusVsDarkPct: 25,
});

console.log('V8.2 E1 canonical DirectDamage + enemy Status: PASS');
