import {
  COMBAT_RATIO_KEYS,
  createCombatProfile,
  fingerprintCombatValue,
} from './combat-v91-contract.mjs';
import {
  SHARED_COMBAT_LEVEL_POLICY_VERSION,
  createCoreCombatStats6,
  createPirateProficiencySnapshot,
  validateSharedCombatLevel,
} from './combat-v91-stat-projection.mjs';
import {
  MONSTER_STAT_FORMULA_VERSION,
  calculateMonsterStats,
} from './monster-stat-formula.mjs';
import {
  MONSTER_STAT_CATALOG_VERSION,
  monsterStatCatalogEntry,
} from './monster-stat-catalog.mjs';

export const COMBAT_V91_ADAPTER_VERSION = 'combat-v91-adapters/v3';
export const HUMAN_CORE_GROWTH_DEFINITION_SCHEMA = 'human-core-growth-definition/v9.1';
export const HUMAN_CORE_CALCULATION_VERSION = 'pirate-human-core/pocket-shaped-core6-v1';
export const HUMAN_RATINGS_DEFINITION_SCHEMA = 'human-combat-ratings-definition/v9.1';
export const HUMAN_HP_OWNER_STATE_SCHEMA = 'human-hp-owner-state/v9.1';
export const HUMAN_COMBAT_DEFINITION_SET_SCHEMA = 'human-combat-definition-set/v9.1';
export const HUMAN_ACTION_EQUIPMENT_POLICY = 'excluded_from_core6_action_scoped_only';

export const PIRATE_PROGRESSION_SOURCE = Object.freeze({
  repository: 'https://github.com/nustanakritwithai/Pirate-fruit-',
  commit: '4df5721de8bdb20c28e53b6a8c933616e132c96d',
  module: 'shared/src/progression/stats.ts',
  calculationVersion: 'pirate-progression-stats/4df5721',
  role: 'action_scoped_proficiency_only',
});

const DOMAIN_ENTITY_KINDS = Object.freeze({
  Pirate: Object.freeze(['Human', 'Npc', 'Boss', 'Ship']),
  Pocket: Object.freeze(['Monster', 'Npc', 'Boss']),
});
const HUMAN_CORE_DEFINITION_KEYS = Object.freeze([
  'schemaVersion',
  'authority',
  'ownerDomain',
  'combatLevelPolicyVersion',
  'combatLevel',
  'progressionStateVersion',
  'calculationVersion',
  'definitionVersion',
  'equipmentPolicy',
  'coreStats',
]);
const HUMAN_RATINGS_DEFINITION_KEYS = Object.freeze([
  'schemaVersion',
  'authority',
  'ownerDomain',
  'definitionVersion',
  'ratings',
]);
const HUMAN_HP_OWNER_STATE_KEYS = Object.freeze([
  'schemaVersion',
  'authority',
  'ownerDomain',
  'entityId',
  'coreDefinitionFingerprint',
  'hpCurrent',
  'stateVersion',
]);
const PIRATE_PROFILE_INPUT_KEYS = new Set([
  'entityId',
  'entityKind',
  'types',
  'humanCoreGrowthDefinition',
  'ratingsDefinition',
  'currentHpOwnerState',
  'proficiencySnapshot',
]);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalFingerprint(payload, suppliedFingerprint, mismatchReason) {
  const fingerprint = fingerprintCombatValue(payload);
  if (suppliedFingerprint !== undefined && suppliedFingerprint !== fingerprint) {
    return result(false, mismatchReason, { expectedFingerprint: fingerprint });
  }
  return result(true, null, { fingerprint });
}

function definitionInput(input, keys, invalidReason) {
  if (!isRecord(input)) return result(false, invalidReason);
  const allowed = [...keys, 'fingerprint'];
  const unknown = Object.keys(input).find(key => !allowed.includes(key));
  if (unknown) return result(false, invalidReason, { field: unknown });
  return result(true, null);
}

function validateRatings(ratings) {
  if (!exactKeys(ratings, COMBAT_RATIO_KEYS)) return result(false, 'invalid_authoritative_ratings_shape');
  for (const key of COMBAT_RATIO_KEYS) {
    if (!Number.isFinite(ratings[key]) || ratings[key] < 0 || ratings[key] > 1) {
      return result(false, 'invalid_authoritative_rating', { field: key });
    }
  }
  return result(true, null);
}

function validatePocketRatings(ratings) {
  if (!isRecord(ratings)) return result(false, 'authoritative_definition_required');
  for (const key of COMBAT_RATIO_KEYS) {
    if (!Number.isFinite(ratings[key]) || ratings[key] < 0 || ratings[key] > 1) {
      return result(false, 'invalid_authoritative_rating', { field: key });
    }
  }
  return result(true, null);
}

