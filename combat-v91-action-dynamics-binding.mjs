import {
  createCombatActionDefinition,
  fingerprintCombatValue,
} from './combat-v91-contract.mjs';
import { createCombatDynamicsDefinition } from './combat-v91-dynamics-contract.mjs';

// Registry-facing pair contract. A resolver/scheduler hand-off must carry this
// fingerprint, rather than independently looking up action math and timing by
// actionId, so a timing definition cannot be swapped under valid action math.

export const COMBAT_V91_ACTION_DYNAMICS_BINDING_VERSION =
  'combat-v91-action-dynamics-binding/v2';
export const COMBAT_V91_ACTION_DYNAMICS_BINDING_SCHEMA =
  'combat-action-dynamics-binding/v9.1';

const INPUT_FIELDS = Object.freeze([
  'schemaVersion',
  'bindingVersion',
  'sourceProvenanceFingerprint',
  'action',
  'dynamics',
  'actionId',
  'hitCount',
  'actionDefinitionVersion',
  'actionFingerprint',
  'dynamicsDefinitionVersion',
  'dynamicsFingerprint',
  'fingerprint',
]);

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableVersion(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && value.trim() === value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function createCombatActionDynamicsBinding(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_action_dynamics_binding');
  const unknown = Object.keys(input).find(key => !INPUT_FIELDS.includes(key));
  if (unknown) return result(false, 'unknown_action_dynamics_binding_field', { field: unknown });
  if (input.schemaVersion !== undefined
    && input.schemaVersion !== COMBAT_V91_ACTION_DYNAMICS_BINDING_SCHEMA) {
    return result(false, 'action_dynamics_binding_schema_mismatch');
  }
  if (!stableVersion(input.bindingVersion)) {
    return result(false, 'invalid_action_dynamics_binding_version');
  }
  if (typeof input.sourceProvenanceFingerprint !== 'string'
    || !HASH_PATTERN.test(input.sourceProvenanceFingerprint)) {
    return result(false, 'invalid_action_dynamics_source_provenance');
  }

  const actionResult = createCombatActionDefinition(input.action);
  if (!actionResult.ok) {
    return result(false, 'invalid_bound_action_definition', { cause: actionResult });
  }
  const dynamicsResult = createCombatDynamicsDefinition(input.dynamics);
  if (!dynamicsResult.ok) {
    return result(false, 'invalid_bound_dynamics_definition', { cause: dynamicsResult });
  }
  const action = actionResult.action;
  const dynamics = dynamicsResult.definition;
  if (action.actionId !== dynamics.actionId) {
    return result(false, 'action_dynamics_action_id_mismatch');
  }
  if (action.hitCount !== dynamics.hitCount) {
    return result(false, 'action_dynamics_hit_count_mismatch');
  }

  const payload = {
    schemaVersion: COMBAT_V91_ACTION_DYNAMICS_BINDING_SCHEMA,
    bindingVersion: input.bindingVersion,
    actionId: action.actionId,
    hitCount: action.hitCount,
    actionDefinitionVersion: action.definitionVersion,
    actionFingerprint: action.fingerprint,
    dynamicsDefinitionVersion: dynamics.definitionVersion,
    dynamicsFingerprint: dynamics.fingerprint,
    sourceProvenanceFingerprint: input.sourceProvenanceFingerprint,
  };
  const derivedChecks = [
    ['actionId', 'action_dynamics_action_id_mismatch'],
    ['hitCount', 'action_dynamics_hit_count_mismatch'],
    ['actionDefinitionVersion', 'action_dynamics_action_version_mismatch'],
    ['actionFingerprint', 'action_dynamics_action_fingerprint_mismatch'],
    ['dynamicsDefinitionVersion', 'action_dynamics_timing_version_mismatch'],
    ['dynamicsFingerprint', 'action_dynamics_timing_fingerprint_mismatch'],
    ['sourceProvenanceFingerprint', 'action_dynamics_source_provenance_mismatch'],
  ];
  for (const [field, reason] of derivedChecks) {
    if (input[field] !== undefined && input[field] !== payload[field]) return result(false, reason);
  }
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'action_dynamics_binding_fingerprint_mismatch', {
      expectedFingerprint: fingerprint,
    });
  }
  const binding = deepFreeze({ ...payload, fingerprint });
  return result(true, null, {
    binding,
    action,
    dynamics,
    boundDefinition: deepFreeze({ binding, action, dynamics }),
  });
}

export function validateCombatActionDynamicsBinding(binding, { action, dynamics } = {}) {
  if (!isRecord(binding)) return result(false, 'invalid_action_dynamics_binding');
  return createCombatActionDynamicsBinding({ ...binding, action, dynamics });
}
