import {
  COMBAT_V91_ACTION_SCHEMA,
  COMBAT_RATIO_KEYS,
  COMBAT_STAT_KEYS,
  COMBAT_V91_SAFETY_BOUNDS,
  fingerprintCombatValue,
  validateCombatProfile,
} from './combat-v91-contract.mjs';
import {
  COMBAT_V91_MODE_POLICY_VERSION,
  validateCombatModeAction,
} from './combat-v91-mode-policy.mjs';
import {
  COMBAT_V91_ACTION_STAT_PROJECTION_SCHEMA,
  COMBAT_V91_ACTION_STAT_PROJECTION_VERSION,
  COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_CALCULATION_VERSION,
  COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_SOURCE_SCHEMA,
  createCombatActionStatProjection,
} from './combat-v91-action-stat-projection.mjs';

export const CORE_COMBAT_STATS6_SCHEMA = 'core-combat-stats6/v9.1';
export const COMBAT_PROFILE12_SEMANTICS_SCHEMA = 'combat-profile12-semantics/v9.1';
export const PIRATE_PROFICIENCY_SNAPSHOT_SCHEMA = 'pirate-proficiency-snapshot/v9.1';
export const PIRATE_ACTION_PROJECTION_SCHEMA =
  COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_SOURCE_SCHEMA;
export const PIRATE_ACTION_PROJECTION_VERSION =
  COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_CALCULATION_VERSION;
export const SHARED_COMBAT_LEVEL_POLICY_VERSION = 'shared-combat-level/1-60-v1';

export const SHARED_COMBAT_LEVEL_BOUNDS = Object.freeze({
  minimum: 1,
  maximum: COMBAT_V91_SAFETY_BOUNDS.levelMax,
});

export const COMBAT_FIXED_POINT_SCALE = 10_000;
export const CORE_COMBAT_STAT_KEYS = Object.freeze([
  'hp',
  'atk',
  'def',
  'spAtk',
  'spDef',
  'spd',
]);
export const PIRATE_PROFICIENCY_KEYS = Object.freeze([
  'combat',
  'vitality',
  'blade',
  'ranged',
  'fruitPower',
  'mana',
]);
export const PIRATE_ACTION_CATEGORIES = Object.freeze([
  'style',
  'sword',
  'gun',
  'fruit',
  'guard',
]);

export const COMBAT_PROFILE12_SEMANTICS = deepFreeze({
  schemaVersion: COMBAT_PROFILE12_SEMANTICS_SCHEMA,
  pocketBasedCore6: {
    hp: 'hpMax',
    atk: 'atk',
    def: 'def',
    spAtk: 'spAtk',
    spDef: 'spDef',
    spd: 'spd',
  },
  ownerRuntimeState: ['hpCurrent'],
  sharedRatings: [...COMBAT_RATIO_KEYS],
  rules: {
    core6Writer: 'progression_owner_via_server',
    hpCurrentWriter: 'server_authoritative_target_owner_commit',
    combatLevelWriter: 'progression_owner_normalizes_to_shared_1_60_via_server',
    nativeLevelRole: 'provenance_only_never_damage_input',
    proficiencyRole: 'action_scoped_input_only',
    worldRole: 'immutable_bounded_modifier_snapshot',
  },
});

export const PIRATE_PROFICIENCY_BOUNDS = Object.freeze({
  minimum: 0,
  maximum: 2_800,
  maximumBonusFp: 5_000,
  equipmentContributionMaximum: COMBAT_V91_SAFETY_BOUNDS.statMax,
});

export const PIRATE_ACTION_CATEGORY_RULES = deepFreeze({
  style: {
    role: 'offense',
    sourceStat: 'atk',
    proficiency: 'combat',
    mastery: 'style',
  },
  sword: {
    role: 'offense',
    sourceStat: 'atk',
    proficiency: 'blade',
    mastery: 'sword',
  },
  gun: {
    role: 'offense',
    sourceStat: 'atk',
    proficiency: 'ranged',
    mastery: 'gun',
  },
  fruit: {
    role: 'offense',
    sourceStat: 'spAtk',
    proficiency: 'fruitPower',
    mastery: 'fruit',
  },
  guard: {
    role: 'defense',
    sourceStat: 'def',
    proficiency: 'vitality',
    mastery: 'guard',
  },
});

