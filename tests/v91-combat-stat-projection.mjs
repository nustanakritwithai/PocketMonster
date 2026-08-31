import assert from 'node:assert/strict';
import { createCombatProfile } from '../combat-v91-contract.mjs';
import {
  COMBAT_FIXED_POINT_SCALE,
  COMBAT_PROFILE12_SEMANTICS,
  CORE_COMBAT_STAT_KEYS,
  PIRATE_ACTION_CATEGORIES,
  PIRATE_ACTION_PROJECTION_VERSION,
  PIRATE_PROFICIENCY_BOUNDS,
  PIRATE_PROFICIENCY_KEYS,
  SHARED_COMBAT_LEVEL_BOUNDS,
  SHARED_COMBAT_LEVEL_POLICY_VERSION,
  combatProfile12KeysMatchContract,
  createCombatProfile12SemanticView,
  createCoreCombatStats6,
  createPirateActionStatProjection,
  createPirateProficiencySnapshot,
  isPirateActionCategory,
  isPirateProficiencyKey,
  validateSharedCombatLevel,
} from '../combat-v91-stat-projection.mjs';

assert.deepEqual(CORE_COMBAT_STAT_KEYS, ['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']);
assert.deepEqual(PIRATE_PROFICIENCY_KEYS, [
  'combat', 'vitality', 'blade', 'ranged', 'fruitPower', 'mana',
]);
assert.deepEqual(PIRATE_ACTION_CATEGORIES, ['style', 'sword', 'gun', 'fruit', 'guard']);
assert.equal(combatProfile12KeysMatchContract(), true);
assert.equal(COMBAT_PROFILE12_SEMANTICS.pocketBasedCore6.hp, 'hpMax');
assert.deepEqual(COMBAT_PROFILE12_SEMANTICS.ownerRuntimeState, ['hpCurrent']);
assert.equal(COMBAT_PROFILE12_SEMANTICS.rules.proficiencyRole, 'action_scoped_input_only');
assert.equal(COMBAT_PROFILE12_SEMANTICS.rules.nativeLevelRole, 'provenance_only_never_damage_input');
assert.deepEqual(SHARED_COMBAT_LEVEL_BOUNDS, { minimum: 1, maximum: 60 });
assert.equal(validateSharedCombatLevel(1).ok, true);
assert.equal(validateSharedCombatLevel(60).ok, true);
assert.equal(validateSharedCombatLevel(0).reason, 'shared_combat_level_out_of_range');
assert.equal(validateSharedCombatLevel(61).reason, 'shared_combat_level_out_of_range');
assert.equal(validateSharedCombatLevel(2_800).reason, 'shared_combat_level_out_of_range',
  'Pirate native progression level cannot enter shared damage math');
assert.equal(validateSharedCombatLevel(1.5).reason, 'shared_combat_level_out_of_range');
assert.equal(isPirateProficiencyKey('blade'), true);
assert.equal(isPirateProficiencyKey('atk'), false);
assert.equal(isPirateActionCategory('fruit'), true);
assert.equal(isPirateActionCategory('magic'), false);

const coreInput = { hp: 500, atk: 100, def: 90, spAtk: 200, spDef: 110, spd: 80 };
const core = createCoreCombatStats6(coreInput);
assert.equal(core.ok, true);
assert.equal(Object.isFrozen(core.stats), true);
assert.deepEqual(core.stats, coreInput);
assert.equal(core.fingerprint.length, 64);
assert.equal(createCoreCombatStats6({ ...coreInput, hp: 0 }).reason, 'invalid_core6_stat');
assert.equal(createCoreCombatStats6({ ...coreInput, atk: 1.5 }).reason, 'invalid_core6_stat');
assert.equal(createCoreCombatStats6({ ...coreInput, luck: 1 }).reason, 'invalid_core6_shape');

const profileResult = createCombatProfile({
  entityId: 'human:proficiency:1',
  ownerDomain: 'Pirate',
  entityKind: 'Human',
  level: 60,
  types: ['Fighting'],
  stats: {
    hpMax: coreInput.hp,
    hpCurrent: 321,
    atk: coreInput.atk,
    def: coreInput.def,
    spAtk: coreInput.spAtk,
    spDef: coreInput.spDef,
    spd: coreInput.spd,
    accuracy: 0.95,
    crit: 0.1,
    evasion: 0.05,
    resistance: 0.08,
    penetration: 0.02,
  },
  progressionStateVersion: 'human-core-growth/v1:60',
  calculationVersion: 'pocket-shaped-human-core/v1',
  definitionVersion: 'human-archetype/v1',
  stateVersion: 8,
});
assert.equal(profileResult.ok, true);
const profile = profileResult.profile;
const semanticView = createCombatProfile12SemanticView(profile);
assert.equal(semanticView.ok, true);
assert.deepEqual(semanticView.view.coreStats, coreInput);
assert.deepEqual(semanticView.view.runtimeState, { hpCurrent: 321 });
assert.equal(semanticView.view.combatLevelPolicyVersion, SHARED_COMBAT_LEVEL_POLICY_VERSION);
assert.equal(semanticView.view.combatLevel, 60);
assert.equal(Object.isFrozen(semanticView.view.coreStats), true);
assert.equal(Object.isFrozen(semanticView.view.runtimeState), true);

