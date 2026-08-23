import assert from 'node:assert/strict';
import fs from 'node:fs';
import { statBreakdown } from '../combat-rating.mjs';
import { refreshCoreStats } from '../live-progression.mjs';
import {
  INSTANCE_SAVE_VERSION,
  normalizeInstance,
  sanitizeMonsterInstanceForPersistence,
} from '../monster-instance.mjs';
import {
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  SAVE_MIGRATION_REGISTRY,
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

assert.equal(INSTANCE_SAVE_VERSION, 11);
assert.equal(SAVE_SCHEMA_VERSION, 11);
assert.deepEqual(SAVE_MIGRATION_REGISTRY.map(entry => [entry.id, entry.targetVersion]), [
  ['monster-instance-v9-skill-runtime', 9],
  ['breeding-egg-v10', 10],
  ['passive-instance-v11', 11],
]);

const injected = '<img src=x onerror=globalThis.passivePwned=1>';
const rock = normalizeInstance({
  instanceId: 'rock-passive',
  speciesId: 'rockhorn',
  formId: 'rockhorn',
  passive: injected,
  passiveId: 'PASS_FORGED_99',
}, { now: 1000 });
assert.equal(rock.passiveId, 'PASS_ROCK_01', 'invalid or missing selection migrates to species Passive1ID');
assert.equal('passive' in rock, false, 'legacy display markup is never retained');

const selectedStage2 = normalizeInstance({
  instanceId: 'rock-stage2',
  speciesId: 'rockhorn',
  formId: 'MON_025',
  passiveId: 'PASS_ROCK_02',
}, { now: 1000 });
assert.equal(selectedStage2.passiveId, 'PASS_ROCK_01', 'Passive2 selection remains deferred even at Stage2');

const normal = normalizeInstance({ instanceId: 'normal-passive', speciesId: 'normalooze' }, { now: 1000 });
assert.equal(normal.passiveId, 'PASS_NORMAL_01');
assert.equal(normalizeInstance({ instanceId: 'unknown-passive', speciesId: 'unknown' }, { now: 1000 }).passiveId, null);

const baseBuild = {
  level: 1,
  species: { base: { def: 100 }, growthPerLevel: { def: 0 } },
  genes: { def: 'B' },
  training: {},
  condition: 'normal',
};
const withoutPassive = statBreakdown(baseBuild, 'def');
const activeStoneHideBuild = {
  ...baseBuild,
  passiveId: rock.passiveId,
  passiveOwnerSpeciesId: 'rockhorn',
  passiveOwnerFainted: false,
};
const withStoneHide = statBreakdown(activeStoneHideBuild, 'def');
assert.equal(withoutPassive.final, 100);
assert.equal(withStoneHide.prePassiveFinal, 100);
assert.equal(withStoneHide.passiveMultiplier, 1.1);
assert.equal(withStoneHide.final, 110, 'Stone Hide is applied by the shared stat boundary');
assert.deepEqual(statBreakdown(activeStoneHideBuild, 'def'), withStoneHide,
  'repeated stat recomputation starts from source values and cannot stack the passive');
assert.equal(statBreakdown({
  ...baseBuild,
  passiveId: normal.passiveId,
  passiveOwnerSpeciesId: 'normalooze',
  passiveOwnerFainted: false,
}, 'def').final, 100,
  'catalog-only passives do not alter gameplay');
assert.equal(statBreakdown({
  ...activeStoneHideBuild,
  passiveOwnerSpeciesId: 'normalooze',
}, 'def').final, 100, 'forged live species/passive pairing fails closed');
assert.equal(statBreakdown({
  ...activeStoneHideBuild,
  passiveOwnerFainted: true,
}, 'def').final, 100, 'fainted live owner receives no passive effect');

const revivedRock = { ...rock, hp: 0, maxHp: 100, fainted: true, _condition: 'normal' };
const revived = refreshCoreStats(revivedRock, {
  id: 'rockhorn',
  base: { hp: 100, atk: 100, def: 100, spd: 100 },
  growthPerLevel: { hp: 0, atk: 0, def: 0, spd: 0 },
}, null, null, { heal: true });
assert.equal(revived.stats.def, 110, 'revive computes Stone Hide in the same transaction');
assert.equal(revivedRock.def, 110);
assert.equal(revivedRock.hp, revivedRock.maxHp);
assert.equal(revivedRock.fainted, false);

const sanitizedMonster = sanitizeMonsterInstanceForPersistence({
  ...rock,
  passive: injected,
  passiveEventState: { processedEventIds: ['evt'] },
  passiveEventLedger: { processedEventIds: ['evt-ledger'] },
  processedEventIds: ['evt-direct'],
  eventFingerprintById: { 'evt-direct': 'fingerprint' },
});
assert.equal(sanitizedMonster.passiveId, 'PASS_ROCK_01');
assert.equal('passive' in sanitizedMonster, false);
assert.equal('passiveEventState' in sanitizedMonster, false);
assert.equal('passiveEventLedger' in sanitizedMonster, false);
assert.equal('processedEventIds' in sanitizedMonster, false);
assert.equal('eventFingerprintById' in sanitizedMonster, false);

const state = normalizeSavedState({
  saveVersion: 10,
  collection: [{
    instanceId: 'rock-passive',
    speciesId: 'rockhorn',
    passive: injected,
    passiveId: 'PASS_FORGED_99',
    passiveEventState: { processedEventIds: ['evt'] },
  }],
  party: ['rock-passive', null, null],
  storage: [],
  ranchActive: [],
  passiveEventState: { processedEventIds: ['evt-root'] },
  passiveEventLedger: { processedEventIds: ['evt-root-ledger'] },
  processedEventIds: ['evt-root-direct'],
  eventFingerprintById: { 'evt-root-direct': 'fingerprint' },
}, { now: 1000 });
assert.equal(state.saveVersion, 11);
assert.equal(state.collection[0].passiveId, 'PASS_ROCK_01');
assert.equal('passive' in state.collection[0], false);
assert.equal('passiveEventState' in state.collection[0], false);
assert.equal('passiveEventState' in state, false);
assert.equal('passiveEventLedger' in state, false);
assert.equal('processedEventIds' in state, false);
assert.equal('eventFingerprintById' in state, false);
assert.deepEqual(normalizeSavedState(state, { now: 1000 }), state, 'v11 migration is idempotent');

const sanitizedState = sanitizeStateForPersistence({ ...state, passiveEventState: { processedEventIds: ['evt'] } });
assert.equal('passiveEventState' in sanitizedState, false);
const storage = new MemoryStorage();
storage.setItem(SAVE_KEY, JSON.stringify({
  state: {
    ...state,
    passiveEventLedger: { processedEventIds: ['legacy-root'] },
    collection: [{
      ...state.collection[0],
      passive: injected,
      passiveEventLedger: { processedEventIds: ['legacy-monster'] },
    }],
  },
  appVersion: '8.2.0',
  saveSchemaVersion: 10,
}));
writeStoredSave(storage, { state: { ...state, passiveEventState: { processedEventIds: ['evt'] } } });
const serialized = storage.getItem(SAVE_KEY);
const serializedBackup = storage.getItem(SAVE_BACKUP_KEY);
const envelope = JSON.parse(serialized);
assert.equal(envelope.saveSchemaVersion, 11);
assert.equal(envelope.state.collection[0].passiveId, 'PASS_ROCK_01');
assert.doesNotMatch(serialized, /<img|onerror|PASS_FORGED_99|processedEventIds/);
assert.doesNotMatch(serializedBackup, /<img|onerror|passiveEventLedger|processedEventIds/,
  'backup payload is sanitized at the same persistence boundary as current save');
assert.equal(JSON.parse(serializedBackup).saveSchemaVersion, 11);

const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(gameSource, /typeof instanceContext\?\.passiveId==='string'[\s\S]*?passiveCatalogEntry\(instanceContext\.passiveId\)/,
  'UI type-checks the saved ID and resolves the passive only through the catalog');
assert.doesNotMatch(gameSource, /inst\.passive\|\|inst\.genes\?\.trait/, 'raw saved passive markup is not rendered');
assert.match(gameSource, /refreshCoreStats\(inst,sp,path,getEquipmentFlat\(inst\),\{heal\}\)/,
  'live refresh uses the atomic revive/stat transaction');

console.log('V8.1 A34 passive instance/save/live stat wiring: PASS');