const PROFICIENCY_KEY_SET = new Set(PIRATE_PROFICIENCY_KEYS);
const CATEGORY_SET = new Set(PIRATE_ACTION_CATEGORIES);
const PROFILE_CORE_MAP = COMBAT_PROFILE12_SEMANTICS.pocketBasedCore6;
const PROFICIENCY_SNAPSHOT_KEYS = Object.freeze([
  'schemaVersion',
  'authority',
  'entityId',
  'ownerDomain',
  'progressionStateVersion',
  'definitionVersion',
  'stateVersion',
  'proficiencies',
  'masteryByCategory',
]);
const ACTION_DEFINITION_KEYS = Object.freeze([
  'actionId',
  'definitionVersion',
  'combatActionFingerprint',
  'category',
  'equipmentContribution',
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

function floorMultiplyDivide(value, multiplier, divisor) {
  return Number((BigInt(value) * BigInt(multiplier)) / BigInt(divisor));
}

function validateBoundedInteger(value, minimum, maximum, reason, field) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    return result(false, reason, { field });
  }
  return result(true, null);
}

export function createCoreCombatStats6(input = {}) {
  if (!exactKeys(input, CORE_COMBAT_STAT_KEYS)) return result(false, 'invalid_core6_shape');
  for (const key of CORE_COMBAT_STAT_KEYS) {
    const minimum = key === 'hp' ? 1 : 0;
    const validation = validateBoundedInteger(
      input[key],
      minimum,
      COMBAT_V91_SAFETY_BOUNDS.statMax,
      'invalid_core6_stat',
      key,
    );
    if (!validation.ok) return validation;
  }
  const stats = Object.freeze(Object.fromEntries(CORE_COMBAT_STAT_KEYS.map(key => [key, input[key]])));
  return result(true, null, {
    schemaVersion: CORE_COMBAT_STATS6_SCHEMA,
    stats,
    fingerprint: fingerprintCombatValue({ schemaVersion: CORE_COMBAT_STATS6_SCHEMA, stats }),
  });
}

export function validateSharedCombatLevel(value) {
  return validateBoundedInteger(
    value,
    SHARED_COMBAT_LEVEL_BOUNDS.minimum,
    SHARED_COMBAT_LEVEL_BOUNDS.maximum,
    'shared_combat_level_out_of_range',
    'combatLevel',
  );
}

export function createCombatProfile12SemanticView(profile) {
  const validation = validateCombatProfile(profile);
  if (!validation.ok) return result(false, 'invalid_combat_profile12', { cause: validation });
  const canonicalProfile = validation.profile;
  const levelValidation = validateSharedCombatLevel(canonicalProfile.level);
  if (!levelValidation.ok) return levelValidation;
  const coreInput = Object.fromEntries(
    CORE_COMBAT_STAT_KEYS.map(key => [key, canonicalProfile.stats[PROFILE_CORE_MAP[key]]]),
  );
  const core = createCoreCombatStats6(coreInput);
  if (!core.ok) return result(false, 'invalid_combat_profile12_core6', { cause: core });
  const hpValidation = validateBoundedInteger(
    canonicalProfile.stats.hpCurrent,
    0,
    canonicalProfile.stats.hpMax,
    'invalid_combat_profile12_hp_current',
    'hpCurrent',
  );
  if (!hpValidation.ok) return hpValidation;

  const payload = {
    schemaVersion: COMBAT_PROFILE12_SEMANTICS_SCHEMA,
    entityId: canonicalProfile.entityId,
    ownerDomain: canonicalProfile.ownerDomain,
    entityKind: canonicalProfile.entityKind,
    combatLevelPolicyVersion: SHARED_COMBAT_LEVEL_POLICY_VERSION,
    combatLevel: canonicalProfile.level,
    coreStats: core.stats,
    runtimeState: { hpCurrent: canonicalProfile.stats.hpCurrent },
    ratings: Object.fromEntries(COMBAT_RATIO_KEYS.map(key => [key, canonicalProfile.stats[key]])),
    profileFingerprint: canonicalProfile.fingerprint,
    coreFingerprint: core.fingerprint,
  };
  return result(true, null, {
    view: deepFreeze({ ...payload, fingerprint: fingerprintCombatValue(payload) }),
  });
}

