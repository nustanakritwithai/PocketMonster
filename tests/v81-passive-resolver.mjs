import assert from 'node:assert/strict';
import {
  PASSIVE_EVENT_POLICY,
  createPassiveEventState,
  endPassiveEncounter,
  resolvePassiveEvent,
  resolvePassiveStaticModifier,
} from '../passive-resolver.mjs';

const state = createPassiveEventState({ encounterId: 'encounter-a34' });
assert.deepEqual(state, {
  version: 'PASSIVE_EVENT_v1',
  encounterId: 'encounter-a34',
  processedEventIds: [],
  eventFingerprintById: {},
});
assert.equal(Object.isFrozen(state), true);
assert.equal(Object.isFrozen(state.processedEventIds), true);
assert.equal(Object.isFrozen(state.eventFingerprintById), true);
assert.equal(PASSIVE_EVENT_POLICY.eventType, 'stat-modifiers-requested');
assert.equal(PASSIVE_EVENT_POLICY.eventStatePersistence, 'do_not_persist');

const event = {
  eventId: 'evt-stat-001',
  encounterId: 'encounter-a34',
  type: 'stat-modifiers-requested',
  ownerInstanceId: 'owned-rock-1',
  ownerSpeciesId: 'rockhorn',
  passiveId: 'PASS_ROCK_01',
  ownerFainted: false,
};
const before = structuredClone(event);
const applied = resolvePassiveEvent(state, event);
assert.equal(applied.ok, true);
assert.equal(applied.applied, true);
assert.equal(applied.reason, null);
assert.deepEqual(applied.modifiers, [{
  kind: 'stat_multiplier',
  stat: 'DEF',
  multiplier: 1.1,
  sourcePassiveId: 'PASS_ROCK_01',
}]);
assert.deepEqual(applied.state.processedEventIds, ['evt-stat-001']);
assert.equal(typeof applied.state.eventFingerprintById['evt-stat-001'], 'string');
assert.deepEqual(event, before, 'event adapter never mutates the gameplay event');
assert.deepEqual(state.processedEventIds, [], 'event adapter is a pure state transition');

const duplicate = resolvePassiveEvent(applied.state, event);
assert.equal(duplicate.ok, true);
assert.equal(duplicate.applied, false);
assert.equal(duplicate.reason, 'duplicate_event');
assert.equal(duplicate.replay, true);
assert.equal(duplicate.state, applied.state);
assert.deepEqual(duplicate.modifiers, [], 'duplicate callbacks cannot apply a modifier twice');

const conflict = resolvePassiveEvent(applied.state, { ...event, passiveId: 'PASS_FLYING_01' });
assert.equal(conflict.ok, false);
assert.equal(conflict.reason, 'event_id_conflict');
assert.equal(conflict.state, applied.state);
assert.deepEqual(conflict.modifiers, []);

const injectedReplay = resolvePassiveEvent(applied.state, { ...event, multiplier: 999, injectedPayload: 'different' });
assert.equal(injectedReplay.ok, false);
assert.equal(injectedReplay.reason, 'event_id_conflict', 'event ID is bound to the complete typed payload shape');

assert.deepEqual(resolvePassiveStaticModifier({
  passiveId: 'PASS_ROCK_01',
  ownerSpeciesId: 'rockhorn',
  ownerFainted: false,
}), applied.modifiers);
assert.deepEqual(resolvePassiveStaticModifier({
  passiveId: 'PASS_FLYING_01',
  ownerSpeciesId: 'galebird',
  ownerFainted: false,
}), [], 'other passive mechanics remain catalog-only');
assert.deepEqual(resolvePassiveStaticModifier({
  passiveId: 'PASS_ROCK_01',
  ownerSpeciesId: 'normalooze',
  ownerFainted: false,
}), [], 'a forged species/passive pairing cannot reach the static modifier');
assert.deepEqual(resolvePassiveStaticModifier({
  passiveId: 'PASS_ROCK_01',
  ownerSpeciesId: 'rockhorn',
  ownerFainted: true,
}), [], 'a fainted owner cannot receive a passive modifier');

const deferred = resolvePassiveEvent(applied.state, {
  ...event,
  eventId: 'evt-stat-002',
  ownerSpeciesId: 'galebird',
  passiveId: 'PASS_FLYING_01',
});
assert.equal(deferred.ok, true);
assert.equal(deferred.applied, false);
assert.equal(deferred.reason, 'passive_deferred');
assert.deepEqual(deferred.state.processedEventIds, ['evt-stat-001', 'evt-stat-002']);

const fainted = resolvePassiveEvent(deferred.state, { ...event, eventId: 'evt-stat-003', ownerFainted: true });
assert.equal(fainted.ok, true);
assert.equal(fainted.applied, false);
assert.equal(fainted.reason, 'owner_fainted');
assert.deepEqual(fainted.modifiers, []);
assert.deepEqual(fainted.state.processedEventIds, ['evt-stat-001', 'evt-stat-002', 'evt-stat-003']);

for (const [badEvent, reason] of [
  [{ ...event, eventId: '' }, 'invalid_event_id'],
  [{ ...event, encounterId: 'other' }, 'encounter_mismatch'],
  [{ ...event, type: 'damage-resolved' }, 'unsupported_event_type'],
  [{ ...event, ownerInstanceId: '' }, 'invalid_owner_instance_id'],
  [{ ...event, ownerSpeciesId: '' }, 'invalid_owner_species_id'],
  [{ ...event, passiveId: 'PASS_UNKNOWN_99' }, 'unknown_passive'],
  [{ ...event, ownerSpeciesId: 'normalooze' }, 'passive_not_eligible'],
  [{ ...event, ownerFainted: 'no' }, 'invalid_fainted_state'],
  [{ ...event, unexpected: 'payload' }, 'invalid_event_shape'],
  [Object.assign(Object.create({ inherited: true }), event), 'invalid_event_shape'],
]) {
  const rejected = resolvePassiveEvent(state, badEvent);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, reason);
  assert.equal(rejected.state, state, `${reason} cannot consume an event ID`);
  assert.deepEqual(rejected.modifiers, []);
}

const bigintOwner = { ...event, ownerInstanceId: 1n };
assert.doesNotThrow(() => resolvePassiveEvent(state, bigintOwner), 'malformed scalar input must fail closed');
assert.equal(resolvePassiveEvent(state, bigintOwner).reason, 'invalid_owner_instance_id');

const malformedState = resolvePassiveEvent({ ...state, processedEventIds: ['evt', 'evt'] }, event);
assert.equal(malformedState.ok, false);
assert.equal(malformedState.reason, 'invalid_state');

const inheritedState = Object.create({
  version: 'PASSIVE_EVENT_v1',
  encounterId: 'encounter-a34',
  processedEventIds: [],
  eventFingerprintById: {},
});
assert.equal(resolvePassiveEvent(inheritedState, event).reason, 'invalid_state', 'ledger fields must be own state fields');

const reset = endPassiveEncounter(fainted.state);
assert.deepEqual(reset, {
  version: 'PASSIVE_EVENT_v1',
  encounterId: null,
  processedEventIds: [],
  eventFingerprintById: {},
});
assert.equal(resolvePassiveEvent(reset, event).reason, 'encounter_inactive');
assert.equal(resolvePassiveEvent(reset, { ...event, encounterId: null }).reason, 'encounter_inactive',
  'an ended encounter cannot be reactivated by a null encounter ID');

console.log('V8.1 A34 passive event resolver: PASS');
