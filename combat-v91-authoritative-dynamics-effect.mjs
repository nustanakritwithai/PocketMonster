import { fingerprintCombatValue } from './combat-v91-contract.mjs';

export const COMBAT_V91_AUTHORITATIVE_DYNAMICS_EFFECT_VERSION =
  'combat-v91-authoritative-dynamics-effect/v1';
export const COMBAT_V91_AUTHORITATIVE_DYNAMICS_EFFECT_SCHEMA =
  'combat-authoritative-dynamics-effect/v9.1.2';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const FIELDS = Object.freeze([
  'schemaVersion', 'authority', 'combatId', 'actionSequence', 'actorEntityId',
  'targetEntityId', 'actionId', 'actionDynamicsBindingFingerprint',
  'sourceProvenanceFingerprint', 'hitOrdinal', 'impactCombatTick', 'impulse',
  'hitstopPresentation', 'fingerprint',
]);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, fields) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function stableString(value) {
  return typeof value === 'string' && value.length > 0
    && value.length <= 256 && value.trim() === value;
}

function validHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function safeInteger(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function canonicalImpulse(input) {
  if (input === null) return result(true, null, { value: null });
  if (!exactKeys(input, [
    'profileId', 'horizontalMilliUnits', 'verticalMilliUnits', 'durationTicks', 'authority',
  ]) || !stableString(input.profileId)
    || !safeInteger(input.horizontalMilliUnits, 0, 1_000_000)
    || !safeInteger(input.verticalMilliUnits, 0, 1_000_000)
    || !safeInteger(input.durationTicks, 1, 3_600)
    || input.authority !== 'world') return result(false, 'invalid_authoritative_impulse');
  return result(true, null, { value: Object.freeze({ ...input, authority: 'world' }) });
}

function canonicalHitstop(input) {
  if (input === null) return result(true, null, { value: null });
  if (!exactKeys(input, [
    'activation', 'durationTicks', 'actorScaleBasisPoints',
    'targetScaleBasisPoints', 'authority',
  ]) || input.activation !== 'confirmed_hit'
    || !safeInteger(input.durationTicks, 1, 3_600)
    || !safeInteger(input.actorScaleBasisPoints, 0, 10_000)
    || !safeInteger(input.targetScaleBasisPoints, 0, 10_000)
    || input.authority !== 'presentation_only') {
    return result(false, 'invalid_authoritative_hitstop');
  }
  return result(true, null, {
    value: Object.freeze({ ...input, authority: 'presentation_only' }),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function createAuthoritativeDynamicsEffectReceipt(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_authoritative_dynamics_effect');
  const unknown = Object.keys(input).find(key => !FIELDS.includes(key));
  if (unknown) return result(false, 'unknown_authoritative_dynamics_effect_field', { field: unknown });
  if (input.schemaVersion !== undefined
    && input.schemaVersion !== COMBAT_V91_AUTHORITATIVE_DYNAMICS_EFFECT_SCHEMA) {
    return result(false, 'authoritative_dynamics_effect_schema_mismatch');
  }
  if (input.authority !== 'server'
    || ![input.combatId, input.actorEntityId, input.targetEntityId, input.actionId]
      .every(stableString)
    || !safeInteger(input.actionSequence, 0)
    || input.hitOrdinal !== 0
    || !safeInteger(input.impactCombatTick, 0)
    || !validHash(input.actionDynamicsBindingFingerprint)
    || !validHash(input.sourceProvenanceFingerprint)) {
    return result(false, 'invalid_authoritative_dynamics_effect');
  }
  const impulse = canonicalImpulse(input.impulse);
  if (!impulse.ok) return impulse;
  const hitstop = canonicalHitstop(input.hitstopPresentation);
  if (!hitstop.ok) return hitstop;
  const payload = {
    schemaVersion: COMBAT_V91_AUTHORITATIVE_DYNAMICS_EFFECT_SCHEMA,
    authority: 'server',
    combatId: input.combatId,
    actionSequence: input.actionSequence,
    actorEntityId: input.actorEntityId,
    targetEntityId: input.targetEntityId,
    actionId: input.actionId,
    actionDynamicsBindingFingerprint: input.actionDynamicsBindingFingerprint,
    sourceProvenanceFingerprint: input.sourceProvenanceFingerprint,
    hitOrdinal: 0,
    impactCombatTick: input.impactCombatTick,
    impulse: impulse.value,
    hitstopPresentation: hitstop.value,
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'authoritative_dynamics_effect_fingerprint_mismatch');
  }
  return result(true, null, {
    receipt: deepFreeze({ ...payload, fingerprint }),
  });
}

export function validateAuthoritativeDynamicsEffectReceipt(input, expected = {}) {
  if (!exactKeys(input, FIELDS)) return result(false, 'invalid_authoritative_dynamics_effect_shape');
  const created = createAuthoritativeDynamicsEffectReceipt(input);
  if (!created.ok) return created;
  const receipt = created.receipt;
  for (const field of [
    'combatId', 'actionSequence', 'actorEntityId', 'targetEntityId', 'actionId',
    'actionDynamicsBindingFingerprint', 'sourceProvenanceFingerprint',
    'hitOrdinal', 'impactCombatTick',
  ]) {
    if (expected[field] !== undefined && receipt[field] !== expected[field]) {
      return result(false, 'authoritative_dynamics_effect_binding_mismatch', { field });
    }
  }
  return result(true, null, { receipt });
}
