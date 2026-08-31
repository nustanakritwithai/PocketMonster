import assert from 'node:assert/strict';
import {
  COMBAT_V91_ADAPTER_VERSION,
  HUMAN_ACTION_EQUIPMENT_POLICY,
  HUMAN_COMBAT_DEFINITION_SET_SCHEMA,
  HUMAN_CORE_CALCULATION_VERSION,
  HUMAN_CORE_GROWTH_DEFINITION_SCHEMA,
  HUMAN_HP_OWNER_STATE_SCHEMA,
  HUMAN_RATINGS_DEFINITION_SCHEMA,
  PIRATE_PROGRESSION_SOURCE,
  createDomainCombatProfile,
  createHumanCoreGrowthDefinition,
  createHumanCurrentHpOwnerState,
  createHumanRatingsDefinition,
  createPirateCombatProfile,
  createPocketCombatProfile,
} from '../combat-v91-adapters.mjs';
import { MONSTER_STAT_CATALOG_VERSION } from '../monster-stat-catalog.mjs';
import {
  SHARED_COMBAT_LEVEL_POLICY_VERSION,
  createPirateActionStatProjection,
  createPirateProficiencySnapshot,
} from '../combat-v91-stat-projection.mjs';

const ratings = Object.freeze({
  accuracy: 0.95, crit: 0.05, evasion: 0.02, resistance: 0.1, penetration: 0,
});

assert.equal(COMBAT_V91_ADAPTER_VERSION, 'combat-v91-adapters/v3');
assert.equal(PIRATE_PROGRESSION_SOURCE.commit, '4df5721de8bdb20c28e53b6a8c933616e132c96d');
assert.equal(PIRATE_PROGRESSION_SOURCE.role, 'action_scoped_proficiency_only');

// Pocket remains the existing direct owner-calculator path.
const pocketInput = {
  entityId: 'monster:ember:1', formId: 'MON_002', level: 15, currentHp: 41, ratings,
  progressionStateVersion: 'monster-save/15:1', stateVersion: 1,
};
const pocket = createPocketCombatProfile(pocketInput);
assert.equal(pocket.ok, true);
assert.equal(pocket.profile.ownerDomain, 'Pocket');
assert.equal(pocket.profile.entityKind, 'Monster');
assert.deepEqual(pocket.profile.types, ['Fire']);
assert.deepEqual(pocket.profile.stats, {
  hpMax: 41, hpCurrent: 41, atk: 18, def: 17, spAtk: 23, spDef: 18, spd: 21, ...ratings,
});
assert.equal(pocket.profile.definitionVersion, MONSTER_STAT_CATALOG_VERSION);

const routedPocket = createDomainCombatProfile({ ownerDomain: 'Pocket', profileInput: pocketInput });
assert.equal(routedPocket.ok, true);
assert.equal(routedPocket.profile.fingerprint, pocket.profile.fingerprint);

const maxPotential = { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 };
const maxTraining = { hp: 200, atk: 200, def: 0, spAtk: 200, spDef: 0, spd: 0 };
const pocketBoss = createPocketCombatProfile({
  ...pocketInput, entityId: 'boss:blaze:60', entityKind: 'Boss', formId: 'MON_020', level: 60,
  potential: maxPotential, training: maxTraining, currentHp: 221, stateVersion: 5,
});
assert.equal(pocketBoss.ok, true);
assert.equal(pocketBoss.profile.stats.hpMax, 221);
assert.equal(pocketBoss.profile.stats.spAtk, 167);
assert.equal(pocketBoss.profile.stats.spDef, 106);

assert.equal(createPocketCombatProfile({
  ...pocketInput, definitionVersion: 'monster-stat-catalog/stale',
}).reason, 'pocket_definition_version_mismatch');
assert.equal(createPocketCombatProfile({ ...pocketInput, entityKind: 'Human' }).reason,
  'invalid_pocket_entity_kind');
assert.equal(createPocketCombatProfile({ ...pocketInput, ratings: undefined }).reason,
  'authoritative_definition_required');
assert.equal(createPocketCombatProfile({ ...pocketInput, currentHp: 42 }).reason, 'invalid_current_hp');

