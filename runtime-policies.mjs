export const ENCOUNTER_POLICY = Object.freeze({
  aggroRadius: 4,
  leashRadius: 18,
  disengageRadius: 20,
  maxEngaged: 2,
});

// Legacy owned-monster Basic Attack distances/timing, now centralized for the
// deterministic A35 resolver. These values are runtime compatibility policy;
// Monster_Profile Role/PreferredRange/AIStyle does not define numeric weights.
export const OWNED_BASIC_AI_POLICY = Object.freeze({
  acquireRangeM: 9,
  retainRangeM: 12,
  basicAttackRangeM: 1.35,
  basicAttackCooldownSec: 0.9,
  basicAttackPower: 15,
  actionTypes: Object.freeze(['idle', 'move', 'basic_attack']),
  targetTieBreak: 'distance_then_stable_id',
  commandSource: 'basicAI',
  manualSkillSlots: 'never',
  usesConsumed: 0,
  skillPriority: 'deferred_AI_Skill_Priority_TODO',
});

function capturePolicyResult(ok, reason) {
  return Object.freeze({ ok, reason, shouldRoll: ok });
}

// Pure A26 precondition boundary. Ball consumption and ownership mutation are
// intentionally deferred to the A27 capture transaction.
export function evaluateCaptureAttemptPolicy({
  ownedMonsterActive,
  ballQuantity,
  targetAlive,
  projectileHit,
  capturable,
} = {}) {
  if (typeof ownedMonsterActive !== 'boolean'
    || !Number.isInteger(ballQuantity) || ballQuantity < 0
    || typeof targetAlive !== 'boolean'
    || typeof projectileHit !== 'boolean'
    || typeof capturable !== 'boolean') {
    return capturePolicyResult(false, 'invalid_state');
  }
  if (ownedMonsterActive) return capturePolicyResult(false, 'active_monster_must_recall');
  if (ballQuantity <= 0) return capturePolicyResult(false, 'no_capture_ball');
  if (!targetAlive) return capturePolicyResult(false, 'target_fainted');
  if (!projectileHit) return capturePolicyResult(false, 'projectile_miss');
  if (!capturable) return capturePolicyResult(false, 'capture_disabled');
  return capturePolicyResult(true, null);
}

export function tickCooldown(current, dt) {
  const normalized = Number.isFinite(current) && current > 0 ? current : 0;
  const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
  return Math.max(0, normalized - elapsed);
}

export function shouldResetEncounter({
  engaged,
  targetValid,
  distanceToTarget,
  distanceFromHome,
  leashRadius = ENCOUNTER_POLICY.leashRadius,
  disengageRadius = ENCOUNTER_POLICY.disengageRadius,
}) {
  if (!engaged) return false;
  if (!targetValid) return true;
  if (!Number.isFinite(distanceToTarget) || !Number.isFinite(distanceFromHome)) return true;
  return distanceFromHome > leashRadius || distanceToTarget > disengageRadius;
}

export function fillEngagedWildIds(candidates, policy = ENCOUNTER_POLICY, output = new Set()) {
  const aggroRadius = Number.isFinite(policy.aggroRadius) ? policy.aggroRadius : ENCOUNTER_POLICY.aggroRadius;
  const leashRadius = Number.isFinite(policy.leashRadius) ? policy.leashRadius : ENCOUNTER_POLICY.leashRadius;
  const disengageRadius = Number.isFinite(policy.disengageRadius) ? policy.disengageRadius : ENCOUNTER_POLICY.disengageRadius;
  const maxEngaged = Number.isInteger(policy.maxEngaged) && policy.maxEngaged >= 0 ? policy.maxEngaged : ENCOUNTER_POLICY.maxEngaged;
  if (!Array.isArray(candidates) || !(output instanceof Set)) throw new TypeError('engagement buffers are invalid');
  output.clear();
  for (let selectedCount = 0; selectedCount < maxEngaged; selectedCount += 1) {
    let selected = null;
    for (const candidate of candidates) {
      if (output.has(candidate?.id)) continue;
      if (!candidate || candidate.dead || !candidate.targetValid) continue;
      if (!Number.isFinite(candidate.distanceToTarget) || !Number.isFinite(candidate.distanceFromHome)) continue;
      const targetRadius = candidate.engaged ? disengageRadius : aggroRadius;
      if (candidate.distanceFromHome > leashRadius || candidate.distanceToTarget > targetRadius) continue;
      if (!selected
        || candidate.distanceToTarget < selected.distanceToTarget
        || candidate.distanceToTarget === selected.distanceToTarget
          && String(candidate.id).localeCompare(String(selected.id)) < 0) selected = candidate;
    }
    if (!selected) break;
    output.add(selected.id);
  }
  return output;
}

export function selectEngagedWildIds(candidates, policy = ENCOUNTER_POLICY) {
  return [...fillEngagedWildIds(candidates, policy)];
}
