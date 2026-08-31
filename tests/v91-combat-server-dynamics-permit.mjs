import assert from 'node:assert/strict';
import { fingerprintCombatValue } from '../combat-v91-contract.mjs';
import {
  COMBAT_V91_SERVER_DYNAMICS_PERMIT_SCHEMA,
  COMBAT_V91_SERVER_DYNAMICS_POLICY,
  createCombatServerDynamicsPermit,
  validateCombatServerDynamicsPermit,
} from '../combat-v91-server-dynamics-permit.mjs';
import { fixtureAction } from './v91-combat-fixtures.mjs';

const action = fixtureAction({ actionId: 'pirate:sword:permit-test' });
const input = {
  authority: 'server',
  permitVersion: 'server-dynamics-permit/single-direct/v1',
  combatId: 'combat:dynamics-permit',
  actionSequence: 4,
  actorEntityId: 'human:dynamics-permit',
  targetEntityId: 'monster:dynamics-permit',
  actionId: action.actionId,
  actionFingerprint: action.fingerprint,
  actionDynamicsBindingFingerprint: fingerprintCombatValue({ binding: 'authoritative' }),
  sourceProvenanceFingerprint: fingerprintCombatValue({ source: 'pirate-selected-commit' }),
  resolutionPolicy: 'single_direct_impact',
  delivery: 'direct',
  hitOrdinal: 0,
  startCombatTick: 100,
  impactCombatTick: 112,
  validatedAtCombatTick: 112,
  expiresAtCombatTick: 113,
  dynamicsStateVersion: 7,
  dynamicsStateVersionAfter: 8,
  actorOccupancyStateVersion: 11,
  actorOccupancyStateVersionAfter: 12,
  actorOccupancyLeaseId: 'occupancy:human:dynamics-permit:4',
  occupiedUntilCombatTick: 113,
  resourceReservationToken: 'reservation:combat:dynamics-permit:4',
  authoritativeEffectReceipt: null,
};

const created = createCombatServerDynamicsPermit(input);
assert.equal(created.ok, true, created.reason);
assert.equal(created.permit.schemaVersion, COMBAT_V91_SERVER_DYNAMICS_PERMIT_SCHEMA);
assert.equal(created.permit.authority, 'server');
assert.equal(Object.isFrozen(created.permit), true);
assert.equal(COMBAT_V91_SERVER_DYNAMICS_POLICY.multiHit,
  'fail_closed_until_per_impact_protocol');
assert.equal(COMBAT_V91_SERVER_DYNAMICS_POLICY.projectile,
  'fail_closed_until_world_collision_receipt');

assert.equal(validateCombatServerDynamicsPermit(created.permit, {
  combatId: input.combatId,
  actionSequence: input.actionSequence,
  actorEntityId: input.actorEntityId,
  targetEntityId: input.targetEntityId,
  actionId: input.actionId,
  actionFingerprint: input.actionFingerprint,
  resourceReservationToken: input.resourceReservationToken,
}).ok, true);

assert.equal(validateCombatServerDynamicsPermit(created.permit, {
  actorEntityId: input.targetEntityId,
}).reason, 'server_dynamics_permit_binding_mismatch');
assert.equal(createCombatServerDynamicsPermit({
  ...input,
  permitVersion: 'client-selected/v999',
}).reason, 'invalid_server_dynamics_permit');
assert.equal(createCombatServerDynamicsPermit({
  ...input,
  delivery: 'projectile',
}).reason, 'invalid_server_dynamics_permit');
assert.equal(createCombatServerDynamicsPermit({
  ...input,
  dynamicsStateVersionAfter: input.dynamicsStateVersion,
}).reason, 'invalid_server_dynamics_permit');
assert.equal(createCombatServerDynamicsPermit({
  ...input,
  validatedAtCombatTick: input.expiresAtCombatTick + 1,
}).reason, 'invalid_server_dynamics_permit',
'a server clock validation after permit expiry fails closed');
assert.equal(createCombatServerDynamicsPermit({
  ...input,
  sourceProvenanceFingerprint: 'client-literal',
}).reason, 'invalid_server_dynamics_permit');
assert.equal(validateCombatServerDynamicsPermit({
  ...created.permit,
  fingerprint: '0'.repeat(64),
}).reason, 'server_dynamics_permit_fingerprint_mismatch');

console.log('V9.1.2 Server dynamics permit: PASS (direct impact, provenance, timing/occupancy CAS)');