function validCurrentHp(value, hpMax) {
  return Number.isFinite(value) && value >= 0 && value <= hpMax;
}

function hasCanonicalFingerprint(value) {
  return isRecord(value) && typeof value.fingerprint === 'string'
    && /^[0-9a-f]{64}$/.test(value.fingerprint);
}

export function createHumanCoreGrowthDefinition(input = {}) {
  const shape = definitionInput(input, HUMAN_CORE_DEFINITION_KEYS, 'invalid_human_core_definition_shape');
  if (!shape.ok) return shape;
  if (input.schemaVersion !== undefined && input.schemaVersion !== HUMAN_CORE_GROWTH_DEFINITION_SCHEMA) {
    return result(false, 'human_core_definition_schema_mismatch');
  }
  if (input.authority !== 'server') return result(false, 'invalid_human_core_definition_authority');
  if (input.ownerDomain !== 'Pirate') return result(false, 'invalid_human_core_definition_owner');
  if (input.combatLevelPolicyVersion !== SHARED_COMBAT_LEVEL_POLICY_VERSION) {
    return result(false, 'human_core_level_policy_mismatch');
  }
  const levelValidation = validateSharedCombatLevel(input.combatLevel);
  if (!levelValidation.ok) return levelValidation;
  for (const field of ['progressionStateVersion', 'definitionVersion']) {
    if (!nonEmptyString(input[field])) return result(false, 'invalid_human_core_definition_version', { field });
  }
  if (input.calculationVersion !== HUMAN_CORE_CALCULATION_VERSION) {
    return result(false, 'human_core_calculation_version_mismatch');
  }
  if (input.equipmentPolicy !== HUMAN_ACTION_EQUIPMENT_POLICY) {
    return result(false, 'human_core_equipment_policy_mismatch');
  }
  const core = createCoreCombatStats6(input.coreStats);
  if (!core.ok) return result(false, 'invalid_human_core_stats', { cause: core });

  const payload = {
    schemaVersion: HUMAN_CORE_GROWTH_DEFINITION_SCHEMA,
    authority: 'server',
    ownerDomain: 'Pirate',
    combatLevelPolicyVersion: SHARED_COMBAT_LEVEL_POLICY_VERSION,
    combatLevel: input.combatLevel,
    progressionStateVersion: input.progressionStateVersion,
    calculationVersion: HUMAN_CORE_CALCULATION_VERSION,
    definitionVersion: input.definitionVersion,
    equipmentPolicy: HUMAN_ACTION_EQUIPMENT_POLICY,
    coreStats: core.stats,
  };
  const fingerprintResult = canonicalFingerprint(
    payload,
    input.fingerprint,
    'human_core_definition_fingerprint_mismatch',
  );
  if (!fingerprintResult.ok) return fingerprintResult;
  return result(true, null, {
    definition: deepFreeze({ ...payload, fingerprint: fingerprintResult.fingerprint }),
  });
}

export function createHumanRatingsDefinition(input = {}) {
  const shape = definitionInput(
    input,
    HUMAN_RATINGS_DEFINITION_KEYS,
    'invalid_human_ratings_definition_shape',
  );
  if (!shape.ok) return shape;
  if (input.schemaVersion !== undefined && input.schemaVersion !== HUMAN_RATINGS_DEFINITION_SCHEMA) {
    return result(false, 'human_ratings_definition_schema_mismatch');
  }
  if (input.authority !== 'server') return result(false, 'invalid_human_ratings_definition_authority');
  if (input.ownerDomain !== 'Pirate') return result(false, 'invalid_human_ratings_definition_owner');
  if (!nonEmptyString(input.definitionVersion)) {
    return result(false, 'invalid_human_ratings_definition_version');
  }
  const ratingValidation = validateRatings(input.ratings);
  if (!ratingValidation.ok) return ratingValidation;

  const payload = {
    schemaVersion: HUMAN_RATINGS_DEFINITION_SCHEMA,
    authority: 'server',
    ownerDomain: 'Pirate',
    definitionVersion: input.definitionVersion,
    ratings: Object.freeze(Object.fromEntries(COMBAT_RATIO_KEYS.map(key => [key, input.ratings[key]]))),
  };
  const fingerprintResult = canonicalFingerprint(
    payload,
    input.fingerprint,
    'human_ratings_definition_fingerprint_mismatch',
  );
  if (!fingerprintResult.ok) return fingerprintResult;
  return result(true, null, {
    definition: deepFreeze({ ...payload, fingerprint: fingerprintResult.fingerprint }),
  });
}

