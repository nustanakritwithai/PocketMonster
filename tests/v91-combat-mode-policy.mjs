import assert from 'node:assert/strict';
import {
  COMBAT_V91_MODE_IDS,
  COMBAT_V91_MODE_POLICIES,
  COMBAT_V91_MODE_POLICY_VERSION,
  canDamageContributeToCapture,
  combatModePolicy,
  validateCombatModeAction,
} from '../combat-v91-mode-policy.mjs';

assert.equal(COMBAT_V91_MODE_POLICY_VERSION, 'combat-mode-policy/v9.1.1');
assert.deepEqual(Object.keys(COMBAT_V91_MODE_POLICIES), COMBAT_V91_MODE_IDS);
assert.equal(Object.values(COMBAT_V91_MODE_POLICIES).every(Object.isFrozen), true);

const capture = combatModePolicy('monster-life.capture');
assert.equal(capture.activeOwnedMonsterLimit, 1, 'Ring 0 keeps one active owned monster');
assert.equal(capture.partyLimit, 3, 'Ring 0 keeps Party 3');
assert.equal(capture.basicAttackController, 'ai', 'Ring 0 keeps AI Basic Attack');
assert.equal(capture.manualSkillSlots, 3, 'Ring 0 keeps manual Skill 1-3');
assert.equal(capture.recallBeforeCapture, true, 'Ring 1 requires Recall before Capture');

assert.equal(validateCombatModeAction({
  modeId: 'monster-life.capture', actionKind: 'damage',
  actorEntityKind: 'Human', targetEntityKind: 'Monster', activeOwnedMonsterCount: 1,
}).reason, 'actor_damage_forbidden', 'Human combat cannot leak into the capture loop');
assert.equal(validateCombatModeAction({
  modeId: 'monster-life.capture', actionKind: 'damage',
  actorEntityKind: 'Monster', targetEntityKind: 'Monster', activeOwnedMonsterCount: 1,
}).ok, true, 'Monster remains the capture-loop damage source');
assert.equal(canDamageContributeToCapture({
  modeId: 'monster-life.capture', actorEntityKind: 'Monster',
}), true);
assert.equal(canDamageContributeToCapture({
  modeId: 'monster-life.capture', actorEntityKind: 'Human',
}), false);

assert.equal(validateCombatModeAction({
  modeId: 'monster-life.capture', actionKind: 'capture',
  actorEntityKind: 'Human', targetEntityKind: 'Monster', activeOwnedMonsterCount: 1,
}).reason, 'recall_required_before_capture');
assert.equal(validateCombatModeAction({
  modeId: 'monster-life.capture', actionKind: 'capture',
  actorEntityKind: 'Human', targetEntityKind: 'Monster', activeOwnedMonsterCount: 0,
}).ok, true);
assert.equal(validateCombatModeAction({
  modeId: 'monster-life.capture', actionKind: 'capture',
  actorEntityKind: 'Human', targetEntityKind: 'Boss', activeOwnedMonsterCount: 0,
}).reason, 'boss_capture_forbidden');

assert.equal(validateCombatModeAction({
  modeId: 'pirate.adventure', actionKind: 'damage',
  actorEntityKind: 'Human', targetEntityKind: 'Monster', activeOwnedMonsterCount: 0,
}).ok, true, 'Pirate adventure permits the Human kit');
assert.equal(validateCombatModeAction({
  modeId: 'hybrid.boss', actionKind: 'damage',
  actorEntityKind: 'Human', targetEntityKind: 'Boss', activeOwnedMonsterCount: 1,
}).ok, true);
assert.equal(validateCombatModeAction({
  modeId: 'hybrid.boss', actionKind: 'damage',
  actorEntityKind: 'Monster', targetEntityKind: 'Boss', activeOwnedMonsterCount: 1,
}).ok, true, 'Human and Monster can share one Boss encounter');
assert.equal(validateCombatModeAction({
  modeId: 'hybrid.boss', actionKind: 'damage',
  actorEntityKind: 'Human', targetEntityKind: 'Human', activeOwnedMonsterCount: 0,
}).reason, 'damage_target_forbidden');

assert.equal(validateCombatModeAction({
  modeId: 'pvp', actionKind: 'damage',
  actorEntityKind: 'Human', targetEntityKind: 'Human', activeOwnedMonsterCount: 0,
}).reason, 'combat_mode_disabled', 'PvP remains fail-closed before its post-slice owner lock');
assert.equal(validateCombatModeAction({
  modeId: 'missing', actionKind: 'damage',
  actorEntityKind: 'Human', targetEntityKind: 'Monster', activeOwnedMonsterCount: 0,
}).reason, 'unknown_combat_mode');
assert.equal(validateCombatModeAction({
  modeId: 'pirate.adventure', actionKind: 'damage',
  actorEntityKind: 'Human', targetEntityKind: 'Monster', activeOwnedMonsterCount: 2,
}).reason, 'active_owned_monster_limit');

console.log('V9.1 combat mode policy: PASS (Ring 0/1 isolation, Pirate and hybrid permissions)');