function validateProficiencyVector(proficiencies) {
  if (!exactKeys(proficiencies, PIRATE_PROFICIENCY_KEYS)) {
    return result(false, 'invalid_pirate_proficiency_shape');
  }
  for (const key of PIRATE_PROFICIENCY_KEYS) {
    const validation = validateBoundedInteger(
      proficiencies[key],
      PIRATE_PROFICIENCY_BOUNDS.minimum,
      PIRATE_PROFICIENCY_BOUNDS.maximum,
      'invalid_pirate_proficiency',
      key,
    );
    if (!validation.ok) return validation;
  }
  return result(true, null);
}

function validateMasteryVector(masteryByCategory) {
  if (!exactKeys(masteryByCategory, PIRATE_ACTION_CATEGORIES)) {
    return result(false, 'invalid_pirate_mastery_shape');
  }
  for (const key of PIRATE_ACTION_CATEGORIES) {
    const validation = validateBoundedInteger(
      masteryByCategory[key],
      PIRATE_PROFICIENCY_BOUNDS.minimum,
      PIRATE_PROFICIENCY_BOUNDS.maximum,
      'invalid_pirate_mastery',
      key,
    );
    if (!validation.ok) return validation;
  }
  return result(true, null);
}

export function createPirateProficiencySnapshot(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_pirate_proficiency_snapshot');
  const allowedKeys = [...PROFICIENCY_SNAPSHOT_KEYS, 'fingerprint'];
  const unknown = Object.keys(input).find(key => !allowedKeys.includes(key));
  if (unknown) return result(false, 'unknown_pirate_proficiency_field', { field: unknown });
  if (input.schemaVersion !== undefined && input.schemaVersion !== PIRATE_PROFICIENCY_SNAPSHOT_SCHEMA) {
    return result(false, 'pirate_proficiency_schema_mismatch');
  }
  if (input.authority !== 'server') return result(false, 'invalid_pirate_proficiency_authority');
  if (!nonEmptyString(input.entityId)) return result(false, 'invalid_pirate_proficiency_entity');
  if (input.ownerDomain !== 'Pirate') return result(false, 'invalid_pirate_proficiency_owner');
  for (const field of ['progressionStateVersion', 'definitionVersion']) {
    if (!nonEmptyString(input[field])) return result(false, 'invalid_pirate_proficiency_version', { field });
  }
  if (!Number.isSafeInteger(input.stateVersion) || input.stateVersion < 0) {
    return result(false, 'invalid_pirate_proficiency_state_version');
  }
  const proficiencyValidation = validateProficiencyVector(input.proficiencies);
  if (!proficiencyValidation.ok) return proficiencyValidation;
  const masteryValidation = validateMasteryVector(input.masteryByCategory);
  if (!masteryValidation.ok) return masteryValidation;

  const payload = {
    schemaVersion: PIRATE_PROFICIENCY_SNAPSHOT_SCHEMA,
    authority: 'server',
    entityId: input.entityId,
    ownerDomain: 'Pirate',
    progressionStateVersion: input.progressionStateVersion,
    definitionVersion: input.definitionVersion,
    stateVersion: input.stateVersion,
    proficiencies: Object.fromEntries(PIRATE_PROFICIENCY_KEYS.map(key => [key, input.proficiencies[key]])),
    masteryByCategory: Object.fromEntries(
      PIRATE_ACTION_CATEGORIES.map(key => [key, input.masteryByCategory[key]]),
    ),
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'pirate_proficiency_fingerprint_mismatch', { expectedFingerprint: fingerprint });
  }
  return result(true, null, { snapshot: deepFreeze({ ...payload, fingerprint }) });
}

function validateActionDefinition(action) {
  if (!exactKeys(action, ACTION_DEFINITION_KEYS)) return result(false, 'invalid_pirate_action_shape');
  if (!nonEmptyString(action.actionId) || !nonEmptyString(action.definitionVersion)) {
    return result(false, 'invalid_pirate_action_identity');
  }
  if (typeof action.combatActionFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(action.combatActionFingerprint)) {
    return result(false, 'invalid_pirate_action_fingerprint');
  }
  if (!CATEGORY_SET.has(action.category)) return result(false, 'invalid_pirate_action_category');
  const equipmentValidation = validateBoundedInteger(
    action.equipmentContribution,
    0,
    PIRATE_PROFICIENCY_BOUNDS.equipmentContributionMaximum,
    'invalid_pirate_equipment_contribution',
    'equipmentContribution',
  );
  if (!equipmentValidation.ok) return equipmentValidation;
  return result(true, null);
}