export function createHumanCurrentHpOwnerState(input = {}) {
  const shape = definitionInput(input, HUMAN_HP_OWNER_STATE_KEYS, 'invalid_human_hp_owner_state_shape');
  if (!shape.ok) return shape;
  if (input.schemaVersion !== undefined && input.schemaVersion !== HUMAN_HP_OWNER_STATE_SCHEMA) {
    return result(false, 'human_hp_owner_state_schema_mismatch');
  }
  if (input.authority !== 'server') return result(false, 'invalid_human_hp_owner_state_authority');
  if (input.ownerDomain !== 'Pirate') return result(false, 'invalid_human_hp_owner_state_owner');
  if (!nonEmptyString(input.entityId)) return result(false, 'invalid_human_hp_owner_state_entity');
  if (typeof input.coreDefinitionFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(input.coreDefinitionFingerprint)) {
    return result(false, 'invalid_human_hp_owner_core_fingerprint');
  }
  if (!Number.isSafeInteger(input.hpCurrent) || input.hpCurrent < 0) {
    return result(false, 'invalid_human_hp_owner_current_hp');
  }
  if (!Number.isSafeInteger(input.stateVersion) || input.stateVersion < 0) {
    return result(false, 'invalid_human_hp_owner_state_version');
  }

  const payload = {
    schemaVersion: HUMAN_HP_OWNER_STATE_SCHEMA,
    authority: 'server',
    ownerDomain: 'Pirate',
    entityId: input.entityId,
    coreDefinitionFingerprint: input.coreDefinitionFingerprint,
    hpCurrent: input.hpCurrent,
    stateVersion: input.stateVersion,
  };
  const fingerprintResult = canonicalFingerprint(
    payload,
    input.fingerprint,
    'human_hp_owner_state_fingerprint_mismatch',
  );
  if (!fingerprintResult.ok) return fingerprintResult;
  return result(true, null, {
    state: deepFreeze({ ...payload, fingerprint: fingerprintResult.fingerprint }),
  });
}

export function createPocketCombatProfile({
  entityId,
  entityKind = 'Monster',
  formId,
  level,
  potential,
  training,
  currentHp,
  ratings,
  progressionStateVersion,
  definitionVersion = MONSTER_STAT_CATALOG_VERSION,
  stateVersion,
} = {}) {
  if (!DOMAIN_ENTITY_KINDS.Pocket.includes(entityKind)) return result(false, 'invalid_pocket_entity_kind');
  if (definitionVersion !== MONSTER_STAT_CATALOG_VERSION) {
    return result(false, 'pocket_definition_version_mismatch');
  }
  const calculated = calculateMonsterStats({ formId, level, potential, training });
  if (!calculated.ok) return result(false, 'pocket_calculation_failed', { cause: calculated });
  const form = monsterStatCatalogEntry(formId);
  if (!form) return result(false, 'unknown_pocket_form');
  const ratingValidation = validatePocketRatings(ratings);
  if (!ratingValidation.ok) return ratingValidation;
  if (!validCurrentHp(currentHp, calculated.stats.hp)) return result(false, 'invalid_current_hp');
  const created = createCombatProfile({
    entityId,
    ownerDomain: 'Pocket',
    entityKind,
    level,
    types: [form.runtimeType],
    stats: {
      hpMax: calculated.stats.hp,
      hpCurrent: currentHp,
      atk: calculated.stats.atk,
      def: calculated.stats.def,
      spAtk: calculated.stats.spAtk,
      spDef: calculated.stats.spDef,
      spd: calculated.stats.spd,
      accuracy: ratings.accuracy,
      crit: ratings.crit,
      evasion: ratings.evasion,
      resistance: ratings.resistance,
      penetration: ratings.penetration,
    },
    progressionStateVersion,
    calculationVersion: MONSTER_STAT_FORMULA_VERSION,
    definitionVersion,
    stateVersion,
  });
  if (!created.ok) return created;
  return result(true, null, {
    profile: created.profile,
    provenance: Object.freeze({
      adapterVersion: COMBAT_V91_ADAPTER_VERSION,
      formulaVersion: calculated.formulaVersion,
      catalogVersion: MONSTER_STAT_CATALOG_VERSION,
      formId,
      runtimeSpeciesId: calculated.runtimeSpeciesId,
    }),
  });
}

