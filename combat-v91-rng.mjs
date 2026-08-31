import { canonicalCombatJson, sha256Hex } from './combat-v91-contract.mjs';

export const COMBAT_V91_RNG_VERSION = 'combat-rng/sha256-counter-v1';
export const COMBAT_V91_RNG_SEED_PATTERN = /^[0-9a-f]{64}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Browser/worker/Node deterministic RNG. The seed is issued by the Server as
 * part of the authoritative World snapshot; action identity is mixed in so a
 * seed cannot be replayed for another command.
 */
export function createCombatV91Rng({
  seed,
  combatId,
  actionSequence,
  actorEntityId,
  targetEntityId,
  actionId,
  actionFingerprint,
  worldSnapshotFingerprint,
  rngTicketId,
} = {}) {
  if (!COMBAT_V91_RNG_SEED_PATTERN.test(seed ?? '')) return result(false, 'invalid_rng_seed');
  if (![combatId, actorEntityId, targetEntityId, actionId, rngTicketId].every(nonEmptyString)
    || !HASH_PATTERN.test(actionFingerprint ?? '')
    || !HASH_PATTERN.test(worldSnapshotFingerprint ?? '')
    || !Number.isInteger(actionSequence) || actionSequence < 0) return result(false, 'invalid_rng_context');
  const contextPayload = {
    version: COMBAT_V91_RNG_VERSION,
    combatId,
    actionSequence,
    actorEntityId,
    targetEntityId,
    actionId,
    actionFingerprint,
    worldSnapshotFingerprint,
    rngTicketId,
  };
  const contextFingerprint = sha256Hex(canonicalCombatJson(contextPayload));
  const streamFingerprint = sha256Hex(canonicalCombatJson({
    ...contextPayload,
    seed,
    contextFingerprint,
  }));
  let counter = 0;
  const rng = () => {
    const digest = sha256Hex([
      COMBAT_V91_RNG_VERSION,
      seed,
      contextFingerprint,
      String(counter),
    ].join('\0'));
    counter += 1;
    // 13 hex digits are exactly 52 random bits and stay within JS safe integer precision.
    return Number.parseInt(digest.slice(0, 13), 16) / (2 ** 52);
  };
  return result(true, null, { rng, contextFingerprint, streamFingerprint });
}
