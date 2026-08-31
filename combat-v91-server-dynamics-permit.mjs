import { fingerprintCombatValue } from './combat-v91-contract.mjs';
import { validateAuthoritativeDynamicsEffectReceipt } from './combat-v91-authoritative-dynamics-effect.mjs';

// A trusted server-side receipt that proves the action reached its one
// authoritative direct impact. The client scheduler is prediction/presentation
// only; this permit is the timing/occupancy state that the atomic writer CASes.

export const COMBAT_V91_SERVER_DYNAMICS_PERMIT_VERSION =
  'combat-v91-server-dynamics-permit/v1';
export const COMBAT_V91_SERVER_DYNAMICS_PERMIT_SCHEMA =
  'combat-server-dynamics-permit/v9.1.2';
export const COMBAT_V91_SERVER_DYNAMICS_PERMIT_DEFINITION =
  'server-dynamics-permit/single-direct/v1';
export const COMBAT_V91_SERVER_DYNAMICS_POLICY = Object.freeze({
  authority: 'server',
  combatClock: 'fixed_60hz_server_clock',
  resolutionPolicy: 'single_direct_impact',
  multiHit: 'fail_closed_until_per_impact_protocol',
  projectile: 'fail_closed_until_world_collision_receipt',
  actorOccupancy: 'server_cas',
  resourceReservation: 'same_atomic_transaction',
});

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const FIELDS = Object.freeze([
  'schemaVersion',
  'authority',
  'permitVersion',
  'combatId',
  'actionSequence',
  'actorEntityId',
  'targetEntityId',
  'actionId',
  'actionFingerprint',
  'actionDynamicsBindingFingerprint',
  'sourceProvenanceFingerprint',
  'resolutionPolicy',
  'delivery',
  'hitOrdinal',
  'startCombatTick',
  'impactCombatTick',
  'validatedAtCombatTick',
  'expiresAtCombatTick',
  'dynamicsStateVersion',
  'dynamicsStateVersionAfter',
  'actorOccupancyStateVersion',
  'actorOccupancyStateVersionAfter',
  'actorOccupancyLeaseId',
  'occupiedUntilCombatTick',
  'resourceReservationToken',
  'authoritativeEffectReceipt',
  'fingerprint',
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

function safeVersion(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function safeTick(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function createCombatServerDynamicsPermit(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_server_dynamics_permit');
  const unknown = Object.keys(input).find(key => !FIELDS.includes(key));
  if (unknown) return result(false, 'unknown_server_dynamics_permit_field', { field: unknown });
  if (input.schemaVersion !== undefined
    && input.schemaVersion !== COMBAT_V91_SERVER_DYNAMICS_PERMIT_SCHEMA) {
    return result(false, 'server_dynamics_permit_schema_mismatch');
  }
  if (input.authority !== 'server'
    || ![
      input.combatId,
      input.actorEntityId,
      input.targetEntityId,
      input.actionId,
      input.actorOccupancyLeaseId,
      input.resourceReservationToken,
    ].every(stableString)
    || input.permitVersion !== COMBAT_V91_SERVER_DYNAMICS_PERMIT_DEFINITION
    || !validHash(input.actionFingerprint)
    || !validHash(input.actionDynamicsBindingFingerprint)
    || !validHash(input.sourceProvenanceFingerprint)
    || input.resolutionPolicy !== 'single_direct_impact'
    || input.delivery !== 'direct'
    || input.hitOrdinal !== 0
    || !safeVersion(input.actionSequence)
    || !safeTick(input.startCombatTick)
    || !safeTick(input.impactCombatTick)
    || !safeTick(input.validatedAtCombatTick)
    || !safeTick(input.expiresAtCombatTick)
    || !safeTick(input.occupiedUntilCombatTick)
    || input.impactCombatTick < input.startCombatTick
    || input.validatedAtCombatTick < input.impactCombatTick
    || input.expiresAtCombatTick < input.validatedAtCombatTick
    || input.occupiedUntilCombatTick < input.validatedAtCombatTick
    || !safeVersion(input.dynamicsStateVersion)
    || input.dynamicsStateVersion >= Number.MAX_SAFE_INTEGER
    || input.dynamicsStateVersionAfter !== input.dynamicsStateVersion + 1
    || !safeVersion(input.actorOccupancyStateVersion)
    || input.actorOccupancyStateVersion >= Number.MAX_SAFE_INTEGER
    || input.actorOccupancyStateVersionAfter !== input.actorOccupancyStateVersion + 1) {
    return result(false, 'invalid_server_dynamics_permit');
  }

  const effect = input.authoritativeEffectReceipt === null
    ? result(true, null, { receipt: null })
    : validateAuthoritativeDynamicsEffectReceipt(input.authoritativeEffectReceipt, {
      combatId: input.combatId,
      actionSequence: input.actionSequence,
      actorEntityId: input.actorEntityId,
      targetEntityId: input.targetEntityId,
      actionId: input.actionId,
      actionDynamicsBindingFingerprint: input.actionDynamicsBindingFingerprint,
      sourceProvenanceFingerprint: input.sourceProvenanceFingerprint,
      hitOrdinal: 0,
      impactCombatTick: input.impactCombatTick,
    });
  if (!effect.ok) return result(false, 'invalid_server_dynamics_effect_receipt', { cause: effect });

  const payload = {
    schemaVersion: COMBAT_V91_SERVER_DYNAMICS_PERMIT_SCHEMA,
    authority: 'server',
    permitVersion: COMBAT_V91_SERVER_DYNAMICS_PERMIT_DEFINITION,
    combatId: input.combatId,
    actionSequence: input.actionSequence,
    actorEntityId: input.actorEntityId,
    targetEntityId: input.targetEntityId,
    actionId: input.actionId,
    actionFingerprint: input.actionFingerprint,
    actionDynamicsBindingFingerprint: input.actionDynamicsBindingFingerprint,
    sourceProvenanceFingerprint: input.sourceProvenanceFingerprint,
    resolutionPolicy: 'single_direct_impact',
    delivery: 'direct',
    hitOrdinal: 0,
    startCombatTick: input.startCombatTick,
    impactCombatTick: input.impactCombatTick,
    validatedAtCombatTick: input.validatedAtCombatTick,
    expiresAtCombatTick: input.expiresAtCombatTick,
    dynamicsStateVersion: input.dynamicsStateVersion,
    dynamicsStateVersionAfter: input.dynamicsStateVersionAfter,
    actorOccupancyStateVersion: input.actorOccupancyStateVersion,
    actorOccupancyStateVersionAfter: input.actorOccupancyStateVersionAfter,
    actorOccupancyLeaseId: input.actorOccupancyLeaseId,
    occupiedUntilCombatTick: input.occupiedUntilCombatTick,
    resourceReservationToken: input.resourceReservationToken,
    authoritativeEffectReceipt: effect.receipt,
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'server_dynamics_permit_fingerprint_mismatch');
  }
  return result(true, null, {
    permit: deepFreeze({ ...payload, fingerprint }),
  });
}

export function validateCombatServerDynamicsPermit(input, expected = {}) {
  if (!exactKeys(input, FIELDS)) return result(false, 'invalid_server_dynamics_permit_shape');
  const created = createCombatServerDynamicsPermit(input);
  if (!created.ok) return created;
  const permit = created.permit;
  const bindings = [
    ['combatId', expected.combatId],
    ['actionSequence', expected.actionSequence],
    ['actorEntityId', expected.actorEntityId],
    ['targetEntityId', expected.targetEntityId],
    ['actionId', expected.actionId],
    ['actionFingerprint', expected.actionFingerprint],
    ['resourceReservationToken', expected.resourceReservationToken],
    ['actionDynamicsBindingFingerprint', expected.actionDynamicsBindingFingerprint],
    ['sourceProvenanceFingerprint', expected.sourceProvenanceFingerprint],
    ['validatedAtCombatTick', expected.currentCombatTick],
    ['dynamicsStateVersion', expected.dynamicsStateVersion],
    ['actorOccupancyStateVersion', expected.actorOccupancyStateVersion],
    ['actorOccupancyLeaseId', expected.actorOccupancyLeaseId],
    ['occupiedUntilCombatTick', expected.occupiedUntilCombatTick],
  ];
  for (const [field, value] of bindings) {
    if (value !== undefined && permit[field] !== value) {
      return result(false, 'server_dynamics_permit_binding_mismatch', { field });
    }
  }
  return result(true, null, { permit });
}
