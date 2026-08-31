import assert from 'node:assert/strict';
import {
  COMBAT_V91_ACTION_SCHEMA,
  COMBAT_V91_PROFILE_SCHEMA,
  createCombatActionDefinition,
  createCombatProfile,
} from '../combat-v91-contract.mjs';
import {
  COMBAT_V91_ACTION_STAT_PROJECTION_SCHEMA,
  COMBAT_V91_ACTION_STAT_PROJECTION_VERSION,
  COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_CALCULATION_VERSION,
  COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_SOURCE_SCHEMA,
  createCombatActionStatProjection,
  validateCombatActionStatProjection,
} from '../combat-v91-action-stat-projection.mjs';

const profile = createCombatProfile({
  entityId: 'human:projection:1',
  ownerDomain: 'Pirate',
  entityKind: 'Human',
  level: 20,
  types: [],
  stats: {
    hpMax: 100, hpCurrent: 100, atk: 40, def: 30, spAtk: 50, spDef: 35, spd: 25,
    accuracy: 1, crit: 0, evasion: 0, resistance: 0, penetration: 0,
  },
  progressionStateVersion: 'human-core/v1:20',
  calculationVersion: 'pocket-shaped-human/v1',
  definitionVersion: 'human-growth/v1',
  stateVersion: 2,
}).profile;
const action = createCombatActionDefinition({
  actionId: 'pirate:sword:test',
  definitionVersion: 'pirate-action/test/v1',
  channel: 'physical',
  power: 40,
  accuracy: 1,
  element: null,
  hitCount: 1,
  criticalAllowed: false,
  armorPierce: 0,
  statusApplications: [],
}).action;

const input = {
  schemaVersion: COMBAT_V91_ACTION_STAT_PROJECTION_SCHEMA,
  projectionVersion: COMBAT_V91_ACTION_STAT_PROJECTION_VERSION,
  authority: 'server',
  ownerDomain: profile.ownerDomain,
  entityId: profile.entityId,
  profileSchemaVersion: profile.schemaVersion,
  profileProgressionStateVersion: profile.progressionStateVersion,
  profileCalculationVersion: profile.calculationVersion,
  profileDefinitionVersion: profile.definitionVersion,
  profileStateVersion: profile.stateVersion,
  profileFingerprint: profile.fingerprint,
  actionId: action.actionId,
  actionSchemaVersion: action.schemaVersion,
  actionDefinitionVersion: action.definitionVersion,
  actionFingerprint: action.fingerprint,
  sourceStat: 'atk',
  baseStat: profile.stats.atk,
  projectedStat: 55,
  calculationVersion: COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_CALCULATION_VERSION,
  sourceSchemaVersion: COMBAT_V91_ACTION_STAT_PROJECTION_PIRATE_SOURCE_SCHEMA,
  sourceFingerprint: 'a'.repeat(64),
};
const created = createCombatActionStatProjection(input);
assert.equal(created.ok, true);
assert.equal(Object.isFrozen(created.projection), true);
assert.equal(created.projection.ownerDomain, 'Pirate');
assert.equal(created.projection.profileSchemaVersion, COMBAT_V91_PROFILE_SCHEMA);
assert.equal(created.projection.actionSchemaVersion, COMBAT_V91_ACTION_SCHEMA);
assert.equal(created.projection.profileProgressionStateVersion, profile.progressionStateVersion);
assert.equal(validateCombatActionStatProjection(created.projection, {
  profile,
  action,
  expectedSourceStat: 'atk',
}).ok, true);

for (const [mutation, reason] of [
  [{ ...created.projection, authority: 'client', fingerprint: undefined },
    'invalid_action_stat_projection_authority'],
  [{ ...created.projection, hpCurrent: 1, fingerprint: undefined },
    'invalid_action_stat_projection_shape'],
  [{ ...created.projection, projectedStat: 1.5, fingerprint: undefined },
    'invalid_action_stat_projection_value'],
  [{ ...created.projection, sourceStat: 'hpMax', fingerprint: undefined },
    'invalid_action_stat_projection_source'],
  [{ ...created.projection, ownerDomain: 'Pocket', fingerprint: undefined },
    'pocket_action_stat_projection_forbidden'],
  [{ ...created.projection, ownerDomain: 'World', fingerprint: undefined },
    'invalid_action_stat_projection_owner'],
  [{ ...created.projection, profileSchemaVersion: 'combat-profile/forged', fingerprint: undefined },
    'action_stat_projection_contract_schema_mismatch'],
  [{ ...created.projection, projectionVersion: 'combat-action-stat-projection/forged', fingerprint: undefined },
    'action_stat_projection_version_mismatch'],
  [{ ...created.projection, actionSchemaVersion: 'combat-action/forged', fingerprint: undefined },
    'action_stat_projection_contract_schema_mismatch'],
  [{ ...created.projection, sourceSchemaVersion: 'forged-projection/v1', fingerprint: undefined },
    'action_stat_projection_source_contract_mismatch'],
  [{ ...created.projection, calculationVersion: 'forged-calculator/v1', fingerprint: undefined },
    'action_stat_projection_source_contract_mismatch'],
  [{ ...created.projection, fingerprint: '0'.repeat(64) },
    'action_stat_projection_fingerprint_mismatch'],
]) assert.equal(createCombatActionStatProjection(mutation).reason, reason);

const reboundProgression = createCombatActionStatProjection({
  ...created.projection,
  profileProgressionStateVersion: 'human-core/v1:forged',
  fingerprint: undefined,
});
assert.equal(reboundProgression.ok, true);
assert.equal(validateCombatActionStatProjection(reboundProgression.projection, {
  profile,
  action,
}).reason, 'action_stat_projection_profile_mismatch');

assert.equal(validateCombatActionStatProjection(created.projection, {
  profile: { ...profile, entityId: 'human:other', fingerprint: undefined },
  action,
}).reason, 'action_stat_projection_profile_mismatch');
assert.equal(validateCombatActionStatProjection(created.projection, {
  profile,
  action: { ...action, actionId: 'other' },
}).reason, 'action_stat_projection_action_mismatch');
assert.equal(validateCombatActionStatProjection(created.projection, {
  profile,
  action,
  expectedSourceStat: 'spAtk',
}).reason, 'action_stat_projection_channel_mismatch');

const pocketProfile = createCombatProfile({
  entityId: 'monster:projection:1',
  ownerDomain: 'Pocket',
  entityKind: 'Monster',
  level: 20,
  types: ['Fire'],
  stats: profile.stats,
  progressionStateVersion: 'pocket-growth/v1:20',
  calculationVersion: 'pocket-base-stats/v1',
  definitionVersion: 'monster-growth/v1',
  stateVersion: 2,
}).profile;
assert.equal(validateCombatActionStatProjection(created.projection, {
  profile: pocketProfile,
  action,
}).reason, 'pocket_action_stat_projection_forbidden',
  'Pocket must use its direct authoritative Base Stats and can never consume a projection');

console.log('V9.1 action stat projection: PASS (server-bound, action-scoped, no Base/HP writer)');
