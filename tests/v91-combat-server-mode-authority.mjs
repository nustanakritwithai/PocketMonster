import assert from 'node:assert/strict';
import {
  createCombatActionDefinition,
  fingerprintCombatValue,
} from '../combat-v91-contract.mjs';
import {
  COMBAT_V91_MODE_CONTEXT_SCHEMA,
  COMBAT_V91_SERVER_MODE_AUTHORITY_POLICY,
  createCombatModeContext,
  createModeBoundActionAuthorizer,
} from '../combat-v91-server-mode-authority.mjs';

function action(overrides = {}) {
  const created = createCombatActionDefinition({
    actionId: 'pirate:sword:m1',
    definitionVersion: 'test/action/v1',
    channel: 'physical',
    power: 80,
    accuracy: 1,
    element: null,
    hitCount: 1,
    criticalAllowed: false,
    armorPierce: 0,
    statusApplications: [],
    ...overrides,
  });
  assert.equal(created.ok, true);
  return created.action;
}

const DAMAGE_ACTION = action();
const UTILITY_ACTION = action({ actionId: 'pirate:utility:m1', power: 0 });

function modeContext(overrides = {}) {
  const payload = {
    schemaVersion: COMBAT_V91_MODE_CONTEXT_SCHEMA,
    authority: 'server',
    modeId: 'pirate.adventure',
    actionKind: 'damage',
    actionId: DAMAGE_ACTION.actionId,
    actionFingerprint: DAMAGE_ACTION.fingerprint,
    activeOwnedMonsterCount: 0,
    stateVersion: 6,
    ...overrides,
  };
  return Object.freeze({ ...payload, fingerprint: fingerprintCombatValue(payload) });
}

function request(overrides = {}) {
  return Object.freeze({
    authorityContext: Object.freeze({ principalId: 'p', sessionId: 's', idempotencyScope: 'i' }),
    combatId: 'combat:mode',
    actorProfile: Object.freeze({ entityId: 'human:1', entityKind: 'Human' }),
    targetProfile: Object.freeze({ entityId: 'monster:1', entityKind: 'Monster' }),
    actionId: 'pirate:sword:m1',
    actionFingerprint: DAMAGE_ACTION.fingerprint,
    actionSequence: 1,
    ...overrides,
  });
}

assert.equal(COMBAT_V91_SERVER_MODE_AUTHORITY_POLICY.trustsClientMode, false);
assert.equal(COMBAT_V91_SERVER_MODE_AUTHORITY_POLICY.wraps, 'combat-v91-server-authority/v3');
assert.equal(COMBAT_V91_SERVER_MODE_AUTHORITY_POLICY.productionWritesEnabled, false);
assert.equal(createCombatModeContext(modeContext()).ok, true);
assert.equal(createCombatModeContext({ ...modeContext(), modeId: 'forged' }).reason,
  'invalid_mode_context');
assert.equal(createCombatModeContext({ ...modeContext(), stateVersion: 7 }).reason,
  'mode_context_fingerprint_mismatch');
assert.equal(createCombatModeContext({ ...modeContext(), injected: true }).reason,
  'invalid_mode_context');

let downstreamCalls = 0;
const allowed = createModeBoundActionAuthorizer({
  loadCombatModeContext: async () => modeContext(),
  authorizeAction: async ({ modeContext: loaded, modePolicy }) => {
    downstreamCalls += 1;
    assert.equal(loaded.modeId, 'pirate.adventure');
    assert.equal(modePolicy.modeId, 'pirate.adventure');
    return { authorized: true, permit: { entitlementStateVersion: 6, action: DAMAGE_ACTION } };
  },
});
assert.equal(allowed.ok, true);
assert.equal((await allowed.authorizer(request())).authorized, true);
assert.equal(downstreamCalls, 1);

