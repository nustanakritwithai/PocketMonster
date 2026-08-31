import {
  HUMAN_ACTION_EQUIPMENT_POLICY,
  HUMAN_CORE_CALCULATION_VERSION,
  createHumanCoreGrowthDefinition,
  createHumanCurrentHpOwnerState,
  createHumanRatingsDefinition,
} from '../combat-v91-adapters.mjs';
import {
  SHARED_COMBAT_LEVEL_POLICY_VERSION,
  createPirateProficiencySnapshot,
} from '../combat-v91-stat-projection.mjs';

function must(result, label) {
  if (!result?.ok) throw new Error(`${label}: ${result?.reason ?? 'unknown'}`);
  return result;
}

export function fixturePirateProfileSource({
  entityId,
  entityKind = 'Human',
  combatLevel = 15,
  currentHp = 145,
  stateVersion = 1,
  ratings,
  coreStats = { hp: 145, atk: 10, def: 10, spAtk: 10, spDef: 10, spd: 10 },
  progressionStateVersion = `${entityId}/pirate-progression/v3`,
} = {}) {
  const core = must(createHumanCoreGrowthDefinition({
    authority: 'server',
    ownerDomain: 'Pirate',
    combatLevelPolicyVersion: SHARED_COMBAT_LEVEL_POLICY_VERSION,
    combatLevel,
    progressionStateVersion,
    calculationVersion: HUMAN_CORE_CALCULATION_VERSION,
    definitionVersion: 'pirate-human-archetype/test-v1',
    equipmentPolicy: HUMAN_ACTION_EQUIPMENT_POLICY,
    coreStats,
  }), 'human core fixture').definition;
  const ratingDefinition = must(createHumanRatingsDefinition({
    authority: 'server',
    ownerDomain: 'Pirate',
    definitionVersion: 'pirate-human-ratings/test-v1',
    ratings,
  }), 'human ratings fixture').definition;
  const ownerState = must(createHumanCurrentHpOwnerState({
    authority: 'server',
    ownerDomain: 'Pirate',
    entityId,
    coreDefinitionFingerprint: core.fingerprint,
    hpCurrent: currentHp,
    stateVersion,
  }), 'human HP fixture').state;
  const proficiency = must(createPirateProficiencySnapshot({
    authority: 'server',
    entityId,
    ownerDomain: 'Pirate',
    progressionStateVersion,
    definitionVersion: 'pirate-proficiency/test-v1',
    stateVersion,
    proficiencies: {
      combat: 10,
      vitality: 10,
      blade: 10,
      ranged: 10,
      fruitPower: 10,
      mana: 10,
    },
    masteryByCategory: {
      style: 10,
      sword: 10,
      gun: 10,
      fruit: 10,
      guard: 10,
    },
  }), 'pirate proficiency fixture').snapshot;
  return {
    ownerDomain: 'Pirate',
    profileInput: {
      entityId,
      entityKind,
      types: [],
      humanCoreGrowthDefinition: core,
      ratingsDefinition: ratingDefinition,
      currentHpOwnerState: ownerState,
      proficiencySnapshot: proficiency,
    },
  };
}

export function withProfileSourceHp(source, hpCurrent, stateVersion) {
  const next = structuredClone(source);
  if (next.ownerDomain === 'Pocket') {
    next.profileInput.currentHp = hpCurrent;
    next.profileInput.stateVersion = stateVersion;
    return next;
  }
  const current = next.profileInput.currentHpOwnerState;
  next.profileInput.currentHpOwnerState = must(createHumanCurrentHpOwnerState({
    ...current,
    hpCurrent,
    stateVersion,
    fingerprint: undefined,
  }), 'updated human HP fixture').state;
  return next;
}
