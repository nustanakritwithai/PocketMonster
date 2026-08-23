import assert from 'node:assert/strict';
import {
  INSTANCE_SAVE_VERSION,
  INSTANCE_STAT_SCHEMA_VERSION,
  INSTANCE_STAT_TRAINING_MAP,
  addStatTraining,
  addTrainingExp,
  canonicalFormIdForInstance,
  normalizeInstance,
  normalizeInstanceStatTraining,
  sanitizeMonsterInstanceForPersistence,
  statTrainingUsed,
} from '../monster-instance.mjs';
import { calculateMonsterStats } from '../monster-stat-formula.mjs';
import {
  SAVE_KEY,
  SAVE_MIGRATION_REGISTRY,
  SAVE_SCHEMA_VERSION,
  normalizeSavedState,
  sanitizeStateForPersistence,
  writeStoredSave,
} from '../save-schema.mjs';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

assert.equal(INSTANCE_SAVE_VERSION, 12);
assert.equal(SAVE_SCHEMA_VERSION, 12);
assert.equal(INSTANCE_STAT_SCHEMA_VERSION, 'monster-instance-stats/v1');
assert.deepEqual(INSTANCE_STAT_TRAINING_MAP, {
  hp: null, atk: 'power', def: 'defense', spAtk: 'technique', spDef: 'spirit', spd: 'speed',
});
assert.equal(Object.isFrozen(INSTANCE_STAT_TRAINING_MAP), true);
assert.deepEqual(SAVE_MIGRATION_REGISTRY.map(entry => [entry.id, entry.targetVersion]), [
  ['monster-instance-v9-skill-runtime', 9],
  ['breeding-egg-v10', 10],
  ['passive-instance-v11', 11],
  ['canonical-monster-stats-v12', 12],
]);

const legacy = {
  instanceId: 'legacy-stat',
  speciesId: 'flameling',
  formId: 'flameling',
  level: 15,
  training: { power: 120, defense: 80, speed: 60, technique: 40, spirit: 20 },
};
const before = structuredClone(legacy);
const migrated = normalizeInstance(legacy, { now: 1000 });
assert.deepEqual(legacy, before, 'migration never mutates the source instance');
assert.equal(migrated.saveVersion, 12);
assert.equal(migrated.statSchemaVersion, 'monster-instance-stats/v1');
assert.equal(migrated.canonicalFormId, 'MON_002');
assert.deepEqual(migrated.statTraining, { hp: 0, atk: 120, def: 80, spAtk: 40, spDef: 20, spd: 60 });
assert.equal(statTrainingUsed(migrated), 320);
const calculated = calculateMonsterStats({
  formId: migrated.canonicalFormId,
  level: migrated.level,
  potential: migrated.potential,
  training: migrated.statTraining,
});
assert.equal(calculated.ok, true, 'migrated instance is accepted directly by the M2 formula engine');
assert.deepEqual(Object.keys(calculated.stats), ['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']);
assert.deepEqual(normalizeInstance(migrated, { now: 1000 }), migrated, 'instance migration is idempotent');

assert.equal(canonicalFormIdForInstance({ speciesId: 'flameling', formId: 'MON_020' }), 'MON_020');
assert.equal(canonicalFormIdForInstance({ speciesId: 'flameling', formId: 'flameling_lv2', evolutionPath: 'flameling_lv2' }), 'MON_020');
assert.equal(canonicalFormIdForInstance({ speciesId: 'flameling', formId: 'flameling_lv2', evolutionHistory: [{ to: 'flameling_lv2' }] }), 'MON_020');
assert.equal(canonicalFormIdForInstance({ speciesId: 'flameling', canonicalFormId: 'MON_999', formId: 'flameling' }), 'MON_002');
assert.equal(canonicalFormIdForInstance({ speciesId: 'unknown', formId: 'MON_020' }), null);

assert.deepEqual(normalizeInstanceStatTraining({
  hp: 500, atk: 500, def: 500, spatk: 500, spdef: 500, spd: 500,
}), { hp: 200, atk: 200, def: 200, spAtk: 0, spDef: 0, spd: 0 }, 'canonical training is capped per stat and at 600 total');
assert.deepEqual(normalizeInstanceStatTraining({ hp: 1.9, atk: -5, def: Number.NaN }, { defense: 44 }), {
  hp: 1, atk: 0, def: 44, spAtk: 0, spDef: 0, spd: 0,
}, 'canonical values are integral and missing values fall back to legacy lines');

const synchronized = normalizeInstance({
  instanceId: 'sync-training', speciesId: 'aquapuff', training: { power: 10 },
}, { now: 1000 });
assert.equal(addTrainingExp(synchronized, 'power', 25), 25);
assert.equal(synchronized.training.power, 35);
assert.equal(synchronized.statTraining.atk, 35, 'legacy Ranch award synchronizes canonical ATK training');
assert.equal(addStatTraining(synchronized, 'hp', 250), 200);
assert.equal(synchronized.statTraining.hp, 200);
assert.equal(addStatTraining(synchronized, 'luck', 10), 0);

const evolved = normalizeInstance({
  ...legacy,
  instanceId: 'evolved-stat',
  formId: 'flameling_lv2',
  evolutionPath: 'flameling_lv2',
}, { now: 1000 });
assert.equal(evolved.canonicalFormId, 'MON_020');
const persistentMonster = sanitizeMonsterInstanceForPersistence(evolved);
assert.equal(persistentMonster.canonicalFormId, 'MON_020');
assert.equal(persistentMonster.statSchemaVersion, 'monster-instance-stats/v1');
assert.deepEqual(persistentMonster.statTraining, { hp: 0, atk: 120, def: 80, spatk: 40, spdef: 20, spd: 60 });
assert.equal('spAtk' in persistentMonster.statTraining, false);
assert.equal('spDef' in persistentMonster.statTraining, false);

const state = normalizeSavedState({
  saveVersion: 11,
  collection: [legacy, { ...evolved, statTraining: persistentMonster.statTraining }],
  party: ['legacy-stat', null, null],
  storage: ['evolved-stat'],
  ranchActive: ['evolved-stat'],
}, { now: 1000 });
assert.equal(state.saveVersion, 12);
assert.equal(state.collection[0].canonicalFormId, 'MON_002');
assert.equal(state.collection[1].canonicalFormId, 'MON_020');
assert.deepEqual(normalizeSavedState(state, { now: 1000 }), state, 'whole-save migration is twice-is-same');

const sanitized = sanitizeStateForPersistence(state);
assert.equal(sanitized.saveVersion, 12);
assert.equal(sanitized.collection[0].statTraining.spatk, 40);
const storage = new MemoryStorage();
writeStoredSave(storage, { state, playerHp: 100 });
const envelope = JSON.parse(storage.getItem(SAVE_KEY));
assert.equal(envelope.saveSchemaVersion, 12);
assert.equal(envelope.state.saveVersion, 12);
const roundTrip = normalizeSavedState(envelope.state, { now: 1000 });
assert.deepEqual(roundTrip.collection.map(monster => monster.statTraining), state.collection.map(monster => monster.statTraining));
assert.deepEqual(roundTrip.collection.map(monster => monster.canonicalFormId), ['MON_002', 'MON_020']);

console.log('V8.3 six-stat instance/save/training migration: PASS');
