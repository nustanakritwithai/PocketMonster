import assert from 'node:assert/strict';
import { createCombatActionDynamicsBinding } from '../combat-v91-action-dynamics-binding.mjs';
import { createCombatActionDefinition } from '../combat-v91-contract.mjs';
import {
  PIRATE_COMBO_DYNAMICS_INPUT_SCHEMA,
  PIRATE_DYNAMICS_SOURCE,
  PIRATE_SKILL_DYNAMICS_INPUT_SCHEMA,
  createPirateComboDynamicsDefinition,
  createPirateSkillDynamicsDefinition,
  pirateSecondsToCombatTicks,
} from '../combat-v91-pirate-dynamics-adapter.mjs';

assert.equal(PIRATE_DYNAMICS_SOURCE.commit,
  '4df5721de8bdb20c28e53b6a8c933616e132c96d');
assert.equal(pirateSecondsToCombatTicks(0.1).ticks, 6);
assert.equal(pirateSecondsToCombatTicks(0.14).ticks, 9,
  'fractional source frames round up and never release early');
assert.equal(pirateSecondsToCombatTicks(-1).reason, 'invalid_pirate_seconds');

const comboInput = {
  schemaVersion: PIRATE_COMBO_DYNAMICS_INPUT_SCHEMA,
  authority: 'server',
  sourceCommit: PIRATE_DYNAMICS_SOURCE.commit,
  actionId: 'pirate:sword:training-finisher',
  definitionVersion: 'pirate-combo/training-sword/hit-4/v1',
  windupSec: 0.24,
  recoverySec: 0.65,
  comboWindowSec: 1.2,
  movementLock: 0,
  knockbackUnits: 11,
  knockbackDurationSec: 0.22,
  hitstopSec: 0.05,
};
const combo = createPirateComboDynamicsDefinition(comboInput);
assert.equal(combo.ok, true, combo.reason);
assert.deepEqual(combo.definition.timeline, {
  windupStartTick: 0,
  castStartTick: 15,
  activeStartTick: 15,
  recoveryStartTick: 16,
  completionTick: 127,
});
assert.equal(combo.definition.movementLocks[0].closesAtActionTickExclusive, 55,
  'Pirate movement lock ends after real recovery, before the follow-up combo buffer');
assert.deepEqual(combo.definition.comboWindow, {
  opensAtActionTick: 55,
  closesAtActionTickExclusive: 127,
  acceptsActionTags: ['combo', 'm1'],
});
assert.equal(combo.definition.impulses[0].horizontalMilliUnits, 11_000);
assert.equal(combo.definition.impulses[0].durationTicks, 14);
assert.equal(combo.definition.hitstopPresentation.durationTicks, 3);
assert.equal(combo.definition.hitstopPresentation.authority, 'presentation_only');
assert.equal(combo.provenance.source.role, 'timing_and_motion_proposals_only');
assert.equal(combo.provenance.hpWriter, 'none');
assert.equal(combo.provenance.damageFormula, 'none');
assert.equal(combo.provenance.transformWriter, 'none');
const comboAction = createCombatActionDefinition({
  actionId: comboInput.actionId,
  definitionVersion: 'pirate-action/training-sword-hit-4/v1',
  channel: 'physical',
  power: 50,
  accuracy: 1,
  element: null,
  hitCount: 1,
  criticalAllowed: true,
  armorPierce: 0,
  statusApplications: [],
});
assert.equal(comboAction.ok, true, comboAction.reason);
const comboBinding = createCombatActionDynamicsBinding({
  bindingVersion: 'pirate-combo-selected-source/v1',
  sourceProvenanceFingerprint: combo.provenance.fingerprint,
  action: comboAction.action,
  dynamics: combo.definition,
});
assert.equal(comboBinding.ok, true, comboBinding.reason);
assert.equal(comboBinding.binding.sourceProvenanceFingerprint, combo.provenance.fingerprint,
  'the selected Pirate source provenance is part of the action/timing binding');
assert.equal(createPirateComboDynamicsDefinition({
  ...comboInput,
  damage: 999,
}).reason, 'invalid_pirate_combo_dynamics_shape',
'Pirate timing adapter cannot smuggle a second damage formula');
assert.equal(createPirateComboDynamicsDefinition({
  ...comboInput,
  authority: 'client',
}).reason, 'invalid_pirate_dynamics_authority');

const skillInput = {
  schemaVersion: PIRATE_SKILL_DYNAMICS_INPUT_SCHEMA,
  authority: 'server',
  sourceCommit: PIRATE_DYNAMICS_SOURCE.commit,
  actionId: 'pirate:style:wave-slash',
  definitionVersion: 'pirate-skill/wave-slash/v1',
  castTimeSec: 0.15,
  recoverySec: 0.46,
  hitCount: 1,
  hitIntervalSec: 0,
  delivery: 'projectile',
  movementLock: 0,
  knockbackUnits: 4,
  knockbackDurationSec: 0.25,
  resourceKey: 'mana',
  resourceAmountUnits: 18,
  projectileProfileId: 'pirate-projectile/wave-slash/v1',
  projectileLifetimeSec: 1.05,
  hitstopSec: 0.04,
};
const skill = createPirateSkillDynamicsDefinition(skillInput);
assert.equal(skill.ok, true, skill.reason);
assert.deepEqual(skill.definition.timeline, {
  windupStartTick: 0,
  castStartTick: 0,
  activeStartTick: 9,
  recoveryStartTick: 10,
  completionTick: 38,
});
assert.equal(skill.definition.resourceCosts[0].resourceKey, 'mana');
assert.equal(skill.definition.resourceCosts[0].amountUnits, 18);
assert.equal(skill.definition.resourceCosts[0].commitAt, 'active_start');
assert.equal(skill.definition.projectiles[0].spawnAtActionTick, 9);
assert.equal(skill.definition.projectiles[0].lifetimeTicks, 63);
assert.equal(skill.definition.projectiles[0].collisionAuthority, 'world');
assert.equal(skill.definition.movementLocks[0].movementMultiplierBasisPoints, 0);
assert.equal(skill.definition.movementLocks[0].closesAtActionTickExclusive, 9);
assert.equal(skill.definition.impulses[0].authority, 'world');
assert.equal(createPirateSkillDynamicsDefinition({
  ...skillInput,
  sourceCommit: '0'.repeat(40),
}).reason, 'pirate_dynamics_source_commit_mismatch');
assert.equal(createPirateSkillDynamicsDefinition({
  ...skillInput,
  delivery: 'direct',
}).reason, 'invalid_pirate_projectile_binding');
assert.equal(createPirateSkillDynamicsDefinition({
  ...skillInput,
  hitCount: 1.5,
}).reason, 'invalid_pirate_skill_dynamics_value');

const multiDirect = createPirateSkillDynamicsDefinition({
  ...skillInput,
  actionId: 'pirate:fruit:flurry',
  definitionVersion: 'pirate-skill/flurry/v1',
  hitCount: 3,
  hitIntervalSec: 0.1,
  delivery: 'direct',
  projectileProfileId: null,
  projectileLifetimeSec: 0,
});
assert.equal(multiDirect.ok, true, multiDirect.reason);
assert.deepEqual(multiDirect.definition.impactWindows[0].hits.map(hit => hit.atActiveTick),
  [0, 6, 12]);
assert.equal(multiDirect.definition.activeTicks, 13);
assert.equal(multiDirect.definition.projectiles.length, 0);

console.log('V9.1.2 Pirate dynamics adapter: PASS (source timing -> shared fixed ticks)');
