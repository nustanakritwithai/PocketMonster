import assert from 'node:assert/strict';
import {
  APP_VERSION,
  ASSET_REVISION,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  SAVE_SCHEMA_VERSION,
  normalizeSavedState,
  readStoredSave,
  writeStoredSave,
} from '../save-schema.mjs';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

assert.equal(APP_VERSION, '8.0.0');
assert.equal(ASSET_REVISION, '710');
assert.equal(SAVE_SCHEMA_VERSION, 8);
assert.equal(SAVE_KEY, 'monster-life-rpg-proto-v6', 'release must preserve the established save key');

const storage = new MemoryStorage();
writeStoredSave(storage, { state: { collection: [], party: [] }, playerHp: 100 });
writeStoredSave(storage, { state: { collection: [], party: [] }, playerHp: 80 });
assert.equal(JSON.parse(storage.getItem(SAVE_BACKUP_KEY)).playerHp, 100, 'last valid save must be retained as backup');
storage.setItem(SAVE_KEY, '{corrupt');
const recovered = readStoredSave(storage);
assert.equal(recovered.source, 'backup');
assert.equal(recovered.playerHp, 100);

const normalized = normalizeSavedState({
  collection: [{ instanceId: 'a' }, { instanceId: 'a' }, { instanceId: 'b' }, { instanceId: 'c' }],
  party: ['a', 'a', 'missing', 'b'],
  storage: ['a', 'b', 'b', 'c', 'missing'],
  ranchActive: ['a', 'c', 'c', 'missing'],
  selectedSlot: 99,
});
assert.deepEqual(normalized.collection.map(monster => monster.instanceId), ['a', 'b', 'c']);
assert.deepEqual(normalized.party, ['a', null, null], 'party migration must preserve slot positions and remove duplicate ownership');
assert.deepEqual(normalized.storage, ['b', 'c']);
assert.deepEqual(normalized.ranchActive, ['c']);
assert.equal(normalized.selectedSlot, 2);
assert.equal(normalized.saveVersion, SAVE_SCHEMA_VERSION);
console.log('P0 version/save identity regression: PASS');