export function createPirateActionStatProjection({
  authority,
  combatMode,
  targetEntityKind,
  activeOwnedMonsterCount = 0,
  combatProfile,
  proficiencySnapshot,
  expectedProficiencyStateVersion,
  expectedProficiencyFingerprint,
  action,
} = {}) {
  if (authority !== 'server') return result(false, 'invalid_pirate_projection_authority');
  const profileView = createCombatProfile12SemanticView(combatProfile);
  if (!profileView.ok) return profileView;
  const canonicalProfile = validateCombatProfile(combatProfile).profile;
  if (canonicalProfile.ownerDomain !== 'Pirate') return result(false, 'pirate_combat_profile_required');
  const proficiencyValidation = createPirateProficiencySnapshot(proficiencySnapshot);
  if (!proficiencyValidation.ok) return result(false, 'invalid_pirate_proficiency_snapshot', {
    cause: proficiencyValidation,
  });
  const canonicalProficiency = proficiencyValidation.snapshot;
  if (canonicalProficiency.entityId !== canonicalProfile.entityId) {
    return result(false, 'pirate_projection_entity_mismatch');
  }
  if (canonicalProficiency.progressionStateVersion
    !== canonicalProfile.progressionStateVersion) {
    return result(false, 'pirate_projection_progression_mismatch');
  }
  if (!Number.isSafeInteger(expectedProficiencyStateVersion)
    || expectedProficiencyStateVersion < 0
    || typeof expectedProficiencyFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(expectedProficiencyFingerprint)) {
    return result(false, 'pirate_projection_proficiency_expectation_required');
  }
  if (canonicalProficiency.stateVersion !== expectedProficiencyStateVersion
    || canonicalProficiency.fingerprint !== expectedProficiencyFingerprint) {
    return result(false, 'pirate_projection_proficiency_snapshot_mismatch');
  }
  const actionValidation = validateActionDefinition(action);
  if (!actionValidation.ok) return actionValidation;
  const rule = PIRATE_ACTION_CATEGORY_RULES[action.category];
  const permission = validateCombatModeAction({
    modeId: combatMode,
    actionKind: rule.role === 'offense' ? 'damage' : 'utility',
    actorEntityKind: canonicalProfile.entityKind,
    targetEntityKind,
    activeOwnedMonsterCount,
  });
  if (!permission.ok) return result(false, permission.reason, { cause: permission });

  const primaryValue = canonicalProficiency.proficiencies[rule.proficiency];
  const masteryValue = canonicalProficiency.masteryByCategory[rule.mastery];
  const combinedMaximum = PIRATE_PROFICIENCY_BOUNDS.maximum * 2;
  const combinedProficiency = primaryValue + masteryValue;
  const proficiencyRatioFp = floorMultiplyDivide(
    combinedProficiency,
    COMBAT_FIXED_POINT_SCALE,
    combinedMaximum,
  );
  const proficiencyBonusFp = floorMultiplyDivide(
    combinedProficiency,
    PIRATE_PROFICIENCY_BOUNDS.maximumBonusFp,
    combinedMaximum,
  );
  const proficiencyMultiplierFp = COMBAT_FIXED_POINT_SCALE + proficiencyBonusFp;
  const baseStat = profileView.view.coreStats[rule.sourceStat];
  const scaledBaseStat = floorMultiplyDivide(
    baseStat,
    proficiencyMultiplierFp,
    COMBAT_FIXED_POINT_SCALE,
  );
  const projectedActionStat = scaledBaseStat + action.equipmentContribution;
  if (projectedActionStat > COMBAT_V91_SAFETY_BOUNDS.effectiveStatMax) {
    return result(false, 'projected_action_stat_out_of_range');
  }

  const payload = {
    schemaVersion: PIRATE_ACTION_PROJECTION_SCHEMA,
    authority: 'server',
    calculationVersion: PIRATE_ACTION_PROJECTION_VERSION,
    modePolicyVersion: COMBAT_V91_MODE_POLICY_VERSION,
    combatLevelPolicyVersion: SHARED_COMBAT_LEVEL_POLICY_VERSION,
    combatLevel: profileView.view.combatLevel,
    combatMode,
    targetEntityKind,
    activeOwnedMonsterCount,
    entityId: canonicalProfile.entityId,
    ownerDomain: canonicalProfile.ownerDomain,
    profileSchemaVersion: canonicalProfile.schemaVersion,
    profileProgressionStateVersion: canonicalProfile.progressionStateVersion,
    profileCalculationVersion: canonicalProfile.calculationVersion,
    profileDefinitionVersion: canonicalProfile.definitionVersion,
    profileStateVersion: canonicalProfile.stateVersion,
    actionId: action.actionId,
    actionDefinitionVersion: action.definitionVersion,
    actionFingerprint: action.combatActionFingerprint,
    actionCategory: action.category,
    role: rule.role,
    sourceStat: rule.sourceStat,
    baseStat,
    proficiencyKey: rule.proficiency,
    proficiencyValue: primaryValue,
    masteryKey: rule.mastery,
    masteryValue,
    combinedProficiency,
    proficiencyRatioFp,
    proficiencyBonusFp,
    proficiencyMultiplierFp,
    equipmentContribution: action.equipmentContribution,
    projectedActionStat,
    profileFingerprint: canonicalProfile.fingerprint,
    proficiencySchemaVersion: canonicalProficiency.schemaVersion,
    proficiencyProgressionStateVersion: canonicalProficiency.progressionStateVersion,
    proficiencyDefinitionVersion: canonicalProficiency.definitionVersion,
    proficiencyStateVersion: canonicalProficiency.stateVersion,
    proficiencyFingerprint: canonicalProficiency.fingerprint,
  };
  const projection = deepFreeze({ ...payload, fingerprint: fingerprintCombatValue(payload) });
  const actionStat = createCombatActionStatProjection({
    schemaVersion: COMBAT_V91_ACTION_STAT_PROJECTION_SCHEMA,
    projectionVersion: COMBAT_V91_ACTION_STAT_PROJECTION_VERSION,
    authority: 'server',
    ownerDomain: canonicalProfile.ownerDomain,
    entityId: canonicalProfile.entityId,
    profileSchemaVersion: canonicalProfile.schemaVersion,
    profileProgressionStateVersion: canonicalProfile.progressionStateVersion,
    profileCalculationVersion: canonicalProfile.calculationVersion,
    profileDefinitionVersion: canonicalProfile.definitionVersion,
    profileStateVersion: canonicalProfile.stateVersion,
    profileFingerprint: canonicalProfile.fingerprint,
    actionId: action.actionId,
    actionSchemaVersion: COMBAT_V91_ACTION_SCHEMA,
    actionDefinitionVersion: action.definitionVersion,
    actionFingerprint: action.combatActionFingerprint,
    sourceStat: rule.sourceStat,
    baseStat,
    projectedStat: projectedActionStat,
    calculationVersion: PIRATE_ACTION_PROJECTION_VERSION,
    sourceSchemaVersion: PIRATE_ACTION_PROJECTION_SCHEMA,
    sourceFingerprint: projection.fingerprint,
  });
  if (!actionStat.ok) {
    return result(false, 'invalid_action_stat_projection', { cause: actionStat });
  }
  return result(true, null, {
    projection,
    actionStatProjection: actionStat.projection,
  });
}

export function isPirateProficiencyKey(value) {
  return PROFICIENCY_KEY_SET.has(value);
}

export function isPirateActionCategory(value) {
  return CATEGORY_SET.has(value);
}

export function combatProfile12KeysMatchContract() {
  const semanticKeys = [
    ...Object.values(COMBAT_PROFILE12_SEMANTICS.pocketBasedCore6),
    ...COMBAT_PROFILE12_SEMANTICS.ownerRuntimeState,
    ...COMBAT_PROFILE12_SEMANTICS.sharedRatings,
  ];
  return semanticKeys.length === COMBAT_STAT_KEYS.length
    && new Set(semanticKeys).size === semanticKeys.length
    && COMBAT_STAT_KEYS.every(key => semanticKeys.includes(key));
}
