import {
  createCombatActionDefinition,
  fingerprintCombatValue,
} from './combat-v91-contract.mjs';
import {
  COMBAT_V91_MODE_POLICY_VERSION,
  combatModePolicy,
  validateCombatModeAction,
} from './combat-v91-mode-policy.mjs';
import { executeCombatV91AuthorityV3 } from './combat-v91-server-authority.mjs';

export const COMBAT_V91_MODE_CONTEXT_SCHEMA = 'combat-mode-context/v9.1.2';
export const COMBAT_V91_SERVER_MODE_AUTHORITY_VERSION = 'combat-v91-server-mode-authority/v3';
export const COMBAT_V91_SERVER_MODE_AUTHORITY_POLICY = Object.freeze({
  authority: 'server',
  wraps: 'combat-v91-server-authority/v3',
  modePolicyVersion: COMBAT_V91_MODE_POLICY_VERSION,
  modeSource: 'server_loader_only',
  entitlementBinding: 'mode_state_version_equals_action_permit_entitlement_state_version',
  actionBinding: 'server_mode_context_action_id_and_fingerprint_equal_permitted_action',
  actionClassification: 'damaging_action_cannot_be_declared_utility_or_capture',
  trustsClientMode: false,
  productionWritesEnabled: false,
});

const CONTEXT_KEYS = Object.freeze([
  'schemaVersion',
  'authority',
  'modeId',
  'actionKind',
  'actionId',
  'actionFingerprint',
  'activeOwnedMonsterCount',
  'stateVersion',
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

function validFingerprint(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function createCombatModeContext(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_mode_context');
  const supplied = { ...input };
  delete supplied.fingerprint;
  if (!exactKeys(supplied, CONTEXT_KEYS)
    || input.schemaVersion !== COMBAT_V91_MODE_CONTEXT_SCHEMA
    || input.authority !== 'server'
    || !combatModePolicy(input.modeId)
    || !['damage', 'utility', 'capture'].includes(input.actionKind)
    || !nonEmptyString(input.actionId)
    || !validFingerprint(input.actionFingerprint)
    || !Number.isInteger(input.activeOwnedMonsterCount)
    || input.activeOwnedMonsterCount < 0
    || !Number.isInteger(input.stateVersion)
    || input.stateVersion < 0) {
    return result(false, 'invalid_mode_context');
  }
  const payload = Object.freeze(Object.fromEntries(CONTEXT_KEYS.map(key => [key, input[key]])));
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'mode_context_fingerprint_mismatch');
  }
  return result(true, null, { context: Object.freeze({ ...payload, fingerprint }) });
}

function rejectionReason(reason) {
  return `MODE_${String(reason || 'REJECTED').toUpperCase()}`;
}

export function createModeBoundActionAuthorizer({ loadCombatModeContext, authorizeAction } = {}) {
  if (typeof loadCombatModeContext !== 'function' || typeof authorizeAction !== 'function') {
    return result(false, 'missing_mode_authority_dependency');
  }
  const authorizer = async request => {
    const raw = await loadCombatModeContext(Object.freeze({ ...request }));
    const created = createCombatModeContext(raw);
    if (!created.ok) return Object.freeze({ authorized: false, reason: rejectionReason(created.reason) });
    const modeContext = created.context;
    if (modeContext.actionId !== request.actionId
      || modeContext.actionFingerprint !== request.actionFingerprint) {
      return Object.freeze({
        authorized: false,
        reason: 'MODE_ACTION_BINDING_MISMATCH',
      });
    }
    const permission = validateCombatModeAction({
      modeId: modeContext.modeId,
      actionKind: modeContext.actionKind,
      actorEntityKind: request.actorProfile?.entityKind,
      targetEntityKind: request.targetProfile?.entityKind,
      activeOwnedMonsterCount: modeContext.activeOwnedMonsterCount,
    });
    if (!permission.ok) {
      return Object.freeze({ authorized: false, reason: rejectionReason(permission.reason) });
    }
    const decision = await authorizeAction(Object.freeze({
      ...request,
      modeContext,
      modePolicy: permission.policy,
    }));
    if (!isRecord(decision) || typeof decision.authorized !== 'boolean') return decision;
    if (decision.authorized !== true) return decision;
    if (decision.permit?.entitlementStateVersion !== modeContext.stateVersion) {
      return Object.freeze({
        authorized: false,
        reason: 'MODE_ENTITLEMENT_VERSION_MISMATCH',
      });
    }
    const actionValidation = createCombatActionDefinition(decision.permit?.action);
    if (!actionValidation.ok
      || actionValidation.action.actionId !== modeContext.actionId
      || actionValidation.action.fingerprint !== modeContext.actionFingerprint) {
      return Object.freeze({
        authorized: false,
        reason: 'MODE_PERMIT_ACTION_BINDING_MISMATCH',
      });
    }
    if (modeContext.actionKind !== 'damage' && actionValidation.action.power > 0) {
      return Object.freeze({
        authorized: false,
        reason: 'MODE_ACTION_CLASSIFICATION_MISMATCH',
      });
    }
    return decision;
  };
  return result(true, null, { authorizer });
}

export async function executeCombatV91ModeAuthority(request = {}, dependencies = {}) {
  const composed = createModeBoundActionAuthorizer({
    loadCombatModeContext: dependencies.loadCombatModeContext,
    authorizeAction: dependencies.authorizeAction,
  });
  if (!composed.ok) return composed;
  const {
    loadCombatModeContext: _loadCombatModeContext,
    authorizeAction: _authorizeAction,
    ...authorityDependencies
  } = dependencies;
  return executeCombatV91AuthorityV3(request, {
    ...authorityDependencies,
    authorizeAction: composed.authorizer,
  });
}
