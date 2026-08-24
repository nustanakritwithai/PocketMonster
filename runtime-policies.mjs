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

// V8.10 Wild AI runtime-compatibility policy. These values preserve the
// existing encounter radii and Basic Attack balance. Threat/role weights stay
// neutral until a separate design lock defines authoritative numeric behavior.
export const WILD_BASIC_AI_POLICY = Object.freeze({
  id: 'wild-basic-v810',
  preferredRangeMinM: 0,
  preferredRangeMaxM: 1.25,
  aggroRadiusM: ENCOUNTER_POLICY.aggroRadius,
  leashRadiusM: ENCOUNTER_POLICY.leashRadius,
  disengageRadiusM: ENCOUNTER_POLICY.disengageRadius,
  retargetCooldownSec: 1.2,
  targetSwitchMargin: 0.25,
  currentTargetBonus: 0.25,
  distanceWeight: 1,
  threatWeight: 0,
  rolePriorityWeight: 0,
  alertDurationSec: 0.35,
  windupDurationSec: 0.22,
  recoverDurationSec: 0.12,
  basicAttackCooldownSec: 1.2,
  bossAttackCooldownSec: 0.85,
  commandSource: 'wildBasicAI',
  manualSkillSlots: 'never',
  usesConsumed: 0,
});

// Bosses keep the same deterministic Basic-only contract, but expose the
// longer reaction window required by the encounter fairness contract.
export const WILD_BOSS_BASIC_AI_POLICY = Object.freeze({
  ...WILD_BASIC_AI_POLICY,
  id: 'wild-boss-basic-v810',
  windupDurationSec: 0.65,
  basicAttackCooldownSec: WILD_BASIC_AI_POLICY.bossAttackCooldownSec,
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

function engagementCandidateEligible(candidate, aggroRadius, leashRadius, disengageRadius) {
  if (!candidate || candidate.dead || candidate.capturing || !candidate.targetValid) return false;
  if (!Number.isFinite(candidate.distanceToTarget) || !Number.isFinite(candidate.distanceFromHome)) return false;
  const targetRadius = candidate.engaged ? disengageRadius : aggroRadius;
  return candidate.distanceFromHome <= leashRadius && candidate.distanceToTarget <= targetRadius;
}

export function fillEngagedWildIds(candidates, policy = ENCOUNTER_POLICY, output = new Set(), requiredId = null) {
  const aggroRadius = Number.isFinite(policy.aggroRadius) ? policy.aggroRadius : ENCOUNTER_POLICY.aggroRadius;
  const leashRadius = Number.isFinite(policy.leashRadius) ? policy.leashRadius : ENCOUNTER_POLICY.leashRadius;
  const disengageRadius = Number.isFinite(policy.disengageRadius) ? policy.disengageRadius : ENCOUNTER_POLICY.disengageRadius;
  const maxEngaged = Number.isInteger(policy.maxEngaged) && policy.maxEngaged >= 0 ? policy.maxEngaged : ENCOUNTER_POLICY.maxEngaged;
  if (!Array.isArray(candidates) || !(output instanceof Set)) throw new TypeError('engagement buffers are invalid');
  output.clear();
  if (maxEngaged > 0 && requiredId !== null && requiredId !== undefined) {
    let required = null;
    for (const candidate of candidates) if (candidate?.id === requiredId) { required = candidate; break; }
    if (engagementCandidateEligible(required, aggroRadius, leashRadius, disengageRadius)) output.add(required.id);
  }
  for (let pass = 0; pass < 2 && output.size < maxEngaged; pass += 1) {
    const preserveExisting = pass === 0;
    while (output.size < maxEngaged) {
      let selected = null;
      for (const candidate of candidates) {
        if (output.has(candidate?.id) || (candidate?.engaged === true) !== preserveExisting) continue;
        if (!engagementCandidateEligible(candidate, aggroRadius, leashRadius, disengageRadius)) continue;
        const candidateResumePriority = candidate.resumePriority === true;
        const selectedResumePriority = selected?.resumePriority === true;
        if (!selected
          || candidateResumePriority && !selectedResumePriority
          || candidateResumePriority === selectedResumePriority
            && (candidate.distanceToTarget < selected.distanceToTarget
              || candidate.distanceToTarget === selected.distanceToTarget
                && String(candidate.id) < String(selected.id))) selected = candidate;
      }
      if (!selected) break;
      output.add(selected.id);
    }
  }
  return output;
}

export function selectEngagedWildIds(candidates, policy = ENCOUNTER_POLICY) {
  return [...fillEngagedWildIds(candidates, policy)];
}
