export const ENCOUNTER_POLICY = Object.freeze({
  aggroRadius: 4,
  leashRadius: 18,
  disengageRadius: 20,
  maxEngaged: 2,
});

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

export function selectEngagedWildIds(candidates, policy = ENCOUNTER_POLICY) {
  const aggroRadius = Number.isFinite(policy.aggroRadius) ? policy.aggroRadius : ENCOUNTER_POLICY.aggroRadius;
  const leashRadius = Number.isFinite(policy.leashRadius) ? policy.leashRadius : ENCOUNTER_POLICY.leashRadius;
  const disengageRadius = Number.isFinite(policy.disengageRadius) ? policy.disengageRadius : ENCOUNTER_POLICY.disengageRadius;
  const maxEngaged = Number.isInteger(policy.maxEngaged) && policy.maxEngaged >= 0 ? policy.maxEngaged : ENCOUNTER_POLICY.maxEngaged;

  return candidates
    .filter(candidate => {
      if (!candidate || candidate.dead || !candidate.targetValid) return false;
      if (!Number.isFinite(candidate.distanceToTarget) || !Number.isFinite(candidate.distanceFromHome)) return false;
      const targetRadius = candidate.engaged ? disengageRadius : aggroRadius;
      return candidate.distanceFromHome <= leashRadius && candidate.distanceToTarget <= targetRadius;
    })
    .sort((a, b) => a.distanceToTarget - b.distanceToTarget || String(a.id).localeCompare(String(b.id)))
    .slice(0, maxEngaged)
    .map(candidate => candidate.id);
}
