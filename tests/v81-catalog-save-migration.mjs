import assert from 'node:assert/strict';
import {
  catalogIdentityDiagnostics,
  migrateState,
} from '../monster-instance.mjs';
import {
  SAVE_MIGRATION_REGISTRY,
  applySaveMigrations,
  normalizeSavedState,
  writeStoredSave,
} from '../save-schema.mjs';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const legacy = {
  saveVersion: 5,
  collection: [
    { instanceId: 'known', speciesId: 'flameling', exp: 12, customLegacyField: 'keep-me' },
    { instanceId: 'unknown', speciesId: 'flame_slime', exp: 7 },
    { instanceId: 'stored', speciesId: 'aquapuff', exp: 3 },
  ],
  party: ['known', null, null],
  storage: ['unknown', 'stored'],
  ranchActive: ['stored'],
  inventory: { captureBalls: 4 },
};

assert.equal(Object.isFrozen(SAVE_MIGRATION_REGISTRY), true, 'migration registry is immutable');
assert.deepEqual(
  SAVE_MIGRATION_REGISTRY.map(entry => [entry.id, entry.targetVersion]),
  [
    ['monster-instance-v9-skill-runtime', 9],
    ['breeding-egg-v10', 10],
    ['passive-instance-v11', 11],
    ['canonical-monster-stats-v12', 12],
    ['canonical-monster-exp-v13', 13],
  ],
  'the supported instance migration is explicit and versioned',
);

const reported = [];
const migrated = normalizeSavedState(legacy, { now: 1000, onDiagnostic: issue => reported.push(issue) });
assert.equal(migrated.collection.length, 3, 'legacy collection is preserved');
assert.equal(migrated.collection[0].speciesId, 'flameling', 'known runtime identity is unchanged');
assert.equal(migrated.collection[1].speciesId, 'flame_slime', 'unknown legacy identity is never silently replaced');
assert.equal(migrated.collection[0].customLegacyField, 'keep-me', 'unknown legacy fields survive migration');
assert.deepEqual(migrated.party, ['known', null, null], 'party ownership is unchanged');
assert.deepEqual(migrated.storage, ['unknown', 'stored'], 'storage ownership is unchanged');
assert.deepEqual(migrated.ranchActive, ['stored'], 'ranch remains a storage subset');
assert.equal(reported.length, 1, 'unknown species is reported once through the non-destructive path');
assert.equal(reported[0].code, 'migration_invalid_reference');
assert.equal(reported[0].instanceId, 'unknown');
assert.equal(reported[0].runtimeSpeciesId, 'flame_slime');
assert.equal(Object.isFrozen(reported[0]), true, 'reported diagnostics cannot be mutated by consumers');
assert.equal('catalogDiagnostics' in migrated, false, 'diagnostics are transient and never added to save state');

const migratedAgain = normalizeSavedState(migrated, { now: 1000 });
assert.deepEqual(migratedAgain, migrated, 'load normalization is idempotent');
assert.deepEqual(applySaveMigrations(migrated, { now: 1000 }), migrated, 'migration registry is idempotent');
assert.deepEqual(migrateState(migrateState(migrated, { now: 1000 }), { now: 1000 }), migrateState(migrated, { now: 1000 }), 'instance migration is idempotent');

const diagnostics = catalogIdentityDiagnostics(migrated);
assert.equal(diagnostics.length, 1);
assert.equal(Object.isFrozen(diagnostics), true);

const storage = new MemoryStorage();
const saveReports = [];
writeStoredSave(storage, { state: migrated }, { onDiagnostic: issue => saveReports.push(issue) });
assert.equal(saveReports.length, 1, 'pre-save validation reports the same unknown reference');
const serialized = [...storage.values.values()].join('\n');
assert.doesNotMatch(serialized, /catalogDiagnostics|migration_invalid_reference/, 'transient diagnostics never enter the payload');

console.log('V8.1 catalog/save migration guard: PASS');
