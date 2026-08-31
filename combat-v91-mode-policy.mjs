export const COMBAT_V91_MODE_POLICY_VERSION = 'combat-mode-policy/v9.1.1';

export const COMBAT_V91_MODE_IDS = Object.freeze([
  'monster-life.capture',
  'monster-life.battle',
  'pirate.adventure',
  'hybrid.boss',
  'world.autonomous',
  'pvp',
]);

const DAMAGE_ENTITY_KINDS = Object.freeze(['Human', 'Monster', 'Npc', 'Boss', 'Ship']);
const ACTION_KINDS = Object.freeze(['damage', 'utility', 'capture']);

const RAW_POLICIES = Object.freeze({
  'monster-life.capture': Object.freeze({
    enabled: true,
    damageActorKinds: Object.freeze(['Monster']),
    utilityActorKinds: Object.freeze(['Human', 'Monster']),
    captureActorKinds: Object.freeze(['Human']),
    damageTargetKinds: Object.freeze(['Monster', 'Boss']),
    captureTargetKinds: Object.freeze(['Monster']),
    captureWeakeningActorKinds: Object.freeze(['Monster']),
    activeOwnedMonsterLimit: 1,
    partyLimit: 3,
    basicAttackController: 'ai',
    manualSkillSlots: 3,
    recallBeforeCapture: true,
    bossCaptureAllowed: false,
  }),
  'monster-life.battle': Object.freeze({
    enabled: true,
    damageActorKinds: Object.freeze(['Monster']),
    utilityActorKinds: Object.freeze(['Human', 'Monster']),
    captureActorKinds: Object.freeze([]),
    damageTargetKinds: Object.freeze(['Monster', 'Boss']),
    captureTargetKinds: Object.freeze([]),
    captureWeakeningActorKinds: Object.freeze([]),
    activeOwnedMonsterLimit: 1,
    partyLimit: 3,
    basicAttackController: 'ai',
    manualSkillSlots: 3,
    recallBeforeCapture: false,
    bossCaptureAllowed: false,
  }),
  'pirate.adventure': Object.freeze({
    enabled: true,
    damageActorKinds: Object.freeze(['Human', 'Monster', 'Npc', 'Boss', 'Ship']),
    utilityActorKinds: Object.freeze(['Human', 'Monster', 'Npc', 'Boss', 'Ship']),
    captureActorKinds: Object.freeze([]),
    damageTargetKinds: Object.freeze(['Human', 'Monster', 'Npc', 'Boss', 'Ship']),
    captureTargetKinds: Object.freeze([]),
    captureWeakeningActorKinds: Object.freeze([]),
    activeOwnedMonsterLimit: 1,
    partyLimit: 3,
    basicAttackController: 'domain',
    manualSkillSlots: 4,
    recallBeforeCapture: false,
    bossCaptureAllowed: false,
  }),
  'hybrid.boss': Object.freeze({
    enabled: true,
    damageActorKinds: Object.freeze(['Human', 'Monster']),
    utilityActorKinds: Object.freeze(['Human', 'Monster']),
    captureActorKinds: Object.freeze([]),
    damageTargetKinds: Object.freeze(['Boss']),
    captureTargetKinds: Object.freeze([]),
    captureWeakeningActorKinds: Object.freeze([]),
    activeOwnedMonsterLimit: 1,
    partyLimit: 3,
    basicAttackController: 'domain',
    manualSkillSlots: 3,
    recallBeforeCapture: false,
    bossCaptureAllowed: false,
  }),
  'world.autonomous': Object.freeze({
    enabled: true,
    damageActorKinds: DAMAGE_ENTITY_KINDS,
    utilityActorKinds: DAMAGE_ENTITY_KINDS,
    captureActorKinds: Object.freeze([]),
    damageTargetKinds: DAMAGE_ENTITY_KINDS,
    captureTargetKinds: Object.freeze([]),
    captureWeakeningActorKinds: Object.freeze([]),
    activeOwnedMonsterLimit: 1,
    partyLimit: 3,
    basicAttackController: 'domain',
    manualSkillSlots: 0,
    recallBeforeCapture: false,
    bossCaptureAllowed: false,
  }),
  // PvP remains outside the locked Vertical Slice. Keeping an explicit fail-closed
  // policy prevents a shared resolver from accidentally making it production-live.
  pvp: Object.freeze({
    enabled: false,
    damageActorKinds: Object.freeze([]),
    utilityActorKinds: Object.freeze([]),
    captureActorKinds: Object.freeze([]),
    damageTargetKinds: Object.freeze([]),
    captureTargetKinds: Object.freeze([]),
    captureWeakeningActorKinds: Object.freeze([]),
    activeOwnedMonsterLimit: 0,
    partyLimit: 0,
    basicAttackController: 'disabled',
    manualSkillSlots: 0,
    recallBeforeCapture: false,
    bossCaptureAllowed: false,
  }),
});

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function validEntityKind(value) {
  return DAMAGE_ENTITY_KINDS.includes(value);
}

export function combatModePolicy(modeId) {
  const value = RAW_POLICIES[modeId];
  if (!value) return null;
  return Object.freeze({
    schemaVersion: COMBAT_V91_MODE_POLICY_VERSION,
    modeId,
    ...value,
  });
}

export function validateCombatModeAction({
  modeId,
  actionKind,
  actorEntityKind,
  targetEntityKind,
  activeOwnedMonsterCount = 0,
} = {}) {
  const policy = combatModePolicy(modeId);
  if (!policy) return result(false, 'unknown_combat_mode');
  if (!policy.enabled) return result(false, 'combat_mode_disabled', { policy });
  if (!ACTION_KINDS.includes(actionKind)) return result(false, 'invalid_mode_action_kind', { policy });
  if (!validEntityKind(actorEntityKind) || !validEntityKind(targetEntityKind)) {
    return result(false, 'invalid_mode_entity_kind', { policy });
  }
  if (!Number.isInteger(activeOwnedMonsterCount) || activeOwnedMonsterCount < 0) {
    return result(false, 'invalid_active_owned_monster_count', { policy });
  }
  if (activeOwnedMonsterCount > policy.activeOwnedMonsterLimit) {
    return result(false, 'active_owned_monster_limit', { policy });
  }

  const actorKinds = actionKind === 'damage'
    ? policy.damageActorKinds
    : actionKind === 'utility'
      ? policy.utilityActorKinds
      : policy.captureActorKinds;
  if (!actorKinds.includes(actorEntityKind)) {
    return result(false, actionKind === 'damage' ? 'actor_damage_forbidden' : 'actor_action_forbidden', { policy });
  }

  if (actionKind === 'damage' && !policy.damageTargetKinds.includes(targetEntityKind)) {
    return result(false, 'damage_target_forbidden', { policy });
  }
  if (actionKind === 'capture') {
    if (!policy.captureTargetKinds.includes(targetEntityKind)) {
      return result(false, targetEntityKind === 'Boss' ? 'boss_capture_forbidden' : 'capture_target_forbidden', { policy });
    }
    if (policy.recallBeforeCapture && activeOwnedMonsterCount !== 0) {
      return result(false, 'recall_required_before_capture', { policy });
    }
  }
  return result(true, null, { policy });
}

export function canDamageContributeToCapture({ modeId, actorEntityKind } = {}) {
  const policy = combatModePolicy(modeId);
  return Boolean(policy?.enabled && policy.captureWeakeningActorKinds.includes(actorEntityKind));
}

export const COMBAT_V91_MODE_POLICIES = Object.freeze(Object.fromEntries(
  COMBAT_V91_MODE_IDS.map(modeId => [modeId, combatModePolicy(modeId)]),
));