const proficiencyInput = {
  authority: 'server',
  entityId: profile.entityId,
  ownerDomain: 'Pirate',
  progressionStateVersion: profile.progressionStateVersion,
  definitionVersion: 'pirate-proficiency-definition/v1',
  stateVersion: 42,
  proficiencies: {
    combat: 2_800,
    vitality: 1_400,
    blade: 1_400,
    ranged: 700,
    fruitPower: 0,
    mana: 2_800,
  },
  masteryByCategory: {
    style: 2_800,
    sword: 1_400,
    gun: 700,
    fruit: 0,
    guard: 1_400,
  },
};
const proficiency = createPirateProficiencySnapshot(proficiencyInput);
assert.equal(proficiency.ok, true);
assert.equal(Object.isFrozen(proficiency.snapshot), true);
assert.equal(Object.isFrozen(proficiency.snapshot.proficiencies), true);
assert.equal(Object.isFrozen(proficiency.snapshot.masteryByCategory), true);
assert.equal(proficiency.snapshot.fingerprint.length, 64);
assert.deepEqual(proficiencyInput.proficiencies, {
  combat: 2_800, vitality: 1_400, blade: 1_400, ranged: 700, fruitPower: 0, mana: 2_800,
});

for (const [mutation, reason] of [
  [{ ...proficiencyInput, authority: 'client' }, 'invalid_pirate_proficiency_authority'],
  [{ ...proficiencyInput, ownerDomain: 'Pocket' }, 'invalid_pirate_proficiency_owner'],
  [{ ...proficiencyInput, stateVersion: -1 }, 'invalid_pirate_proficiency_state_version'],
  [{ ...proficiencyInput, proficiencies: { ...proficiencyInput.proficiencies, blade: 2_801 } }, 'invalid_pirate_proficiency'],
  [{ ...proficiencyInput, proficiencies: { ...proficiencyInput.proficiencies, blade: 1.5 } }, 'invalid_pirate_proficiency'],
  [{ ...proficiencyInput, proficiencies: { ...proficiencyInput.proficiencies, atk: 1 } }, 'invalid_pirate_proficiency_shape'],
  [{ ...proficiencyInput, masteryByCategory: { ...proficiencyInput.masteryByCategory, magic: 1 } }, 'invalid_pirate_mastery_shape'],
  [{ ...proficiencyInput, clientPower: 999 }, 'unknown_pirate_proficiency_field'],
]) assert.equal(createPirateProficiencySnapshot(mutation).reason, reason);
assert.equal(createPirateProficiencySnapshot({
  ...proficiency.snapshot,
  fingerprint: '0'.repeat(64),
}).reason, 'pirate_proficiency_fingerprint_mismatch');

function project(category, equipmentContribution = 0, overrides = {}) {
  const selectedProficiency = overrides.proficiencySnapshot ?? proficiency.snapshot;
  return createPirateActionStatProjection({
    authority: 'server',
    combatMode: 'pirate.adventure',
    targetEntityKind: 'Monster',
    activeOwnedMonsterCount: 0,
    combatProfile: profile,
    proficiencySnapshot: selectedProficiency,
    expectedProficiencyStateVersion: selectedProficiency.stateVersion,
    expectedProficiencyFingerprint: selectedProficiency.fingerprint,
    action: {
      actionId: `pirate:${category}:1`,
      definitionVersion: `pirate-action/${category}/v1`,
      combatActionFingerprint: 'b'.repeat(64),
      category,
      equipmentContribution,
    },
    ...overrides,
  });
}

const beforeProfile = JSON.stringify(profile);
const style = project('style', 10);
assert.equal(style.ok, true);
assert.equal(style.projection.calculationVersion, PIRATE_ACTION_PROJECTION_VERSION);
assert.equal(style.projection.combatLevelPolicyVersion, SHARED_COMBAT_LEVEL_POLICY_VERSION);
assert.equal(style.projection.combatLevel, 60);
assert.equal(style.projection.ownerDomain, profile.ownerDomain);
assert.equal(style.projection.profileSchemaVersion, profile.schemaVersion);
assert.equal(style.projection.profileProgressionStateVersion, profile.progressionStateVersion);
assert.equal(style.projection.profileCalculationVersion, profile.calculationVersion);
assert.equal(style.projection.profileDefinitionVersion, profile.definitionVersion);
assert.equal(style.projection.profileStateVersion, profile.stateVersion);
assert.equal(style.projection.proficiencySchemaVersion, proficiency.snapshot.schemaVersion);
assert.equal(style.projection.proficiencyProgressionStateVersion,
  proficiency.snapshot.progressionStateVersion);
