import assert from 'node:assert/strict';
import {
  COMBAT_V91_ACTION_DYNAMICS_BINDING_VERSION,
  createCombatActionDynamicsBinding,
  validateCombatActionDynamicsBinding,
} from '../combat-v91-action-dynamics-binding.mjs';

const SOURCE_PROVENANCE_FINGERPRINT = 'a'.repeat(64);

function actionInput(overrides = {}) {
  return {
    actionId: 'pirate:sword:cross-cut',
    definitionVersion: 'pirate-action/cross-cut/v1',
    channel: 'physical',
    power: 72,
    accuracy: 0.94,
    element: 'Steel',
    hitCount: 2,
    criticalAllowed: true,
    armorPierce: 0.1,
    statusApplications: [],
    ...overrides,
  };
}

function dynamicsInput(overrides = {}) {
  return {
    actionId: 'pirate:sword:cross-cut',
    definitionVersion: 'pirate-dynamics/cross-cut/v1',
    windupTicks: 1,
    castTicks: 0,
    activeTicks: 2,
    recoveryTicks: 1,
    impactWindows: [{
      windowId: 'cross-cut-contact',
      opensAtActiveTick: 0,
      closesAtActiveTickExclusive: 2,
      hits: [
        { hitOrdinal: 0, atActiveTick: 0, delivery: 'direct' },
        { hitOrdinal: 1, atActiveTick: 1, delivery: 'direct' },
      ],
    }],
    comboWindow: null,
    cancelPolicy: { windows: [] },
    interruptPolicy: {
      allowedPhases: ['windup', 'active', 'recovery'],
      allowedReasons: ['damage'],
      superArmorPhases: [],
    },
    resourceCosts: [],
    projectiles: [],
    impulses: [],
    guard: null,
    movementLocks: [{
      lockId: 'cross-cut-footwork',
      opensAtActionTick: 0,
      closesAtActionTickExclusive: 3,
      movementMultiplierBasisPoints: 0,
      authority: 'world_locomotion_owner',
    }],
    hitstopPresentation: null,
    ...overrides,
  };
}

assert.equal(
  COMBAT_V91_ACTION_DYNAMICS_BINDING_VERSION,
  'combat-v91-action-dynamics-binding/v2',
);

const created = createCombatActionDynamicsBinding({
  bindingVersion: 'pirate-cross-cut-pair/v1',
  sourceProvenanceFingerprint: SOURCE_PROVENANCE_FINGERPRINT,
  action: actionInput(),
  dynamics: dynamicsInput(),
});
assert.equal(created.ok, true, created.reason);
assert.equal(created.binding.actionId, created.action.actionId);
assert.equal(created.binding.hitCount, created.action.hitCount);
assert.equal(created.binding.actionFingerprint, created.action.fingerprint);
assert.equal(created.binding.dynamicsFingerprint, created.dynamics.fingerprint);
assert.equal(Object.isFrozen(created.boundDefinition), true);
assert.equal(Object.isFrozen(created.boundDefinition.dynamics.movementLocks[0]), true);

const replay = validateCombatActionDynamicsBinding(created.binding, {
  action: created.action,
  dynamics: created.dynamics,
});
assert.equal(replay.ok, true, replay.reason);
assert.deepEqual(replay.binding, created.binding);

assert.equal(createCombatActionDynamicsBinding({
  bindingVersion: 'bad-id/v1',
  sourceProvenanceFingerprint: SOURCE_PROVENANCE_FINGERPRINT,
  action: actionInput(),
  dynamics: dynamicsInput({ actionId: 'pirate:sword:other' }),
}).reason, 'action_dynamics_action_id_mismatch');

assert.equal(createCombatActionDynamicsBinding({
  bindingVersion: 'bad-hit-count/v1',
  sourceProvenanceFingerprint: SOURCE_PROVENANCE_FINGERPRINT,
  action: actionInput({ hitCount: 1 }),
  dynamics: dynamicsInput(),
}).reason, 'action_dynamics_hit_count_mismatch');

const alternateTiming = dynamicsInput({
  definitionVersion: 'pirate-dynamics/cross-cut/v2',
  windupTicks: 2,
  recoveryTicks: 0,
});
const swapped = validateCombatActionDynamicsBinding(created.binding, {
  action: created.action,
  dynamics: alternateTiming,
});
assert.equal(swapped.reason, 'action_dynamics_timing_version_mismatch',
  'a valid timing definition cannot replace the version/fingerprint bound to action math');

const sameVersionDifferentTiming = dynamicsInput({
  windupTicks: 2,
  recoveryTicks: 0,
});
assert.equal(validateCombatActionDynamicsBinding(created.binding, {
  action: created.action,
  dynamics: sameVersionDifferentTiming,
}).reason, 'action_dynamics_timing_fingerprint_mismatch',
'same-version timing drift is rejected by the pair fingerprint');

assert.equal(validateCombatActionDynamicsBinding({
  ...created.binding,
  actionFingerprint: '0'.repeat(64),
}, {
  action: created.action,
  dynamics: created.dynamics,
}).reason, 'action_dynamics_action_fingerprint_mismatch');

assert.equal(validateCombatActionDynamicsBinding({
  ...created.binding,
  fingerprint: 'f'.repeat(64),
}, {
  action: created.action,
  dynamics: created.dynamics,
}).reason, 'action_dynamics_binding_fingerprint_mismatch');

assert.equal(createCombatActionDynamicsBinding({
  bindingVersion: 'missing-provenance/v1',
  action: actionInput(),
  dynamics: dynamicsInput(),
}).reason, 'invalid_action_dynamics_source_provenance');

assert.equal(validateCombatActionDynamicsBinding({
  ...created.binding,
  sourceProvenanceFingerprint: 'b'.repeat(64),
}, {
  action: created.action,
  dynamics: created.dynamics,
}).reason, 'action_dynamics_binding_fingerprint_mismatch',
'source provenance is inside the binding fingerprint');

console.log('V9.1 Action+Dynamics Binding: PASS (identity, hit count, versions, fingerprints)');
