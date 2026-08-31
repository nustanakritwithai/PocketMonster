import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  COMBAT_ENTITY_KINDS,
  COMBAT_OWNER_DOMAINS,
  COMBAT_STAT_KEYS,
  COMBAT_V91_CONTRACT_VERSION,
  COMBAT_V91_SAFETY_BOUNDS,
  canonicalCombatJson,
  createCombatActionDefinition,
  createCombatProfile,
  createWorldCombatSnapshot,
  fingerprintCombatValue,
  sha256Hex,
  validateCombatProfile,
  validateCombatStats,
  validateEffectiveCombatStats,
} from '../combat-v91-contract.mjs';
import { COMBAT_V91_RNG_VERSION } from '../combat-v91-rng.mjs';
import { TEST_RNG_SEEDS } from './v91-combat-fixtures.mjs';

assert.equal(COMBAT_V91_CONTRACT_VERSION, 'combat-v91-contract/v1');
assert.deepEqual(COMBAT_STAT_KEYS, [
  'hpMax', 'hpCurrent', 'atk', 'def', 'spAtk', 'spDef', 'spd',
  'accuracy', 'crit', 'evasion', 'resistance', 'penetration',
]);
assert.deepEqual(COMBAT_ENTITY_KINDS, ['Human', 'Monster', 'Npc', 'Boss', 'Ship']);
assert.deepEqual(COMBAT_OWNER_DOMAINS, ['Pirate', 'Pocket'], 'World supplies snapshots, not combat profiles');