assert.equal(style.projection.proficiencyDefinitionVersion, proficiency.snapshot.definitionVersion);
assert.equal(style.projection.proficiencyStateVersion, proficiency.snapshot.stateVersion);
assert.equal(style.projection.sourceStat, 'atk');
assert.equal(style.projection.proficiencyKey, 'combat');
assert.equal(style.projection.masteryKey, 'style');
assert.equal(style.projection.proficiencyMultiplierFp, 15_000);
assert.equal(style.projection.projectedActionStat, 160);
assert.equal(style.actionStatProjection.projectedStat, 160);
assert.equal(style.actionStatProjection.baseStat, profile.stats.atk);
assert.equal(style.actionStatProjection.ownerDomain, profile.ownerDomain);
assert.equal(style.actionStatProjection.profileProgressionStateVersion,
  profile.progressionStateVersion);
assert.equal(style.actionStatProjection.profileFingerprint, profile.fingerprint);
assert.equal(style.actionStatProjection.sourceFingerprint, style.projection.fingerprint);
assert.equal(Object.isFrozen(style.actionStatProjection), true);
assert.equal(Number.isInteger(style.projection.proficiencyRatioFp), true);
assert.equal(Number.isInteger(style.projection.projectedActionStat), true);
assert.equal(Object.isFrozen(style.projection), true);
assert.equal(Object.hasOwn(style.projection, 'stats'), false, 'projection cannot replace CombatProfile12');
assert.equal(Object.hasOwn(style.projection, 'hpCurrent'), false, 'projection cannot commit HP');
assert.equal(JSON.stringify(profile), beforeProfile, 'projection leaves Core6 and hpCurrent untouched');

const sword = project('sword');
assert.equal(sword.ok, true);
assert.equal(sword.projection.sourceStat, 'atk');
assert.equal(sword.projection.proficiencyKey, 'blade');
assert.equal(sword.projection.proficiencyMultiplierFp, 12_500);
assert.equal(sword.projection.projectedActionStat, 125);

const gun = project('gun');
assert.equal(gun.ok, true);
assert.equal(gun.projection.proficiencyKey, 'ranged');
assert.equal(gun.projection.proficiencyMultiplierFp, 11_250);
assert.equal(gun.projection.projectedActionStat, 112);

const fruit = project('fruit');
assert.equal(fruit.ok, true);
assert.equal(fruit.projection.sourceStat, 'spAtk');
assert.equal(fruit.projection.proficiencyKey, 'fruitPower');
assert.equal(fruit.projection.proficiencyMultiplierFp, COMBAT_FIXED_POINT_SCALE);
assert.equal(fruit.projection.projectedActionStat, 200);

const guard = project('guard');
assert.equal(guard.ok, true);
assert.equal(guard.projection.role, 'defense');
assert.equal(guard.projection.sourceStat, 'def');
assert.equal(guard.projection.proficiencyKey, 'vitality');
assert.equal(guard.projection.masteryKey, 'guard');
assert.equal(guard.projection.projectedActionStat, 112);

const alternateInactiveValues = createPirateProficiencySnapshot({
  ...proficiencyInput,
  stateVersion: 43,
  proficiencies: {
    ...proficiencyInput.proficiencies,
    combat: 0,
    vitality: 0,
    ranged: 2_800,
    fruitPower: 2_800,
    mana: 0,
  },
  masteryByCategory: {
    ...proficiencyInput.masteryByCategory,
    style: 0,
    gun: 2_800,
    fruit: 2_800,
    guard: 0,
  },
});
assert.equal(alternateInactiveValues.ok, true);
const sameSword = project('sword', 0, { proficiencySnapshot: alternateInactiveValues.snapshot });
assert.equal(sameSword.ok, true);
assert.equal(sameSword.projection.projectedActionStat, sword.projection.projectedActionStat,
  'only the active action category can affect the projection');

const repeatedSword = project('sword');
assert.equal(repeatedSword.projection.fingerprint, sword.projection.fingerprint,
  'fixed-point projection is deterministic');

assert.equal(project('sword', 0, {
  expectedProficiencyStateVersion: proficiency.snapshot.stateVersion + 1,
}).reason, 'pirate_projection_proficiency_snapshot_mismatch',
  'a stale/forged expected proficiency state cannot authorize a projection');
