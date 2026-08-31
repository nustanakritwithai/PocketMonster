import {
  COMBAT_RATIO_KEYS,
  COMBAT_STAT_KEYS,
  COMBAT_V91_RULES_VERSION,
  createCombatActionDefinition,
  createWorldCombatSnapshot,
  fingerprintCombatValue,
  validateCombatProfile,
} from './combat-v91-contract.mjs';
import {
  combatStatusStackCount,
  createCombatStatusProjection,
  planCombatStatusSnapshot,
  proposeCombatStatusApplication,
  validateCombatStatusSnapshot,
} from './combat-v91-status.mjs';
import { SKILL_STATUS_LINKS } from './status-catalog.mjs';
import { splitDamageBudget } from './damage-resolver.mjs';
import { typeEffectiveness } from './type-catalog.mjs';
import { COMBAT_V91_RNG_VERSION, createCombatV91Rng } from './combat-v91-rng.mjs';

export const COMBAT_V91_RULES_POLICY = Object.freeze({
  version: COMBAT_V91_RULES_VERSION,
  authority: 'deterministic_proposal_only',
  authoritativeWriter: 'server_or_target_owner',
  sharedPath: 'all_entity_kinds',
  levelScaleDivisor: 5,
  baseFormulaDivisor: 50,
  baseDamageFlat: 2,
  stab: 1.2,
  criticalMultiplier: 1.5,
  varianceMin: 0.9,
  varianceMax: 1,
  minimumSuccessfulDamage: 1,
  maximumCombinedPenetration: 0.95,
  rngOrder: Object.freeze(['hit', 'critical', 'variance', 'status_in_definition_order']),
});

const LINK_BY_ID = new Map(SKILL_STATUS_LINKS.map(link => [link.id, link]));

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function frozenTrace(trace) {
  return Object.freeze(trace.map(entry => Object.freeze({ ...entry })));
}

function statusContext(statusState, incomingType, nowSec) {
  const projected = createCombatStatusProjection(statusState, { incomingType, nowSec });
  if (!projected.ok) return projected;
  return result(true, null, { context: projected.projection });
}

function effectiveStats(profile, worldMultipliers, status, role) {
  const values = Object.fromEntries(COMBAT_STAT_KEYS.map(key => [key, profile.stats[key]]));
  for (const key of Object.keys(worldMultipliers)) values[key] *= worldMultipliers[key];
  if (role === 'actor') {
    values.atk *= status.modifiers.attackMultiplier;
    values.spAtk *= status.modifiers.specialAttackMultiplier;
    values.spd *= status.modifiers.speedMultiplier;
    values.accuracy *= status.control.accuracyMultiplier;
    values.crit += status.modifiers.critChancePct / 100;
  } else {
    values.def *= status.modifiers.defenseMultiplier;
    values.spDef *= status.modifiers.defenseMultiplier;
    values.spd *= status.modifiers.speedMultiplier;
    values.evasion += status.modifiers.evasionChancePct / 100;
  }
  for (const key of COMBAT_RATIO_KEYS) values[key] = clamp(values[key], 0, 1);
  return Object.freeze(values);
}

function readRng(rng, trace, label) {
  let value;
  try {
    value = rng();
  } catch {
    return result(false, 'rng_failure');
  }
  if (!Number.isFinite(value) || value < 0 || value >= 1) return result(false, 'invalid_rng_value');
  trace.push({ index: trace.length, label, value });
  return result(true, null, { value });
}

function validationFailure(snapshot) {
  if (!snapshot.validation.targetExists) return 'target_missing';
  if (!snapshot.validation.permission) return 'permission_denied';
  if (snapshot.validation.safeZone) return 'safe_zone';
  if (!snapshot.validation.inRange) return 'out_of_range';
  if (!snapshot.validation.lineOfSight) return 'line_of_sight_blocked';
  return null;
}

function currentStacks(statusState, statusId) {
  if (statusState == null) return 0;
  return combatStatusStackCount(statusState, statusId) ?? 0;
}

function statusTransition(plan) {
  return Object.freeze({
    entityId: plan.before.entityId,
    ownerDomain: plan.before.ownerDomain,
    statusStateVersionBefore: plan.before.statusStateVersion,
    statusStateVersionAfter: plan.after.statusStateVersion,
    statusFingerprintBefore: plan.before.fingerprint,
    statusFingerprintAfter: plan.after.fingerprint,
    changed: plan.changed,
    attempts: plan.attempts,
  });
}

function statusResistance(linkId, profile, statusContextValue) {
  const statusId = LINK_BY_ID.get(linkId)?.statusId ?? null;
  const poisonBonus = statusId === 'ST_POISON' ? statusContextValue.modifiers.poisonResistancePct / 100 : 0;
  return clamp(profile.resistance + poisonBonus, 0, 1);
}

