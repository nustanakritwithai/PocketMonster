// PocketMonster V8.1 A34 — typed, pure passive-event adapter.
// The adapter emits normalized modifiers; it does not mutate stats, status,
// resources, saves, or the source gameplay event.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import {
  PASSIVE_RUNTIME_POLICY,
  isPassiveEligibleForSpecies,
  passiveCatalogEntry,
} from './passive-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

const EVENT_STATE_VERSION = 'PASSIVE_EVENT_v1';
const EVENT_TYPE = 'stat-modifiers-requested';
const EVENT_KEYS = Object.freeze([
  'encounterId',
  'eventId',
  'ownerFainted',
  'ownerInstanceId',
  'ownerSpeciesId',
  'passiveId',
  'type',
]);
const STATE_KEYS = Object.freeze([
  'encounterId',
  'eventFingerprintById',
  'processedEventIds',
  'version',
]);
const EMPTY_MODIFIERS = Object.freeze([]);
const STONE_HIDE_MODIFIERS = Object.freeze([Object.freeze({
  kind: 'stat_multiplier',
  stat: 'DEF',
  multiplier: 1.1,
  sourcePassiveId: 'PASS_ROCK_01',
})]);

const STATIC_MODIFIERS_BY_PASSIVE = new Map([
  ['PASS_ROCK_01', STONE_HIDE_MODIFIERS],
]);