const captureHuman = createModeBoundActionAuthorizer({
  loadCombatModeContext: async () => modeContext({ modeId: 'monster-life.capture' }),
  authorizeAction: async () => {
    downstreamCalls += 1;
    return { authorized: true, permit: { entitlementStateVersion: 6, action: DAMAGE_ACTION } };
  },
});
const captureRejected = await captureHuman.authorizer(request());
assert.deepEqual(captureRejected, { authorized: false, reason: 'MODE_ACTOR_DAMAGE_FORBIDDEN' });
assert.equal(downstreamCalls, 1, 'mode rejection happens before action ownership/permit creation');

const monsterCaptureDamage = createModeBoundActionAuthorizer({
  loadCombatModeContext: async () => modeContext({ modeId: 'monster-life.capture' }),
  authorizeAction: async () => ({
    authorized: true,
    permit: { entitlementStateVersion: 6, action: DAMAGE_ACTION },
  }),
});
assert.equal((await monsterCaptureDamage.authorizer(request({
  actorProfile: Object.freeze({ entityId: 'monster:owned', entityKind: 'Monster' }),
}))).authorized, true, 'owned Monster damage remains legal in the capture loop');

const staleEntitlement = createModeBoundActionAuthorizer({
  loadCombatModeContext: async () => modeContext({ stateVersion: 8 }),
  authorizeAction: async () => ({
    authorized: true,
    permit: { entitlementStateVersion: 6, action: DAMAGE_ACTION },
  }),
});
assert.deepEqual(await staleEntitlement.authorizer(request()), {
  authorized: false,
  reason: 'MODE_ENTITLEMENT_VERSION_MISMATCH',
});

const invalidLoader = createModeBoundActionAuthorizer({
  loadCombatModeContext: async () => ({ modeId: 'pirate.adventure' }),
  authorizeAction: async () => ({
    authorized: true,
    permit: { entitlementStateVersion: 6, action: DAMAGE_ACTION },
  }),
});
assert.equal((await invalidLoader.authorizer(request())).reason, 'MODE_INVALID_MODE_CONTEXT');

const actionBindingMismatch = createModeBoundActionAuthorizer({
  loadCombatModeContext: async () => modeContext({
    actionId: UTILITY_ACTION.actionId,
    actionFingerprint: UTILITY_ACTION.fingerprint,
  }),
  authorizeAction: async () => ({
    authorized: true,
    permit: { entitlementStateVersion: 6, action: DAMAGE_ACTION },
  }),
});
assert.equal((await actionBindingMismatch.authorizer(request())).reason,
  'MODE_ACTION_BINDING_MISMATCH');

let bypassDownstreamCalls = 0;
const captureUtilityDamageBypass = createModeBoundActionAuthorizer({
  loadCombatModeContext: async () => modeContext({
    modeId: 'monster-life.capture',
    actionKind: 'utility',
  }),
  authorizeAction: async () => {
    bypassDownstreamCalls += 1;
    return { authorized: true, permit: { entitlementStateVersion: 6, action: DAMAGE_ACTION } };
  },
});
assert.equal((await captureUtilityDamageBypass.authorizer(request())).reason,
  'MODE_ACTION_CLASSIFICATION_MISMATCH');
assert.equal(bypassDownstreamCalls, 1, 'damaging permit is rejected after authoritative permit creation');

const utilityAllowed = createModeBoundActionAuthorizer({
  loadCombatModeContext: async () => modeContext({
    modeId: 'monster-life.capture',
    actionKind: 'utility',
    actionId: UTILITY_ACTION.actionId,
    actionFingerprint: UTILITY_ACTION.fingerprint,
  }),
  authorizeAction: async () => ({
    authorized: true,
    permit: { entitlementStateVersion: 6, action: UTILITY_ACTION },
  }),
});
assert.equal((await utilityAllowed.authorizer(request({
  actionId: UTILITY_ACTION.actionId,
  actionFingerprint: UTILITY_ACTION.fingerprint,
}))).authorized, true);
assert.equal(createModeBoundActionAuthorizer({}).reason, 'missing_mode_authority_dependency');

console.log('V9.1 Server mode authority: PASS (server-loaded mode/action binding, Ring gate, entitlement CAS)');