const progressionStateVersion = 'pirate-save/v2:42';
const coreStats = Object.freeze({ hp: 120, atk: 34, def: 29, spAtk: 41, spDef: 33, spd: 37 });
const coreInput = {
  authority: 'server',
  ownerDomain: 'Pirate',
  combatLevelPolicyVersion: SHARED_COMBAT_LEVEL_POLICY_VERSION,
  combatLevel: 15,
  progressionStateVersion,
  calculationVersion: HUMAN_CORE_CALCULATION_VERSION,
  definitionVersion: 'pirate-human-archetype/adventurer-v1',
  equipmentPolicy: HUMAN_ACTION_EQUIPMENT_POLICY,
  coreStats,
};
const coreResult = createHumanCoreGrowthDefinition(coreInput);
assert.equal(coreResult.ok, true);
assert.equal(coreResult.definition.schemaVersion, HUMAN_CORE_GROWTH_DEFINITION_SCHEMA);
assert.equal(coreResult.definition.fingerprint.length, 64);
assert.equal(Object.isFrozen(coreResult.definition.coreStats), true);
assert.deepEqual(createHumanCoreGrowthDefinition(coreInput).definition, coreResult.definition,
  'same authoritative Core6 input has the same definition fingerprint');

const ratingsResult = createHumanRatingsDefinition({
  authority: 'server',
  ownerDomain: 'Pirate',
  definitionVersion: 'pirate-human-ratings/v1',
  ratings,
});
assert.equal(ratingsResult.ok, true);
assert.equal(ratingsResult.definition.schemaVersion, HUMAN_RATINGS_DEFINITION_SCHEMA);
assert.equal(Object.isFrozen(ratingsResult.definition.ratings), true);

function proficiencyFor(entityId, overrides = {}) {
  return createPirateProficiencySnapshot({
    authority: 'server',
    entityId,
    ownerDomain: 'Pirate',
    progressionStateVersion,
    definitionVersion: 'pirate-proficiency-definition/v1',
    stateVersion: 42,
    proficiencies: {
      combat: 2_800,
      vitality: 1_400,
      blade: 700,
      ranged: 350,
      fruitPower: 1_400,
      mana: 2_800,
    },
    masteryByCategory: {
      style: 2_800,
      sword: 700,
      gun: 350,
      fruit: 1_400,
      guard: 1_400,
    },
    ...overrides,
  });
}

function pirateInputFor(entityId, entityKind = 'Human', hpCurrent = 97, proficiencyOverrides = {}) {
  const ownerState = createHumanCurrentHpOwnerState({
    authority: 'server',
    ownerDomain: 'Pirate',
    entityId,
    coreDefinitionFingerprint: coreResult.definition.fingerprint,
    hpCurrent,
    stateVersion: 8,
  });
  assert.equal(ownerState.ok, true);
  assert.equal(ownerState.state.schemaVersion, HUMAN_HP_OWNER_STATE_SCHEMA);
  const proficiency = proficiencyFor(entityId, proficiencyOverrides);
  assert.equal(proficiency.ok, true);
  return {
    entityId,
    entityKind,
    types: ['Fighting'],
    humanCoreGrowthDefinition: coreResult.definition,
    ratingsDefinition: ratingsResult.definition,
    currentHpOwnerState: ownerState.state,
    proficiencySnapshot: proficiency.snapshot,
  };
}

const pirateInput = pirateInputFor('human:1');
const pirate = createPirateCombatProfile(pirateInput);
assert.equal(pirate.ok, true);
assert.equal(pirate.profile.ownerDomain, 'Pirate');
assert.equal(pirate.profile.entityKind, 'Human');
assert.equal(pirate.profile.level, 15, 'shared combat level is 1-60 and not Pirate native level');
assert.deepEqual(pirate.profile.stats, {
  hpMax: 120,
  hpCurrent: 97,
  atk: 34,
  def: 29,
  spAtk: 41,
  spDef: 33,
  spd: 37,
  ...ratings,
});
assert.equal(pirate.profile.calculationVersion, HUMAN_CORE_CALCULATION_VERSION);
assert.equal(pirate.profile.definitionVersion.startsWith(`${HUMAN_COMBAT_DEFINITION_SET_SCHEMA}:`), true);
assert.equal(pirate.proficiencySnapshot.fingerprint, pirateInput.proficiencySnapshot.fingerprint);
assert.equal(pirate.provenance.equipmentPolicy, HUMAN_ACTION_EQUIPMENT_POLICY);
assert.equal(pirate.provenance.definitionSetFingerprint.length, 64);