export const PASSIVE_EVENT_POLICY = Object.freeze({
  version: EVENT_STATE_VERSION,
  eventType: EVENT_TYPE,
  eventIdentity: 'caller_owned_non_empty_string',
  duplicatePolicy: 'exactly_once_per_encounter_event_id',
  eventStatePersistence: PASSIVE_RUNTIME_POLICY.eventStatePersistence,
  effectOutput: 'immutable_modifier_descriptors',
  directMutation: false,
  serverAuthorityClaim: false,
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactOwnStringKeys(value, expectedKeys) {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === expectedKeys.length
    && ownKeys.every(key => {
      if (typeof key !== 'string' || !expectedKeys.includes(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(descriptor && Object.hasOwn(descriptor, 'value'));
    });
}

function frozenState(encounterId, processedEventIds, eventFingerprintById = {}) {
  return Object.freeze({
    version: EVENT_STATE_VERSION,
    encounterId,
    processedEventIds: Object.freeze(processedEventIds),
    eventFingerprintById: Object.freeze({ ...eventFingerprintById }),
  });
}

function validState(state) {
  try {
    if (!isPlainRecord(state) || !hasExactOwnStringKeys(state, STATE_KEYS)) return false;
    if (state.version !== EVENT_STATE_VERSION) return false;
    if (state.encounterId !== null && !nonEmptyString(state.encounterId)) return false;
    if (!Array.isArray(state.processedEventIds)) return false;
    if (!isPlainRecord(state.eventFingerprintById)) return false;
    const ids = new Set();
    for (const eventId of state.processedEventIds) {
      if (!nonEmptyString(eventId) || ids.has(eventId)) return false;
      ids.add(eventId);
    }
    const fingerprints = Object.entries(state.eventFingerprintById);
    if (fingerprints.length !== ids.size) return false;
    for (const [eventId, fingerprint] of fingerprints) {
      const descriptor = Object.getOwnPropertyDescriptor(state.eventFingerprintById, eventId);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')
        || !ids.has(eventId)
        || !nonEmptyString(fingerprint)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function fingerprintValue(value) {
  if (value === null) return ['null'];
  const type = typeof value;
  if (type === 'number') {
    if (Number.isNaN(value)) return ['number', 'NaN'];
    if (value === Infinity) return ['number', 'Infinity'];
    if (value === -Infinity) return ['number', '-Infinity'];
    if (Object.is(value, -0)) return ['number', '-0'];
  }
  if (type === 'bigint') return ['bigint', value.toString()];
  if (['string', 'number', 'boolean', 'undefined'].includes(type)) return [type, value];
  return [type, Object.prototype.toString.call(value)];
}

function eventFingerprint(event) {
  try {
    const ownKeys = Reflect.ownKeys(event)
      .map(key => typeof key === 'symbol' ? `symbol:${String(key.description ?? '')}` : `string:${key}`)
      .sort();
    const prototype = Object.getPrototypeOf(event);
    const prototypeKind = prototype === Object.prototype ? 'object' : prototype === null ? 'null' : 'other';
    return JSON.stringify([
      prototypeKind,
      ownKeys,
      fingerprintValue(event.type),
      fingerprintValue(event.encounterId),
      fingerprintValue(event.ownerInstanceId),
      fingerprintValue(event.ownerSpeciesId),
      fingerprintValue(event.passiveId),
      fingerprintValue(event.ownerFainted),
    ]);
  } catch {
    return null;
  }
}

function validEventShape(event) {
  try {
    return isPlainRecord(event) && hasExactOwnStringKeys(event, EVENT_KEYS);
  } catch {
    return false;
  }
}

function result(ok, reason, state, detail = {}) {
  return Object.freeze({
    ok,
    applied: false,
    replay: false,
    reason,
    state,
    modifiers: EMPTY_MODIFIERS,
    ...detail,
  });
}

export function createPassiveEventState({ encounterId } = {}) {
  if (!nonEmptyString(encounterId)) throw new TypeError('encounterId must be a non-empty string');
  return frozenState(encounterId, [], {});
}

export function endPassiveEncounter(state) {
  if (!validState(state)) throw new TypeError('invalid passive event state');
  return frozenState(null, [], {});
}

export function resolvePassiveStaticModifier(context = {}) {
  try {
    if (!isPlainRecord(context)) return EMPTY_MODIFIERS;
    const { passiveId, ownerSpeciesId, ownerFainted } = context;
    if (ownerFainted !== false || !isPassiveEligibleForSpecies(ownerSpeciesId, passiveId)) {
      return EMPTY_MODIFIERS;
    }
    return STATIC_MODIFIERS_BY_PASSIVE.get(passiveId) ?? EMPTY_MODIFIERS;
  } catch {
    return EMPTY_MODIFIERS;
  }
}

export function resolvePassiveEvent(state, event) {
  if (!validState(state)) return result(false, 'invalid_state', state);
  if (state.encounterId === null) return result(false, 'encounter_inactive', state);
  if (!event || typeof event !== 'object' || Array.isArray(event)) return result(false, 'invalid_event', state);
  let eventId;
  let encounterId;
  try {
    eventId = event.eventId;
    encounterId = event.encounterId;
  } catch {
    return result(false, 'invalid_event', state);
  }
  if (!nonEmptyString(eventId)) return result(false, 'invalid_event_id', state);
  if (encounterId !== state.encounterId) return result(false, 'encounter_mismatch', state);

  const fingerprint = eventFingerprint(event);
  if (state.processedEventIds.includes(eventId)) {
    return fingerprint !== null
      && validEventShape(event)
      && state.eventFingerprintById[eventId] === fingerprint
      ? result(true, 'duplicate_event', state, { replay: true })
      : result(false, 'event_id_conflict', state);
  }
  if (!validEventShape(event)) return result(false, 'invalid_event_shape', state);
  let type;
  let ownerInstanceId;
  let ownerSpeciesId;
  let passiveId;
  let ownerFainted;
  try {
    ({ type, ownerInstanceId, ownerSpeciesId, passiveId, ownerFainted } = event);
  } catch {
    return result(false, 'invalid_event', state);
  }
  if (type !== EVENT_TYPE) return result(false, 'unsupported_event_type', state);
  if (!nonEmptyString(ownerInstanceId)) return result(false, 'invalid_owner_instance_id', state);
  if (!nonEmptyString(ownerSpeciesId)) return result(false, 'invalid_owner_species_id', state);
  const passive = passiveCatalogEntry(passiveId);
  if (!passive) return result(false, 'unknown_passive', state);
  if (!isPassiveEligibleForSpecies(ownerSpeciesId, passive.id)) {
    return result(false, 'passive_not_eligible', state);
  }
  if (typeof ownerFainted !== 'boolean') return result(false, 'invalid_fainted_state', state);
  if (fingerprint === null) return result(false, 'invalid_event', state);

  const nextState = frozenState(
    state.encounterId,
    [...state.processedEventIds, eventId],
    { ...state.eventFingerprintById, [eventId]: fingerprint },
  );
  if (ownerFainted) return result(true, 'owner_fainted', nextState);

  const modifiers = resolvePassiveStaticModifier({
    passiveId: passive.id,
    ownerSpeciesId,
    ownerFainted,
  });
  if (passive.activation !== 'resolver_ready' || modifiers.length === 0) {
    return result(true, 'passive_deferred', nextState);
  }
  return result(true, null, nextState, { applied: true, modifiers });
}
