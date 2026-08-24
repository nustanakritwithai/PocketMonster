import assert from 'node:assert/strict';
import { consumeSkillUse } from '../skill-progression.mjs';
import {
  SAVE_KEY,
  SAVE_SCHEMA_VERSION,
  normalizeSavedState,
  sanitizeStateForPersistence,
  writeStoredSave,
} from '../save-schema.mjs';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const legacy = {
  saveVersion: 8,
  cooldownRemaining: { SK_FIRE_01: 4 },
  collection: [{
    instanceId: 'skill-save',
    speciesId: 'flameling',
    cooldownRemaining: { SK_FIRE_01: 4 },
    cooldownRemainingMs: 4000,
    skillCds: [4, 0, 0],
    skills: [
      { skillId: 'SK_FIRE_01', slot: 's1', cooldownRemaining: 4 },
      { skillId: 'SK_FIRE_02', slot: 's2', currentUses: 5, cooldownRemainingMs: 1500 },
      { skillId: 'SK_FIRE_04', slot: 's3', currentUses: 'broken' },
      { skillId: 'legacy_move_name', slot: null, masteryExp: 12 },
    ],
  }],
  party: ['skill-save', null, null],
  storage: [],
  ranchActive: [],
};

const migrated = normalizeSavedState(legacy, { now: 1000 });
assert.equal(SAVE_SCHEMA_VERSION, 15);
assert.equal(migrated.saveVersion, SAVE_SCHEMA_VERSION);
assert.equal('cooldownRemaining' in migrated, false, 'encounter cooldown state never survives load migration');
const monster = migrated.collection[0];
assert.equal('cooldownRemaining' in monster, false);
assert.equal('cooldownRemainingMs' in monster, false);
assert.equal('skillCds' in monster, false);
assert.equal(monster.skills[0].currentUses, 28, 'old save with no use field defaults to catalog MaxUses');
assert.equal(monster.skills[1].currentUses, 5, 'intended remaining uses survive reload');
assert.equal(monster.skills[2].currentUses, 0, 'malformed use state fails closed');
assert.equal(monster.skills[3].skillId, 'legacy_move_name', 'unknown legacy skill data is preserved non-destructively');
for (const skill of monster.skills) {
  assert.equal('cooldownRemaining' in skill, false);
  assert.equal('cooldownRemainingMs' in skill, false);
}

const cast = consumeSkillUse(monster, {
  skillId: 'SK_FIRE_02', castId: 'post-reload-cast', castAccepted: true,
});
assert.equal(cast.currentUses, 4, 'reloaded intended use count remains usable');

const migratedAgain = normalizeSavedState(migrated, { now: 1000 });
assert.deepEqual(migratedAgain, migrated, 'v9 migration is twice-is-same');

const rawForSave = {
  ...legacy,
  collection: [{
    ...legacy.collection[0],
    skills: [{ skillId: 'SK_FIRE_01', slot: 's1', currentUses: 7, cooldownRemaining: 9 }],
  }],
};
const before = structuredClone(rawForSave);
const sanitized = sanitizeStateForPersistence(rawForSave);
assert.deepEqual(rawForSave, before, 'persistence sanitization never mutates live state');
assert.equal(sanitized.collection[0].skills[0].currentUses, 7);
assert.equal('cooldownRemaining' in sanitized.collection[0].skills[0], false);

const storage = new MemoryStorage();
writeStoredSave(storage, { state: rawForSave, playerHp: 80 });
const envelope = JSON.parse(storage.getItem(SAVE_KEY));
assert.equal(envelope.saveSchemaVersion, SAVE_SCHEMA_VERSION);
assert.equal(envelope.state.saveVersion, SAVE_SCHEMA_VERSION);
assert.equal(envelope.state.collection[0].skills[0].currentUses, 7);
assert.doesNotMatch(storage.getItem(SAVE_KEY), /cooldownRemaining|cooldownRemainingMs|skillCds/, 'local payload cannot persist cooldown runtime fields');

console.log('V8.1 uses/cooldown save migration: PASS');
