import {
  COMBAT_V91_ACTION_SCHEMA,
  COMBAT_V91_PROFILE_SCHEMA,
  COMBAT_V91_SAFETY_BOUNDS,
  createCombatActionDefinition,
  fingerprintCombatValue,
  validateCombatProfile,
} from './combat-v91-contract.mjs';

export const COMBAT_V91_ACTION_STAT_PROJECTION_SCHEMA = 'combat-action-stat-projection/v9.1';
export const COMBAT_V91_ACTION_STAT_PROJECTION_VERSION = 'combat-action-stat-projection/v2';
export const COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_SOURCE_SCHEMA =
  'pirate-action-stat-projection/v9.1';
export const COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_CALCULATION_VERSION =
  'pirate-action-stat-projection/fixed-point-v1';
export const COMBAT_V91_ACTION_STAT_KEYS = Object.freeze(['atk', 'spAtk', 'def', 'spDef']);

const INPUT_KEYS = Object.freeze([
  'schemaVersion',
  'projectionVersion',
  'authority',
  'ownerDomain',
  'entityId',
  'profileSchemaVersion',
  'profileProgressionStateVersion',
  'profileCalculationVersion',
  'profileDefinitionVersion',
  'profileStateVersion',
  'profileFingerprint',
  'actionId',
  'actionSchemaVersion',
  'actionDefinitionVersion',
  'actionFingerprint',
  'sourceStat',
  'baseStat',
  'projectedStat',
  'calculationVersion',
  'sourceSchemaVersion',
  'sourceFingerprint',
]);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function validFingerprint(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Canonical shared-resolver view of a Pirate action-scoped stat calculation.
 * It is not a CombatProfile and cannot carry HP or mutate Base Stats.
 */
export function createCombatActionStatProjection(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_action_stat_projection');
  const supplied = { ...input };
  delete supplied.fingerprint;
  if (!exactKeys(supplied, INPUT_KEYS)) return result(false, 'invalid_action_stat_projection_shape');
  if (input.schemaVersion !== COMBAT_V91_ACTION_STAT_PROJECTION_SCHEMA) {
    return result(false, 'action_stat_projection_schema_mismatch');
  }
  if (input.projectionVersion !== COMBAT_V91_ACTION_STAT_PROJECTION_VERSION) {
    return result(false, 'action_stat_projection_version_mismatch');
  }
  if (input.authority !== 'server') return result(false, 'invalid_action_stat_projection_authority');
  if (input.ownerDomain === 'Pocket') {
    return result(false, 'pocket_action_stat_projection_forbidden');
  }
  if (input.ownerDomain !== 'Pirate') return result(false, 'invalid_action_stat_projection_owner');
  if (input.profileSchemaVersion !== COMBAT_V91_PROFILE_SCHEMA
    || input.actionSchemaVersion !== COMBAT_V91_ACTION_SCHEMA) {
    return result(false, 'action_stat_projection_contract_schema_mismatch');
  }
  if (input.sourceSchemaVersion !== COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_SOURCE_SCHEMA
    || input.calculationVersion
      !== COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_CALCULATION_VERSION) {
    return result(false, 'action_stat_projection_source_contract_mismatch');
  }
  for (const field of [
    'entityId', 'profileProgressionStateVersion', 'profileCalculationVersion',
    'profileDefinitionVersion', 'profileFingerprint', 'actionId',
    'actionDefinitionVersion', 'actionFingerprint', 'sourceFingerprint',
  ]) {
    if (!nonEmptyString(input[field])) {
      return result(false, 'invalid_action_stat_projection_identity', { field });
    }
  }
  if (!validFingerprint(input.profileFingerprint)
    || !validFingerprint(input.actionFingerprint)
    || !validFingerprint(input.sourceFingerprint)) {
    return result(false, 'invalid_action_stat_projection_fingerprint');
  }
  if (!Number.isSafeInteger(input.profileStateVersion) || input.profileStateVersion < 0) {
    return result(false, 'invalid_action_stat_projection_profile_state_version');
  }
  if (!COMBAT_V91_ACTION_STAT_KEYS.includes(input.sourceStat)) {
    return result(false, 'invalid_action_stat_projection_source');
  }
  if (!Number.isSafeInteger(input.baseStat)
    || input.baseStat < 0
    || input.baseStat > COMBAT_V91_SAFETY_BOUNDS.statMax) {
    return result(false, 'invalid_action_stat_projection_base');
  }
  if (!Number.isSafeInteger(input.projectedStat)
    || input.projectedStat < 0
    || input.projectedStat > COMBAT_V91_SAFETY_BOUNDS.effectiveStatMax) {
    return result(false, 'invalid_action_stat_projection_value');
  }
  const payload = Object.freeze(Object.fromEntries(INPUT_KEYS.map(key => [key, input[key]])));
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'action_stat_projection_fingerprint_mismatch');
  }
  return result(true, null, {
    projection: Object.freeze({ ...payload, fingerprint }),
  });
}

export function validateCombatActionStatProjection(input, {
  profile,
  action,
  expectedSourceStat,
} = {}) {
  const created = createCombatActionStatProjection(input);
  if (!created.ok) return created;
  const projection = created.projection;
  const profileValidation = validateCombatProfile(profile);
  if (!profileValidation.ok) {
    return result(false, 'invalid_action_stat_projection_profile', { cause: profileValidation });
  }
  const canonicalProfile = profileValidation.profile;
  if (canonicalProfile.ownerDomain === 'Pocket') {
    return result(false, 'pocket_action_stat_projection_forbidden');
  }
  if (projection.ownerDomain !== canonicalProfile.ownerDomain
    || projection.entityId !== canonicalProfile.entityId
    || projection.profileSchemaVersion !== canonicalProfile.schemaVersion
    || projection.profileProgressionStateVersion !== canonicalProfile.progressionStateVersion
    || projection.profileCalculationVersion !== canonicalProfile.calculationVersion
    || projection.profileDefinitionVersion !== canonicalProfile.definitionVersion
    || projection.profileStateVersion !== canonicalProfile.stateVersion
    || projection.profileFingerprint !== canonicalProfile.fingerprint
    || projection.baseStat !== canonicalProfile.stats[projection.sourceStat]) {
    return result(false, 'action_stat_projection_profile_mismatch');
  }
  const actionValidation = createCombatActionDefinition(action);
  if (!actionValidation.ok) {
    return result(false, 'action_stat_projection_action_mismatch', { cause: actionValidation });
  }
  const canonicalAction = actionValidation.action;
  if (projection.actionId !== canonicalAction.actionId
    || projection.actionSchemaVersion !== canonicalAction.schemaVersion
    || projection.actionDefinitionVersion !== canonicalAction.definitionVersion
    || projection.actionFingerprint !== canonicalAction.fingerprint) {
    return result(false, 'action_stat_projection_action_mismatch');
  }
  if (expectedSourceStat !== undefined && projection.sourceStat !== expectedSourceStat) {
    return result(false, 'action_stat_projection_channel_mismatch');
  }
  return result(true, null, { projection });
}