assert.equal(project('sword', 0, {
  expectedProficiencyFingerprint: '0'.repeat(64),
}).reason, 'pirate_projection_proficiency_snapshot_mismatch',
  'a stale/forged expected proficiency fingerprint cannot authorize a projection');

const staleProgression = createPirateProficiencySnapshot({
  ...proficiencyInput,
  progressionStateVersion: 'human-core-growth/v1:stale',
  stateVersion: proficiency.snapshot.stateVersion + 1,
});
assert.equal(staleProgression.ok, true);
assert.equal(project('sword', 0, {
  proficiencySnapshot: staleProgression.snapshot,
}).reason, 'pirate_projection_progression_mismatch',
  'a proficiency snapshot from another progression revision cannot bind to the current profile');

assert.equal(createPirateActionStatProjection({
  authority: 'server',
  combatMode: 'monster-life.capture',
  targetEntityKind: 'Monster',
  activeOwnedMonsterCount: 1,
  combatProfile: profile,
  proficiencySnapshot: proficiency.snapshot,
  expectedProficiencyStateVersion: proficiency.snapshot.stateVersion,
  expectedProficiencyFingerprint: proficiency.snapshot.fingerprint,
  action: {
    actionId: 'pirate:sword:capture-mode',
    definitionVersion: 'pirate-action/sword/v1',
    combatActionFingerprint: 'b'.repeat(64),
    category: 'sword',
    equipmentContribution: 0,
  },
}).reason, 'actor_damage_forbidden', 'Ring 0 keeps the player from becoming the damage source');
assert.equal(createPirateActionStatProjection({
  authority: 'server',
  combatMode: 'monster-life.capture',
  targetEntityKind: 'Monster',
  activeOwnedMonsterCount: 1,
  combatProfile: profile,
  proficiencySnapshot: proficiency.snapshot,
  expectedProficiencyStateVersion: proficiency.snapshot.stateVersion,
  expectedProficiencyFingerprint: proficiency.snapshot.fingerprint,
  action: {
    actionId: 'pirate:guard:capture-mode',
    definitionVersion: 'pirate-action/guard/v1',
    combatActionFingerprint: 'b'.repeat(64),
    category: 'guard',
    equipmentContribution: 0,
  },
}).ok, true, 'Ring 0 still permits a non-damage guard projection');

for (const [projection, reason] of [
  [project('sword', 0, { authority: 'client' }), 'invalid_pirate_projection_authority'],
  [project('sword', 0, { combatMode: 'unknown' }), 'unknown_combat_mode'],
  [project('sword', 0, {
    proficiencySnapshot: { ...proficiency.snapshot, entityId: 'human:other', fingerprint: undefined },
  }), 'pirate_projection_entity_mismatch'],
  [createPirateActionStatProjection({
    authority: 'server', combatMode: 'pirate.adventure', targetEntityKind: 'Monster',
    activeOwnedMonsterCount: 0, combatProfile: profile,
    proficiencySnapshot: proficiency.snapshot,
    expectedProficiencyStateVersion: proficiency.snapshot.stateVersion,
    expectedProficiencyFingerprint: proficiency.snapshot.fingerprint,
    action: {
      actionId: 'x', definitionVersion: 'x/v1', combatActionFingerprint: 'b'.repeat(64),
      category: 'magic', equipmentContribution: 0,
    },
  }), 'invalid_pirate_action_category'],
  [project('sword', PIRATE_PROFICIENCY_BOUNDS.equipmentContributionMaximum + 1),
    'invalid_pirate_equipment_contribution'],
]) assert.equal(projection.reason, reason);

assert.equal(createPirateActionStatProjection({
  authority: 'server',
  combatMode: 'pirate.adventure',
  targetEntityKind: 'Monster',
  activeOwnedMonsterCount: 0,
  combatProfile: profile,
  proficiencySnapshot: proficiency.snapshot,
  action: {
    actionId: 'pirate:sword:missing-current-source',
    definitionVersion: 'pirate-action/sword/v1',
    combatActionFingerprint: 'b'.repeat(64),
    category: 'sword',
    equipmentContribution: 0,
  },
}).reason, 'pirate_projection_proficiency_expectation_required',
  'callers must provide the authoritative current proficiency state and fingerprint');

const pocketProfile = createCombatProfile({
  ...profile,
  entityId: 'monster:projection:forbidden',
  ownerDomain: 'Pocket',
  entityKind: 'Monster',
  fingerprint: undefined,
}).profile;
assert.equal(project('sword', 0, { combatProfile: pocketProfile }).reason,
  'pirate_combat_profile_required', 'Pocket Base Stats cannot enter Pirate projection');

console.log('V9.1 stat projection: PASS (Pocket Core6, immutable Profile12, bounded Pirate proficiency)');