export function createPirateCombatProfile(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_pirate_profile_input');
  const unknown = Object.keys(input).find(key => !PIRATE_PROFILE_INPUT_KEYS.has(key));
  if (unknown) return result(false, 'unknown_pirate_profile_input_field', { field: unknown });

  const entityKind = input.entityKind ?? 'Human';
  const types = input.types ?? [];
  if (!DOMAIN_ENTITY_KINDS.Pirate.includes(entityKind)) return result(false, 'invalid_pirate_entity_kind');

  for (const [field, reason] of [
    ['humanCoreGrowthDefinition', 'human_core_definition_fingerprint_required'],
    ['ratingsDefinition', 'human_ratings_definition_fingerprint_required'],
    ['currentHpOwnerState', 'human_hp_owner_state_fingerprint_required'],
    ['proficiencySnapshot', 'pirate_proficiency_fingerprint_required'],
  ]) {
    if (!hasCanonicalFingerprint(input[field])) return result(false, reason);
  }

  const coreResult = createHumanCoreGrowthDefinition(input.humanCoreGrowthDefinition);
  if (!coreResult.ok) return coreResult;
  const core = coreResult.definition;
  const ratingsResult = createHumanRatingsDefinition(input.ratingsDefinition);
  if (!ratingsResult.ok) return ratingsResult;
  const ratings = ratingsResult.definition;
  const ownerStateResult = createHumanCurrentHpOwnerState(input.currentHpOwnerState);
  if (!ownerStateResult.ok) return ownerStateResult;
  const ownerState = ownerStateResult.state;
  const proficiencyResult = createPirateProficiencySnapshot(input.proficiencySnapshot);
  if (!proficiencyResult.ok) {
    return result(false, 'invalid_pirate_proficiency_snapshot', { cause: proficiencyResult });
  }
  const proficiency = proficiencyResult.snapshot;

  if (ownerState.entityId !== input.entityId || proficiency.entityId !== input.entityId) {
    return result(false, 'pirate_profile_entity_mismatch');
  }
  if (ownerState.coreDefinitionFingerprint !== core.fingerprint) {
    return result(false, 'human_hp_owner_core_definition_mismatch');
  }
  if (proficiency.progressionStateVersion !== core.progressionStateVersion) {
    return result(false, 'pirate_progression_snapshot_mismatch');
  }
  if (!validCurrentHp(ownerState.hpCurrent, core.coreStats.hp)) {
    return result(false, 'invalid_current_hp');
  }

  const definitionSetPayload = {
    schemaVersion: HUMAN_COMBAT_DEFINITION_SET_SCHEMA,
    coreDefinitionVersion: core.definitionVersion,
    coreDefinitionFingerprint: core.fingerprint,
    ratingsDefinitionVersion: ratings.definitionVersion,
    ratingsDefinitionFingerprint: ratings.fingerprint,
    equipmentPolicy: HUMAN_ACTION_EQUIPMENT_POLICY,
  };
  const definitionSetFingerprint = fingerprintCombatValue(definitionSetPayload);
  const definitionSetVersion = `${HUMAN_COMBAT_DEFINITION_SET_SCHEMA}:${definitionSetFingerprint}`;
  const created = createCombatProfile({
    entityId: input.entityId,
    ownerDomain: 'Pirate',
    entityKind,
    level: core.combatLevel,
    types,
    stats: {
      hpMax: core.coreStats.hp,
      hpCurrent: ownerState.hpCurrent,
      atk: core.coreStats.atk,
      def: core.coreStats.def,
      spAtk: core.coreStats.spAtk,
      spDef: core.coreStats.spDef,
      spd: core.coreStats.spd,
      accuracy: ratings.ratings.accuracy,
      crit: ratings.ratings.crit,
      evasion: ratings.ratings.evasion,
      resistance: ratings.ratings.resistance,
      penetration: ratings.ratings.penetration,
    },
    progressionStateVersion: core.progressionStateVersion,
    calculationVersion: core.calculationVersion,
    definitionVersion: definitionSetVersion,
    stateVersion: ownerState.stateVersion,
  });
  if (!created.ok) return created;
  return result(true, null, {
    profile: created.profile,
    proficiencySnapshot: proficiency,
    provenance: deepFreeze({
      adapterVersion: COMBAT_V91_ADAPTER_VERSION,
      source: PIRATE_PROGRESSION_SOURCE,
      combatLevelPolicyVersion: SHARED_COMBAT_LEVEL_POLICY_VERSION,
      coreDefinitionVersion: core.definitionVersion,
      coreDefinitionFingerprint: core.fingerprint,
      ratingsDefinitionVersion: ratings.definitionVersion,
      ratingsDefinitionFingerprint: ratings.fingerprint,
      definitionSetFingerprint,
      equipmentPolicy: HUMAN_ACTION_EQUIPMENT_POLICY,
    }),
  });
}

export function createDomainCombatProfile(source = {}) {
  if (!isRecord(source) || !isRecord(source.profileInput)) return result(false, 'invalid_domain_profile_source');
  if (source.ownerDomain === 'Pirate') return createPirateCombatProfile(source.profileInput);
  if (source.ownerDomain === 'Pocket') return createPocketCombatProfile(source.profileInput);
  return result(false, 'unsupported_combat_profile_owner');
}
