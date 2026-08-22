import {
  INSTANCE_SAVE_VERSION,
  TRANSIENT_COOLDOWN_FIELDS,
  TRANSIENT_PASSIVE_FIELDS,
  catalogIdentityDiagnostics,
  migrateState,
  sanitizeMonsterInstanceForPersistence,
} from './monster-instance.mjs';
import {
  eggCollectionDiagnostics,
  normalizeEggsForPersistence,
} from './breeding.mjs';

export const APP_VERSION = '8.2.0';
export const ASSET_REVISION = '810';
export const SAVE_SCHEMA_VERSION = 11;
export const SAVE_KEY = 'monster-life-rpg-proto-v6';
export const SAVE_BACKUP_KEY = `${SAVE_KEY}:backup`;
export const LEGACY_SAVE_KEYS = Object.freeze([
  'monster-life-rpg-proto-v5',
  'monster-capture-summon-proto-v4',
]);

if (INSTANCE_SAVE_VERSION !== SAVE_SCHEMA_VERSION) {
  throw new Error(`instance/save schema mismatch: ${INSTANCE_SAVE_VERSION}/${SAVE_SCHEMA_VERSION}`);
}

export const SAVE_MIGRATION_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'monster-instance-v9-skill-runtime',
    targetVersion: 9,
    migrate: migrateState,
  }),
  Object.freeze({
    id: 'breeding-egg-v10',
    targetVersion: 10,
    migrate: migrateState,
  }),
  Object.freeze({
    id: 'passive-instance-v11',
    targetVersion: 11,
    migrate: migrateState,
  }),
]);

export function sanitizeStateForPersistence(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const state = { ...source };
  for (const field of TRANSIENT_COOLDOWN_FIELDS) delete state[field];
  for (const field of TRANSIENT_PASSIVE_FIELDS) delete state[field];
  state.collection = Array.isArray(source.collection)
    ? source.collection.map(sanitizeMonsterInstanceForPersistence)
    : [];
  state.eggs = normalizeEggsForPersistence(source.eggs);
  state.saveVersion = SAVE_SCHEMA_VERSION;
  return state;
}

export function applySaveMigrations(input, { now = Date.now() } = {}) {
  let state = input && typeof input === 'object' ? input : {};
  for (const migration of SAVE_MIGRATION_REGISTRY) {
    state = migration.migrate(state, { now });
  }
  return state;
}

function reportSaveDiagnostics(state, onDiagnostic) {
  const diagnostics = Object.freeze([
    ...catalogIdentityDiagnostics(state),
    ...eggCollectionDiagnostics(state.eggs),
  ]);
  if (typeof onDiagnostic === 'function') {
    for (const diagnostic of diagnostics) onDiagnostic(diagnostic);
  }
  return diagnostics;
}

function parseEnvelope(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const envelope = JSON.parse(raw);
    return envelope && typeof envelope === 'object' && envelope.state && typeof envelope.state === 'object'
      ? envelope
      : null;
  } catch {
    return null;
  }
}

function uniqueKnownIds(values, knownIds, excluded = new Set()) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== 'string' || !knownIds.has(value) || excluded.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function normalizeSavedState(input, { ranchCap = 6, now = Date.now(), onDiagnostic } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const collection = [];
  const knownIds = new Set();
  for (const monster of Array.isArray(source.collection) ? source.collection : []) {
    if (!monster || typeof monster !== 'object' || typeof monster.instanceId !== 'string' || knownIds.has(monster.instanceId)) continue;
    knownIds.add(monster.instanceId);
    collection.push(monster);
  }

  const partySeen = new Set();
  const sourceParty = Array.isArray(source.party) ? source.party : [];
  const party = Array.from({ length: 3 }, (_, index) => {
    const id = sourceParty[index];
    if (typeof id !== 'string' || !knownIds.has(id) || partySeen.has(id)) return null;
    partySeen.add(id);
    return id;
  });
  const storage = uniqueKnownIds(source.storage, knownIds, partySeen);
  const storageIds = new Set(storage);
  const ranchActive = uniqueKnownIds(source.ranchActive, storageIds).slice(0, Math.max(0, ranchCap));
  const selectedSlot = Number.isInteger(source.selectedSlot)
    ? Math.max(0, Math.min(2, source.selectedSlot))
    : 0;

  const canonical = {
    ...source,
    collection,
    party,
    storage,
    ranchActive,
    selectedSlot,
    lifeLastAt: Number.isFinite(source.lifeLastAt)
      ? source.lifeLastAt
      : Number.isFinite(source.trainingLastAt) ? source.trainingLastAt : now,
    inventory: {
      captureBalls: source.inventory?.captureBalls ?? 12,
      protein: source.inventory?.protein ?? 6,
      healthy: source.inventory?.healthy ?? 6,
      favorite: source.inventory?.favorite ?? 6,
      trainingChow: source.inventory?.trainingChow ?? 3,
      mineralBite: source.inventory?.mineralBite ?? 3,
      emberFruit: source.inventory?.emberFruit ?? 2,
      moonFruit: source.inventory?.moonFruit ?? 2,
      stash: Array.isArray(source.inventory?.stash)
        ? source.inventory.stash.filter(id => typeof id === 'string')
        : ['ranch_band', 'guard_charm', 'swift_lens', 'flame_claw', 'guard_band', 'focus_lens'],
    },
    eggs: normalizeEggsForPersistence(source.eggs),
    saveVersion: SAVE_SCHEMA_VERSION,
  };
  const migrated = applySaveMigrations(canonical, { now });
  reportSaveDiagnostics(migrated, onDiagnostic);
  return migrated;
}

export function readStoredSave(storage) {
  const current = parseEnvelope(storage.getItem(SAVE_KEY));
  if (current) return { ...current, source: 'current' };

  const backup = parseEnvelope(storage.getItem(SAVE_BACKUP_KEY));
  if (backup) return { ...backup, source: 'backup' };

  for (const key of LEGACY_SAVE_KEYS) {
    const legacy = parseEnvelope(storage.getItem(key));
    if (legacy) return { ...legacy, source: key };
  }
  return null;
}

export function writeStoredSave(storage, envelope, { onDiagnostic } = {}) {
  if (!envelope?.state || typeof envelope.state !== 'object') throw new TypeError('save envelope state is required');
  const persistentState = sanitizeStateForPersistence(envelope.state);
  reportSaveDiagnostics(persistentState, onDiagnostic);
  const previousRaw = storage.getItem(SAVE_KEY);
  const previous = parseEnvelope(previousRaw);
  if (previous) {
    storage.setItem(SAVE_BACKUP_KEY, JSON.stringify({
      ...previous,
      state: sanitizeStateForPersistence(previous.state),
      appVersion: APP_VERSION,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    }));
  }
  const next = {
    ...envelope,
    state: persistentState,
    appVersion: APP_VERSION,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
  };
  storage.setItem(SAVE_KEY, JSON.stringify(next));
  return next;
}