const routedPirate = createDomainCombatProfile({ ownerDomain: 'Pirate', profileInput: pirateInput });
assert.equal(routedPirate.ok, true);
assert.equal(routedPirate.profile.fingerprint, pirate.profile.fingerprint);

// Pirate stats/mastery are an action-scoped snapshot and never rewrite Core6.
const alternateProficiencyInput = pirateInputFor('human:1', 'Human', 97, {
  stateVersion: 43,
  proficiencies: {
    combat: 0, vitality: 0, blade: 2_800, ranged: 2_800, fruitPower: 0, mana: 0,
  },
  masteryByCategory: { style: 0, sword: 2_800, gun: 2_800, fruit: 0, guard: 0 },
});
const alternateProficiency = createPirateCombatProfile(alternateProficiencyInput);
assert.equal(alternateProficiency.ok, true);
assert.equal(alternateProficiency.profile.fingerprint, pirate.profile.fingerprint,
  'proficiency changes do not change Pocket-shaped Base CombatStats');
assert.notEqual(alternateProficiency.proficiencySnapshot.fingerprint, pirate.proficiencySnapshot.fingerprint);

const projectedStyle = createPirateActionStatProjection({
  authority: 'server',
  combatMode: 'pirate.adventure',
  targetEntityKind: 'Monster',
  activeOwnedMonsterCount: 0,
  combatProfile: pirate.profile,
  proficiencySnapshot: pirate.proficiencySnapshot,
  expectedProficiencyStateVersion: pirate.proficiencySnapshot.stateVersion,
  expectedProficiencyFingerprint: pirate.proficiencySnapshot.fingerprint,
  action: {
    actionId: 'pirate:style:basic',
    definitionVersion: 'pirate-action/style/v1',
    combatActionFingerprint: 'a'.repeat(64),
    category: 'style',
    equipmentContribution: 11,
  },
});
assert.equal(projectedStyle.ok, true);
assert.equal(pirate.profile.stats.atk, 34, 'action equipment is excluded from Core6');
assert.equal(projectedStyle.projection.projectedActionStat, 62,
  'proficiency scales Core6 before one action-scoped equipment contribution');

for (const entityKind of ['Npc', 'Boss', 'Ship']) {
  const profile = createPirateCombatProfile(pirateInputFor(`pirate:${entityKind}`, entityKind));
  assert.equal(profile.ok, true, `Pirate owns ${entityKind} progression when explicitly routed`);
}
assert.equal(createPirateCombatProfile(pirateInputFor('pirate:Monster', 'Monster')).reason,
  'invalid_pirate_entity_kind');

// Old V9.1 inputs fail closed; native level 1..2800 and legacy stats cannot enter Base Core6.
assert.deepEqual(createPirateCombatProfile({ ...pirateInput, level: 2_800 }), {
  ok: false, reason: 'unknown_pirate_profile_input_field', field: 'level',
});
assert.equal(createPirateCombatProfile({
  ...pirateInput,
  progression: { combat: 2_800, vitality: 2_800, blade: 2_800, ranged: 2_800, fruitPower: 2_800, mana: 2_800 },
}).reason, 'unknown_pirate_profile_input_field');
assert.equal(createPirateCombatProfile({ ...pirateInput, combatDefinition: {} }).reason,
  'unknown_pirate_profile_input_field');
assert.equal(createPirateCombatProfile({
  ...pirateInput,
  humanCoreGrowthDefinition: { ...coreResult.definition, fingerprint: undefined },
}).reason, 'human_core_definition_fingerprint_required');
assert.equal(createPirateCombatProfile({
  ...pirateInput,
  proficiencySnapshot: { ...pirateInput.proficiencySnapshot, fingerprint: undefined },
}).reason, 'pirate_proficiency_fingerprint_required');