for (const value of ['', 'abc', 'สู้ร่วมกัน', JSON.stringify({ z: 1, a: [2, 3] })]) {
  assert.equal(sha256Hex(value), createHash('sha256').update(value).digest('hex'), `SHA-256 parity: ${value}`);
}
assert.equal(canonicalCombatJson({ z: 1, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"z":1}');
assert.equal(fingerprintCombatValue({ z: 1, a: 2 }), fingerprintCombatValue({ a: 2, z: 1 }));

const stats = {
  hpMax: 100, hpCurrent: 73, atk: 22, def: 18, spAtk: 31, spDef: 20, spd: 25,
  accuracy: 0.95, crit: 0.05, evasion: 0.02, resistance: 0.1, penetration: 0,
};
assert.equal(validateCombatStats(stats).ok, true);
assert.equal(validateCombatStats({ ...stats, atk: COMBAT_V91_SAFETY_BOUNDS.statMax }).ok, true);
assert.equal(validateCombatStats({ ...stats, atk: COMBAT_V91_SAFETY_BOUNDS.statMax + 1 }).reason, 'invalid_stat');
assert.equal(validateEffectiveCombatStats({
  ...stats, atk: COMBAT_V91_SAFETY_BOUNDS.effectiveStatMax,
}).ok, true, 'bounded World and Status modifiers may exceed the Base Stat ceiling');
assert.equal(validateEffectiveCombatStats({
  ...stats, atk: COMBAT_V91_SAFETY_BOUNDS.effectiveStatMax + 1,
}).reason, 'invalid_effective_stat');

const input = {
  entityId: 'monster:MON_002:001', ownerDomain: 'Pocket', entityKind: 'Monster', level: 15,
  types: ['Fire'], stats, progressionStateVersion: 'monster-save/15',
  calculationVersion: 'monster-stat-formula/v1', definitionVersion: 'monster-stat-catalog/v1',
  stateVersion: 7,
};
const created = createCombatProfile(input);
assert.equal(created.ok, true);
assert.match(created.profile.fingerprint, /^[0-9a-f]{64}$/);
assert.equal(Object.isFrozen(created.profile), true);
assert.equal(Object.isFrozen(created.profile.stats), true);
assert.equal(Object.isFrozen(created.profile.types), true);
assert.equal(validateCombatProfile(created.profile).ok, true);
assert.equal(validateCombatProfile(created.profile, { entityId: input.entityId }).ok, true);
assert.equal(validateCombatProfile(created.profile, { entityId: 'other' }).reason, 'profile_mismatch');
assert.equal(createCombatProfile({ ...created.profile, fingerprint: '0'.repeat(64) }).reason, 'fingerprint_mismatch');
assert.deepEqual(input.stats, stats, 'profile construction is immutable');

for (const [mutation, reason] of [
  [{ ...input, entityId: '' }, 'invalid_entity_id'],
  [{ ...input, ownerDomain: 'World' }, 'invalid_owner_domain'],
  [{ ...input, entityKind: 'Player' }, 'invalid_entity_kind'],
  [{ ...input, level: 0 }, 'invalid_level'],
  [{ ...input, types: ['Fire', 'Fire'] }, 'invalid_types'],
  [{ ...input, stats: { ...stats, hpCurrent: 101 } }, 'hp_out_of_range'],
  [{ ...input, stats: { ...stats, crit: 1.1 } }, 'ratio_out_of_range'],
  [{ ...input, stats: { ...stats, atk: Number.NaN } }, 'invalid_stat'],
  [{ ...input, stats: { ...stats, luck: 1 } }, 'invalid_stats_shape'],
  [{ ...input, stateVersion: -1 }, 'invalid_state_version'],
  [{ ...input, extra: true }, 'unknown_profile_field'],
]) assert.equal(createCombatProfile(mutation).reason, reason);

const worldInput = {
  authority: 'server', worldSnapshotTick: 10482, combatTimeSec: 12.5,
  worldModifierVersion: 'world-modifier/v1', actorEntityId: input.entityId, targetEntityId: 'human:1',
  actorMultipliers: { atk: 0.8, spd: 0.85 }, targetMultipliers: { def: 1.1 },
  validation: { targetExists: true, permission: true, inRange: true, lineOfSight: true, safeZone: false },
  rngVersion: COMBAT_V91_RNG_VERSION, rngSeed: TEST_RNG_SEEDS.alpha,
  rngTicketId: 'rng-ticket:contract', rngTicketStateVersion: 3, rngExpiresAtWorldTick: 10492,
};
const snapshot = createWorldCombatSnapshot(worldInput);
assert.equal(snapshot.ok, true);
assert.equal(snapshot.snapshot.combatTimeSec, 12.5);
assert.equal(snapshot.snapshot.rngSeed, TEST_RNG_SEEDS.alpha);
assert.equal(snapshot.snapshot.actorMultipliers.atk, 0.8);
assert.equal(snapshot.snapshot.actorMultipliers.def, 1);
assert.equal(Object.isFrozen(snapshot.snapshot.actorMultipliers), true);

for (const [mutation, reason] of [
  [{ ...snapshot.snapshot, authority: 'client' }, 'invalid_world_authority'],
  [{ ...snapshot.snapshot, combatTimeSec: -1 }, 'invalid_combat_time'],
  [{ ...snapshot.snapshot, rngVersion: 'Math.random' }, 'invalid_world_rng_version'],
  [{ ...snapshot.snapshot, rngSeed: 'ABC' }, 'invalid_world_rng_seed'],
  [{ ...snapshot.snapshot, rngTicketId: '' }, 'invalid_world_rng_ticket'],
  [{ ...snapshot.snapshot, rngExpiresAtWorldTick: 10481 }, 'invalid_world_rng_ticket'],
  [{ ...snapshot.snapshot, actorMultipliers: { luck: 2 } }, 'unknown_multiplier'],
  [{ ...snapshot.snapshot, actorMultipliers: { atk: 4.01 } }, 'multiplier_out_of_range'],
  [{ ...snapshot.snapshot, debugTruth: true }, 'unknown_world_snapshot_field'],
]) assert.equal(createWorldCombatSnapshot({ ...mutation, fingerprint: undefined }).reason, reason);

const action = createCombatActionDefinition({
  actionId: 'skill:fire-burst', definitionVersion: 'action/fire-burst/v1', channel: 'special',
  power: 55, accuracy: 0.9, element: 'Fire', hitCount: 2, criticalAllowed: true,
  armorPierce: 0.1, statusApplications: [{ linkId: 'SL_0004', target: 'target' }],
});
assert.equal(action.ok, true);
assert.equal(Object.isFrozen(action.action.statusApplications[0]), true);
assert.equal(createCombatActionDefinition({ ...action.action, channel: 'domain-special' }).reason, 'invalid_action_channel');
assert.equal(createCombatActionDefinition({ ...action.action, element: 'Light' }).reason, 'invalid_action_element');
assert.equal(createCombatActionDefinition({
  ...action.action, statusApplications: [{ linkId: 'SL_0004', target: 'world' }], fingerprint: undefined,
}).reason, 'invalid_status_application');
assert.equal(createCombatActionDefinition({
  ...action.action,
  statusApplications: [{ linkId: 'SL_0004', target: 'target', clientChance: 1 }],
  fingerprint: undefined,
}).reason, 'invalid_status_application', 'nested client-only action fields are fail-closed');
assert.equal(createCombatActionDefinition({ ...action.action, domainDamageRule: 'Pirate' }).reason, 'unknown_action_field');

console.log('V9.1 CombatStats contract: PASS (12 stats, bounded profiles, Server RNG World snapshot)');