export function resolveCombatV91Proposal({
  combatId,
  actionSequence,
  attacker,
  target,
  action,
  worldSnapshot,
  attackerStatusSnapshot,
  targetStatusSnapshot,
} = {}) {
  if (typeof combatId !== 'string' || combatId.length === 0) return result(false, 'invalid_combat_id');
  if (!Number.isInteger(actionSequence) || actionSequence < 0) return result(false, 'invalid_action_sequence');
  const actorValidation = validateCombatProfile(attacker);
  if (!actorValidation.ok) return result(false, 'invalid_attacker_profile', { cause: actorValidation });
  const targetValidation = validateCombatProfile(target);
  if (!targetValidation.ok) return result(false, 'invalid_target_profile', { cause: targetValidation });
  const actionValidation = createCombatActionDefinition(action);
  if (!actionValidation.ok) return result(false, 'invalid_action_definition', { cause: actionValidation });
  const worldValidation = createWorldCombatSnapshot(worldSnapshot);
  if (!worldValidation.ok) return result(false, 'invalid_world_snapshot', { cause: worldValidation });

  const actorProfile = actorValidation.profile;
  const targetProfile = targetValidation.profile;
  const canonicalAction = actionValidation.action;
  const snapshot = worldValidation.snapshot;
  const actorStatusValidation = validateCombatStatusSnapshot(attackerStatusSnapshot, {
    combatId,
    entityId: actorValidation.profile.entityId,
    ownerDomain: actorValidation.profile.ownerDomain,
  });
  const targetStatusValidation = validateCombatStatusSnapshot(targetStatusSnapshot, {
    combatId,
    entityId: targetValidation.profile.entityId,
    ownerDomain: targetValidation.profile.ownerDomain,
  });
  if (!actorStatusValidation.ok) return result(false, 'invalid_attacker_status', { cause: actorStatusValidation });
  if (!targetStatusValidation.ok) return result(false, 'invalid_target_status', { cause: targetStatusValidation });
  if (actorStatusValidation.snapshot.state.currentTimeSec !== snapshot.combatTimeSec
    || targetStatusValidation.snapshot.state.currentTimeSec !== snapshot.combatTimeSec) {
    return result(false, 'unsettled_status_clock');
  }
  const statusLinks = [];
  const uniqueStatuses = new Set();
  for (const application of canonicalAction.statusApplications) {
    const link = LINK_BY_ID.get(application.linkId);
    if (!link) return result(false, 'unknown_status_link', { linkId: application.linkId });
    const key = `${link.statusId}\u0000${application.target}`;
    if (uniqueStatuses.has(key)) return result(false, 'duplicate_status_application', { statusId: link.statusId });
    uniqueStatuses.add(key);
    statusLinks.push(link);
  }
  if (snapshot.actorEntityId !== actorProfile.entityId || snapshot.targetEntityId !== targetProfile.entityId) {
    return result(false, 'world_entity_mismatch');
  }
  if (actorProfile.entityId === targetProfile.entityId) return result(false, 'same_entity_not_supported');
  const blocked = validationFailure(snapshot);
  if (blocked) return result(false, blocked, { rngDraws: 0, rngTrace: Object.freeze([]) });

  const actorStatusSnapshot = actorStatusValidation.snapshot;
  const defenderStatusSnapshot = targetStatusValidation.snapshot;
  const actorStatus = statusContext(actorStatusSnapshot.state, null, snapshot.combatTimeSec);
  if (!actorStatus.ok) return result(false, 'invalid_attacker_status', { cause: actorStatus });
  const defenderStatus = statusContext(defenderStatusSnapshot.state, canonicalAction.element, snapshot.combatTimeSec);
  if (!defenderStatus.ok) return result(false, 'invalid_target_status', { cause: defenderStatus });
  if (!actorStatus.context.control.canAttack) {
    return result(false, 'actor_status_controlled', { rngDraws: 0, rngTrace: Object.freeze([]) });
  }

  const rngStream = createCombatV91Rng({
    seed: snapshot.rngSeed,
    combatId,
    actionSequence,
    actorEntityId: actorProfile.entityId,
    targetEntityId: targetProfile.entityId,
    actionId: canonicalAction.actionId,
    actionFingerprint: canonicalAction.fingerprint,
    worldSnapshotFingerprint: snapshot.fingerprint,
    rngTicketId: snapshot.rngTicketId,
  });
  if (!rngStream.ok) return result(false, rngStream.reason);
  const rng = rngStream.rng;

  const actorStats = effectiveStats(actorProfile, snapshot.actorMultipliers, actorStatus.context, 'actor');
  const targetStats = effectiveStats(targetProfile, snapshot.targetMultipliers, defenderStatus.context, 'target');
  const trace = [];
  const hitRoll = readRng(rng, trace, 'hit');
  if (!hitRoll.ok) return result(false, hitRoll.reason, { rngDraws: trace.length, rngTrace: frozenTrace(trace) });
  const criticalRoll = readRng(rng, trace, 'critical');
  if (!criticalRoll.ok) return result(false, criticalRoll.reason, { rngDraws: trace.length, rngTrace: frozenTrace(trace) });
  const varianceRoll = readRng(rng, trace, 'variance');
  if (!varianceRoll.ok) return result(false, varianceRoll.reason, { rngDraws: trace.length, rngTrace: frozenTrace(trace) });

  const hitChance = clamp(canonicalAction.accuracy * actorStats.accuracy * (1 - targetStats.evasion), 0, 1);
  const hit = hitRoll.value < hitChance;
  const criticalChance = canonicalAction.criticalAllowed ? actorStats.crit : 0;
  const critical = hit && criticalRoll.value < criticalChance;
  const attackStat = canonicalAction.channel === 'physical' ? actorStats.atk : actorStats.spAtk;
  const defenseStat = canonicalAction.channel === 'physical' ? targetStats.def : targetStats.spDef;
  const combinedPenetration = clamp(
    canonicalAction.armorPierce + actorStats.penetration,
    0,
    COMBAT_V91_RULES_POLICY.maximumCombinedPenetration,
  );
  const effectiveDefense = Math.max(1, defenseStat * (1 - combinedPenetration));
  const typeMultiplier = canonicalAction.element === null
    ? 1
    : typeEffectiveness(canonicalAction.element, targetProfile.types);
  const stabMultiplier = canonicalAction.element !== null && actorProfile.types.includes(canonicalAction.element)
    ? COMBAT_V91_RULES_POLICY.stab
    : 1;
  const criticalMultiplier = critical ? COMBAT_V91_RULES_POLICY.criticalMultiplier : 1;
  const varianceMultiplier = COMBAT_V91_RULES_POLICY.varianceMin
    + (COMBAT_V91_RULES_POLICY.varianceMax - COMBAT_V91_RULES_POLICY.varianceMin) * varianceRoll.value;
  const baseDamage = canonicalAction.power > 0
    ? Math.floor(((((2 * actorProfile.level / COMBAT_V91_RULES_POLICY.levelScaleDivisor) + 2)
      * canonicalAction.power * attackStat / effectiveDefense)
      / COMBAT_V91_RULES_POLICY.baseFormulaDivisor) + COMBAT_V91_RULES_POLICY.baseDamageFlat)
    : 0;
  const damageMultiplier = defenderStatus.context.modifiers.damageTakenMultiplier
    * defenderStatus.context.modifiers.elementDamageTakenMultiplier;
  const unresolvedDamage = baseDamage * stabMultiplier * typeMultiplier
    * criticalMultiplier * varianceMultiplier * damageMultiplier;
  const totalDamage = hit && canonicalAction.power > 0 && typeMultiplier > 0
    ? Math.max(COMBAT_V91_RULES_POLICY.minimumSuccessfulDamage, Math.floor(unresolvedDamage))
    : 0;
  const hitDamages = splitDamageBudget(totalDamage, canonicalAction.hitCount);
  const predictedHp = Math.max(0, targetProfile.stats.hpCurrent - totalDamage);

  const statusProposals = [];
  const statusEligible = hit && (canonicalAction.power === 0 || totalDamage > 0);
  if (statusEligible) {
    for (let index = 0; index < canonicalAction.statusApplications.length; index += 1) {
      const application = canonicalAction.statusApplications[index];
      if (application.target === 'target' && predictedHp <= 0) continue;
      const recipientProfile = application.target === 'actor' ? actorProfile : targetProfile;
      const recipientStats = application.target === 'actor' ? actorStats : targetStats;
      const recipientContext = application.target === 'actor' ? actorStatus.context : defenderStatus.context;
      const recipientState = application.target === 'actor' ? actorStatusSnapshot.state : defenderStatusSnapshot.state;
      const link = statusLinks[index];
      const status = proposeCombatStatusApplication({
        linkId: application.linkId,
        targetTypes: recipientProfile.types,
        currentStacks: currentStacks(recipientState, link.statusId),
        targetResistance: statusResistance(application.linkId, recipientStats, recipientContext),
      }, { rng: () => {
        const rolled = readRng(rng, trace, `status:${application.linkId}`);
        if (!rolled.ok) throw new TypeError(rolled.reason);
        return rolled.value;
      } });
      if (!status.ok) return result(false, status.reason, { linkId: application.linkId, rngTrace: frozenTrace(trace) });
      statusProposals.push(Object.freeze({
        applicationIndex: index,
        linkId: application.linkId,
        target: application.target,
        targetEntityId: recipientProfile.entityId,
        applied: status.applied,
        reason: status.reason,
        statusId: status.statusId,
        proposedStatus: status.proposedStatus,
        finalChance: status.finalChance,
        roll: status.roll,
      }));
    }
  }

  const actorStatusPlan = planCombatStatusSnapshot(
    actorStatusSnapshot,
    statusProposals.filter(application => application.targetEntityId === actorProfile.entityId),
    { nowSec: snapshot.combatTimeSec },
  );
  if (!actorStatusPlan.ok) return result(false, actorStatusPlan.reason, { cause: actorStatusPlan });
  const targetStatusPlan = planCombatStatusSnapshot(
    defenderStatusSnapshot,
    statusProposals.filter(application => application.targetEntityId === targetProfile.entityId),
    { nowSec: snapshot.combatTimeSec },
  );
  if (!targetStatusPlan.ok) return result(false, targetStatusPlan.reason, { cause: targetStatusPlan });
  const targetStateVersionAfter = targetProfile.stateVersion + (totalDamage > 0 ? 1 : 0);
  const predictedStatusSnapshots = Object.freeze([actorStatusPlan.after, targetStatusPlan.after]);
  const predictedStatusTransitions = Object.freeze([
    statusTransition(actorStatusPlan),
    statusTransition(targetStatusPlan),
  ]);
  const predictedStatusApplied = Object.freeze([
    ...actorStatusPlan.attempts,
    ...targetStatusPlan.attempts,
  ]
    .filter(attempt => attempt.applied)
    .sort((left, right) => left.applicationIndex - right.applicationIndex)
    .map(attempt => Object.freeze({
      statusId: attempt.statusId,
      targetEntityId: attempt.targetEntityId,
    })));
  const predictedCommitPayload = {
    schemaVersion: 'combat-commit-projection/v9.1',
    combatId,
    actionSequence,
    actorEntityId: actorProfile.entityId,
    targetEntityId: targetProfile.entityId,
    hpBefore: targetProfile.stats.hpCurrent,
    hpAfter: predictedHp,
    targetStateVersionBefore: targetProfile.stateVersion,
    targetStateVersionAfter,
    statusSnapshots: predictedStatusSnapshots.map(status => ({
      entityId: status.entityId,
      statusStateVersion: status.statusStateVersion,
      fingerprint: status.fingerprint,
    })),
    statusApplied: predictedStatusApplied,
  };
  const predictedCommitFingerprint = fingerprintCombatValue(predictedCommitPayload);

  const payload = {
    schemaVersion: 'combat-proposal/v9.1',
    rulesVersion: COMBAT_V91_RULES_VERSION,
    authority: COMBAT_V91_RULES_POLICY.authority,
    committed: false,
    combatId,
    actionSequence,
    worldSnapshotTick: snapshot.worldSnapshotTick,
    actorEntityId: actorProfile.entityId,
    targetEntityId: targetProfile.entityId,
    actionId: canonicalAction.actionId,
    actionDefinitionVersion: canonicalAction.definitionVersion,
    actorProfileFingerprint: actorProfile.fingerprint,
    targetProfileFingerprint: targetProfile.fingerprint,
    actionFingerprint: canonicalAction.fingerprint,
    worldSnapshotFingerprint: snapshot.fingerprint,
    actorStateVersion: actorProfile.stateVersion,
    targetStateVersion: targetProfile.stateVersion,
    actorStatusStateVersion: actorStatusSnapshot.statusStateVersion,
    targetStatusStateVersion: defenderStatusSnapshot.statusStateVersion,
    actorStatusFingerprint: actorStatusSnapshot.fingerprint,
    targetStatusFingerprint: defenderStatusSnapshot.fingerprint,
    channel: canonicalAction.channel,
    hit,
    hitChance,
    critical,
    criticalChance,
    typeMultiplier,
    stabMultiplier,
    varianceMultiplier,
    attackStat,
    defenseStat,
    effectiveDefense,
    combinedPenetration,
    totalDamage,
    hitDamages,
    predictedHp,
    targetStateVersionAfter,
    defeatedCandidate: predictedHp <= 0,
    proposedStatuses: Object.freeze(statusProposals),
    predictedStatusTransitions,
    predictedStatusSnapshots,
    predictedStatusApplied,
    predictedCommitFingerprint,
    effectiveActorStats: actorStats,
    effectiveTargetStats: targetStats,
    rngVersion: COMBAT_V91_RNG_VERSION,
    rngTicketId: snapshot.rngTicketId,
    rngTicketStateVersion: snapshot.rngTicketStateVersion,
    rngStreamFingerprint: rngStream.streamFingerprint,
    rngTrace: frozenTrace(trace),
    rngDraws: trace.length,
  };
  const predictedResultFingerprint = fingerprintCombatValue(payload);
  return result(true, hit ? null : 'attack_missed', {
    proposal: Object.freeze({ ...payload, predictedResultFingerprint }),
  });
}