assert.equal(createHumanCoreGrowthDefinition({ ...coreInput, combatLevel: 2_800 }).reason,
  'shared_combat_level_out_of_range');
assert.equal(createHumanCoreGrowthDefinition({ ...coreInput, authority: 'client' }).reason,
  'invalid_human_core_definition_authority');
assert.equal(createHumanCoreGrowthDefinition({
  ...coreInput, calculationVersion: 'client-invented/v999',
}).reason, 'human_core_calculation_version_mismatch');
assert.equal(createHumanCoreGrowthDefinition({
  ...coreInput, equipmentPolicy: 'included_in_core6',
}).reason, 'human_core_equipment_policy_mismatch');
assert.equal(createHumanCoreGrowthDefinition({
  ...coreResult.definition, fingerprint: '0'.repeat(64),
}).reason, 'human_core_definition_fingerprint_mismatch');
assert.equal(createHumanCoreGrowthDefinition({
  ...coreInput, coreStats: { ...coreStats, weaponDamage: 999 },
}).reason, 'invalid_human_core_stats');
assert.equal(createHumanCoreGrowthDefinition({
  ...coreInput, ratings,
}).reason, 'invalid_human_core_definition_shape', 'ratings cannot be hidden inside Core6');

assert.equal(createHumanRatingsDefinition({
  ...ratingsResult.definition, fingerprint: '0'.repeat(64),
}).reason, 'human_ratings_definition_fingerprint_mismatch');
assert.equal(createHumanRatingsDefinition({
  authority: 'server', ownerDomain: 'Pirate', definitionVersion: 'x', ratings: { ...ratings, crit: 1.01 },
}).reason, 'invalid_authoritative_rating');

const wrongCoreOwnerState = createHumanCurrentHpOwnerState({
  authority: 'server',
  ownerDomain: 'Pirate',
  entityId: 'human:1',
  coreDefinitionFingerprint: '0'.repeat(64),
  hpCurrent: 97,
  stateVersion: 8,
});
assert.equal(wrongCoreOwnerState.ok, true);
assert.equal(createPirateCombatProfile({
  ...pirateInput, currentHpOwnerState: wrongCoreOwnerState.state,
}).reason, 'human_hp_owner_core_definition_mismatch');

const excessiveHpOwnerState = createHumanCurrentHpOwnerState({
  authority: 'server',
  ownerDomain: 'Pirate',
  entityId: 'human:1',
  coreDefinitionFingerprint: coreResult.definition.fingerprint,
  hpCurrent: 121,
  stateVersion: 8,
});
assert.equal(excessiveHpOwnerState.ok, true);
assert.equal(createPirateCombatProfile({
  ...pirateInput, currentHpOwnerState: excessiveHpOwnerState.state,
}).reason, 'invalid_current_hp');

const staleProficiency = proficiencyFor('human:1', { progressionStateVersion: 'pirate-save/v2:stale' });
assert.equal(staleProficiency.ok, true);
assert.equal(createPirateCombatProfile({
  ...pirateInput, proficiencySnapshot: staleProficiency.snapshot,
}).reason, 'pirate_progression_snapshot_mismatch');
assert.equal(createPirateCombatProfile({
  ...pirateInput,
  currentHpOwnerState: createHumanCurrentHpOwnerState({
    ...pirateInput.currentHpOwnerState,
    entityId: 'human:other',
    fingerprint: undefined,
  }).state,
}).reason, 'pirate_profile_entity_mismatch');

assert.equal(createDomainCombatProfile({ ownerDomain: 'World', profileInput: pirateInput }).reason,
  'unsupported_combat_profile_owner');
assert.equal(createDomainCombatProfile({ ownerDomain: 'Pocket' }).reason, 'invalid_domain_profile_source');

console.log('V9.1 combat adapters: PASS (Pocket Core6, Human authoritative definitions, proficiency-only Pirate stats)');
