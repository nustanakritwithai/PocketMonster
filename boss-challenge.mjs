export const BOSS_CHALLENGE_POLICY = Object.freeze({
  promptRadiusM: 6,
  rearmRadiusM: 8,
});

export function createBossChallengeSession() {
  return Object.freeze({ activeBossId: null, dismissedBossId: null });
}

function validBossId(bossId) {
  return typeof bossId === 'string' && bossId.length > 0;
}

export function bossCombatAuthorized(session, bossId) {
  return validBossId(bossId) && session?.activeBossId === bossId;
}

export function bossTargetable(wild, session) {
  if (!wild?.boss) return true;
  return bossCombatAuthorized(session, wild.id);
}

export function bossPromptAvailable({ session, bossId, alive, distanceM } = {}, policy = BOSS_CHALLENGE_POLICY) {
  if (!validBossId(bossId) || alive !== true || !Number.isFinite(distanceM)) return false;
  if (bossCombatAuthorized(session, bossId) || session?.dismissedBossId === bossId) return false;
  return distanceM <= policy.promptRadiusM;
}

export function acceptBossChallenge(session, bossId) {
  if (!validBossId(bossId)) return createBossChallengeSession();
  return Object.freeze({ activeBossId: bossId, dismissedBossId: null });
}

export function declineBossChallenge(session, bossId) {
  if (!validBossId(bossId) || bossCombatAuthorized(session, bossId)) return session ?? createBossChallengeSession();
  return Object.freeze({ activeBossId: null, dismissedBossId: bossId });
}

export function retreatBossChallenge(session, bossId) {
  if (!validBossId(bossId) || !bossCombatAuthorized(session, bossId)) return session ?? createBossChallengeSession();
  return Object.freeze({ activeBossId: null, dismissedBossId: bossId });
}

export function rearmBossChallenge(session, bossId, distanceM, policy = BOSS_CHALLENGE_POLICY) {
  if (!validBossId(bossId) || session?.dismissedBossId !== bossId || !Number.isFinite(distanceM)
    || distanceM < policy.rearmRadiusM) return session ?? createBossChallengeSession();
  return createBossChallengeSession();
}
